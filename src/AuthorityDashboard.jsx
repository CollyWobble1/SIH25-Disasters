import { useEffect, useState, useMemo } from "react";
import { collection, onSnapshot, doc, updateDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import {
  getZonesSortedByRisk,
  getTopRiskZones,
  getRiskSummary,
  getCurrentSeasonInfo,
  getRiskColor,
  getRiskBg,
  TOP_RANK_STYLES,
} from "./utils/riskAnalytics";
import {
  detectSOSClusters,
  findNearestHospital,
} from "./utils/sosClustering";
import { MapContainer, TileLayer, CircleMarker, Circle, Popup, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./AuthorityDashboard.css";
import ShelterTracker, { INITIAL_MOCK_SHELTERS } from "./ShelterTracker";
import DisasterMap from "./DisasterMap";
import DisasterFeed from "./DisasterFeed";
import AuthorityResourcePublisher from "./components/resources/AuthorityResourcePublisher";
import {
  RESOURCE_CATEGORIES,
  RESOURCE_UNITS,
  updateCommitmentStatus,
  updateRequestStatus,
  deleteResourceRequest,
} from "./services/resourceMatchmakingService";

// Unified Disaster Incident Lifecycle Status Normalizer
export function getUnifiedStatus(reqOrStatus) {
  let raw = "";
  if (typeof reqOrStatus === "string") {
    raw = reqOrStatus;
  } else if (reqOrStatus && typeof reqOrStatus === "object") {
    raw = reqOrStatus.status || (reqOrStatus.volunteerRequested ? "VOLUNTEER_DISPATCHED" : "PENDING");
  }
  const s = String(raw).toUpperCase();
  if (s === "RESOLVED") return "RESOLVED";
  if (s === "IN_PROGRESS" || s === "RESPONDER_EN_ROUTE" || s === "ARRIVED" || s === "TRAVELLING" || s === "ON_SCENE") return "IN_PROGRESS";
  if (s === "VOLUNTEER_DISPATCHED" || s === "DISPATCHED") return "VOLUNTEER_DISPATCHED";
  return "PENDING";
}

export function getIncidentStepIndex(unifiedStatus) {
  switch (unifiedStatus) {
    case "PENDING":
      return 1;
    case "VOLUNTEER_DISPATCHED":
      return 2;
    case "IN_PROGRESS":
      return 3;
    case "RESOLVED":
      return 4;
    default:
      return 1;
  }
}

// Visual 4-Step Incident Lifecycle Progress Stepper
export function IncidentLifecycleStepper({ status }) {
  const currentStep = getIncidentStepIndex(getUnifiedStatus(status));
  const steps = [
    { num: 1, label: "1. Reported", key: "PENDING" },
    { num: 2, label: "2. Dispatched", key: "VOLUNTEER_DISPATCHED" },
    { num: 3, label: "3. On Scene", key: "IN_PROGRESS" },
    { num: 4, label: "4. Resolved", key: "RESOLVED" },
  ];

  return (
    <div style={{ margin: "8px 0 6px 0", background: "rgba(15, 23, 42, 0.5)", borderRadius: "8px", padding: "8px 10px", border: "1px solid rgba(148, 163, 184, 0.15)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative" }}>
        {/* Step Connector Line */}
        <div
          style={{
            position: "absolute",
            top: "10px",
            left: "12%",
            right: "12%",
            height: "2px",
            background: "#334155",
            zIndex: 1,
          }}
        />
        {steps.map((step) => {
          const isDone = currentStep >= step.num;
          const isCurrent = currentStep === step.num;
          const stepColor = isDone ? (step.num === 4 ? "#10B981" : step.num === 3 ? "#38BDF8" : step.num === 2 ? "#F59E0B" : "#3B82F6") : "#475569";

          return (
            <div key={step.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, position: "relative", zIndex: 2 }}>
              <div
                style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  background: isDone ? stepColor : "#1E293B",
                  border: `2px solid ${stepColor}`,
                  color: isDone ? "#FFFFFF" : "#94A3B8",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "9.5px",
                  fontWeight: 800,
                  boxShadow: isCurrent ? `0 0 8px ${stepColor}` : "none",
                  transition: "all 0.2s ease",
                }}
              >
                {isDone && currentStep > step.num ? "✓" : step.num}
              </div>
              <span
                style={{
                  fontSize: "9.5px",
                  fontWeight: isCurrent ? 800 : 600,
                  color: isDone ? (isCurrent ? "#FFFFFF" : stepColor) : "#64748B",
                  marginTop: "4px",
                  textAlign: "center",
                  letterSpacing: "0.2px",
                }}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Helper function to format timestamp to relative time (e.g., "10 mins ago")
function formatTimeAgo(createdAt) {
  if (!createdAt) return "Just now";
  
  let date;
  if (createdAt.toDate && typeof createdAt.toDate === "function") {
    date = createdAt.toDate();
  } else if (createdAt.seconds) {
    date = new Date(createdAt.seconds * 1000);
  } else if (createdAt instanceof Date) {
    date = createdAt;
  } else if (typeof createdAt === "string" || typeof createdAt === "number") {
    date = new Date(createdAt);
  } else {
    return "Recently";
  }

  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 0) return "Just now";
  if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
  
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes} min${diffInMinutes > 1 ? "s" : ""} ago`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? "s" : ""} ago`;
  
  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays} day${diffInDays > 1 ? "s" : ""} ago`;
}

// Automated Priority Tagging Scanner: identifies high-urgency keywords
function isCriticalPriority(req) {
  if (!req) return false;
  const notesText = [
    req.notes,
    req.note,
    req.message,
    req.details,
    req.situation,
    req.category,
    req.type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const criticalKeywords = ["trapped", "severe", "fire", "bleed", "child"];
  return criticalKeywords.some((kw) => notesText.includes(kw));
}

export default function AuthorityDashboard() {
  const [activeTab, setActiveTab] = useState("incidents"); // 'incidents' | 'hospitals' | 'risk' | 'shelters' | 'map' | 'feed'

  // Risk Analytics state
  const [riskSearch, setRiskSearch] = useState("");
  const [riskLevelFilter, setRiskLevelFilter] = useState("ALL"); // 'ALL'|'CRITICAL'|'HIGH'|'MODERATE'|'LOW'
  const [riskSortField, setRiskSortField] = useState("vulnerabilityScore"); // 'vulnerabilityScore'|'incidentCount'
  const allZones = useMemo(() => getZonesSortedByRisk(), []);
  const riskSummary = useMemo(() => getRiskSummary(), []);
  const [requests, setRequests] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [shelters, setShelters] = useState(INITIAL_MOCK_SHELTERS);
  const [filter, setFilter] = useState("all"); // 'all' | 'pending' | 'dispatched' | 'in_progress' | 'resolved'
  const [updatingId, setUpdatingId] = useState(null);
  const [approvingId, setApprovingId] = useState(null);
  const [loading, setLoading] = useState(true);
  // Fullscreen photo lightbox
  const [lightboxSrc, setLightboxSrc] = useState(null);

  // Proximity Clustering & Priority Alert System state
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [dispatchingClusterId, setDispatchingClusterId] = useState(null);

  // Emergency Alert Broadcasting State
  const [alerts, setAlerts] = useState([]);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [newAlertTitle, setNewAlertTitle] = useState("");
  const [newAlertSeverity, setNewAlertSeverity] = useState("CRITICAL");
  const [newAlertZone, setNewAlertZone] = useState("");
  const [newAlertInstructions, setNewAlertInstructions] = useState("");
  const [broadcastingAlert, setBroadcastingAlert] = useState(false);

  // Real-Time Resource Matchmaking & Demands State
  const [resourceRequests, setResourceRequests] = useState([]);
  const [showResourceModal, setShowResourceModal] = useState(false);
  const [isBroadcastingResource, setIsBroadcastingResource] = useState(false);
  const [resourceFormData, setResourceFormData] = useState({
    type: "goods",
    category: "Food & Water",
    title: "",
    description: "",
    quantityNeeded: "",
    unit: "packs",
    urgency: "CRITICAL",
    address: "Central Disaster Relief Hub, Gate 2",
    dropOffInstructions: "Deliver to Logistics Desk A.",
    latitude: 28.6139,
    longitude: 77.209,
  });

  // 1. Subscribe to SOS Requests in real-time
  useEffect(() => {
    const q = collection(db, "sos_requests");
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));

        // Sort descending: newest requests first
        items.sort((a, b) => {
          const timeA = a.createdAt?.toDate 
            ? a.createdAt.toDate().getTime() 
            : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (a.createdAt ? new Date(a.createdAt).getTime() : 0));
          const timeB = b.createdAt?.toDate 
            ? b.createdAt.toDate().getTime() 
            : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (b.createdAt ? new Date(b.createdAt).getTime() : 0));
          return timeB - timeA;
        });

        setRequests(items);
        setLoading(false);
      },
      (error) => {
        console.error("Firestore SOS listener error:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // 2. Subscribe to Hospitals in real-time (READ-ONLY)
  useEffect(() => {
    const q = collection(db, "hospitals");
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));

        // Sort: Verified active hospitals with most free beds first
        items.sort((a, b) => {
          if (a.isVerified !== b.isVerified) return a.isVerified ? -1 : 1;
          if (a.isMaxOccupied && !b.isMaxOccupied) return 1;
          if (!a.isMaxOccupied && b.isMaxOccupied) return -1;
          const freeA = a.availableBeds ?? ((a.totalBeds || 0) - (a.occupiedBeds || 0));
          const freeB = b.availableBeds ?? ((b.totalBeds || 0) - (b.occupiedBeds || 0));
          return freeB - freeA;
        });

        setHospitals(items);
      },
      (error) => {
        console.error("Firestore Hospitals listener error:", error);
      }
    );

    return () => unsubscribe();
  }, []);

  // 3. Subscribe to Shelters & Alerts in real-time
  useEffect(() => {
    const unsubShelters = onSnapshot(
      collection(db, "shelters"),
      (snap) => {
        if (!snap.empty) {
          const live = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setShelters(live);
        } else {
          setShelters(INITIAL_MOCK_SHELTERS);
        }
      },
      (err) => {
        console.warn("Shelters snapshot listener:", err);
        setShelters(INITIAL_MOCK_SHELTERS);
      }
    );

    const unsubAlerts = onSnapshot(
      collection(db, "alerts"),
      (snap) => {
        if (!snap.empty) {
          const live = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setAlerts(live);
        }
      },
      (err) => {
        console.warn("Alerts listener error in AuthorityDashboard:", err);
      }
    );

    return () => {
      unsubShelters();
      unsubAlerts();
    };
  }, []);

  // 4. Subscribe to Resource Requests in real-time with onSnapshot
  useEffect(() => {
    const unsubResources = onSnapshot(
      collection(db, "resource_requests"),
      (snapshot) => {
        const items = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          const qNeeded = data.quantityNeeded !== undefined ? Number(data.quantityNeeded) : (Number(data.requiredQuantity) || 0);
          const qFulfilled = data.quantityFulfilled !== undefined ? Number(data.quantityFulfilled) : (Number(data.fulfilledQuantity) || 0);

          return {
            id: docSnap.id,
            ...data,
            quantityNeeded: qNeeded,
            requiredQuantity: qNeeded,
            quantityFulfilled: qFulfilled,
            fulfilledQuantity: qFulfilled,
            type: data.type || "goods",
            status: data.status || (qFulfilled >= qNeeded && qNeeded > 0 ? "CLOSED" : qFulfilled > 0 ? "PARTIALLY_FULFILLED" : "OPEN"),
          };
        });

        // Sort descending by creation date
        items.sort((a, b) => {
          const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
          const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
          return timeB - timeA;
        });

        setResourceRequests(items);
      },
      (err) => {
        console.warn("resource_requests listener error:", err);
      }
    );

    return () => unsubResources();
  }, []);

  // Proximity Clustering Engine: Groups active alerts within 500m & 15 mins
  const activeClusters = useMemo(() => {
    return detectSOSClusters(requests, 500, 15);
  }, [requests]);



  // Batch Dispatch Emergency Unit to entire cluster
  const handleBatchDispatchCluster = async (cluster) => {
    if (!cluster || !cluster.requestIds || !cluster.requestIds.length) return;
    try {
      setDispatchingClusterId(cluster.id);
      const promises = cluster.requestIds.map((id) => {
        const reqRef = doc(db, "sos_requests", id);
        return updateDoc(reqRef, {
          status: "dispatched",
          dispatchedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      await Promise.all(promises);
      alert(`🚨 Emergency units successfully dispatched to all ${cluster.victimCount} clustered victims!`);
      setSelectedCluster(null);
    } catch (err) {
      console.error("Batch dispatch cluster error:", err);
      alert(`Could not dispatch emergency units: ${err.message || "Unknown error"}`);
    } finally {
      setDispatchingClusterId(null);
    }
  };

  // SOS Incident Status Update Handler
  const handleUpdateStatus = async (id, newStatus) => {
    try {
      setUpdatingId(id);
      const reqRef = doc(db, "sos_requests", id);
      await updateDoc(reqRef, {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error(`Failed to update status to ${newStatus}:`, err);
      alert(`Could not update incident status: ${err.message || "Unknown error"}`);
    } finally {
      setUpdatingId(null);
    }
  };

  // Dispatch Volunteer to Incident Command (Unified Status: VOLUNTEER_DISPATCHED)
  const handleDispatchVolunteer = async (id, targetQuota = 1) => {
    try {
      setUpdatingId(id);
      const reqRef = doc(db, "sos_requests", id);
      await updateDoc(reqRef, {
        status: "VOLUNTEER_DISPATCHED",
        volunteerRequested: true,
        requiredVolunteers: targetQuota,
        dispatchedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Failed to dispatch volunteer:", err);
      alert(`Could not dispatch volunteer: ${err.message || "Unknown error"}`);
    } finally {
      setUpdatingId(null);
    }
  };

  // Update Volunteer Quota Needed
  const handleUpdateVolunteerQuota = async (id, newQuota) => {
    const quota = Math.max(1, Number(newQuota) || 1);
    try {
      setUpdatingId(id);
      const reqRef = doc(db, "sos_requests", id);
      await updateDoc(reqRef, {
        requiredVolunteers: quota,
        volunteerRequested: true,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Failed to update volunteer quota:", err);
    } finally {
      setUpdatingId(null);
    }
  };

  // Authority Action: Approve Hospital Registration (Flipping isVerified to true)
  const handleApproveHospital = async (hospitalId) => {
    try {
      setApprovingId(hospitalId);
      const hospRef = doc(db, "hospitals", hospitalId);
      await updateDoc(hospRef, {
        isVerified: true,
        verifiedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Failed to approve hospital registration:", err);
      alert(`Could not approve hospital: ${err.message || "Unknown error"}`);
    } finally {
      setApprovingId(null);
    }
  };

  // SOS Incident Metrics computation
  const pendingCount = requests.filter((r) => r.status === "pending" || !r.status).length;
  const dispatchedCount = requests.filter((r) => {
    const s = (r.status || "").toLowerCase();
    return s === "dispatched" || s === "in_progress" || r.status === "RESPONDER_EN_ROUTE" || r.volunteerRequested;
  }).length;
  const resolvedCount = requests.filter((r) => (r.status || "").toLowerCase() === "resolved").length;
  const totalCount = requests.length;

  // Hospital Metrics computation (Verified facilities only)
  const verifiedHospitals = hospitals.filter((h) => h.isVerified === true);
  const pendingHospitals = hospitals.filter((h) => !h.isVerified);

  const totalVerifiedHospitals = verifiedHospitals.length;
  const totalFreeBeds = verifiedHospitals.reduce((acc, h) => {
    const free = h.availableBeds !== undefined ? h.availableBeds : Math.max(0, (h.totalBeds || 0) - (h.occupiedBeds || 0));
    return acc + (h.isMaxOccupied ? 0 : free);
  }, 0);
  const totalStaffAvailable = verifiedHospitals.reduce((acc, h) => acc + (Number(h.staffCount) || 0), 0);
  const maxOccupancyCount = verifiedHospitals.filter((h) => h.isMaxOccupied).length;

  // Filtered requests based on selected tab state
  const filteredRequests = requests.filter((r) => {
    const currentStatus = (r.status || "pending").toLowerCase();
    if (filter === "all") return true;
    if (filter === "pending" || filter === "active") return currentStatus === "pending" || currentStatus === "active";
    if (filter === "dispatched") return currentStatus === "dispatched" || currentStatus === "in_progress" || r.status === "RESPONDER_EN_ROUTE" || r.volunteerRequested;
    if (filter === "resolved") return currentStatus === "resolved";
    return true;
  });

  // Emergency Alert Broadcasting Handlers
  const handleBroadcastAlert = async (e) => {
    e.preventDefault();
    if (!newAlertTitle.trim()) return;
    setBroadcastingAlert(true);
    try {
      await addDoc(collection(db, "alerts"), {
        title: newAlertTitle.trim(),
        severity: newAlertSeverity,
        affectedZone: newAlertZone.trim() || "All High-Risk Sectors",
        instructions: newAlertInstructions.trim() || "Evacuate low-lying areas immediately and head to designated shelters.",
        isActive: true,
        createdAt: serverTimestamp(),
      });
      setNewAlertTitle("");
      setNewAlertZone("");
      setNewAlertInstructions("");
      setShowAlertModal(false);
    } catch (err) {
      console.error("Failed to broadcast emergency alert:", err);
      alert(`Could not broadcast alert: ${err.message}`);
    } finally {
      setBroadcastingAlert(false);
    }
  };

  const handleToggleAlertActive = async (alertId, currentActive) => {
    try {
      await updateDoc(doc(db, "alerts", alertId), {
        isActive: !currentActive,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Failed to toggle alert status:", err);
    }
  };

  // Real-Time Resource Request Broadcast Handler
  const handleBroadcastResourceRequest = async (e) => {
    e.preventDefault();
    if (!resourceFormData.title.trim() || !resourceFormData.quantityNeeded || Number(resourceFormData.quantityNeeded) <= 0) {
      alert("Please provide a title and a valid quantity needed.");
      return;
    }

    setIsBroadcastingResource(true);
    try {
      const qNeeded = Number(resourceFormData.quantityNeeded);
      await addDoc(collection(db, "resource_requests"), {
        authorityId: "HQ-INCIDENT-COMMAND",
        type: resourceFormData.type, // 'goods' | 'services'
        category: resourceFormData.category,
        title: resourceFormData.title.trim(),
        description: resourceFormData.description.trim(),
        quantityNeeded: qNeeded,
        requiredQuantity: qNeeded,
        quantityFulfilled: 0,
        fulfilledQuantity: 0,
        unit: resourceFormData.unit || "units",
        urgency: resourceFormData.urgency || "CRITICAL",
        status: "OPEN", // 'OPEN' | 'PARTIALLY_FULFILLED' | 'CLOSED'
        location: {
          latitude: Number(resourceFormData.latitude) || 28.6139,
          longitude: Number(resourceFormData.longitude) || 77.209,
          address: resourceFormData.address.trim() || "Central Disaster Relief Hub",
          dropOffInstructions: resourceFormData.dropOffInstructions.trim() || "Report to Logistics Desk A.",
        },
        commitments: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setResourceFormData({
        type: "goods",
        category: "Food & Water",
        title: "",
        description: "",
        quantityNeeded: "",
        unit: "packs",
        urgency: "CRITICAL",
        address: "Central Disaster Relief Hub, Gate 2",
        dropOffInstructions: "Deliver to Logistics Desk A.",
        latitude: 28.6139,
        longitude: 77.209,
      });
      setShowResourceModal(false);
      alert("✅ Resource Request successfully broadcast to all active volunteers!");
    } catch (err) {
      console.error("Failed to broadcast resource request:", err);
      alert(`Could not broadcast resource request: ${err.message}`);
    } finally {
      setIsBroadcastingResource(false);
    }
  };

  return (
    <div className="eoc-container min-h-screen bg-slate-950 max-w-full overflow-x-hidden p-6">
      {/* 1. Header & Navigation */}
      <header className="eoc-navbar flex-wrap">
        <div className="eoc-brand">
          <div className="eoc-brand-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <div className="eoc-title-group">
            <h1 className="eoc-title">Authority Incident Command</h1>
            <span className="eoc-subtitle">Emergency Response & Dispatch System</span>
          </div>
        </div>

      </header>

      {/* Live Mass Emergency Flash Bar for Proximity Clusters */}
      {activeClusters.length > 0 && (
        <div className="eoc-flash-bar">
          <div className="eoc-flash-left">
            <div className="eoc-flash-icon-box">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </div>
            <div className="eoc-flash-title-group">
              <div className="eoc-flash-headline">
                <span className="eoc-flash-tag">
                  {activeClusters[0].severityLabel}
                </span>
                <span>
                  {activeClusters[0].victimCount} Active Victims Clustered within 500m
                </span>
              </div>
              <div className="eoc-flash-sub">
                Spatial Centroid: {activeClusters[0].centroid.lat.toFixed(4)}°, {activeClusters[0].centroid.lng.toFixed(4)}° • Occurred within last 15 minutes
              </div>
            </div>
          </div>

          <div className="eoc-flash-actions">
            <button
              className="eoc-flash-inspect-btn"
              onClick={() => {
                setSelectedCluster(activeClusters[0]);
                setActiveTab("risk");
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Inspect Priority Cluster & Hospital Telemetry &rarr;
            </button>
          </div>
        </div>
      )}

      {/* Top View Mode Tabs: Live SOS Requests vs Hospital Capacity vs Risk Analytics */}
      <nav className="eoc-view-tabs flex-wrap">
        <button
          className={`eoc-tab-btn ${activeTab === "incidents" ? "active" : ""}`}
          onClick={() => setActiveTab("incidents")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          Live SOS Requests
          <span className="eoc-tab-badge">{pendingCount} Active</span>
        </button>

        <button
          className={`eoc-tab-btn ${activeTab === "hospitals" ? "active" : ""}`}
          onClick={() => setActiveTab("hospitals")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
          Hospital Capacity
          <span className="eoc-tab-badge" style={{ color: totalFreeBeds > 0 ? "#34d399" : "#ff8080" }}>
            {totalFreeBeds} Beds Free
          </span>
          {pendingHospitals.length > 0 && (
            <span
              style={{
                fontSize: "0.72rem",
                background: "#EF4444",
                color: "#FFFFFF",
                padding: "2px 6px",
                borderRadius: "10px",
                fontWeight: 800,
              }}
            >
              {pendingHospitals.length} Pending
            </span>
          )}
        </button>

        <button
          className={`eoc-tab-btn ${activeTab === "risk" ? "active" : ""}`}
          onClick={() => setActiveTab("risk")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          Risk Analytics
          <span className="eoc-tab-badge" style={{ color: "#EF4444" }}>
            {riskSummary.criticalCount} Critical
          </span>
        </button>

        <button
          className={`eoc-tab-btn ${activeTab === "shelters" ? "active" : ""}`}
          onClick={() => setActiveTab("shelters")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          Shelter Tracker
          <span className="eoc-tab-badge" style={{ color: "#38BDF8" }}>
            {shelters.length} Shelters
          </span>
        </button>

        <button
          className={`eoc-tab-btn ${activeTab === "map" ? "active" : ""}`}
          onClick={() => setActiveTab("map")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
            <line x1="8" y1="2" x2="8" y2="18" />
            <line x1="16" y1="6" x2="16" y2="22" />
          </svg>
          Route Overlay Map
        </button>

        <button
          className={`eoc-tab-btn ${activeTab === "feed" ? "active" : ""}`}
          onClick={() => setActiveTab("feed")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
          Citizen Feed
          <span className="eoc-tab-badge" style={{ color: "#34D399" }}>
            Live
          </span>
        </button>

        {/* Resource Matchmaking & Demands Tab */}
        <button
          className={`eoc-tab-btn ${activeTab === "resources" ? "active" : ""}`}
          onClick={() => setActiveTab("resources")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
          Resource Matchmaking
          <span className="eoc-tab-badge" style={{ color: "#34D399" }}>
            {resourceRequests.filter((r) => r.status !== "CLOSED").length} Active
          </span>
        </button>

        {/* Emergency Alert & Resource Broadcast Button Group */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <button
            type="button"
            className="eoc-tab-btn"
            style={{
              background: "linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(5, 150, 105, 0.15))",
              color: "#6EE7B7",
              border: "1px solid #10B981",
              fontWeight: 800,
            }}
            onClick={() => setShowResourceModal(true)}
          >
            📦 Broadcast Need
          </button>

          <button
            type="button"
            className="eoc-tab-btn"
            style={{
              background: "rgba(220, 38, 38, 0.2)",
              color: "#FCA5A5",
              border: "1px solid #EF4444",
              fontWeight: 800,
            }}
            onClick={() => setShowAlertModal(true)}
          >
            📢 Broadcast Warning
            {alerts.filter((a) => a.isActive !== false).length > 0 && (
              <span className="eoc-tab-badge" style={{ background: "#EF4444", color: "#FFFFFF" }}>
                {alerts.filter((a) => a.isActive !== false).length} Active
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="eoc-content">
        {/* ========================================================================= */}
        {/* VIEW 1: ACTIVE SOS INCIDENT COMMAND                                       */}
        {/* ========================================================================= */}
        {activeTab === "incidents" && (
          <>
            {/* Real-time Active Resource Drives & Fulfillment Progress Bar Strip */}
            {resourceRequests.length > 0 && (
              <div style={{
                background: "rgba(15, 23, 42, 0.75)",
                border: "1px solid rgba(51, 65, 85, 0.8)",
                borderRadius: "12px",
                padding: "12px 16px",
                marginBottom: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                boxShadow: "0 4px 16px rgba(0, 0, 0, 0.3)"
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "16px" }}>📦</span>
                    <span style={{ fontSize: "0.85rem", fontWeight: 800, color: "#F1F5F9", letterSpacing: "0.3px" }}>
                      ACTIVE RESOURCE DRIVES & AID MATCHMAKING
                    </span>
                    <span style={{
                      fontSize: "0.7rem",
                      fontWeight: 800,
                      background: "rgba(16, 185, 129, 0.2)",
                      color: "#34D399",
                      border: "1px solid rgba(16, 185, 129, 0.4)",
                      padding: "2px 8px",
                      borderRadius: "12px"
                    }}>
                      {resourceRequests.filter(r => r.status !== "CLOSED").length} Active Needs
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <button
                      type="button"
                      onClick={() => setShowResourceModal(true)}
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 800,
                        background: "#10B981",
                        color: "#FFFFFF",
                        border: "none",
                        borderRadius: "6px",
                        padding: "4px 10px",
                        cursor: "pointer"
                      }}
                    >
                      + Broadcast Request
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("resources")}
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        background: "rgba(30, 41, 59, 0.8)",
                        color: "#94A3B8",
                        border: "1px solid #334155",
                        borderRadius: "6px",
                        padding: "4px 10px",
                        cursor: "pointer"
                      }}
                    >
                      Manage All &rarr;
                    </button>
                  </div>
                </div>

                {/* Horizontal Drive Cards with Live Progress Bars */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "10px" }}>
                  {resourceRequests.slice(0, 4).map((resItem) => {
                    const qN = resItem.quantityNeeded || resItem.requiredQuantity || 1;
                    const qF = resItem.quantityFulfilled || resItem.fulfilledQuantity || 0;
                    const pct = Math.min(100, Math.round((qF / qN) * 100));
                    const isCritical = resItem.urgency === "CRITICAL";

                    return (
                      <div key={resItem.id} style={{
                        background: "rgba(2, 6, 23, 0.6)",
                        border: `1px solid ${isCritical ? "rgba(239, 68, 68, 0.4)" : "rgba(51, 65, 85, 0.5)"}`,
                        borderRadius: "8px",
                        padding: "8px 12px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px"
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{
                            fontSize: "0.7rem",
                            fontWeight: 800,
                            color: resItem.type === "goods" ? "#34D399" : "#60A5FA",
                            textTransform: "uppercase"
                          }}>
                            {resItem.type === "goods" ? "📦 Goods" : "🤝 Service"} • {resItem.category}
                          </span>
                          <span style={{
                            fontSize: "0.68rem",
                            fontWeight: 900,
                            color: isCritical ? "#EF4444" : "#F59E0B"
                          }}>
                            {resItem.urgency}
                          </span>
                        </div>

                        <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#FFFFFF", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {resItem.title}
                        </div>

                        {/* Progress Bar */}
                        <div style={{ width: "100%", background: "#1E293B", borderRadius: "9999px", height: "6px", overflow: "hidden" }}>
                          <div style={{
                            width: `${pct}%`,
                            height: "100%",
                            background: pct >= 100 ? "#10B981" : pct >= 50 ? "#F59E0B" : "#EF4444",
                            borderRadius: "9999px",
                            transition: "width 0.3s ease"
                          }} />
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "#94A3B8" }}>
                          <span>{qF} / {qN} {resItem.unit || "units"}</span>
                          <span style={{ fontWeight: 800, color: pct >= 100 ? "#34D399" : "#FCD34D" }}>{pct}% Fulfilled</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Interactive Toolbar & Filter Bar */}
            <div className="eoc-toolbar">
              <div className="eoc-filter-bar" role="tablist" aria-label="Incident status filters">
                <button
                  role="tab"
                  aria-selected={filter === "all"}
                  className={`eoc-filter-btn ${filter === "all" ? "active" : ""}`}
                  onClick={() => setFilter("all")}
                >
                  All
                  <span className="eoc-filter-count">{totalCount}</span>
                </button>
                <button
                  role="tab"
                  aria-selected={filter === "pending" || filter === "active"}
                  className={`eoc-filter-btn ${filter === "pending" || filter === "active" ? "active" : ""}`}
                  onClick={() => setFilter("pending")}
                >
                  Active/Pending
                  <span className="eoc-filter-count">{pendingCount}</span>
                </button>
                <button
                  role="tab"
                  aria-selected={filter === "dispatched"}
                  className={`eoc-filter-btn ${filter === "dispatched" ? "active" : ""}`}
                  onClick={() => setFilter("dispatched")}
                >
                  Dispatched
                  <span className="eoc-filter-count">{dispatchedCount}</span>
                </button>
                <button
                  role="tab"
                  aria-selected={filter === "in_progress"}
                  className={`eoc-filter-btn ${filter === "in_progress" ? "active" : ""}`}
                  onClick={() => setFilter("in_progress")}
                >
                  In Progress / On Scene
                  <span className="eoc-filter-count">
                    {requests.filter((r) => getUnifiedStatus(r) === "IN_PROGRESS").length}
                  </span>
                </button>
                <button
                  role="tab"
                  aria-selected={filter === "resolved"}
                  className={`eoc-filter-btn ${filter === "resolved" ? "active" : ""}`}
                  onClick={() => setFilter("resolved")}
                >
                  Resolved
                  <span className="eoc-filter-count">{resolvedCount}</span>
                </button>
              </div>

              <div className="eoc-stats-summary">
                <div className="eoc-stat-item">
                  <span>Active/Pending:</span>
                  <span className="eoc-stat-value" style={{ color: "#ff8080" }}>{pendingCount}</span>
                </div>
                <div className="eoc-stat-item">
                  <span>Dispatched:</span>
                  <span className="eoc-stat-value" style={{ color: "#fcd34d" }}>{dispatchedCount}</span>
                </div>
                <div className="eoc-stat-item">
                  <span>Resolved:</span>
                  <span className="eoc-stat-value" style={{ color: "#6ee7b7" }}>{resolvedCount}</span>
                </div>
              </div>
            </div>

            {/* 2. Responsive CSS Grid for Incident Cards */}
            {loading ? (
              <div className="eoc-empty-state">
                <div className="eoc-empty-icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="spin-loader">
                    <line x1="12" y1="2" x2="12" y2="6"></line>
                    <line x1="12" y1="18" x2="12" y2="22"></line>
                    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
                    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
                    <line x1="2" y1="12" x2="6" y2="12"></line>
                    <line x1="18" y1="12" x2="22" y2="12"></line>
                    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
                    <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
                  </svg>
                </div>
                <h3 className="eoc-empty-title">Connecting to Operations Feed...</h3>
                <p className="eoc-empty-desc">Establishing real-time connection with incoming SOS transmissions.</p>
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="eoc-empty-state">
                <div className="eoc-empty-icon">
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                </div>
                <h3 className="eoc-empty-title">No Incident Reports in "{filter.toUpperCase()}"</h3>
                <p className="eoc-empty-desc">
                  {filter === "all"
                    ? "No SOS transmissions have been recorded yet."
                    : `There are currently no incidents in the ${filter} status queue.`}
                </p>
              </div>
            ) : (
              <div className="eoc-grid">
                {filteredRequests.map((req) => {
                  const currentStatus = req.status || "pending";
                  const typeKey = (req.type || "other").toLowerCase();
                  const typeClass = typeKey.includes("med")
                    ? "type-medical"
                    : typeKey.includes("fire")
                    ? "type-fire"
                    : typeKey.includes("trap")
                    ? "type-trapped"
                    : "type-other";

                  const severityClass = currentStatus === "resolved"
                    ? "severity-resolved"
                    : currentStatus === "dispatched" || currentStatus === "in_progress"
                    ? "severity-dispatched"
                    : "severity-pending";

                  const hasCoordinates = req.location && req.location.lat !== undefined && req.location.lng !== undefined;
                  const formattedCoords = hasCoordinates
                    ? `${Number(req.location.lat).toFixed(5)}, ${Number(req.location.lng).toFixed(5)}`
                    : null;
                  const mapsUrl = hasCoordinates
                    ? `https://www.google.com/maps?q=${req.location.lat},${req.location.lng}`
                    : null;
                  const assignedVolunteers = Array.isArray(req.assignedVolunteers)
                    ? req.assignedVolunteers
                    : req.assignedVolunteer
                    ? [req.assignedVolunteer]
                    : req.responder
                    ? [req.responder]
                    : [];

                  const requiredVolunteers = Number(req.requiredVolunteers || req.volunteersNeeded) || 1;
                  const assignedCount = assignedVolunteers.length;
                  const isFull = assignedCount >= requiredVolunteers;

                  return (
                    <div key={req.id} className={`eoc-card ${severityClass}`}>
                      {/* Card Header */}
                      <div className="eoc-card-header">
                        <div className="eoc-badge-group">
                          <span className={`eoc-type-badge ${typeClass}`}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                              <circle cx="12" cy="12" r="10"/>
                            </svg>
                            {req.category || (req.type ? req.type.toUpperCase() : "GENERAL SOS")}
                          </span>

                          {/* Automated Priority Tagging: Red Critical Priority Badge */}
                          {isCriticalPriority(req) && (
                            <span
                              className="eoc-priority-badge-critical"
                              style={{
                                background: "rgba(220, 38, 38, 0.2)",
                                color: "#EF4444",
                                border: "1px solid #DC2626",
                                fontWeight: 800,
                                fontSize: "0.74rem",
                                padding: "2px 8px",
                                borderRadius: "6px",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "5px",
                                letterSpacing: "0.4px",
                              }}
                            >
                              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#EF4444", display: "inline-block" }} />
                              CRITICAL PRIORITY
                            </span>
                          )}

                          {/* Dynamic Header Status Badge: Progress & Quota */}
                          {assignedCount > 0 ? (
                            <span
                              className="eoc-status-badge"
                              style={{
                                background: isFull ? "rgba(16, 185, 129, 0.2)" : "rgba(245, 158, 11, 0.2)",
                                color: isFull ? "#10B981" : "#F59E0B",
                                border: `1px solid ${isFull ? "#10B981" : "#F59E0B"}`,
                                fontWeight: 800,
                                fontSize: "0.74rem",
                                padding: "2px 8px",
                                borderRadius: "6px",
                              }}
                            >
                              🤝 {assignedCount}/{requiredVolunteers} VOLUNTEERS RESPONDING
                            </span>
                          ) : req.volunteerRequested || req.status === "DISPATCHED" || currentStatus === "dispatched" ? (
                            <span
                              className="eoc-status-badge status-dispatched"
                              style={{
                                background: "rgba(245, 158, 11, 0.15)",
                                color: "#F59E0B",
                                border: "1px solid #F59E0B",
                                fontWeight: 800,
                                fontSize: "0.74rem",
                                padding: "2px 8px",
                                borderRadius: "6px",
                              }}
                            >
                              📢 0/{requiredVolunteers} VOLUNTEERS REQUESTED
                            </span>
                          ) : (
                            <span className={`eoc-status-badge status-${currentStatus}`}>
                              {currentStatus === "in_progress" ? "IN PROGRESS" : currentStatus.toUpperCase()}
                            </span>
                          )}
                        </div>

                        <span className="eoc-timestamp" title={req.createdAt?.toDate ? req.createdAt.toDate().toLocaleString() : ""}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                          </svg>
                          {formatTimeAgo(req.createdAt)}
                        </span>
                      </div>

                      {/* Card Content */}
                      <div className="eoc-card-body">
                        {/* Visual 4-Step Incident Lifecycle Progress Stepper */}
                        <IncidentLifecycleStepper status={req.status || (req.volunteerRequested ? "VOLUNTEER_DISPATCHED" : "PENDING")} />

                        {/* Location Coordinates */}
                        <div className="eoc-location-row">
                          <span className="eoc-location-label">
                            <svg className="eoc-pin-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                              <circle cx="12" cy="10" r="3"></circle>
                            </svg>
                            GPS Fix:
                          </span>
                          {hasCoordinates ? (
                            <a
                              href={mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="eoc-coords"
                              title="Open coordinate location in Google Maps"
                            >
                              {formattedCoords}
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                <polyline points="15 3 21 3 21 9"></polyline>
                                <line x1="10" y1="14" x2="21" y2="3"></line>
                              </svg>
                            </a>
                          ) : (
                            <span className="eoc-coords-unavailable">Coordinates unavailable</span>
                          )}
                        </div>

                        {/* Assigned Volunteer Dynamic Roster */}
                        {assignedVolunteers.length > 0 && (
                          <div style={{ background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(148, 163, 184, 0.2)", borderRadius: "8px", padding: "10px 12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(148, 163, 184, 0.15)", paddingBottom: "4px" }}>
                              <span style={{ fontSize: "11px", fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                Assigned Responders ({assignedCount}/{requiredVolunteers})
                              </span>
                              <span style={{ fontSize: "11px", fontWeight: 700, color: isFull ? "#10B981" : "#F59E0B" }}>
                                {isFull ? "✓ QUOTA FILLED" : `${requiredVolunteers - assignedCount} MORE NEEDED`}
                              </span>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                              {assignedVolunteers.map((vol, idx) => (
                                <div key={vol.responderId || vol.volunteerId || idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(30, 41, 59, 0.6)", padding: "6px 10px", borderRadius: "6px" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                    <span style={{ fontSize: "13px" }}>👤</span>
                                    <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#F8FAFC" }}>
                                      {vol.name || `Volunteer ${idx + 1}`}
                                    </span>
                                    <span style={{ fontSize: "10.5px", color: "#94A3B8", background: "rgba(255,255,255,0.08)", padding: "1px 5px", borderRadius: "4px" }}>
                                      {vol.responderId || vol.volunteerId || "VOL-1024"}
                                    </span>
                                  </div>
                                  {vol.phone ? (
                                    <a href={`tel:${vol.phone}`} style={{ fontSize: "11.5px", fontWeight: 700, color: "#38BDF8", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "3px" }}>
                                      📞 {vol.phone}
                                    </a>
                                  ) : (
                                    <span style={{ fontSize: "11px", color: "#64748B" }}>Radio Dispatch</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Caller Notes */}
                        <blockquote className="eoc-notes-box">
                          <div className="eoc-notes-label">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                            </svg>
                            Caller Transmission Notes
                          </div>
                          {req.note && req.note.trim().length > 0 ? (
                            <div className="eoc-notes-text">"{req.note}"</div>
                          ) : (
                            <div className="eoc-notes-empty">No additional caller notes provided.</div>
                          )}
                        </blockquote>

                        {/* Incident Photo Thumbnail — only rendered when a photo exists */}
                        {req.photoBase64 && (
                          <button
                            type="button"
                            className="eoc-thumb-btn"
                            onClick={() => setLightboxSrc(req.photoBase64)}
                            title="Click to view full-size"
                          >
                            <img
                              src={req.photoBase64}
                              alt="Incident photo"
                              className="eoc-thumb-img"
                            />
                            <span className="eoc-thumb-expand-icon">⛶</span>
                          </button>
                        )}
                      </div>

                      {/* Action Controls & Volunteer Quota Selector */}
                      <div className="eoc-card-footer" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        {currentStatus !== "resolved" && (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "rgba(15, 23, 42, 0.5)", border: "1px solid rgba(148, 163, 184, 0.15)", borderRadius: "8px", padding: "6px 10px" }}>
                            <span style={{ fontSize: "12px", fontWeight: 700, color: "#94A3B8" }}>
                              Volunteers Needed:
                            </span>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <button
                                type="button"
                                style={{ width: "26px", height: "26px", background: "#1E293B", border: "1px solid #475569", color: "#FFF", borderRadius: "6px", cursor: "pointer", fontWeight: 800, fontSize: "14px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                                onClick={() => handleUpdateVolunteerQuota(req.id, Math.max(1, requiredVolunteers - 1))}
                                disabled={updatingId === req.id || requiredVolunteers <= 1}
                                title="Decrease quota"
                              >
                                -
                              </button>
                              <span style={{ fontSize: "13px", fontWeight: 800, color: "#38BDF8", minWidth: "22px", textAlign: "center" }}>
                                {requiredVolunteers}
                              </span>
                              <button
                                type="button"
                                style={{ width: "26px", height: "26px", background: "#1E293B", border: "1px solid #475569", color: "#FFF", borderRadius: "6px", cursor: "pointer", fontWeight: 800, fontSize: "14px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                                onClick={() => handleUpdateVolunteerQuota(req.id, requiredVolunteers + 1)}
                                disabled={updatingId === req.id}
                                title="Increase quota"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        )}

                        <div style={{ display: "flex", gap: "8px", width: "100%" }}>
                          {currentStatus !== "resolved" && !isFull && (
                            <button
                              className="eoc-btn eoc-btn-dispatch"
                              onClick={() => handleDispatchVolunteer(req.id, requiredVolunteers)}
                              disabled={updatingId === req.id}
                              style={{ flex: 1 }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="5 3 19 12 5 21 5 3"></polygon>
                              </svg>
                              {updatingId === req.id
                                ? "Dispatching..."
                                : req.volunteerRequested || req.status === "DISPATCHED" || currentStatus === "dispatched"
                                ? "Request More Volunteers ✓"
                                : `Dispatch ${requiredVolunteers} Volunteer${requiredVolunteers > 1 ? "s" : ""}`}
                            </button>
                          )}

                          {currentStatus !== "resolved" && (
                            <button
                              className="eoc-btn eoc-btn-resolve"
                              onClick={() => handleUpdateStatus(req.id, "resolved")}
                              disabled={updatingId === req.id}
                              style={{ flex: isFull ? 1 : undefined }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12"></polyline>
                              </svg>
                              {updatingId === req.id ? "Updating..." : "Mark Resolved"}
                            </button>
                          )}
                        </div>

                        {currentStatus === "resolved" && (
                          <button
                            className="eoc-btn eoc-btn-reopen"
                            onClick={() => handleUpdateStatus(req.id, "pending")}
                            disabled={updatingId === req.id}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="1 4 1 10 7 10"></polyline>
                              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                            </svg>
                            {updatingId === req.id ? "Reopening..." : "Reopen / Mark Pending"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ========================================================================= */}
        {/* VIEW 2: HOSPITAL CAPACITY MONITOR (STRICTLY READ-ONLY)                    */}
        {/* ========================================================================= */}
        {activeTab === "hospitals" && (
          <div>
            {/* KPI Summary Row */}
            <div className="eoc-kpi-grid">
              <div className="eoc-kpi-card">
                <span className="eoc-kpi-label">Verified Facilities</span>
                <span className="eoc-kpi-val" style={{ color: "#38BDF8" }}>{totalVerifiedHospitals}</span>
                <span className="eoc-kpi-sub">Active in emergency grid</span>
              </div>

              <div className="eoc-kpi-card">
                <span className="eoc-kpi-label">Total Available Beds</span>
                <span className="eoc-kpi-val" style={{ color: totalFreeBeds > 10 ? "#34D399" : "#F59E0B" }}>
                  {totalFreeBeds}
                </span>
                <span className="eoc-kpi-sub">Ready for immediate intake</span>
              </div>

              <div className="eoc-kpi-card">
                <span className="eoc-kpi-label">Staff for Minor Trauma</span>
                <span className="eoc-kpi-val" style={{ color: "#818CF8" }}>{totalStaffAvailable}</span>
                <span className="eoc-kpi-sub">Personnel on duty</span>
              </div>

              <div className="eoc-kpi-card">
                <span className="eoc-kpi-label">Max Occupancy Alerts</span>
                <span className="eoc-kpi-val" style={{ color: maxOccupancyCount > 0 ? "#EF4444" : "#10B981" }}>
                  {maxOccupancyCount}
                </span>
                <span className="eoc-kpi-sub">{maxOccupancyCount > 0 ? "Bypass rerouting active" : "All facilities accepting"}</span>
              </div>
            </div>

            {/* SECTION A: PENDING HOSPITAL APPROVALS QUEUE */}
            {pendingHospitals.length > 0 && (
              <div style={{ marginBottom: "28px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                  <span style={{
                    background: "rgba(245, 158, 11, 0.2)",
                    color: "#f59e0b",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    fontWeight: 800,
                    fontSize: "0.82rem",
                    textTransform: "uppercase"
                  }}>
                    Action Required
                  </span>
                  <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "#ffffff" }}>
                    Pending Hospital Registrations ({pendingHospitals.length})
                  </h3>
                </div>

                <div className="eoc-grid">
                  {pendingHospitals.map((hosp) => (
                    <div
                      key={hosp.id}
                      className="eoc-card"
                      style={{ borderLeft: "6px solid #F59E0B", background: "#191D26" }}
                    >
                      <div className="eoc-card-header">
                        <div>
                          <h4 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "#ffffff" }}>
                            {hosp.hospitalName || "Unnamed Hospital"}
                          </h4>
                          <span style={{ fontSize: "0.75rem", color: "#f59e0b", fontWeight: 700 }}>
                            PENDING VERIFICATION
                          </span>
                        </div>
                        <span className="eoc-timestamp">{formatTimeAgo(hosp.createdAt)}</span>
                      </div>

                      <div className="eoc-card-body">
                        <div className="eoc-hosp-stats">
                          <div className="eoc-hosp-stat-box">
                            <span className="eoc-hosp-stat-label">Reported Total Beds</span>
                            <span className="eoc-hosp-stat-val">{hosp.totalBeds || 0}</span>
                          </div>
                          <div className="eoc-hosp-stat-box">
                            <span className="eoc-hosp-stat-label">Minor Injury Staff</span>
                            <span className="eoc-hosp-stat-val" style={{ color: "#38bdf8" }}>{hosp.staffCount || 0}</span>
                          </div>
                        </div>

                        <div className="eoc-location-row">
                          <span className="eoc-location-label">
                            <svg className="eoc-pin-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                              <circle cx="12" cy="10" r="3"></circle>
                            </svg>
                            Registered GPS:
                          </span>
                          <span style={{ fontFamily: "JetBrains Mono", fontSize: "0.85rem", color: "#58A6FF" }}>
                            {hosp.location ? `${hosp.location.lat}, ${hosp.location.lng}` : "Location pending"}
                          </span>
                        </div>
                      </div>

                      <div className="eoc-card-footer">
                        <button
                          className="eoc-btn eoc-btn-resolve"
                          onClick={() => handleApproveHospital(hosp.id)}
                          disabled={approvingId === hosp.id}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                          {approvingId === hosp.id ? "Approving..." : "Approve Hospital Registration"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SECTION B: VERIFIED HOSPITAL READINESS GRID (READ-ONLY) */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "#ffffff" }}>
                Active Emergency Hospital Network (Read-Only Monitor)
              </h3>
              <span style={{ fontSize: "0.8rem", color: "var(--eoc-text-muted)" }}>
                Write permissions locked to verified hospital staff
              </span>
            </div>

            {verifiedHospitals.length === 0 ? (
              <div className="eoc-empty-state">
                <div className="eoc-empty-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                  </svg>
                </div>
                <h3 className="eoc-empty-title">No Verified Hospital Facilities</h3>
                <p className="eoc-empty-desc">
                  {pendingHospitals.length > 0
                    ? "Approve the pending hospital registrations above to display their capacity telemetry."
                    : "No hospital facilities are registered yet. Hospitals can register via the Hospital Portal."}
                </p>
              </div>
            ) : (
              <div className="eoc-grid">
                {verifiedHospitals.map((hosp) => {
                  const total = Number(hosp.totalBeds) || 0;
                  const occupied = Number(hosp.occupiedBeds) || 0;
                  const free = hosp.availableBeds !== undefined ? Number(hosp.availableBeds) : Math.max(0, total - occupied);
                  const isMax = Boolean(hosp.isMaxOccupied) || (total > 0 && occupied >= total);
                  const utilization = total > 0 ? Math.round((occupied / total) * 100) : 0;

                  const statusClass = isMax
                    ? "hospital-max"
                    : free <= 3
                    ? "hospital-warning"
                    : "hospital-available";

                  const badgeStatusClass = isMax
                    ? "status-max"
                    : free <= 3
                    ? "status-critical"
                    : "status-available";

                  const hasCoordinates = hosp.location && hosp.location.lat !== undefined && hosp.location.lng !== undefined;
                  const formattedCoords = hasCoordinates
                    ? `${Number(hosp.location.lat).toFixed(5)}, ${Number(hosp.location.lng).toFixed(5)}`
                    : null;
                  const mapsUrl = hasCoordinates
                    ? `https://www.google.com/maps?q=${hosp.location.lat},${hosp.location.lng}`
                    : null;

                  return (
                    <div key={hosp.id} className={`eoc-card ${statusClass}`}>
                      {/* Header: Name & Status Badge */}
                      <div className="eoc-card-header">
                        <div className="eoc-badge-group">
                          <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "#ffffff" }}>
                            {hosp.hospitalName || "Unnamed Hospital"}
                          </h3>
                          <span className={`eoc-status-badge ${badgeStatusClass}`}>
                            {isMax ? "MAX OCCUPANCY" : free <= 3 ? "CRITICAL SURGE" : "VERIFIED & ACCEPTING"}
                          </span>
                        </div>

                        <span className="eoc-timestamp" title={hosp.updatedAt?.toDate ? hosp.updatedAt.toDate().toLocaleString() : ""}>
                          {formatTimeAgo(hosp.updatedAt)}
                        </span>
                      </div>

                      {/* Body: Read-only Bed stats, progress bar, staff count, GPS */}
                      <div className="eoc-card-body">
                        {/* Bed Capacity Counters */}
                        <div className="eoc-hosp-stats">
                          <div className="eoc-hosp-stat-box">
                            <span className="eoc-hosp-stat-label">Available Free Beds</span>
                            <span
                              className="eoc-hosp-stat-val"
                              style={{ color: isMax ? "#EF4444" : free > 5 ? "#34D399" : "#F59E0B" }}
                            >
                              {isMax ? "0 (FULL)" : free}
                            </span>
                          </div>

                          <div className="eoc-hosp-stat-box">
                            <span className="eoc-hosp-stat-label">Total Bed Registry</span>
                            <span className="eoc-hosp-stat-val">{total}</span>
                          </div>
                        </div>

                        {/* Capacity Progress Bar */}
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "var(--eoc-text-muted)", marginBottom: "4px" }}>
                            <span>Occupancy: {occupied} / {total} beds in use</span>
                            <span style={{ fontWeight: 700, color: isMax ? "#EF4444" : "#ffffff" }}>{utilization}%</span>
                          </div>
                          <div style={{ height: "8px", background: "var(--eoc-card-inner)", borderRadius: "4px", overflow: "hidden", border: "1px solid var(--eoc-border)" }}>
                            <div
                              style={{
                                height: "100%",
                                width: `${Math.min(100, utilization)}%`,
                                background: isMax ? "#EF4444" : utilization >= 80 ? "#F59E0B" : "#10B981",
                                transition: "width 0.3s ease",
                              }}
                            />
                          </div>
                        </div>

                        {/* Staff count on duty */}
                        <div className="eoc-location-row">
                          <span className="eoc-location-label">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                              <circle cx="9" cy="7" r="4"></circle>
                              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                            </svg>
                            Minor Injury Staff:
                          </span>
                          <span style={{ fontFamily: "JetBrains Mono", fontWeight: 700, color: "#38bdf8" }}>
                            {hosp.staffCount || 0} Personnel
                          </span>
                        </div>

                        {/* Location Coordinates with Ambulance Route Link */}
                        <div className="eoc-location-row">
                          <span className="eoc-location-label">
                            <svg className="eoc-pin-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                              <circle cx="12" cy="10" r="3"></circle>
                            </svg>
                            Dispatch GPS Fix:
                          </span>
                          {hasCoordinates ? (
                            <a
                              href={mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="eoc-coords"
                              title="Route ambulance in Google Maps"
                            >
                              {formattedCoords}
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                <polyline points="15 3 21 3 21 9"></polyline>
                                <line x1="10" y1="14" x2="21" y2="3"></line>
                              </svg>
                            </a>
                          ) : (
                            <span className="eoc-coords-unavailable">GPS fix not registered</span>
                          )}
                        </div>
                      </div>

                      {/* Footer: Strictly Read-Only Status Indicator */}
                      <div className="eoc-card-footer" style={{ justifyContent: "center" }}>
                        <span style={{ fontSize: "0.78rem", color: "var(--eoc-text-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                          </svg>
                          Verified Telemetry Stream • Read-Only
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 3: RISK ANALYTICS                                                    */}
        {/* ========================================================================= */}
        {activeTab === "risk" && (
          <RiskAnalyticsPanel
            allZones={allZones}
            riskSummary={riskSummary}
            riskSearch={riskSearch}
            setRiskSearch={setRiskSearch}
            riskLevelFilter={riskLevelFilter}
            setRiskLevelFilter={setRiskLevelFilter}
            riskSortField={riskSortField}
            setRiskSortField={setRiskSortField}
            requests={requests}
            hospitals={verifiedHospitals}
            shelters={shelters}
            activeClusters={activeClusters}
            selectedCluster={selectedCluster}
            setSelectedCluster={setSelectedCluster}
          />
        )}

        {/* ========================================================================= */}
        {/* VIEW 4: SHELTER & RESOURCE TRACKER                                        */}
        {/* ========================================================================= */}
        {activeTab === "shelters" && (
          <div style={{ width: "100%", marginTop: "10px" }}>
            <ShelterTracker isEmbedded={true} />
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 5: DISASTER ROUTE OVERLAY MAP                                        */}
        {/* ========================================================================= */}
        {activeTab === "map" && (
          <div style={{ width: "100%", marginTop: "10px" }}>
            <DisasterMap isEmbedded={true} />
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 6: CROWDSOURCED DISASTER FEED                                        */}
        {/* ========================================================================= */}
        {activeTab === "feed" && (
          <div style={{ width: "100%", marginTop: "10px" }}>
            <DisasterFeed isAuthorityView={true} />
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 7: RESOURCE DRIVES & VOLUNTEER MATCHMAKING                            */}
        {/* ========================================================================= */}
        {activeTab === "resources" && (
          <div style={{ width: "100%", marginTop: "10px" }}>
            <AuthorityResourcePublisher />
          </div>
        )}
      </main>

      {/* Cluster Detail Drawer & Emergency Dispatch Sidebar */}
      {selectedCluster && (
        <ClusterDetailDrawer
          cluster={selectedCluster}
          hospitals={verifiedHospitals}
          onClose={() => setSelectedCluster(null)}
          onDispatch={handleBatchDispatchCluster}
          isDispatching={dispatchingClusterId === selectedCluster.id}
        />
      )}

      {/* ============================================================ */}
      {/* FULLSCREEN PHOTO LIGHTBOX                                     */}
      {/* ============================================================ */}
      {lightboxSrc && (
        <div
          className="eoc-lightbox-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Incident photo full screen"
          onClick={() => setLightboxSrc(null)}
        >
          <button
            type="button"
            className="eoc-lightbox-close"
            onClick={() => setLightboxSrc(null)}
            aria-label="Close lightbox"
          >
            ✕
          </button>
          <img
            src={lightboxSrc}
            alt="Incident media full screen"
            className="eoc-lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* ============================================================ */}
      {/* EMERGENCY ALERT BROADCAST MODAL                                */}
      {/* ============================================================ */}
      {showAlertModal && (
        <div className="risk-modal-overlay" onClick={() => setShowAlertModal(false)}>
          <div className="risk-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "580px" }}>
            <div className="risk-modal-header" style={{ borderBottom: "1px solid #30363D" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ background: "rgba(239, 68, 68, 0.2)", color: "#EF4444", padding: "4px 8px", borderRadius: "6px", fontWeight: 800, fontSize: "0.8rem" }}>
                  📢 EMERGENCY ALERT SYSTEM
                </span>
                <h3 style={{ margin: 0, color: "#FFFFFF", fontSize: "1.1rem" }}>
                  Broadcast Citizen Warning
                </h3>
              </div>
              <button
                type="button"
                className="risk-modal-close"
                onClick={() => setShowAlertModal(false)}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleBroadcastAlert} style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ fontSize: "0.82rem", color: "#94A3B8", fontWeight: 700, display: "block", marginBottom: "4px" }}>
                  Alert Title <span style={{ color: "#EF4444" }}>*</span>
                </label>
                <input
                  type="text"
                  className="eoc-search-input"
                  style={{ width: "100%", boxSizing: "border-box" }}
                  placeholder="e.g. RED FLASH FLOOD WARNING & DAM DISCHARGE"
                  value={newAlertTitle}
                  onChange={(e) => setNewAlertTitle(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: "flex", gap: "12px" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "0.82rem", color: "#94A3B8", fontWeight: 700, display: "block", marginBottom: "4px" }}>
                    Severity Level
                  </label>
                  <select
                    className="eoc-search-input"
                    style={{ width: "100%", background: "#0D1117", color: "#FFFFFF", boxSizing: "border-box" }}
                    value={newAlertSeverity}
                    onChange={(e) => setNewAlertSeverity(e.target.value)}
                  >
                    <option value="CRITICAL">🔴 CRITICAL (Flashing Red Banner)</option>
                    <option value="HIGH">🟡 HIGH (Urgent Warning)</option>
                    <option value="ADVISORY">🔵 ADVISORY (Precautionary)</option>
                  </select>
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "0.82rem", color: "#94A3B8", fontWeight: 700, display: "block", marginBottom: "4px" }}>
                    Affected Sector / Zone
                  </label>
                  <input
                    type="text"
                    className="eoc-search-input"
                    style={{ width: "100%", boxSizing: "border-box" }}
                    placeholder="e.g. Wakad / Sangvi / Mula Basin"
                    value={newAlertZone}
                    onChange={(e) => setNewAlertZone(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: "0.82rem", color: "#94A3B8", fontWeight: 700, display: "block", marginBottom: "4px" }}>
                  Actionable Evacuation Instructions
                </label>
                <textarea
                  className="eoc-search-input"
                  style={{ width: "100%", minHeight: "70px", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }}
                  placeholder="e.g. Move immediately to high ground. Ravet & Wakad relief centers are active and open."
                  value={newAlertInstructions}
                  onChange={(e) => setNewAlertInstructions(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="eoc-batch-dispatch-btn"
                style={{ background: "#EF4444", borderColor: "#F87171", marginTop: "6px" }}
                disabled={broadcastingAlert || !newAlertTitle.trim()}
              >
                {broadcastingAlert ? "Broadcasting..." : "🚨 Transmit Live Warning Broadcast"}
              </button>
            </form>

            {/* Active Alerts Management List */}
            {alerts.length > 0 && (
              <div style={{ padding: "0 20px 20px", borderTop: "1px solid #21262D", marginTop: "10px" }}>
                <h4 style={{ fontSize: "0.85rem", color: "#94A3B8", margin: "14px 0 8px" }}>
                  Currently Managed Alerts ({alerts.length})
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "180px", overflowY: "auto" }}>
                  {alerts.map((al) => (
                    <div key={al.id} style={{ background: "#0D1117", border: "1px solid #30363D", borderRadius: "8px", padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <strong style={{ color: al.isActive !== false ? "#EF4444" : "#8B949E", fontSize: "0.85rem" }}>
                          {al.title}
                        </strong>
                        <div style={{ fontSize: "0.74rem", color: "#6E7681" }}>
                          {al.affectedZone} • {al.isActive !== false ? "🟢 Broadcasting Active" : "⚪ Inactive"}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="eoc-filter-btn"
                        style={{ fontSize: "0.72rem", padding: "4px 8px" }}
                        onClick={() => handleToggleAlertActive(al.id, al.isActive !== false)}
                      >
                        {al.isActive !== false ? "Deactivate" : "Reactivate"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* BROADCAST RESOURCE REQUEST INLINE MODAL                      */}
      {/* ============================================================ */}
      {showResourceModal && (
        <div className="risk-modal-overlay" onClick={() => setShowResourceModal(false)}>
          <div className="risk-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "620px" }}>
            <div className="risk-modal-header" style={{ borderBottom: "1px solid #30363D", background: "linear-gradient(135deg, rgba(6, 78, 59, 0.4), rgba(15, 23, 42, 0.9))" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ background: "rgba(16, 185, 129, 0.2)", color: "#34D399", border: "1px solid rgba(16, 185, 129, 0.4)", padding: "4px 8px", borderRadius: "6px", fontWeight: 800, fontSize: "0.8rem" }}>
                  📦 RESOURCE BROADCAST
                </span>
                <h3 style={{ margin: 0, color: "#FFFFFF", fontSize: "1.1rem" }}>
                  Broadcast Disaster Resource Need
                </h3>
              </div>
              <button
                type="button"
                className="risk-modal-close"
                onClick={() => setShowResourceModal(false)}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleBroadcastResourceRequest} style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px", maxHeight: "80vh", overflowY: "auto" }}>
              {/* Type Toggle: Goods vs Services */}
              <div>
                <label style={{ fontSize: "0.82rem", color: "#94A3B8", fontWeight: 700, display: "block", marginBottom: "6px" }}>
                  Request Type <span style={{ color: "#EF4444" }}>*</span>
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setResourceFormData(p => ({ ...p, type: "goods" }))}
                    style={{
                      padding: "10px",
                      borderRadius: "8px",
                      border: resourceFormData.type === "goods" ? "2px solid #10B981" : "1px solid #334155",
                      background: resourceFormData.type === "goods" ? "rgba(16, 185, 129, 0.15)" : "#0D1117",
                      color: resourceFormData.type === "goods" ? "#34D399" : "#94A3B8",
                      fontWeight: 800,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px"
                    }}
                  >
                    <span>📦</span> Goods / Supplies
                  </button>

                  <button
                    type="button"
                    onClick={() => setResourceFormData(p => ({ ...p, type: "services" }))}
                    style={{
                      padding: "10px",
                      borderRadius: "8px",
                      border: resourceFormData.type === "services" ? "2px solid #3B82F6" : "1px solid #334155",
                      background: resourceFormData.type === "services" ? "rgba(59, 130, 246, 0.15)" : "#0D1117",
                      color: resourceFormData.type === "services" ? "#60A5FA" : "#94A3B8",
                      fontWeight: 800,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px"
                    }}
                  >
                    <span>🤝</span> Services / Skills
                  </button>
                </div>
              </div>

              {/* Title */}
              <div>
                <label style={{ fontSize: "0.82rem", color: "#94A3B8", fontWeight: 700, display: "block", marginBottom: "4px" }}>
                  Resource Title <span style={{ color: "#EF4444" }}>*</span>
                </label>
                <input
                  type="text"
                  className="eoc-search-input"
                  style={{ width: "100%", boxSizing: "border-box" }}
                  placeholder="e.g. Clean Bottled Drinking Water (1L Packs), Pediatrician Volunteers, Inflatable Boats"
                  value={resourceFormData.title}
                  onChange={(e) => setResourceFormData(p => ({ ...p, title: e.target.value }))}
                  required
                />
              </div>

              {/* Category & Urgency */}
              <div style={{ display: "flex", gap: "12px" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "0.82rem", color: "#94A3B8", fontWeight: 700, display: "block", marginBottom: "4px" }}>
                    Category
                  </label>
                  <select
                    className="eoc-search-input"
                    style={{ width: "100%", background: "#0D1117", color: "#FFFFFF", boxSizing: "border-box" }}
                    value={resourceFormData.category}
                    onChange={(e) => setResourceFormData(p => ({ ...p, category: e.target.value }))}
                  >
                    {RESOURCE_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "0.82rem", color: "#94A3B8", fontWeight: 700, display: "block", marginBottom: "4px" }}>
                    Urgency Level
                  </label>
                  <select
                    className="eoc-search-input"
                    style={{ width: "100%", background: "#0D1117", color: "#FFFFFF", boxSizing: "border-box" }}
                    value={resourceFormData.urgency}
                    onChange={(e) => setResourceFormData(p => ({ ...p, urgency: e.target.value }))}
                  >
                    <option value="CRITICAL">🔴 CRITICAL (Immediate triage)</option>
                    <option value="HIGH">🟠 HIGH (Same-day target)</option>
                    <option value="MEDIUM">🔵 MEDIUM (24-48 hr target)</option>
                  </select>
                </div>
              </div>

              {/* Quantity Needed & Unit */}
              <div style={{ display: "flex", gap: "12px" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "0.82rem", color: "#94A3B8", fontWeight: 700, display: "block", marginBottom: "4px" }}>
                    Quantity Needed <span style={{ color: "#EF4444" }}>*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="eoc-search-input"
                    style={{ width: "100%", boxSizing: "border-box" }}
                    placeholder="e.g. 500"
                    value={resourceFormData.quantityNeeded}
                    onChange={(e) => setResourceFormData(p => ({ ...p, quantityNeeded: e.target.value }))}
                    required
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "0.82rem", color: "#94A3B8", fontWeight: 700, display: "block", marginBottom: "4px" }}>
                    Unit of Measurement
                  </label>
                  <select
                    className="eoc-search-input"
                    style={{ width: "100%", background: "#0D1117", color: "#FFFFFF", boxSizing: "border-box" }}
                    value={resourceFormData.unit}
                    onChange={(e) => setResourceFormData(p => ({ ...p, unit: e.target.value }))}
                  >
                    {RESOURCE_UNITS.map(unit => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Address & Drop-Off Instructions */}
              <div>
                <label style={{ fontSize: "0.82rem", color: "#94A3B8", fontWeight: 700, display: "block", marginBottom: "4px" }}>
                  Drop-off / Reporting Location Address <span style={{ color: "#EF4444" }}>*</span>
                </label>
                <input
                  type="text"
                  className="eoc-search-input"
                  style={{ width: "100%", boxSizing: "border-box" }}
                  placeholder="e.g. Kashmiri Gate Relief Depot, Tent A"
                  value={resourceFormData.address}
                  onChange={(e) => setResourceFormData(p => ({ ...p, address: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: "0.82rem", color: "#94A3B8", fontWeight: 700, display: "block", marginBottom: "4px" }}>
                  Drop-off / Contact Instructions
                </label>
                <input
                  type="text"
                  className="eoc-search-input"
                  style={{ width: "100%", boxSizing: "border-box" }}
                  placeholder="e.g. Report to Officer Sharma at Bay 2"
                  value={resourceFormData.dropOffInstructions}
                  onChange={(e) => setResourceFormData(p => ({ ...p, dropOffInstructions: e.target.value }))}
                />
              </div>

              {/* Description */}
              <div>
                <label style={{ fontSize: "0.82rem", color: "#94A3B8", fontWeight: 700, display: "block", marginBottom: "4px" }}>
                  Detailed Specifications & Notes
                </label>
                <textarea
                  className="eoc-search-input"
                  style={{ width: "100%", minHeight: "60px", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }}
                  placeholder="Provide clarity on packaging, expiry, required medical licensing, or vehicle access..."
                  value={resourceFormData.description}
                  onChange={(e) => setResourceFormData(p => ({ ...p, description: e.target.value }))}
                />
              </div>

              <button
                type="submit"
                className="eoc-batch-dispatch-btn"
                style={{ background: "#10B981", borderColor: "#34D399", marginTop: "6px", color: "#FFFFFF" }}
                disabled={isBroadcastingResource || !resourceFormData.title.trim() || !resourceFormData.quantityNeeded}
              >
                {isBroadcastingResource ? "Publishing to Real-Time Network..." : "⚡ Broadcast Resource Request to Volunteers"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Map Controller Subcomponent (Handles dynamic flyTo / smooth pan)
// ============================================================================
function MapViewController({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center && Array.isArray(center) && center.length === 2 && center[0] && center[1]) {
      map.flyTo(center, zoom || 7, {
        duration: 1.2,
        easeLinearity: 0.25,
      });
    }
  }, [center, zoom, map]);
  return null;
}

// ============================================================================
// Risk Analytics Panel Component (Interactive Leaflet Map & Top 3 Telemetry)
// ============================================================================
function RiskAnalyticsPanel({
  allZones,
  riskSummary,
  riskSearch,
  setRiskSearch,
  requests = [],
  hospitals: _hospitals = [],
  shelters = [],
  activeClusters = [],
  selectedCluster: _selectedCluster,
  setSelectedCluster,
}) {
  const { topZone, criticalCount, averageScore, seasonInfo } = riskSummary;
  const topThreeZones = useMemo(() => getTopRiskZones(3), []);
  const activeSeason = seasonInfo || getCurrentSeasonInfo();

  // Map state & selected zone for Risk Factor Breakdown Modal
  const defaultCenter = useMemo(() => {
    if (activeClusters.length > 0) {
      return [activeClusters[0].centroid.lat, activeClusters[0].centroid.lng];
    }
    return [topThreeZones[0]?.lat || 28.6139, topThreeZones[0]?.lng || 77.2090];
  }, [activeClusters, topThreeZones]);

  const [mapCenter, setMapCenter] = useState(defaultCenter);
  const [mapZoom, setMapZoom] = useState(6);
  const [selectedZone, setSelectedZone] = useState(null);
  const [selectedRank, setSelectedRank] = useState(1);

  // Focus a specific top-3 zone on card click
  const handleSelectTopZone = (zone, rank) => {
    setSelectedZone(zone);
    setSelectedRank(rank);
    setMapCenter([zone.lat, zone.lng]);
    setMapZoom(7.5);
  };

  // Focus a cluster on map
  const handleSelectCluster = (cluster) => {
    setSelectedCluster(cluster);
    setMapCenter([cluster.centroid.lat, cluster.centroid.lng]);
    setMapZoom(13);
  };

  // Filtered search list for jump navigation
  const searchResults = useMemo(() => {
    if (!riskSearch.trim()) return [];
    const q = riskSearch.toLowerCase();
    return allZones
      .filter((z) => z.zoneName.toLowerCase().includes(q))
      .slice(0, 5);
  }, [allZones, riskSearch]);

  const handleSelectSearchResult = (zone) => {
    setSelectedZone(zone);
    const topIdx = topThreeZones.findIndex((t) => t.id === zone.id);
    setSelectedRank(topIdx !== -1 ? topIdx + 1 : null);
    setMapCenter([zone.lat, zone.lng]);
    setMapZoom(8);
    setRiskSearch("");
  };

  // Filter active valid SOS signals
  const activeSOSRequests = useMemo(() => {
    return requests.filter(
      (r) => r.status !== "resolved" && r.location && typeof r.location.lat === "number" && typeof r.location.lng === "number"
    );
  }, [requests]);

  return (
    <div className="risk-panel">
      {/* ── 1. Summary Metric Cards ─────────────────────────────────────────── */}
      <div className="risk-summary-grid">
        {/* Card 1: Highest Risk Area */}
        <div
          className="risk-summary-card risk-card-danger"
          style={{ cursor: "pointer" }}
          onClick={() => handleSelectTopZone(topZone, 1)}
          title="Click to locate on telemetry map"
        >
          <div className="risk-card-icon" style={{ background: "rgba(239,68,68,0.15)", color: "#EF4444" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div className="risk-card-body">
            <span className="risk-card-label">Highest Risk Area</span>
            <span className="risk-card-value" style={{ fontSize: "1.15rem" }}>{topZone.zoneName}</span>
            <span className="risk-card-sub">
              Active Score: <strong style={{ color: "#EF4444" }}>{topZone.activeScore || topZone.vulnerabilityScore}/100</strong>
              &nbsp;·&nbsp;{topZone.incidentCount} recorded events
            </span>
          </div>
          <div
            className="risk-badge"
            style={{ background: getRiskBg(topZone.riskLevel), color: getRiskColor(topZone.riskLevel), borderColor: getRiskColor(topZone.riskLevel) }}
          >
            {topZone.riskLevel}
          </div>
        </div>

        {/* Card 2: Critical Danger Zones & Active Clusters */}
        <div className="risk-summary-card">
          <div className="risk-card-icon" style={{ background: activeClusters.length > 0 ? "rgba(239,68,68,0.2)" : "rgba(239,68,68,0.12)", color: "#F87171" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div className="risk-card-body">
            <span className="risk-card-label">Critical Zones & Clusters</span>
            <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
              <span className="risk-card-value" style={{ color: criticalCount > 0 ? "#EF4444" : "#34D399" }}>
                {criticalCount}
              </span>
              {activeClusters.length > 0 && (
                <span style={{ fontSize: "0.82rem", fontWeight: 800, color: "#EF4444", background: "rgba(239,68,68,0.15)", padding: "2px 8px", borderRadius: "10px" }}>
                  {activeClusters.length} Active Proximity Cluster{activeClusters.length > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <span className="risk-card-sub">Active vulnerability score &gt; 80</span>
          </div>
        </div>

        {/* Card 3: Avg Regional Risk Score & Seasonal Tag */}
        <div className="risk-summary-card">
          <div className="risk-card-icon" style={{ background: "rgba(59,130,246,0.12)", color: "#60A5FA" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <div className="risk-card-body">
            <span className="risk-card-label">Avg Regional Risk Score</span>
            <span
              className="risk-card-value"
              style={{ color: averageScore > 60 ? "#F97316" : averageScore > 40 ? "#EAB308" : "#34D399" }}
            >
              {averageScore}
              <span style={{ fontSize: "1rem", fontWeight: 600, color: "var(--eoc-text-muted)" }}>/100</span>
            </span>
            <span className="risk-card-sub">
              Season: <strong style={{ color: activeSeason.themeColor }}>{activeSeason.seasonName} ({activeSeason.currentMonth})</strong>
            </span>
          </div>
        </div>
      </div>

      {/* ── 2. Interactive Map Section with Top 3 Sidebar ──────────────────── */}
      <div className="risk-map-section">
        <div className="risk-map-header">
          <div className="risk-map-title-group">
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#ffffff" }}>
              Regional Risk & Live SOS Proximity Telemetry Map
            </h3>
            <div className="risk-radar-beacon">
              <span className="radar-dot" />
              <span>{activeSeason.badgeText}</span>
            </div>
          </div>

          {/* Quick Search Jump Input */}
          <div style={{ position: "relative", minWidth: "260px" }}>
            <div className="risk-search-box" style={{ padding: "7px 12px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--eoc-text-muted)" }}>
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                className="risk-search-input"
                placeholder="Search & locate any region..."
                value={riskSearch}
                onChange={(e) => setRiskSearch(e.target.value)}
              />
              {riskSearch && (
                <button className="risk-clear-btn" onClick={() => setRiskSearch("")}>✕</button>
              )}
            </div>

            {/* Quick search autocomplete dropdown */}
            {searchResults.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  marginTop: "6px",
                  background: "#161B22",
                  border: "1px solid var(--eoc-border)",
                  borderRadius: "10px",
                  zIndex: 1100,
                  boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
                  overflow: "hidden",
                }}
              >
                {searchResults.map((sr) => (
                  <div
                    key={sr.id}
                    onClick={() => handleSelectSearchResult(sr)}
                    style={{
                      padding: "10px 14px",
                      cursor: "pointer",
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <span style={{ fontSize: "0.88rem", fontWeight: 600, color: "#ffffff" }}>{sr.zoneName}</span>
                    <span style={{ fontSize: "0.75rem", color: getRiskColor(sr.riskLevel), fontWeight: 700 }}>
                      {sr.activeScore || sr.vulnerabilityScore}/100 ({sr.riskLevel})
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Map Grid: Top 3 Cards Sidebar + Interactive Leaflet Map */}
        <div className="risk-map-grid">
          {/* Left Column: Top 3 Hazard Overlay Cards & Active Clusters */}
          <div className="risk-top3-sidebar">
            {/* Active Proximity Clusters Header if present */}
            {activeClusters.length > 0 && (
              <div style={{ marginBottom: "6px" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 800, textTransform: "uppercase", color: "#EF4444", letterSpacing: "0.05em", display: "block", marginBottom: "8px" }}>
                  🚨 Active High-Priority Clusters ({activeClusters.length})
                </span>
                {activeClusters.map((cluster) => (
                  <div
                    key={cluster.id}
                    className="risk-top-card"
                    style={{
                      borderLeft: `4px solid ${cluster.severityColor}`,
                      background: cluster.severityBg,
                      cursor: "pointer",
                      marginBottom: "8px",
                    }}
                    onClick={() => handleSelectCluster(cluster)}
                    title="Click to zoom in and open dispatch drawer"
                  >
                    <div className="risk-top-card-header">
                      <span
                        className="risk-rank-badge"
                        style={{ background: cluster.severityColor, color: "#ffffff", border: "none" }}
                      >
                        {cluster.severityLabel}
                      </span>
                      <span className="risk-top-card-coords">
                        Radius: {cluster.radiusMeters}m
                      </span>
                    </div>
                    <h4 className="risk-top-card-name" style={{ color: "#ffffff" }}>
                      ⚠️ {cluster.victimCount} Victims Clustered
                    </h4>
                    <div style={{ fontSize: "0.78rem", color: "var(--eoc-text-secondary)", display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
                      <span>Centroid: {cluster.centroid.lat.toFixed(3)}°, {cluster.centroid.lng.toFixed(3)}°</span>
                      <span style={{ color: "#38bdf8", fontWeight: 700 }}>Inspect & Dispatch &rarr;</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <span style={{ fontSize: "0.75rem", fontWeight: 800, textTransform: "uppercase", color: "var(--eoc-text-muted)", letterSpacing: "0.05em", display: "block", marginBottom: "4px" }}>
              Top 3 Seasonal Hazard Zones
            </span>

            {topThreeZones.map((zone, idx) => {
              const rank = idx + 1;
              const rankStyle = TOP_RANK_STYLES[rank] || TOP_RANK_STYLES[3];
              const isSelected = selectedZone?.id === zone.id;
              const score = zone.activeScore || zone.vulnerabilityScore;

              return (
                <div
                  key={zone.id}
                  className={`risk-top-card card-rank-${rank} ${isSelected ? "selected" : ""}`}
                  onClick={() => handleSelectTopZone(zone, rank)}
                  title={`Click to center on ${zone.zoneName}`}
                >
                  <div className="risk-top-card-header">
                    <span
                      className="risk-rank-badge"
                      style={{ background: rankStyle.bg, color: rankStyle.color, border: `1px solid ${rankStyle.color}` }}
                    >
                      {rankStyle.badgeLabel}
                    </span>
                    <span className="risk-top-card-coords">
                      {zone.lat.toFixed(2)}°, {zone.lng.toFixed(2)}°
                    </span>
                  </div>

                  <h4 className="risk-top-card-name">{zone.zoneName}</h4>

                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.75rem", color: "var(--eoc-text-muted)" }}>
                    <span>Active Season:</span>
                    <span style={{ color: activeSeason.themeColor, fontWeight: 700 }}>{zone.activeSeason || activeSeason.seasonName}</span>
                  </div>

                  <div className="risk-top-card-stats">
                    <div className="risk-stat-item">
                      <span className="risk-stat-val" style={{ color: rankStyle.color }}>
                        {score}
                        <span style={{ fontSize: "0.75rem", color: "var(--eoc-text-muted)" }}>/100</span>
                      </span>
                      <span className="risk-stat-lbl">Active Score</span>
                    </div>

                    <div className="risk-stat-item">
                      <span className="risk-stat-val" style={{ color: "#f0f6fc" }}>
                        {zone.incidentCount}
                      </span>
                      <span className="risk-stat-lbl">Events</span>
                    </div>

                    <button
                      type="button"
                      className="risk-inspect-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectTopZone(zone, rank);
                      }}
                    >
                      Breakdown
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}

            <div style={{ padding: "12px 14px", background: "rgba(255,255,255,0.03)", borderRadius: "10px", fontSize: "0.78rem", color: "var(--eoc-text-muted)", lineHeight: 1.4 }}>
              ⚡ <strong>Time-Based Telemetry:</strong> Vulnerability scores are dynamically adjusted for the active <strong>{activeSeason.seasonName}</strong> season ({activeSeason.monthsSpan}).
            </div>
          </div>

          {/* Right Column: Interactive Leaflet Map Container */}
          <div className="risk-map-wrapper">
            <MapContainer
              center={defaultCenter}
              zoom={mapZoom}
              scrollWheelZoom={true}
              style={{ width: "100%", height: "100%", minHeight: "540px" }}
            >
              {/* Map Controller for programmatic flyTo transitions */}
              <MapViewController center={mapCenter} zoom={mapZoom} />

              {/* OpenStreetMap Tile Layer with dark theme filter */}
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                className="dark-tiles"
              />

              {/* 1. Circle Markers for Top 3 Highest-Risk Zones */}
              {topThreeZones.map((zone, idx) => {
                const rank = idx + 1;
                const rankStyle = TOP_RANK_STYLES[rank] || TOP_RANK_STYLES[3];
                const score = zone.activeScore || zone.vulnerabilityScore;
                const radius = Math.max(18, Math.round(score / 2.5));

                return (
                  <CircleMarker
                    key={zone.id}
                    center={[zone.lat, zone.lng]}
                    radius={radius}
                    pathOptions={{
                      color: rankStyle.color,
                      fillColor: rankStyle.color,
                      fillOpacity: 0.38,
                      weight: 3.5,
                    }}
                    eventHandlers={{
                      click: () => {
                        handleSelectTopZone(zone, rank);
                      },
                    }}
                  >
                    <Popup className="risk-popup">
                      <div className="risk-popup-content">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
                          <span
                            className="risk-rank-badge"
                            style={{ background: rankStyle.bg, color: rankStyle.color, border: `1px solid ${rankStyle.color}` }}
                          >
                            Rank #{rank} • {zone.activeSeason || activeSeason.seasonName}
                          </span>
                          <span style={{ fontSize: "0.75rem", color: "#58A6FF", fontFamily: "JetBrains Mono" }}>
                            {zone.lat.toFixed(2)}°, {zone.lng.toFixed(2)}°
                          </span>
                        </div>
                        <h4 className="risk-popup-title">{zone.zoneName}</h4>
                        <div style={{ fontSize: "0.82rem", color: "#f0f6fc" }}>
                          Active Seasonal Score: <strong style={{ color: rankStyle.color }}>{score}/100</strong>
                        </div>
                        <div style={{ fontSize: "0.78rem", color: "var(--eoc-text-muted)" }}>
                          Recorded Historical Disasters: <strong>{zone.incidentCount}</strong>
                        </div>
                        <button
                          type="button"
                          className="risk-inspect-btn"
                          style={{ marginTop: "4px", justifyContent: "center" }}
                          onClick={() => setSelectedZone(zone)}
                        >
                          View Seasonal Risk Factor Breakdown &rarr;
                        </button>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}

              {/* 2. Individual Active SOS Request Signals */}
              {activeSOSRequests.map((req) => {
                const isDispatched = req.status === "dispatched" || req.status === "in_progress";
                const dotColor = isDispatched ? "#F59E0B" : "#EF4444";
                return (
                  <CircleMarker
                    key={req.id}
                    center={[req.location.lat, req.location.lng]}
                    radius={6}
                    pathOptions={{
                      color: "#ffffff",
                      fillColor: dotColor,
                      fillOpacity: 0.95,
                      weight: 1.5,
                    }}
                  >
                    <Popup className="risk-popup">
                      <div className="risk-popup-content">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: "0.75rem", fontWeight: 800, color: dotColor, textTransform: "uppercase" }}>
                            🚨 {req.category || req.type || "General"} SOS
                          </span>
                          <span style={{ fontSize: "0.72rem", color: "var(--eoc-text-muted)" }}>
                            {formatTimeAgo(req.createdAt)}
                          </span>
                        </div>
                        <div style={{ fontSize: "0.82rem", color: "#ffffff", marginTop: "2px" }}>
                          Status: <strong style={{ textTransform: "capitalize", color: dotColor }}>{req.status || "pending"}</strong>
                        </div>
                        {req.note && (
                          <div style={{ fontSize: "0.78rem", color: "#c9d1d9", fontStyle: "italic", marginTop: "4px" }}>
                            "{req.note}"
                          </div>
                        )}
                        <div style={{ fontSize: "0.72rem", color: "#58a6ff", fontFamily: "JetBrains Mono", marginTop: "4px" }}>
                          GPS: {req.location.lat.toFixed(4)}°, {req.location.lng.toFixed(4)}°
                        </div>
                        {req.hasDetails && req.photoBase64 && (
                          <button
                            type="button"
                            style={{
                              marginTop: "8px",
                              padding: 0,
                              border: "none",
                              background: "none",
                              cursor: "pointer",
                              borderRadius: "8px",
                              overflow: "hidden",
                              display: "block",
                              width: "100%",
                            }}
                            onClick={() => setLightboxSrc(req.photoBase64)}
                            title="Click to expand photo"
                          >
                            <img
                              src={req.photoBase64}
                              alt="Incident media"
                              style={{ width: "100%", height: "90px", objectFit: "cover", borderRadius: "8px", display: "block" }}
                            />
                            <div style={{ fontSize: "0.7rem", color: "#58a6ff", textAlign: "center", marginTop: "4px" }}>Tap to expand ⛶</div>
                          </button>
                        )}
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}

              {/* 3. Proximity Clusters with Pulsing Radius Ring & Tooltip */}
              {activeClusters.map((cluster) => (
                <div key={cluster.id}>
                  {/* Affected Proximity Radius Circle (500m area) */}
                  <Circle
                    center={[cluster.centroid.lat, cluster.centroid.lng]}
                    radius={cluster.radiusMeters}
                    pathOptions={{
                      color: cluster.severityColor,
                      fillColor: cluster.severityColor,
                      fillOpacity: 0.18,
                      weight: 3,
                      dashArray: "6, 6",
                      className: "cluster-pulse-ring",
                    }}
                    eventHandlers={{
                      click: () => {
                        handleSelectCluster(cluster);
                      },
                    }}
                  />

                  {/* Cluster Centroid Marker & Urgency Tooltip */}
                  <CircleMarker
                    center={[cluster.centroid.lat, cluster.centroid.lng]}
                    radius={14}
                    pathOptions={{
                      color: "#ffffff",
                      fillColor: cluster.severityColor,
                      fillOpacity: 1,
                      weight: 2.5,
                    }}
                    eventHandlers={{
                      click: () => {
                        handleSelectCluster(cluster);
                      },
                    }}
                  >
                    <Tooltip permanent direction="top" className="cluster-marker-label">
                      ⚠️ {cluster.victimCount} VICTIMS ({cluster.severityLabel})
                    </Tooltip>
                  </CircleMarker>
                </div>
              ))}
              {/* 4. Registered Disaster Shelters */}
              {shelters.map((shelter) => {
                const isFull = shelter.status === "Full";
                const shelterColor = isFull ? "#EF4444" : "#0EA5E9";
                const total = Number(shelter.totalBeds) || 0;
                const occ = Number(shelter.occupiedBeds) || 0;
                const free = Math.max(0, total - occ);

                return (
                  <CircleMarker
                    key={shelter.id}
                    center={[shelter.lat, shelter.lng]}
                    radius={9}
                    pathOptions={{
                      color: "#FFFFFF",
                      fillColor: shelterColor,
                      fillOpacity: 1,
                      weight: 2,
                    }}
                  >
                    <Popup className="risk-popup">
                      <div className="risk-popup-content">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: "0.76rem", fontWeight: 800, color: shelterColor, textTransform: "uppercase" }}>
                            🏠 {isFull ? "SHELTER (FULL)" : "SHELTER (OPEN)"}
                          </span>
                          <span style={{ fontSize: "0.72rem", color: shelter.isVerified ? "#34D399" : "#F59E0B", fontWeight: 800 }}>
                            {shelter.isVerified ? "✓ VERIFIED" : "⏳ PENDING"}
                          </span>
                        </div>
                        <h4 style={{ fontSize: "0.92rem", fontWeight: 800, color: "#FFFFFF", margin: "4px 0" }}>
                          {shelter.shelterName || shelter.name}
                        </h4>
                        <div style={{ fontSize: "0.8rem", color: "#CBD5E1" }}>
                          Bed Capacity: <strong style={{ color: "#38BDF8" }}>{free} Free</strong> / {total} Total
                        </div>
                        {shelter.supplyStatus && (
                          <div style={{ fontSize: "0.74rem", color: "#CBD5E1", marginTop: "2px" }}>
                            Supply: <strong style={{ color: shelter.supplyStatus === "Critical" ? "#EF4444" : shelter.supplyStatus === "Moderate" ? "#F59E0B" : "#34D399" }}>{shelter.supplyStatus}</strong>
                          </div>
                        )}
                        <div style={{ fontSize: "0.74rem", color: "#94A3B8", marginTop: "2px" }}>
                          {shelter.address || "Relief Staging Area"}
                        </div>
                        {(shelter.contactPhone || shelter.phone) && (
                          <div style={{ fontSize: "0.74rem", color: "#38BDF8", marginTop: "2px" }}>
                            📞 {shelter.contactPhone || shelter.phone}
                          </div>
                        )}
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${shelter.lat},${shelter.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ display: "inline-block", marginTop: "6px", fontSize: "0.75rem", color: "#58A6FF", textDecoration: "none" }}
                        >
                          Navigate to Shelter &rarr;
                        </a>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </MapContainer>

            {/* Floating Map Legend */}
            <div className="risk-map-legend">
              <span className="legend-title">Hazard & Telemetry Legend</span>
              <div className="legend-item">
                <span className="legend-dot" style={{ background: "#D32F2F", boxShadow: "0 0 8px #D32F2F" }} />
                <span>#1 Critical ({topThreeZones[0]?.activeScore || 98} Score)</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot" style={{ background: "#EF4444" }} />
                <span>Active SOS Call Signal</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot" style={{ background: "#0EA5E9", boxShadow: "0 0 6px #0EA5E9" }} />
                <span>Evacuation Shelter (Open)</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot" style={{ background: "#F59E0B" }} />
                <span>Dispatched / In Progress</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot" style={{ background: "#F57C00", boxShadow: "0 0 8px #F57C00" }} />
                <span>#2 High ({topThreeZones[1]?.activeScore || 95} Score)</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot" style={{ background: "#FBC02D", boxShadow: "0 0 8px #FBC02D" }} />
                <span>#3 Elevated ({topThreeZones[2]?.activeScore || 81} Score)</span>
              </div>
              {activeClusters.length > 0 && (
                <div className="legend-item" style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "4px" }}>
                  <span className="legend-dot" style={{ background: "#D32F2F", border: "1px dashed #ffffff" }} />
                  <span style={{ color: "#EF4444", fontWeight: 700 }}>Active Cluster (500m Radius)</span>
                </div>
              )}
              <div className="legend-item">
                <span className="legend-dot" style={{ width: "8px", height: "8px", background: "#EF4444", border: "1px solid #ffffff" }} />
                <span>Individual SOS Signal</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 3. Seasonal Risk Factor Breakdown Detail Modal ──────────────────── */}
      {selectedZone && (
        <div className="risk-modal-overlay" onClick={() => setSelectedZone(null)}>
          <div className="risk-modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            {/* Modal Header */}
            <div className="risk-modal-header">
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                  <span
                    className="risk-rank-badge"
                    style={{
                      background: getRiskBg(selectedZone.riskLevel),
                      color: getRiskColor(selectedZone.riskLevel),
                      border: `1px solid ${getRiskColor(selectedZone.riskLevel)}`,
                    }}
                  >
                    {selectedRank ? `Rank #${selectedRank} • ` : ""}
                    {selectedZone.activeSeason || activeSeason.seasonName} Active
                  </span>
                  <span style={{ fontFamily: "JetBrains Mono", fontSize: "0.82rem", color: "#58A6FF" }}>
                    GPS: {selectedZone.lat.toFixed(4)}°, {selectedZone.lng.toFixed(4)}°
                  </span>
                </div>
                <h2 style={{ fontSize: "1.45rem", fontWeight: 800, color: "#ffffff", margin: 0 }}>
                  {selectedZone.zoneName}
                </h2>
                <span style={{ fontSize: "0.82rem", color: "var(--eoc-text-muted)" }}>
                  Seasonal Risk Factor Breakdown • {activeSeason.seasonName} ({activeSeason.monthsSpan})
                </span>
              </div>

              <button
                className="risk-modal-close-btn"
                onClick={() => setSelectedZone(null)}
                title="Close Breakdown"
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {/* Score & Telemetry Metric Box */}
            <div className="risk-modal-score-box">
              <div>
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--eoc-text-muted)", textTransform: "uppercase" }}>
                  Calculated Vulnerability Score
                </span>
                <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginTop: "2px" }}>
                  <span style={{ fontFamily: "JetBrains Mono", fontSize: "2.1rem", fontWeight: 900, color: getRiskColor(selectedZone.riskLevel) }}>
                    {selectedZone.activeScore || selectedZone.vulnerabilityScore}
                  </span>
                  <span style={{ fontSize: "0.95rem", color: "var(--eoc-text-muted)", fontWeight: 600 }}>/ 100</span>
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--eoc-text-muted)", textTransform: "uppercase" }}>
                  Historical Disasters
                </span>
                <div style={{ fontFamily: "JetBrains Mono", fontSize: "1.4rem", fontWeight: 800, color: "#ffffff", marginTop: "2px" }}>
                  {selectedZone.incidentCount} Events
                </div>
              </div>
            </div>

            {/* Disaster Types Tags */}
            {selectedZone.disasterTypes && selectedZone.disasterTypes.length > 0 && (
              <div>
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--eoc-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "8px" }}>
                  Recorded Hazard Typologies
                </span>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {selectedZone.disasterTypes.map((t) => (
                    <span
                      key={t}
                      style={{
                        padding: "4px 10px",
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid var(--eoc-border)",
                        borderRadius: "14px",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        color: "#f0f6fc",
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Dynamic Seasonal Risk Factors */}
            <div>
              <span style={{ fontSize: "0.82rem", fontWeight: 800, color: "#EF5350", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "10px" }}>
                ⚠️ Active Seasonal Risk Factors ({activeSeason.seasonName})
              </span>
              <ul className="risk-factors-list">
                {selectedZone.riskFactors?.map((factor, i) => (
                  <li key={i} className="risk-factor-item">
                    <span className="risk-factor-icon">▪</span>
                    <span>{factor}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Recommended Emergency Action Protocol */}
            <div className="risk-protocol-box">
              <h4 className="risk-protocol-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                Recommended Emergency Action Protocol ({activeSeason.seasonName})
              </h4>
              <ol className="risk-protocol-list">
                {selectedZone.actionProtocol?.map((action, i) => (
                  <li key={i}>{action}</li>
                ))}
              </ol>
            </div>

            {/* Modal Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "4px" }}>
              <button
                className="eoc-btn-resolved"
                style={{ padding: "10px 20px" }}
                onClick={() => setSelectedZone(null)}
              >
                Acknowledge & Close Protocol
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Cluster Detail Drawer & Emergency Dispatch Component
// ============================================================================
function ClusterDetailDrawer({
  cluster,
  hospitals = [],
  onClose,
  onDispatch,
  isDispatching,
}) {
  const nearestHospital = useMemo(() => {
    return findNearestHospital(cluster.centroid, hospitals);
  }, [cluster.centroid, hospitals]);

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${cluster.centroid.lat},${cluster.centroid.lng}`;

  return (
    <div className="cluster-drawer-overlay" onClick={onClose}>
      <div className="cluster-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {/* Drawer Header */}
        <div className="cluster-drawer-header">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <span
                className="cluster-severity-pill"
                style={{
                  background: cluster.severityBg,
                  color: cluster.severityColor,
                  border: `1px solid ${cluster.severityColor}`,
                }}
              >
                🚨 {cluster.severityLabel}
              </span>
            </div>
            <h2 className="cluster-drawer-title">
              Mass Emergency Cluster
            </h2>
            <div style={{ fontSize: "0.82rem", color: "var(--eoc-text-muted)", marginTop: "3px" }}>
              Centroid: {cluster.centroid.lat.toFixed(4)}°, {cluster.centroid.lng.toFixed(4)}°
            </div>
          </div>

          <button
            className="risk-modal-close-btn"
            onClick={onClose}
            title="Close Drawer"
            aria-label="Close cluster drawer"
          >
            ✕
          </button>
        </div>

        {/* Cluster Metric Stats */}
        <div className="cluster-stat-grid">
          <div className="cluster-stat-box">
            <span className="cluster-stat-title">Clustered Victims</span>
            <span className="cluster-stat-number" style={{ color: cluster.severityColor }}>
              {cluster.victimCount}
            </span>
          </div>

          <div className="cluster-stat-box">
            <span className="cluster-stat-title">Proximity Radius</span>
            <span className="cluster-stat-number" style={{ color: "#38bdf8" }}>
              {cluster.radiusMeters}m
            </span>
          </div>
        </div>

        {/* Nearest Available Hospital Card */}
        <div className="cluster-hospital-card">
          <div className="cluster-hospital-header">
            <span className="cluster-hospital-badge">
              Nearest Trauma Facility
            </span>
            {nearestHospital && (
              <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#38bdf8" }}>
                {nearestHospital.distanceKm} km away
              </span>
            )}
          </div>

          {nearestHospital ? (
            <>
              <h4 className="cluster-hospital-name">
                {nearestHospital.hospitalName}
              </h4>
              <div className="cluster-hospital-stats">
                <span
                  className="cluster-hosp-pill"
                  style={{
                    background: nearestHospital.availableBeds > 0 ? "rgba(52, 211, 153, 0.15)" : "rgba(239, 68, 68, 0.15)",
                    color: nearestHospital.availableBeds > 0 ? "#34D399" : "#EF4444",
                    border: `1px solid ${nearestHospital.availableBeds > 0 ? "#34D399" : "#EF4444"}`,
                  }}
                >
                  🛏️ {nearestHospital.availableBeds} Emergency Beds Open
                </span>
                <span
                  className="cluster-hosp-pill"
                  style={{
                    background: "rgba(56, 189, 248, 0.15)",
                    color: "#38BDF8",
                    border: "1px solid #38BDF8",
                  }}
                >
                  👨‍⚕️ {nearestHospital.staffCount} Staff on Duty
                </span>
              </div>
            </>
          ) : (
            <div style={{ fontSize: "0.85rem", color: "var(--eoc-text-muted)" }}>
              No registered hospital found within active telemetry range.
            </div>
          )}

          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: "0.8rem",
              color: "#58A6FF",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              marginTop: "4px",
            }}
          >
            Open GPS Dispatch Coordinates in Maps &rarr;
          </a>
        </div>

        {/* Clustered Victims List */}
        <div className="cluster-victims-section">
          <h4 className="cluster-victims-title">
            Clustered Emergency Calls ({cluster.requests.length})
          </h4>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {cluster.requests.map((req, idx) => (
              <div key={req.id || idx} className="cluster-victim-card">
                <div className="cluster-victim-top">
                  <span
                    className="cluster-victim-type"
                    style={{
                      background: "rgba(239, 68, 68, 0.18)",
                      color: "#EF4444",
                      border: "1px solid rgba(239, 68, 68, 0.4)",
                    }}
                  >
                    {req.type || "Medical / SOS"}
                  </span>
                  <span className="cluster-victim-time">
                    {formatTimeAgo(req.createdAt)}
                  </span>
                </div>

                {req.notes && (
                  <div className="cluster-victim-notes">
                    "{req.notes}"
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.75rem", color: "var(--eoc-text-muted)", marginTop: "2px" }}>
                  <span>Status: <strong style={{ color: req.status === "dispatched" ? "#F59E0B" : "#EF4444" }}>{req.status || "pending"}</strong></span>
                  <span style={{ fontFamily: "JetBrains Mono" }}>
                    {req.location?.lat?.toFixed(4)}°, {req.location?.lng?.toFixed(4)}°
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Dispatch Action Footer */}
        <div className="cluster-drawer-footer">
          <button
            className="cluster-dispatch-btn"
            onClick={() => onDispatch(cluster)}
            disabled={isDispatching}
          >
            {isDispatching ? (
              <span>Dispatching Units to Cluster...</span>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                Dispatch Emergency Unit to Cluster ({cluster.victimCount} Victims)
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}