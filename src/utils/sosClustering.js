// ============================================================================
// SOS Proximity Clustering & Priority Alert Engine
// Uses the Haversine formula to compute geodesic distance between emergency
// coordinates, groups spatio-temporal incidents within 500m, and evaluates
// cluster severity (ELEVATED vs. MASS CRITICAL) with nearest hospital triage.
// ============================================================================

/**
 * Calculates great-circle distance between two GPS coordinates using Haversine formula
 * @param {number} lat1 Latitude of point 1
 * @param {number} lon1 Longitude of point 1
 * @param {number} lat2 Latitude of point 2
 * @param {number} lon2 Longitude of point 2
 * @returns {number} Distance in meters
 */
export function getHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

/**
 * Extracts milliseconds timestamp from diverse Firestore / Date formats
 */
export function getRequestTimestampMs(req) {
  if (!req) return Date.now();
  if (req.createdAt?.toDate && typeof req.createdAt.toDate === "function") {
    return req.createdAt.toDate().getTime();
  }
  if (req.createdAt?.seconds) {
    return req.createdAt.seconds * 1000;
  }
  if (req.createdAt instanceof Date) {
    return req.createdAt.getTime();
  }
  if (typeof req.createdAt === "string" || typeof req.createdAt === "number") {
    const parsed = new Date(req.createdAt).getTime();
    if (!isNaN(parsed)) return parsed;
  }
  return Date.now();
}

/**
 * Groups active SOS alerts within 500m of each other and within 15 minutes
 * @param {Array} requests Array of SOS request documents
 * @param {number} maxDistanceMeters Proximity threshold (default: 500m)
 * @param {number} maxAgeMinutes Time window (default: 15 mins)
 * @returns {Array} List of detected clusters
 */
export function detectSOSClusters(requests = [], maxDistanceMeters = 500, maxAgeMinutes = 15) {
  const now = Date.now();
  const maxAgeMs = maxAgeMinutes * 60 * 1000;

  // 1. Filter eligible active emergency alerts with valid GPS coordinates
  const activeAlerts = requests.filter((r) => {
    if (r.status === "resolved") return false;
    if (!r.location || typeof r.location.lat !== "number" || typeof r.location.lng !== "number") {
      return false;
    }
    const timeMs = getRequestTimestampMs(r);
    // Allow alerts within the 15-minute window or newly created active alerts
    return now - timeMs <= maxAgeMs || r.status === "pending";
  });

  if (activeAlerts.length < 2) {
    return [];
  }

  // 2. Spatial Adjacency Graph: connect alerts within 500m
  const visited = new Set();
  const clusters = [];

  for (let i = 0; i < activeAlerts.length; i++) {
    if (visited.has(activeAlerts[i].id)) continue;

    const currentCluster = [activeAlerts[i]];
    visited.add(activeAlerts[i].id);

    const queue = [activeAlerts[i]];

    while (queue.length > 0) {
      const node = queue.shift();

      for (let j = 0; j < activeAlerts.length; j++) {
        const candidate = activeAlerts[j];
        if (visited.has(candidate.id)) continue;

        const distance = getHaversineDistance(
          node.location.lat,
          node.location.lng,
          candidate.location.lat,
          candidate.location.lng
        );

        if (distance <= maxDistanceMeters) {
          visited.add(candidate.id);
          currentCluster.push(candidate);
          queue.push(candidate);
        }
      }
    }

    // Only consider groups of 2 or more as clusters
    if (currentCluster.length >= 2) {
      // Calculate cluster centroid
      const totalLat = currentCluster.reduce((sum, item) => sum + item.location.lat, 0);
      const totalLng = currentCluster.reduce((sum, item) => sum + item.location.lng, 0);
      const centroidLat = totalLat / currentCluster.length;
      const centroidLng = totalLng / currentCluster.length;

      // Calculate bounding radius in meters
      const maxDistanceFromCenter = currentCluster.reduce((max, item) => {
        const d = getHaversineDistance(centroidLat, centroidLng, item.location.lat, item.location.lng);
        return Math.max(max, d);
      }, 0);

      const radiusMeters = Math.max(250, Math.min(600, maxDistanceFromCenter + 80));

      // Severity rating:
      // - 5+ alerts: MASS CRITICAL CLUSTER (Red Alert)
      // - 3 to 4 alerts: ELEVATED CLUSTER (Orange)
      // - 2 alerts: PROXIMITY PAIR (Yellow/Orange)
      const victimCount = currentCluster.length;
      let severityLabel = "ELEVATED CLUSTER";
      let severityLevel = "ELEVATED";
      let severityColor = "#F57C00";
      let severityBg = "rgba(245, 124, 0, 0.18)";

      if (victimCount >= 5) {
        severityLabel = "MASS CRITICAL CLUSTER";
        severityLevel = "MASS_CRITICAL";
        severityColor = "#D32F2F";
        severityBg = "rgba(211, 47, 47, 0.22)";
      } else if (victimCount >= 3) {
        severityLabel = "ELEVATED CLUSTER";
        severityLevel = "ELEVATED";
        severityColor = "#F57C00";
        severityBg = "rgba(245, 124, 0, 0.18)";
      } else {
        severityLabel = "PROXIMITY ALERT";
        severityLevel = "PAIR";
        severityColor = "#FBC02D";
        severityBg = "rgba(251, 192, 45, 0.16)";
      }

      // Emergency types breakdown
      const typeCounts = {};
      currentCluster.forEach((r) => {
        const t = r.type || "other";
        typeCounts[t] = (typeCounts[t] || 0) + 1;
      });

      clusters.push({
        id: `cluster-${centroidLat.toFixed(4)}-${centroidLng.toFixed(4)}-${victimCount}`,
        centroid: { lat: centroidLat, lng: centroidLng },
        radiusMeters,
        victimCount,
        severityLabel,
        severityLevel,
        severityColor,
        severityBg,
        requests: currentCluster,
        requestIds: currentCluster.map((r) => r.id),
        typeCounts,
        newestTimestamp: Math.max(...currentCluster.map(getRequestTimestampMs)),
        oldestTimestamp: Math.min(...currentCluster.map(getRequestTimestampMs)),
      });
    }
  }

  // Sort clusters: Mass Critical first, then highest victim count
  return clusters.sort((a, b) => {
    if (a.severityLevel === "MASS_CRITICAL" && b.severityLevel !== "MASS_CRITICAL") return -1;
    if (b.severityLevel === "MASS_CRITICAL" && a.severityLevel !== "MASS_CRITICAL") return 1;
    return b.victimCount - a.victimCount;
  });
}

