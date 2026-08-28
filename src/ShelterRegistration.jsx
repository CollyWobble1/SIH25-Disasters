import { useState, useEffect, useCallback } from "react";
import { doc, setDoc, updateDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../firebase";
import { useNavigate } from "react-router-dom";
import "./HospitalDashboard.css";

export default function ShelterRegistration() {
  const navigate = useNavigate();

  // ── Auth & Session State ──────────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [shelterId, setShelterId] = useState(() => localStorage.getItem("registeredShelterId") || "");
  const [shelterDoc, setShelterDoc] = useState(null);
  const [docLoading, setDocLoading] = useState(true);

  // ── Registration Form State (When no shelter registered) ───────────────────
  const [regName, setRegName] = useState("");
  const [regTotalBeds, setRegTotalBeds] = useState("");
  const [regAvailableBeds, setRegAvailableBeds] = useState("");
  const [regSupplyStatus, setRegSupplyStatus] = useState("Abundant");
  const [regLat, setRegLat] = useState("");
  const [regLng, setRegLng] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regAmenities, setRegAmenities] = useState([
    "Potable Water",
    "Hot Meals",
    "First Aid Post",
    "Power Backup",
  ]);

  // ── Operational Management Form State (When shelter is registered) ────────
  const [mgrTotalBeds, setMgrTotalBeds] = useState(100);
  const [mgrAvailableBeds, setMgrAvailableBeds] = useState(100);
  const [mgrSupplyStatus, setMgrSupplyStatus] = useState("Abundant");
  const [mgrPhone, setMgrPhone] = useState("");
  const [mgrStatus, setMgrStatus] = useState("Open");
  const [mgrAmenities, setMgrAmenities] = useState([]);

  // UI state
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState("");
  const [gpsSuccess, setGpsSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  const availableAmenitiesList = [
    "Potable Water",
    "Hot Meals",
    "First Aid Post",
    "Power Backup",
    "Child Care / Nursery",
    "Sanitation & Showers",
    "Pet Friendly Area",
    "Blankets & Bedding",
    "Tactical Mesh Wi-Fi",
  ];

  // ── 1. Auth Listener ───────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
      if (user && !shelterId) {
        setShelterId(user.uid);
      }
    });
    return () => unsub();
  }, [shelterId]);

  // ── 2. Real-time Subscription to this manager's ISOLATED shelter doc ──────
  useEffect(() => {
    const activeId = shelterId || (currentUser ? currentUser.uid : null);
    if (!activeId) {
      setDocLoading(false);
      return;
    }

    const shelterRef = doc(db, "shelters", activeId);
    const unsub = onSnapshot(
      shelterRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setShelterDoc({ id: snap.id, ...data });

          // Sync operational fields
          const total = Number(data.totalBeds) || 100;
          const available = Number(data.availableBeds !== undefined ? data.availableBeds : (total - (Number(data.occupiedBeds) || 0)));
          setMgrTotalBeds(total);
          setMgrAvailableBeds(available);
          setMgrSupplyStatus(data.supplyStatus || "Abundant");
          setMgrPhone(data.contactPhone || data.phone || "");
          setMgrStatus(data.status || (available > 0 ? "Open" : "Full"));
          setMgrAmenities(Array.isArray(data.resources) ? data.resources : []);
        } else {
          setShelterDoc(null);
        }
        setDocLoading(false);
      },
      (err) => {
        console.warn("Shelter doc snapshot listener error:", err);
        setDocLoading(false);
      }
    );

    return () => unsub();
  }, [shelterId, currentUser]);

  // ── Geolocation Handler ────────────────────────────────────────────────────
  const handleGetLocation = useCallback(() => {
    setGpsError("");
    setGpsSuccess(false);

    if (!("geolocation" in navigator)) {
      setGpsError("Geolocation is not supported by your device browser.");
      return;
    }

    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setRegLat(String(pos.coords.latitude.toFixed(6)));
        setRegLng(String(pos.coords.longitude.toFixed(6)));
        setGpsLoading(false);
        setGpsSuccess(true);
      },
      (err) => {
        setGpsLoading(false);
        const map = {
          1: "Location permission denied. Please allow access or enter manually.",
          2: "Location signal unavailable. Enter coordinates manually.",
          3: "Location request timed out.",
        };
        setGpsError(map[err.code] || "Could not retrieve GPS location.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }, []);

  const toggleRegAmenity = (item) => {
    setRegAmenities((prev) =>
      prev.includes(item) ? prev.filter((a) => a !== item) : [...prev, item]
    );
  };

  const toggleMgrAmenity = (item) => {
    setMgrAmenities((prev) =>
      prev.includes(item) ? prev.filter((a) => a !== item) : [...prev, item]
    );
  };

  // ── Registration Submission (Create New Facility) ──────────────────────────
  const handleRegisterShelter = async (e) => {
    e.preventDefault();
    setSubmitError("");

    const total = Number(regTotalBeds);
    const available = Number(regAvailableBeds);

    if (isNaN(total) || total <= 0) {
      setSubmitError("Please enter a valid total bed capacity (greater than 0).");
      return;
    }

    if (isNaN(available) || available < 0) {
      setSubmitError("Please enter a valid available bed count.");
      return;
    }

    if (available > total) {
      setSubmitError("Available beds cannot exceed total capacity.");
      return;
    }

    const latVal = parseFloat(regLat);
    const lngVal = parseFloat(regLng);

    if (isNaN(latVal) || isNaN(lngVal)) {
      setSubmitError("Please provide valid GPS latitude and longitude coordinates.");
      return;
    }

    setSubmitting(true);

    const occupied = Math.max(0, total - available);
    const operationalStatus = available > 0 ? "Open" : "Full";
    const newDocId = currentUser ? currentUser.uid : `shelter_${Date.now()}`;

    const payload = {
      shelterName: regName.trim(),
      name: regName.trim(),
      totalBeds: total,
      availableBeds: available,
      occupiedBeds: occupied,
      supplyStatus: regSupplyStatus,
      latitude: latVal,
      longitude: lngVal,
      lat: latVal,
      lng: lngVal,
      contactPhone: regPhone.trim() || "+91 20 2742 5555",
      phone: regPhone.trim() || "+91 20 2742 5555",
      status: operationalStatus,
      resources: regAmenities,
      isVerified: false, // Must be verified by Authority Incident Command
      adminUid: currentUser ? currentUser.uid : newDocId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(doc(db, "shelters", newDocId), payload);
      localStorage.setItem("registeredShelterId", newDocId);
      setShelterId(newDocId);
      setShelterDoc({ id: newDocId, ...payload });
    } catch (err) {
      console.error("Failed to save facility details in Firestore:", err);
      setSubmitError(`Failed to save facility details: ${err.message || "Unknown error"}`);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Operational Update Submission (Manager Edits Own Facility) ─────────────
  const handleSaveOperationalUpdates = async (e) => {
    if (e) e.preventDefault();
    if (!shelterDoc) return;

    setSubmitting(true);
    setSaveSuccess(false);

    const total = Number(mgrTotalBeds) || 1;
    const available = Math.max(0, Math.min(total, Number(mgrAvailableBeds) || 0));
    const occupied = Math.max(0, total - available);
    const autoStatus = available <= 0 ? "Full" : mgrStatus;

    const payload = {
      totalBeds: total,
      availableBeds: available,
      occupiedBeds: occupied,
      supplyStatus: mgrSupplyStatus,
      contactPhone: mgrPhone.trim(),
      phone: mgrPhone.trim(),
      status: autoStatus,
      resources: mgrAmenities,
      updatedAt: serverTimestamp(),
    };

    try {
      await updateDoc(doc(db, "shelters", shelterDoc.id), payload);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to update shelter operational telemetry:", err);
      alert(`Could not save updates: ${err.message || "Unknown error"}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Quick Available Beds Stepper
  const handleAdjustAvailableBeds = (delta) => {
    const next = Math.max(0, Math.min(mgrTotalBeds, mgrAvailableBeds + delta));
    setMgrAvailableBeds(next);
    if (next === 0) setMgrStatus("Full");
    else if (mgrStatus === "Full" && next > 0) setMgrStatus("Open");
  };

  // Sign out / Switch Shelter
  const handleSwitchShelter = () => {
    localStorage.removeItem("registeredShelterId");
    setShelterId("");
    setShelterDoc(null);
  };

  if (authLoading || docLoading) {
    return (
      <div className="hosp-container" style={{ alignItems: "center", justifyContent: "center" }}>
        <div className="hosp-spinner" style={{ width: "36px", height: "36px" }} />
        <span style={{ marginTop: "12px", color: "#94A3B8", fontWeight: 700 }}>
          Loading shelter management console...
        </span>
      </div>
    );
  }

  return (
    <div className="hosp-container">
      {/* Top Navbar */}
      <header className="hosp-navbar">
        <div className="hosp-brand">
          <div className="hosp-brand-icon" style={{ background: "linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%)" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <div className="hosp-title-group">
            <h1 className="hosp-title">Disaster Shelter Management Portal</h1>
            <span className="hosp-subtitle">Official Emergency Evacuation Housing Telemetry</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            type="button"
            className="hosp-nav-link"
            style={{ background: "#1E293B", border: "1px solid #334155", color: "#F8FAFC", padding: "8px 14px", borderRadius: "8px", cursor: "pointer", fontWeight: 700 }}
            onClick={() => navigate("/")}
          >
            ← Home
          </button>
          {shelterDoc && (
            <button
              type="button"
              className="hosp-nav-link"
              style={{ background: "#334155", border: "1px solid #475569", color: "#F8FAFC", padding: "8px 12px", borderRadius: "8px", cursor: "pointer", fontSize: "0.82rem" }}
              onClick={handleSwitchShelter}
              title="Switch or register another facility"
            >
              Switch Facility
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="hosp-main">
        {shelterDoc ? (
          /* ========================================================================= */
          /* ISOLATED SHELTER MANAGEMENT PANEL (ONLY THIS SHELTER VISIBLE)            */
          /* ========================================================================= */
          <div className="hosp-dashboard-wrapper view-enter">
            {/* Facility Header Banner with Verification Indicator */}
            <div className="hosp-verified-banner" style={{ background: "#111C38", borderColor: "#1E293B" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                {shelterDoc.isVerified ? (
                  <div className="hosp-verified-badge" style={{ background: "rgba(16, 185, 129, 0.2)", color: "#34D399", border: "1px solid #10B981" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    ✓ Verified Facility
                  </div>
                ) : (
                  <div className="hosp-verified-badge" style={{ background: "rgba(245, 158, 11, 0.18)", color: "#F59E0B", border: "1px solid #F59E0B" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    ⏳ Verification Pending by Incident Command
                  </div>
                )}
                <strong style={{ fontSize: "1.25rem", color: "#FFFFFF" }}>
                  {shelterDoc.shelterName || shelterDoc.name}
                </strong>
              </div>

              <span style={{ fontSize: "0.82rem", color: "var(--hosp-text-muted)", fontFamily: "monospace" }}>
                GPS: {shelterDoc.latitude?.toFixed(4) || shelterDoc.lat?.toFixed(4)}°, {shelterDoc.longitude?.toFixed(4) || shelterDoc.lng?.toFixed(4)}°
              </span>
            </div>

            {/* Operational Management Form */}
            <form onSubmit={handleSaveOperationalUpdates} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div className="hosp-grid">
                {/* ── Column 1: Bed Capacity & Available Bed Stepper ──────────────── */}
                <div className="hosp-card-main">
                  <div className="hosp-metric-box">
                    <div className="hosp-metric-header">
                      <span className="hosp-metric-label">Current Available Free Beds</span>
                      <span style={{ fontSize: "0.85rem", color: "var(--hosp-text-muted)" }}>
                        Total Registry: <strong>{mgrTotalBeds} Beds</strong>
                      </span>
                    </div>

                    <div className="hosp-stepper-control">
                      <button
                        type="button"
                        className="hosp-step-btn"
                        onClick={() => handleAdjustAvailableBeds(-1)}
                        disabled={mgrAvailableBeds <= 0}
                      >
                        −
                      </button>
                      <div className="hosp-stepper-value-wrapper">
                        <div className="hosp-stepper-value" style={{ color: mgrAvailableBeds > 0 ? "#34D399" : "#EF4444" }}>
                          {mgrAvailableBeds}
                        </div>
                        <div className="hosp-stepper-sub">
                          {mgrAvailableBeds > 0 ? "Beds Open for Evacuees" : "No Beds Available (FULL)"}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="hosp-step-btn"
                        onClick={() => handleAdjustAvailableBeds(1)}
                        disabled={mgrAvailableBeds >= mgrTotalBeds}
                      >
                        +
                      </button>
                    </div>

                    <div className="hosp-quick-steppers">
                      {[-10, -5, +5, +10].map((d) => (
                        <button
                          key={d}
                          type="button"
                          className="hosp-quick-btn"
                          onClick={() => handleAdjustAvailableBeds(d)}
                          disabled={d < 0 ? mgrAvailableBeds <= 0 : mgrAvailableBeds >= mgrTotalBeds}
                        >
                          {d > 0 ? `+${d}` : d} Free Beds
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Bed Utilization Progress */}
                  <div className="hosp-capacity-meter">
                    <div className="hosp-capacity-labels">
                      <span>Housing Capacity Utilization</span>
                      <span style={{ fontWeight: 800 }}>
                        {mgrTotalBeds - mgrAvailableBeds} Occupied / {mgrTotalBeds} Total ({Math.round(((mgrTotalBeds - mgrAvailableBeds) / mgrTotalBeds) * 100)}%)
                      </span>
                    </div>
                    <div className="hosp-progress-track">
                      <div
                        className="hosp-progress-fill"
                        style={{
                          width: `${Math.min(100, Math.round(((mgrTotalBeds - mgrAvailableBeds) / mgrTotalBeds) * 100))}%`,
                          background: mgrAvailableBeds <= 0 ? "#EF4444" : (mgrAvailableBeds / mgrTotalBeds) <= 0.25 ? "#F59E0B" : "#10B981",
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* ── Column 2: Supply Status & Contact Info ──────────────────────── */}
                <div className="hosp-card-side">
                  <div className="hosp-metric-box">
                    <span className="hosp-metric-label">Food &amp; Water Supply Status</span>
                    <select
                      className="hosp-input"
                      style={{ background: "#0D1117", color: "#F0F6FC", marginTop: "8px" }}
                      value={mgrSupplyStatus}
                      onChange={(e) => setMgrSupplyStatus(e.target.value)}
                    >
                      <option value="Abundant">🟢 Abundant (72+ hours rations &amp; potable water)</option>
                      <option value="Moderate">🟡 Moderate (24-48 hours supply remaining)</option>
                      <option value="Critical">🔴 Critical (Immediate water tankers &amp; food needed)</option>
                    </select>
                  </div>

                  <div className="hosp-metric-box">
                    <span className="hosp-metric-label">Operational Intake Status</span>
                    <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                      <button
                        type="button"
                        className={`hosp-quick-btn ${mgrStatus === "Open" ? "active" : ""}`}
                        style={{ flex: 1, background: mgrStatus === "Open" ? "rgba(16, 185, 129, 0.25)" : "#1E293B", color: mgrStatus === "Open" ? "#34D399" : "#94A3B8", borderColor: mgrStatus === "Open" ? "#10B981" : "#334155" }}
                        onClick={() => setMgrStatus("Open")}
                      >
                        🟢 Open &amp; Accepting
                      </button>
                      <button
                        type="button"
                        className={`hosp-quick-btn ${mgrStatus === "Full" ? "active" : ""}`}
                        style={{ flex: 1, background: mgrStatus === "Full" ? "rgba(239, 68, 68, 0.25)" : "#1E293B", color: mgrStatus === "Full" ? "#F87171" : "#94A3B8", borderColor: mgrStatus === "Full" ? "#EF4444" : "#334155" }}
                        onClick={() => setMgrStatus("Full")}
                      >
                        🔴 At Full Capacity
                      </button>
                    </div>
                  </div>

                  <div className="hosp-metric-box">
                    <span className="hosp-metric-label">Emergency Hotline Number</span>
                    <input
                      type="tel"
                      className="hosp-input"
                      style={{ marginTop: "8px" }}
                      value={mgrPhone}
                      onChange={(e) => setMgrPhone(e.target.value)}
                      placeholder="+91 20 2742 5555"
                    />
                  </div>
                </div>
              </div>

              {/* Amenities & Special Services */}
              <div className="hosp-card-main" style={{ padding: "18px 20px" }}>
                <span className="hosp-metric-label">Active Shelter Facilities &amp; Resources</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "10px" }}>
                  {availableAmenitiesList.map((amenity) => {
                    const isSelected = mgrAmenities.includes(amenity);
                    return (
                      <button
                        key={amenity}
                        type="button"
                        onClick={() => toggleMgrAmenity(amenity)}
                        style={{
                          background: isSelected ? "rgba(14, 165, 233, 0.2)" : "#0D1117",
                          border: `1px solid ${isSelected ? "#0EA5E9" : "#2B3240"}`,
                          color: isSelected ? "#38BDF8" : "#8B949E",
                          padding: "6px 12px",
                          borderRadius: "6px",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {isSelected ? "✓ " : "+ "}
                        {amenity}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Action Save Bar */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#111C38", border: "1px solid #1E293B", padding: "14px 20px", borderRadius: "12px" }}>
                <span style={{ fontSize: "0.85rem", color: "#94A3B8" }}>
                  Changes will be broadcast live to the Authority Command map and routing agents.
                </span>

                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  {saveSuccess && (
                    <span style={{ color: "#34D399", fontWeight: 700, fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      ✓ Telemetry Saved
                    </span>
                  )}
                  <button
                    type="submit"
                    className="hosp-btn hosp-btn-primary"
                    style={{ background: "#0284C7", borderColor: "#38BDF8", padding: "10px 24px" }}
                    disabled={submitting}
                  >
                    {submitting ? "Broadcasting Updates..." : "Save & Broadcast Updates"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        ) : (
          /* ========================================================================= */
          /* REGISTRATION FORM (WHEN NO SHELTER IS REGISTERED YET)                     */
          /* ========================================================================= */
          <div className="hosp-setup-wrapper view-enter">
            <div className="hosp-setup-card">
              <div className="hosp-setup-header">
                <div className="hosp-setup-badge">FACILITY TELEMETRY REGISTRATION</div>
                <h2 className="hosp-setup-title">Register Emergency Evacuation Shelter</h2>
                <p className="hosp-setup-desc">
                  Provide verified housing capacity and supply status. Once submitted, you will manage only this shelter's telemetry.
                </p>
              </div>

              {submitError && (
                <div className="hosp-alert hosp-alert-error" role="alert" style={{ marginBottom: "16px" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{submitError}</span>
                </div>
              )}

              <form onSubmit={handleRegisterShelter} className="hosp-setup-form" noValidate>
                {/* 1. Official Shelter Name */}
                <div className="hosp-form-group">
                  <label className="hosp-label" htmlFor="regName">
                    Official Shelter / Facility Name <span className="req">*</span>
                  </label>
                  <input
                    id="regName"
                    type="text"
                    className="hosp-input"
                    placeholder="e.g. Ravet Community Relief Hall & Evacuation Center"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    required
                  />
                </div>

                {/* 2. Total Capacity & Available Beds */}
                <div className="hosp-form-row">
                  <div className="hosp-form-group">
                    <label className="hosp-label" htmlFor="regTotalBeds">
                      Total Capacity (Beds) <span className="req">*</span>
                    </label>
                    <input
                      id="regTotalBeds"
                      type="number"
                      min="1"
                      className="hosp-input"
                      placeholder="e.g. 150"
                      value={regTotalBeds}
                      onChange={(e) => setRegTotalBeds(e.target.value)}
                      required
                    />
                  </div>

                  <div className="hosp-form-group">
                    <label className="hosp-label" htmlFor="regAvailableBeds">
                      Current Available Beds <span className="req">*</span>
                    </label>
                    <input
                      id="regAvailableBeds"
                      type="number"
                      min="0"
                      className="hosp-input"
                      placeholder="e.g. 85"
                      value={regAvailableBeds}
                      onChange={(e) => setRegAvailableBeds(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* 3. Food / Water Supply Status */}
                <div className="hosp-form-group">
                  <label className="hosp-label" htmlFor="regSupplyStatus">
                    Food / Water Supply Status <span className="req">*</span>
                  </label>
                  <select
                    id="regSupplyStatus"
                    className="hosp-input"
                    value={regSupplyStatus}
                    onChange={(e) => setRegSupplyStatus(e.target.value)}
                    style={{ background: "#0D1117", color: "#F0F6FC" }}
                  >
                    <option value="Abundant">🟢 Abundant (Rations &amp; Water for 72+ hours)</option>
                    <option value="Moderate">🟡 Moderate (Supply sufficient for 24-48 hours)</option>
                    <option value="Critical">🔴 Critical (Immediate restocking / water tankers needed)</option>
                  </select>
                </div>

                {/* 4. GPS Coordinates + Geolocation Button */}
                <div className="hosp-form-group">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <label className="hosp-label" style={{ margin: 0 }}>
                      Shelter GPS Location <span className="req">*</span>
                    </label>
                    <button
                      type="button"
                      className="hosp-gps-btn"
                      onClick={handleGetLocation}
                      disabled={gpsLoading}
                    >
                      {gpsLoading ? (
                        <>
                          <span className="hosp-spinner" />
                          Acquiring GPS Fix...
                        </>
                      ) : (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="2" x2="12" y2="6" />
                            <line x1="12" y1="18" x2="12" y2="22" />
                            <line x1="2" y1="12" x2="6" y2="12" />
                            <line x1="18" y1="12" x2="22" y2="12" />
                          </svg>
                          Get My Location
                        </>
                      )}
                    </button>
                  </div>

                  <div className="hosp-form-row">
                    <input
                      type="number"
                      step="0.000001"
                      className="hosp-input"
                      placeholder="Latitude (e.g. 18.647200)"
                      value={regLat}
                      onChange={(e) => setRegLat(e.target.value)}
                      required
                    />
                    <input
                      type="number"
                      step="0.000001"
                      className="hosp-input"
                      placeholder="Longitude (e.g. 73.743200)"
                      value={regLng}
                      onChange={(e) => setRegLng(e.target.value)}
                      required
                    />
                  </div>

                  {gpsSuccess && (
                    <span style={{ fontSize: "0.78rem", color: "#34D399", marginTop: "4px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      ✓ High-accuracy GPS fix captured successfully.
                    </span>
                  )}
                  {gpsError && (
                    <span style={{ fontSize: "0.78rem", color: "#EF4444", marginTop: "4px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      ⚠️ {gpsError}
                    </span>
                  )}
                </div>

                {/* 5. Emergency Contact Phone Number */}
                <div className="hosp-form-group">
                  <label className="hosp-label" htmlFor="regPhone">
                    Emergency Contact Phone Number <span className="req">*</span>
                  </label>
                  <input
                    id="regPhone"
                    type="tel"
                    className="hosp-input"
                    placeholder="e.g. +91 20 2742 5555 / 98765 43210"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    required
                  />
                </div>

                {/* 6. Shelter Amenities & Resources */}
                <div className="hosp-form-group">
                  <label className="hosp-label">Available Facilities &amp; Amenities</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "4px" }}>
                    {availableAmenitiesList.map((amenity) => {
                      const isSelected = regAmenities.includes(amenity);
                      return (
                        <button
                          key={amenity}
                          type="button"
                          onClick={() => toggleRegAmenity(amenity)}
                          style={{
                            background: isSelected ? "rgba(14, 165, 233, 0.2)" : "#0D1117",
                            border: `1px solid ${isSelected ? "#0EA5E9" : "#2B3240"}`,
                            color: isSelected ? "#38BDF8" : "#8B949E",
                            padding: "6px 12px",
                            borderRadius: "6px",
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {isSelected ? "✓ " : "+ "}
                          {amenity}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Submit Action */}
                <div className="hosp-setup-actions" style={{ marginTop: "10px" }}>
                  <button
                    type="submit"
                    className="hosp-btn hosp-btn-primary"
                    style={{ background: "linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%)", height: "50px", fontSize: "1rem" }}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <>
                        <span className="hosp-spinner" />
                        Transmitting Facility Details to Command...
                      </>
                    ) : (
                      <>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Register &amp; Activate Management Panel
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
