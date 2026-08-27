// ============================================================================
// Risk Analytics Data & Utilities
// Regional zone dataset with seasonal vulnerability scores and disaster typologies.
// Used by Authority Dashboard Risk Analytics and Telemetry Map.
// ============================================================================

/**
 * @typedef {Object} Zone
 * @property {string} id
 * @property {string} zoneName
 * @property {number} lat
 * @property {number} lng
 * @property {number} incidentCount
 * @property {number} vulnerabilityScore
 * @property {number} [activeScore]
 * @property {string} [activeSeason]
 * @property {string[]} [disasterTypes]
 * @property {string[]} [riskFactors]
 * @property {string[]} [actionProtocol]
 */

export const TOP_RANK_STYLES = {
  1: { color: "#EF4444", bg: "rgba(239, 68, 68, 0.15)", badgeLabel: "Rank #1 • Critical" },
  2: { color: "#F59E0B", bg: "rgba(245, 158, 11, 0.15)", badgeLabel: "Rank #2 • High" },
  3: { color: "#EAB308", bg: "rgba(234, 179, 8, 0.15)", badgeLabel: "Rank #3 • Elevated" },
};

/**
 * Returns dynamic seasonal information based on current date.
 */
export function getCurrentSeasonInfo() {
  const month = new Date().toLocaleString("en-US", { month: "long" });
  const monthIdx = new Date().getMonth(); // 0 - 11

  if (monthIdx >= 5 && monthIdx <= 8) {
    return {
      seasonName: "Monsoon Flood Season",
      currentMonth: month,
      themeColor: "#3B82F6",
      badgeText: "High Flood Risk Period Active",
      monthsSpan: "Jun – Sep",
    };
  } else if (monthIdx >= 9 && monthIdx <= 10) {
    return {
      seasonName: "Post-Monsoon Cyclone Season",
      currentMonth: month,
      themeColor: "#8B5CF6",
      badgeText: "Cyclonic Activity Window",
      monthsSpan: "Oct – Nov",
    };
  } else if (monthIdx >= 11 || monthIdx <= 1) {
    return {
      seasonName: "Winter Smog & Fog Season",
      currentMonth: month,
      themeColor: "#64748B",
      badgeText: "Low Ambient Visibility",
      monthsSpan: "Dec – Feb",
    };
  } else {
    return {
      seasonName: "Pre-Monsoon Heatwave Season",
      currentMonth: month,
      themeColor: "#EF4444",
      badgeText: "Extreme Heat & Fire Hazard",
      monthsSpan: "Mar – May",
    };
  }
}

