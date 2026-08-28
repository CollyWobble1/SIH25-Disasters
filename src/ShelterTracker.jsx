import { useState, useEffect } from "react";
import { collection, onSnapshot, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import "./ShelterTracker.css";

// Initial regional emergency shelter mock datasets
export const INITIAL_MOCK_SHELTERS = [
  {
    id: "shelter-ravet-01",
    shelterName: "Ravet Community Relief Hall",
    name: "Ravet Community Relief Hall",
    address: "Sector 29, Ravet, Pune",
    lat: 18.6472,
    lng: 73.7432,
    totalBeds: 120,
    availableBeds: 56,
    occupiedBeds: 64,
    status: "Open", // 'Open' | 'Full'
    supplyStatus: "Abundant",
    resources: ["Potable Water", "Hot Meals", "Medical Post", "Power Generators"],
    contactPhone: "+91 20 2742 5555",
    phone: "+91 20 2742 5555",
    isVerified: true,
    updatedAt: new Date(),
  },
  {
    id: "shelter-wakad-02",
    shelterName: "Wakad High School Evacuation Center",
    name: "Wakad High School Evacuation Center",
    address: "Datta Mandir Road, Wakad, Pune",
    lat: 18.5987,
    lng: 73.7684,
    totalBeds: 200,
    availableBeds: 2,
    occupiedBeds: 198,
    status: "Full",
    supplyStatus: "Moderate",
    resources: ["Blankets", "Child Care", "Dry Rations", "Sanitation Kits"],
    contactPhone: "+91 20 2744 1122",
    phone: "+91 20 2744 1122",
    isVerified: true,
    updatedAt: new Date(),
  },
  {
    id: "shelter-hinjawadi-03",
    shelterName: "Hinjawadi Sports Complex Shelter",
    name: "Hinjawadi Sports Complex Shelter",
    address: "Phase 1, Hinjawadi Rajiv Gandhi Infotech Park, Pune",
    lat: 18.5912,
    lng: 73.7389,
    totalBeds: 350,
    availableBeds: 240,
    occupiedBeds: 110,
    status: "Open",
    supplyStatus: "Abundant",
    resources: ["Wi-Fi Mesh", "Triage Ward", "Pet Friendly", "Ambulance Staging"],
    contactPhone: "+91 20 2749 8800",
    phone: "+91 20 2749 8800",
    isVerified: false,
    updatedAt: new Date(),
  },
  {
    id: "shelter-punawale-04",
    shelterName: "Punawale Municipal Relief Staging",
    name: "Punawale Municipal Relief Staging",
    address: "Kate Wasti, Punawale, Pune",
    lat: 18.6189,
    lng: 73.7498,
    totalBeds: 90,
    availableBeds: 45,
    occupiedBeds: 45,
    status: "Open",
    supplyStatus: "Critical",
    resources: ["Clean Water", "Basic First Aid", "Baby Formula"],
    contactPhone: "+91 20 2746 3311",
    phone: "+91 20 2746 3311",
    isVerified: true,
    updatedAt: new Date(),
  },
];

export default function ShelterTracker({ isEmbedded = false }) {
  const [shelters, setShelters] = useState([]);
  const [filterStatus, setFilterStatus] = useState("ALL"); // 'ALL' | 'VERIFIED' | 'PENDING' | 'OPEN' | 'FULL'
  const [searchQuery, setSearchQuery] = useState("");
  const [verifyingId, setVerifyingId] = useState(null);

  // Subscribe to `shelters` collection in real time
  useEffect(() => {
    const q = collection(db, "shelters");
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!snapshot.empty) {
          const liveShelters = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }));
          setShelters(liveShelters);
        } else {
          setShelters(INITIAL_MOCK_SHELTERS);
        }
      },
      (err) => {
        console.warn("Shelters Firestore listener warning in ShelterTracker:", err);
        setShelters(INITIAL_MOCK_SHELTERS);
      }
    );

    return () => unsubscribe();
  }, []);

  // Filter & Search Shelters
  const filteredShelters = shelters.filter((s) => {
    const statusMatch =
      filterStatus === "ALL" ||
      (filterStatus === "VERIFIED" && s.isVerified) ||
      (filterStatus === "PENDING" && !s.isVerified) ||
      (filterStatus === "OPEN" && s.status === "Open") ||
      (filterStatus === "FULL" && s.status === "Full");

    const queryMatch =
      !searchQuery.trim() ||
      (s.shelterName || s.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.address || "").toLowerCase().includes(searchQuery.toLowerCase());

    return statusMatch && queryMatch;
  });

  // Calculate Telemetry Metrics
  const totalShelters = shelters.length;
  const verifiedCount = shelters.filter((s) => s.isVerified).length;
  const pendingCount = shelters.filter((s) => !s.isVerified).length;
  const openSheltersCount = shelters.filter((s) => s.status === "Open").length;
  const fullSheltersCount = shelters.filter((s) => s.status === "Full").length;
  const totalCapacity = shelters.reduce((acc, s) => acc + (Number(s.totalBeds) || 0), 0);
  const totalAvailableBeds = shelters.reduce((acc, s) => {
    const total = Number(s.totalBeds) || 0;
    const avail = s.availableBeds !== undefined ? Number(s.availableBeds) : Math.max(0, total - (Number(s.occupiedBeds) || 0));
    return acc + avail;
  }, 0);
  const totalOccupied = Math.max(0, totalCapacity - totalAvailableBeds);

  // Authority Verification Toggle Handler
  const handleToggleVerification = async (shelter) => {
    const nextVerified = !shelter.isVerified;
    try {
      setVerifyingId(shelter.id);
      const shelterRef = doc(db, "shelters", shelter.id);
      await updateDoc(shelterRef, {
        isVerified: nextVerified,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn("Firestore shelter verification update error, updating locally:", err);
      setShelters((prev) =>
        prev.map((s) => (s.id === shelter.id ? { ...s, isVerified: nextVerified } : s))
      );
    } finally {
      setVerifyingId(null);
    }
  };

  return (
    <div className={`shelter-tracker-container ${isEmbedded ? "embedded" : ""}`}>
      {!isEmbedded && (
        <header className="shelter-navbar">
          <div className="shelter-brand">
            <div className="shelter-brand-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <div>
              <h1 className="shelter-title">Authority Disaster Shelter Overview</h1>
              <span className="shelter-subtitle">Read-Only Facility Telemetry &amp; Verification Console</span>
            </div>
          </div>

          <div className="shelter-nav-actions">
            <a href="/" className="shelter-nav-btn">
              Home
            </a>
            <a href="/shelter" className="shelter-nav-btn" style={{ background: "#0284C7", borderColor: "#38BDF8" }}>
              Facility Registration Portal &rarr;
            </a>
          </div>
        </header>
      )}

      <main className="shelter-main-content" style={{ padding: isEmbedded ? "0" : "24px" }}>
        {/* KPI Stats Row */}
        <section className="shelter-summary-grid">
          <div className="shelter-stat-card">
            <span className="shelter-stat-label">Total Shelters</span>
            <span className="shelter-stat-val">{totalShelters}</span>
            <div style={{ display: "flex", gap: "8px", marginTop: "4px", fontSize: "0.76rem" }}>
              <span style={{ color: "#34D399", fontWeight: 700 }}>✓ {verifiedCount} Verified</span>
              <span style={{ color: "#F59E0B", fontWeight: 700 }}>⏳ {pendingCount} Pending</span>
            </div>
          </div>

          <div className="shelter-stat-card">
            <span className="shelter-stat-label">Available Free Beds</span>
            <span className="shelter-stat-val" style={{ color: "#34D399" }}>{totalAvailableBeds}</span>
            <span style={{ fontSize: "0.78rem", color: "#94A3B8" }}>Out of {totalCapacity} total capacity</span>
          </div>

          <div className="shelter-stat-card">
            <span className="shelter-stat-label">Active Evacuees Housed</span>
            <span className="shelter-stat-val" style={{ color: "#38BDF8" }}>{totalOccupied}</span>
            <span style={{ fontSize: "0.78rem", color: "#94A3B8" }}>Across all staging shelters</span>
          </div>

          <div className="shelter-stat-card">
            <span className="shelter-stat-label">Intake Status</span>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "4px" }}>
              <span style={{ fontSize: "1.25rem", fontWeight: 800, color: "#10B981" }}>{openSheltersCount} Open</span>
              <span style={{ fontSize: "1.25rem", fontWeight: 800, color: "#EF4444" }}>{fullSheltersCount} Full</span>
            </div>
          </div>
        </section>

        {/* Toolbar: Filter Pills & Search */}
        <div className="shelter-toolbar">
          <div className="shelter-filter-group" style={{ flexWrap: "wrap" }}>
            <button
              type="button"
              className={`shelter-filter-pill ${filterStatus === "ALL" ? "active" : ""}`}
              onClick={() => setFilterStatus("ALL")}
            >
              All ({shelters.length})
            </button>
            <button
              type="button"
              className={`shelter-filter-pill ${filterStatus === "VERIFIED" ? "active" : ""}`}
              onClick={() => setFilterStatus("VERIFIED")}
            >
              ✓ Verified ({verifiedCount})
            </button>
            <button
              type="button"
              className={`shelter-filter-pill ${filterStatus === "PENDING" ? "active" : ""}`}
              onClick={() => setFilterStatus("PENDING")}
            >
              ⏳ Pending ({pendingCount})
            </button>
            <button
              type="button"
              className={`shelter-filter-pill ${filterStatus === "OPEN" ? "active" : ""}`}
              onClick={() => setFilterStatus("OPEN")}
            >
              Open ({openSheltersCount})
            </button>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center", flex: "1 1 auto", justifyContent: "flex-end" }}>
            <input
              type="text"
              className="shelter-form-input"
              placeholder="Search shelter name or sector..."
              style={{ maxWidth: "280px" }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <a
              href="/shelter"
              className="shelter-add-btn"
              style={{ textDecoration: "none" }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Facility Portal
            </a>
          </div>
        </div>

        {/* Read-Only Shelters Cards Grid */}
        <section className="shelter-cards-grid">
          {filteredShelters.map((shelter) => {
            const total = Number(shelter.totalBeds) || 1;
            const available = shelter.availableBeds !== undefined
              ? Number(shelter.availableBeds)
              : Math.max(0, total - (Number(shelter.occupiedBeds) || 0));
            const occupied = Math.max(0, total - available);
            const occPct = Math.min(100, Math.round((occupied / total) * 100));
            const isFull = shelter.status === "Full" || available <= 0;
            const fillColor = isFull ? "#EF4444" : occPct >= 75 ? "#F59E0B" : "#10B981";
            const lat = shelter.latitude || shelter.lat || 18.5204;
            const lng = shelter.longitude || shelter.lng || 73.8567;
            const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
            const isVerifying = verifyingId === shelter.id;

            return (
              <div key={shelter.id} className={`shelter-card ${isFull ? "full" : "open"}`}>
                <div className="shelter-card-top">
                  <div>
                    {/* Visual Verification Badge */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      {shelter.isVerified ? (
                        <span
                          style={{
                            background: "rgba(16, 185, 129, 0.18)",
                            color: "#34D399",
                            border: "1px solid #10B981",
                            fontSize: "0.7rem",
                            fontWeight: 800,
                            padding: "2px 7px",
                            borderRadius: "4px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          ✓ VERIFIED SHELTER
                        </span>
                      ) : (
                        <span
                          style={{
                            background: "rgba(245, 158, 11, 0.18)",
                            color: "#F59E0B",
                            border: "1px solid #F59E0B",
                            fontSize: "0.7rem",
                            fontWeight: 800,
                            padding: "2px 7px",
                            borderRadius: "4px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          ⏳ PENDING VERIFICATION
                        </span>
                      )}

                      <span className={`shelter-badge ${isFull ? "full" : "open"}`} style={{ fontSize: "0.68rem", padding: "2px 6px" }}>
                        {isFull ? "FULL" : "OPEN"}
                      </span>
                    </div>

                    <h3 className="shelter-card-name">{shelter.shelterName || shelter.name}</h3>
                    <div className="shelter-card-address">{shelter.address || "Relief Staging Area"}</div>

                    {/* Supply Status */}
                    {shelter.supplyStatus && (
                      <span
                        style={{
                          display: "inline-block",
                          marginTop: "6px",
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          padding: "2px 7px",
                          borderRadius: "4px",
                          background: shelter.supplyStatus === "Critical" ? "rgba(239, 68, 68, 0.2)" : shelter.supplyStatus === "Moderate" ? "rgba(245, 158, 11, 0.2)" : "rgba(16, 185, 129, 0.2)",
                          color: shelter.supplyStatus === "Critical" ? "#EF4444" : shelter.supplyStatus === "Moderate" ? "#F59E0B" : "#10B981",
                          border: `1px solid ${shelter.supplyStatus === "Critical" ? "#EF4444" : shelter.supplyStatus === "Moderate" ? "#F59E0B" : "#10B981"}`,
                        }}
                      >
                        Food &amp; Water: {shelter.supplyStatus}
                      </span>
                    )}
                  </div>
                </div>

                {/* Capacity Progress Bar */}
                <div className="shelter-capacity-container">
                  <div className="shelter-capacity-header">
                    <span>
                      Occupancy: <strong style={{ color: fillColor }}>{occupied} / {total} Beds</strong>
                    </span>
                    <span style={{ color: "#34D399", fontWeight: 800 }}>{available} Free</span>
                  </div>

                  <div className="shelter-bar-track">
                    <div
                      className="shelter-bar-fill"
                      style={{ width: `${occPct}%`, background: fillColor }}
                    />
                  </div>
                </div>

                {/* Resources & Amenities Tags */}
                {shelter.resources && shelter.resources.length > 0 && (
                  <div className="shelter-resources-row">
                    {shelter.resources.map((res, i) => (
                      <span key={i} className="shelter-res-tag">
                        ✓ {res}
                      </span>
                    ))}
                  </div>
                )}

                {/* Contact Phone & Coordinates */}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "#94A3B8" }}>
                  <span>📞 {shelter.contactPhone || shelter.phone || "+91 20 2742 5555"}</span>
                  <span style={{ fontFamily: "JetBrains Mono, monospace" }}>
                    {lat?.toFixed(4)}°, {lng?.toFixed(4)}°
                  </span>
                </div>

                {/* Authority Actions Bar: Verification Toggle & Maps Link */}
                <div className="shelter-card-actions" style={{ gap: "10px" }}>
                  <button
                    type="button"
                    className="shelter-action-btn"
                    style={{
                      background: shelter.isVerified ? "#1E293B" : "rgba(16, 185, 129, 0.2)",
                      color: shelter.isVerified ? "#94A3B8" : "#34D399",
                      border: `1px solid ${shelter.isVerified ? "#334155" : "#10B981"}`,
                      fontWeight: 800,
                      flex: 1.2,
                    }}
                    onClick={() => handleToggleVerification(shelter)}
                    disabled={isVerifying}
                    title={shelter.isVerified ? "Click to revoke authority verification" : "Approve and verify facility"}
                  >
                    {isVerifying
                      ? "Updating..."
                      : shelter.isVerified
                      ? "✓ Verified (Revoke)"
                      : "Approve & Verify Shelter ✓"}
                  </button>

                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shelter-action-btn shelter-action-maps"
                    style={{ flex: 0.8 }}
                  >
                    🗺️ Directions
                  </a>
                </div>
              </div>
            );
          })}
        </section>
      </main>
    </div>
  );
}
