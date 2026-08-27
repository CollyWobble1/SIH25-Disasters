import { useEffect, useState } from "react";
import { collection, onSnapshot, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import "./AuthorityDashboard.css";

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

export default function AuthorityDashboard() {
  const [activeTab, setActiveTab] = useState("incidents"); // 'incidents' | 'hospitals'
  const [requests, setRequests] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [filter, setFilter] = useState("all"); // 'all' | 'pending' | 'dispatched' | 'resolved'
  const [updatingId, setUpdatingId] = useState(null);
  const [approvingId, setApprovingId] = useState(null);
  const [loading, setLoading] = useState(true);

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
  const dispatchedCount = requests.filter((r) => r.status === "dispatched" || r.status === "in_progress").length;
  const resolvedCount = requests.filter((r) => r.status === "resolved").length;
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

  // Filtered requests
  const filteredRequests = requests.filter((r) => {
    const currentStatus = r.status || "pending";
    if (filter === "all") return true;
    if (filter === "pending") return currentStatus === "pending";
    if (filter === "dispatched") return currentStatus === "dispatched" || currentStatus === "in_progress";
    if (filter === "resolved") return currentStatus === "resolved";
    return true;
  });

  return (
    <div className="eoc-container">
      {/* 1. Header & Navigation */}
      <header className="eoc-navbar">
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

        <div className="eoc-nav-right">
          <a
            href="/hospital"
            style={{
              background: "rgba(2, 132, 199, 0.15)",
              border: "1px solid rgba(2, 132, 199, 0.4)",
              color: "#38bdf8",
              padding: "6px 12px",
              borderRadius: "8px",
              fontSize: "0.82rem",
              fontWeight: 600,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 6v12M6 12h12" />
            </svg>
            Hospital Staff Portal
          </a>

          {/* Live Status Indicator */}
          <div className="eoc-live-badge" title="Real-time WebSocket / Firestore feed active">
            <span className="eoc-pulse-dot" />
            <span>Live Monitoring Active</span>
          </div>
        </div>
      </header>

      {/* Top View Mode Tabs: SOS Incidents vs Hospital Capacity Monitor */}
      <nav className="eoc-view-tabs">
        <button
          className={`eoc-tab-btn ${activeTab === "incidents" ? "active" : ""}`}
          onClick={() => setActiveTab("incidents")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          Active Incidents
          <span className="eoc-tab-badge">{pendingCount} Active</span>
        </button>

        <button
          className={`eoc-tab-btn ${activeTab === "hospitals" ? "active" : ""}`}
          onClick={() => setActiveTab("hospitals")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
          Hospital Capacity Monitor (Read-Only)
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
      </nav>

      {/* Main Content Area */}
      <main className="eoc-content">
        {/* ========================================================================= */}
        {/* VIEW 1: ACTIVE SOS INCIDENT COMMAND                                       */}
        {/* ========================================================================= */}
        {activeTab === "incidents" && (
          <>
            {/* Interactive Toolbar & Filter Bar */}
            <div className="eoc-toolbar">
              <div className="eoc-filter-bar" role="tablist" aria-label="Incident status filters">
                <button
                  role="tab"
                  aria-selected={filter === "all"}
                  className={`eoc-filter-btn ${filter === "all" ? "active" : ""}`}
                  onClick={() => setFilter("all")}
                >
                  All Alerts
                  <span className="eoc-filter-count">{totalCount}</span>
                </button>
                <button
                  role="tab"
                  aria-selected={filter === "pending"}
                  className={`eoc-filter-btn ${filter === "pending" ? "active" : ""}`}
                  onClick={() => setFilter("pending")}
                >
                  Pending
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
                  <span>Critical Active:</span>
                  <span className="eoc-stat-value" style={{ color: "#ff8080" }}>{pendingCount}</span>
                </div>
                <div className="eoc-stat-item">
                  <span>Underway:</span>
                  <span className="eoc-stat-value" style={{ color: "#fcd34d" }}>{dispatchedCount}</span>
                </div>
                <div className="eoc-stat-item">
                  <span>Cleared:</span>
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

                  return (
                    <div key={req.id} className={`eoc-card ${severityClass}`}>
                      {/* Card Header */}
                      <div className="eoc-card-header">
                        <div className="eoc-badge-group">
                          <span className={`eoc-type-badge ${typeClass}`}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                              <circle cx="12" cy="12" r="10"/>
                            </svg>
                            {req.type ? req.type.toUpperCase() : "GENERAL SOS"}
                          </span>

                          <span className={`eoc-status-badge status-${currentStatus}`}>
                            {currentStatus === "in_progress" ? "DISPATCHED" : currentStatus.toUpperCase()}
                          </span>
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
                      </div>

                      {/* Action Controls */}
                      <div className="eoc-card-footer">
                        {currentStatus !== "dispatched" && currentStatus !== "in_progress" && currentStatus !== "resolved" && (
                          <button
                            className="eoc-btn eoc-btn-dispatch"
                            onClick={() => handleUpdateStatus(req.id, "dispatched")}
                            disabled={updatingId === req.id}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polygon points="5 3 19 12 5 21 5 3"></polygon>
                            </svg>
                            {updatingId === req.id ? "Dispatching..." : "Dispatch Team"}
                          </button>
                        )}

                        {currentStatus !== "resolved" && (
                          <button
                            className="eoc-btn eoc-btn-resolve"
                            onClick={() => handleUpdateStatus(req.id, "resolved")}
                            disabled={updatingId === req.id}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                            {updatingId === req.id ? "Updating..." : "Mark Resolved"}
                          </button>
                        )}

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

                        {currentStatus === "dispatched" && (
                          <button
                            className="eoc-btn eoc-btn-reopen"
                            onClick={() => handleUpdateStatus(req.id, "pending")}
                            disabled={updatingId === req.id}
                          >
                            Reset to Pending
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
      </main>
    </div>
  );
}