/** @type {Zone[]} */
const ZONES = [
  {
    id: "zone-001",
    zoneName: "Yamuna Floodplain East (Delhi NCR)",
    lat: 28.6517,
    lng: 77.3219,
    incidentCount: 54,
    vulnerabilityScore: 94,
    activeScore: 96,
    activeSeason: "Monsoon Flood Season",
    disasterTypes: ["Urban Inundation", "Embankment Breach", "Waterlogging"],
    riskFactors: [
      "Low-lying river basin topography subject to rapid upstream surge",
      "High density informal settlements without drainage infrastructure",
      "Siltation in primary drainage outflows and stormwater sluice gates",
    ],
    actionProtocol: [
      "Deploy inflatable motorized rescue boats to designated sector checkpoints",
      "Pre-position mobile medical units and water purification stations",
      "Issue automated red-alert SMS evacuations for low-elevation wards",
    ],
  },
  {
    id: "zone-002",
    zoneName: "Coastal Mahanadi Estuary (Odisha Coast)",
    lat: 20.2961,
    lng: 85.8245,
    incidentCount: 42,
    vulnerabilityScore: 89,
    activeScore: 92,
    activeSeason: "Post-Monsoon Cyclone Season",
    disasterTypes: ["Cyclone Surge", "Saltwater Intrusion", "Wind Damage"],
    riskFactors: [
      "Exposed coastline with high frequency of severe cyclonic storm landfalls",
      "Shallow coastal shelf amplifying tidal surges above 4.5 meters",
      "Vulnerable thatch and masonry residential structures",
    ],
    actionProtocol: [
      "Activate cyclone shelter readiness protocols and backup diesel generators",
      "Pre-position satellite communication HAM radio relay kits",
      "Coordinate with Coast Guard for immediate maritime perimeter closure",
    ],
  },
  {
    id: "zone-003",
    zoneName: "Mithi River Basin & Kurla Transit (Mumbai)",
    lat: 19.0728,
    lng: 72.8797,
    incidentCount: 38,
    vulnerabilityScore: 86,
    activeScore: 88,
    activeSeason: "Monsoon Flood Season",
    disasterTypes: ["Flash Flooding", "Rail Transit Paralysis", "Structural Submersion"],
    riskFactors: [
      "Extreme rainfall concurrent with high tide blockages",
      "Encroached river channels reducing water discharge capacity by 65%",
      "Critical transit corridor convergence vulnerable to cascading gridlocks",
    ],
    actionProtocol: [
      "Operate high-capacity dewatering pump stations continuously",
      "Establish NDRF staging posts at Kurla and Sion railway junctions",
      "Activate bus and emergency ambulance rerouting corridors",
    ],
  },
  {
    id: "zone-004",
    zoneName: "Old City Heritage Quarter",
    lat: 28.6562,
    lng: 77.241,
    incidentCount: 28,
    vulnerabilityScore: 78,
    activeScore: 76,
    activeSeason: "Pre-Monsoon Heatwave Season",
    disasterTypes: ["Electrical Fires", "Narrow-Lane Entrapment", "Structural Fragility"],
    riskFactors: [
      "Century-old unreinforced masonry with high vulnerability to fire propagation",
      "Inaccessible narrow alleys preventing standard fire engine entry",
      "Overhead tangled electrical wiring prone to short-circuits during peak heat",
    ],
    actionProtocol: [
      "Deploy mini motorcycle fire-fighting quick response units (QRVs)",
      "Inspect high-risk transformer junctions and electrical distribution boxes",
      "Pre-assign evacuation muster points outside main gate corridors",
    ],
  },
  {
    id: "zone-005",
    zoneName: "Industrial Sector 7 Chemical Corridor",
    lat: 28.7041,
    lng: 77.1025,
    incidentCount: 23,
    vulnerabilityScore: 71,
    activeScore: 73,
    activeSeason: "Winter Smog & Fog Season",
    disasterTypes: ["Hazmat Chemical Spill", "Toxic Fume Accumulation", "Industrial Fire"],
    riskFactors: [
      "Concentration of chemical storage and solvent manufacturing facilities",
      "Thermal inversion trapping volatile organic vapor clouds near ground level",
      "Proximity to densely populated worker residential colonies",
    ],
    actionProtocol: [
      "Enforce mandatory hazardous material containment inspections",
      "Station specialized Hazmat decontamination tenders in Sector 7",
      "Maintain active air quality sensors with automatic threshold alerts",
    ],
  },
  {
    id: "zone-006",
    zoneName: "Slum Resettlement Zone G",
    lat: 28.6892,
    lng: 77.2678,
    incidentCount: 31,
    vulnerabilityScore: 68,
    activeScore: 70,
    activeSeason: "Monsoon Flood Season",
    disasterTypes: ["Water Contamination", "Epidemic Vector Outbreak", "Urban Runoff"],
    riskFactors: [
      "Lack of centralized sewage leading to immediate overflow during rains",
      "High infant and elderly population density in semi-permanent dwellings",
      "Limited access to clean potable drinking water reservoirs",
    ],
    actionProtocol: [
      "Distribute water purification tablets and chlorine treatment kits",
      "Station mobile primary health clinics with emergency rehydration salts",
      "Clear choked surface drains before predicted heavy precipitation",
    ],
  },
  {
    id: "zone-007",
    zoneName: "University & Hospital Precinct",
    lat: 28.6127,
    lng: 77.209,
    incidentCount: 14,
    vulnerabilityScore: 35,
    activeScore: 32,
    activeSeason: "All Seasons",
    disasterTypes: ["Localized Power Grid Failure", "Traffic Choke"],
    riskFactors: [
      "High daytime influx of ambulances and emergency patients",
      "Dependency on uninterrupted high-voltage utility power feed",
    ],
    actionProtocol: [
      "Ensure automatic diesel generator failover testing every 72 hours",
      "Designate priority green-corridor ambulance lanes with traffic police",
    ],
  },
  {
    id: "zone-008",
    zoneName: "Airport Transit Corridor & Highway Ring",
    lat: 28.5562,
    lng: 77.1,
    incidentCount: 9,
    vulnerabilityScore: 24,
    activeScore: 22,
    activeSeason: "Winter Smog & Fog Season",
    disasterTypes: ["Multi-Vehicle Highway Collision", "Dense Fog Disruption"],
    riskFactors: [
      "Zero-visibility dense fog episodes during early morning hours",
      "High-speed highway traffic with sudden speed deceleration bottlenecks",
    ],
    actionProtocol: [
      "Activate variable electronic message signboards with speed limits",
      "Deploy highway patrol escorts and luminous fog warning beacons",
    ],
  },
];