/**
 * Finds the nearest verified hospital with open emergency beds for a cluster centroid
 */
export function findNearestHospital(clusterCenter, hospitals = []) {
  if (!hospitals || !hospitals.length || !clusterCenter) return null;

  let nearest = null;
  let minDistance = Infinity;

  hospitals.forEach((hosp) => {
    if (!hosp.location || typeof hosp.location.lat !== "number" || typeof hosp.location.lng !== "number") {
      return;
    }

    const distMeters = getHaversineDistance(
      clusterCenter.lat,
      clusterCenter.lng,
      hosp.location.lat,
      hosp.location.lng
    );

    const freeBeds =
      hosp.availableBeds !== undefined
        ? hosp.availableBeds
        : Math.max(0, (hosp.totalBeds || 0) - (hosp.occupiedBeds || 0));

    if (distMeters < minDistance) {
      minDistance = distMeters;
      nearest = {
        id: hosp.id,
        hospitalName: hosp.hospitalName || "Regional Emergency Trauma Center",
        location: hosp.location,
        distanceKm: (distMeters / 1000).toFixed(2),
        distanceMeters: Math.round(distMeters),
        availableBeds: freeBeds,
        totalBeds: hosp.totalBeds || 0,
        staffCount: hosp.staffCount || 0,
        isMaxOccupied: hosp.isMaxOccupied || freeBeds <= 0,
        isVerified: hosp.isVerified,
      };
    }
  });

  return nearest;
}

/**
 * Plays a synthesized audio alert beep using standard Web Audio API
 */
export function playClusterAlertSound(isCritical = true) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = isCritical ? "sawtooth" : "sine";
    osc.frequency.setValueAtTime(isCritical ? 880 : 587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(isCritical ? 440 : 880, ctx.currentTime + 0.35);

    gain.gain.setValueAtTime(0.22, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (err) {
    console.warn("Cluster audio alert prevented by autoplay permissions:", err);
  }
}