/**
 * Returns the risk level label based on vulnerability score.
 * @param {number} score
 * @returns {"CRITICAL"|"HIGH"|"MODERATE"|"LOW"}
 */
export function getRiskLevel(score) {
  if (score > 80) return "CRITICAL";
  if (score > 60) return "HIGH";
  if (score > 40) return "MODERATE";
  return "LOW";
}

/**
 * Returns the CSS color token for a risk level.
 * @param {"CRITICAL"|"HIGH"|"MODERATE"|"LOW"} level
 * @returns {string}
 */
export function getRiskColor(level) {
  switch (level) {
    case "CRITICAL": return "#EF4444";
    case "HIGH": return "#F59E0B";
    case "MODERATE": return "#3B82F6";
    case "LOW": return "#10B981";
    default: return "#8B949E";
  }
}

/**
 * Returns the background color (with transparency) for a risk badge.
 * @param {"CRITICAL"|"HIGH"|"MODERATE"|"LOW"} level
 * @returns {string}
 */
export function getRiskBg(level) {
  switch (level) {
    case "CRITICAL": return "rgba(239, 68, 68, 0.15)";
    case "HIGH": return "rgba(245, 158, 11, 0.15)";
    case "MODERATE": return "rgba(59, 130, 246, 0.15)";
    case "LOW": return "rgba(16, 185, 129, 0.12)";
    default: return "rgba(139, 148, 158, 0.12)";
  }
}

/**
 * Returns all zones, enriched with computed riskLevel and activeScore.
 * @returns {(Zone & { riskLevel: string })[]}
 */
export function getEnrichedZones() {
  return ZONES.map((z) => {
    const score = z.activeScore || z.vulnerabilityScore;
    return {
      ...z,
      activeScore: score,
      riskLevel: getRiskLevel(score),
    };
  });
}

/**
 * Returns zones sorted by risk score descending (highest risk first).
 * @returns {(Zone & { riskLevel: string })[]}
 */
export function getZonesSortedByRisk() {
  return getEnrichedZones().sort((a, b) => (b.activeScore || b.vulnerabilityScore) - (a.activeScore || a.vulnerabilityScore));
}

/**
 * Returns top N hazard zones sorted by risk score descending.
 * @param {number} [count=3]
 * @returns {(Zone & { riskLevel: string })[]}
 */
export function getTopRiskZones(count = 3) {
  return getZonesSortedByRisk().slice(0, count);
}

/**
 * Returns summary analytics across all zones.
 */
export function getRiskSummary() {
  const sorted = getZonesSortedByRisk();
  const criticalCount = sorted.filter((z) => z.riskLevel === "CRITICAL").length;
  const averageScore = Math.round(
    sorted.reduce((sum, z) => sum + (z.activeScore || z.vulnerabilityScore), 0) / sorted.length
  );
  return {
    topZone: sorted[0],
    criticalCount,
    averageScore,
    seasonInfo: getCurrentSeasonInfo(),
  };
}
