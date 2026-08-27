import { useEffect, useState, useCallback } from "react";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  doc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import "./HospitalDashboard.css";

export default function HospitalDashboard() {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // ── Firestore document ──────────────────────────────────────────────────────
  const [hospitalDoc, setHospitalDoc] = useState(null); // null = not loaded yet
  const [docLoading, setDocLoading] = useState(true);

  // ── Setup form state ────────────────────────────────────────────────────────
  const [setupName, setSetupName] = useState("");
  const [setupTotalBeds, setSetupTotalBeds] = useState("");
  const [setupStaff, setSetupStaff] = useState("");
  const [setupLat, setSetupLat] = useState("");
  const [setupLng, setSetupLng] = useState("");
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState("");
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupError, setSetupError] = useState("");

  // ── Operational state ───────────────────────────────────────────────────────
  const [totalBeds, setTotalBeds] = useState(0);
  const [occupiedBeds, setOccupiedBeds] = useState(0);
  const [staffCount, setStaffCount] = useState(0);
  const [isMaxOccupied, setIsMaxOccupied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ── 1. Auth state listener ──────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
      if (!user) {
        setHospitalDoc(null);
        setDocLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // ── 2. Firestore subscription + auto-skeleton creation ──────────────────────
  useEffect(() => {
    if (!currentUser) return;

    const hospRef = doc(db, "hospitals", currentUser.uid);

    const unsub = onSnapshot(
      hospRef,
      async (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setHospitalDoc(data);

          // Sync operational sliders from cloud doc
          setTotalBeds(Number(data.totalBeds) || 0);
          setOccupiedBeds(Number(data.occupiedBeds) || 0);
          setStaffCount(Number(data.staffCount) || 0);
          setIsMaxOccupied(Boolean(data.isMaxOccupied));
        } else {
          // First login — auto-create skeleton so the setup form renders
          try {
            await setDoc(hospRef, {
              adminUid: currentUser.uid,
              isProfileComplete: false,
              isVerified: false,
              createdAt: serverTimestamp(),
            });
            // onSnapshot will fire again with the new doc
          } catch (err) {
            console.error("Failed to initialize hospital skeleton:", err);
          }
        }
        setDocLoading(false);
      },
      (err) => {
        console.error("Firestore snapshot error:", err);
        setDocLoading(false);
      }
    );

    return () => unsub();
  }, [currentUser]);

  // ── Handlers: Auth ──────────────────────────────────────────────────────────
  const handleSignIn = async (e) => {
    e.preventDefault();
    setAuthError("");
    setAuthSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, authEmail.trim(), authPassword);
      setAuthEmail("");
      setAuthPassword("");
    } catch (err) {
      const codeMap = {
        "auth/invalid-credential": "Invalid credentials. Please check your email and password.",
        "auth/user-not-found": "No account found for this email.",
        "auth/wrong-password": "Incorrect password. Please try again.",
      };
      setAuthError(codeMap[err.code] || err.message || "Sign-in failed.");
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setHospitalDoc(null);
  };

  // ── Handlers: GPS Location ─────────────────────────────────────────────────
  const handleGetLocation = useCallback(() => {
    setGpsError("");
    if (!("geolocation" in navigator)) {
      setGpsError("Geolocation is not supported by your device.");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSetupLat(String(pos.coords.latitude.toFixed(6)));
        setSetupLng(String(pos.coords.longitude.toFixed(6)));
        setGpsLoading(false);
      },
      (err) => {
        setGpsError("Could not access location. Please enter coordinates manually.");
        setGpsLoading(false);
        console.warn("GPS error:", err);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // ── Handlers: Setup Form Submission ─────────────────────────────────────────
  const handleSetupSubmit = async (e) => {
    e.preventDefault();
    setSetupError("");

    const name = setupName.trim();
    const beds = parseInt(setupTotalBeds, 10);
    const staff = parseInt(setupStaff, 10);
    const lat = parseFloat(setupLat);
    const lng = parseFloat(setupLng);

    if (!name) return setSetupError("Hospital name is required.");
    if (!beds || beds < 1) return setSetupError("Please enter a valid total bed count (minimum 1).");
    if (isNaN(staff) || staff < 0) return setSetupError("Please enter a valid staff count (0 or more).");
    if (isNaN(lat) || isNaN(lng)) return setSetupError("Please provide a valid GPS location.");

    setSetupSaving(true);
    try {
      await setDoc(
        doc(db, "hospitals", currentUser.uid),
        {
          adminUid: currentUser.uid,
          hospitalName: name,
          location: { lat, lng },
          totalBeds: beds,
          occupiedBeds: 0,
          availableBeds: beds,
          staffCount: staff,
          isMaxOccupied: false,
          isProfileComplete: true,
          isVerified: false,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      // onSnapshot will update hospitalDoc and re-render into Operational mode
    } catch (err) {
      console.error("Setup save error:", err);
      setSetupError("Failed to save facility details. Please try again.");
    } finally {
      setSetupSaving(false);
    }
  };

  // ── Handlers: Operational ───────────────────────────────────────────────────
  const handleOccupancyChange = (delta) => {
    setOccupiedBeds((prev) => {
      const next = Math.max(0, Math.min(totalBeds, prev + delta));
      if (next >= totalBeds && totalBeds > 0) setIsMaxOccupied(true);
      else if (next < totalBeds) setIsMaxOccupied(false);
      return next;
    });
  };

  const handleStaffChange = (delta) => {
    setStaffCount((prev) => Math.max(0, prev + delta));
  };

  const handleSaveOperational = async () => {
    if (!currentUser || !hospitalDoc) return;
    setSaving(true);
    setSaveSuccess(false);
    const occupied = Math.max(0, Math.min(totalBeds, occupiedBeds));
    const maxOccVal = isMaxOccupied || (totalBeds > 0 && occupied >= totalBeds);
    try {
      await setDoc(
        doc(db, "hospitals", currentUser.uid),
        {
          occupiedBeds: occupied,
          availableBeds: Math.max(0, totalBeds - occupied),
          staffCount,
          isMaxOccupied: maxOccVal,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      alert(`Error saving: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Derived values ──────────────────────────────────────────────────────────
  const availableBeds = Math.max(0, totalBeds - occupiedBeds);
  const occupancyPct = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;
  const progressClass = (isMaxOccupied || occupancyPct >= 95)
    ? "fill-max"
    : occupancyPct >= 75
    ? "fill-warning"
    : "fill-available";

  // ── Render states ───────────────────────────────────────────────────────────

  // Loading spinner
  if (authLoading || (currentUser && docLoading)) {
    return (
      <div className="hosp-container">
        <header className="hosp-navbar">
          <div className="hosp-brand">
            <div className="hosp-brand-icon"><CrossIcon /></div>
            <div className="hosp-title-group">
              <h1 className="hosp-title">Hospital Emergency Bed Command</h1>
              <span className="hosp-subtitle">Staff Capacity &amp; Surge Telemetry</span>
            </div>
          </div>
        </header>
        <main className="hosp-content">
          <div className="hosp-loading-screen">
            <div className="hosp-spinner" />
            <span>Connecting to secure facility network...</span>
          </div>
        </main>
      </div>
    );
  }

  // Not signed in → Sign In form
  if (!currentUser) {
    return (
      <div className="hosp-container">
        <header className="hosp-navbar">
          <div className="hosp-brand">
            <div className="hosp-brand-icon"><CrossIcon /></div>
            <div className="hosp-title-group">
              <h1 className="hosp-title">Hospital Emergency Bed Command</h1>
              <span className="hosp-subtitle">Authorized Personnel Only</span>
            </div>
          </div>
          <div className="hosp-nav-actions">
            <a href="/" className="hosp-nav-link"><HomeIcon /> Home</a>
          </div>
        </header>

        <main className="hosp-content">
          <div className="hosp-auth-wrapper">
            <div className="hosp-auth-header">
              <div className="hosp-auth-badge"><LockIcon /> Authorized Personnel Only</div>
              <h2 className="hosp-auth-title">Hospital Staff Sign-In</h2>
              <p className="hosp-auth-desc">
                Enter your pre-provisioned staff credentials. Your facility details will be set up after first sign-in.
              </p>
            </div>

            {authError && <div className="hosp-auth-error">{authError}</div>}

            <form onSubmit={handleSignIn} className="hosp-auth-form">
              <div className="hosp-form-group">
                <label className="hosp-input-label">Staff Email Address</label>
                <input
                  type="email"
                  className="hosp-input"
                  placeholder="hospital.staff@domain.org"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  required
                />
              </div>
              <div className="hosp-form-group">
                <label className="hosp-input-label">Security Password</label>
                <input
                  type="password"
                  className="hosp-input"
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="hosp-save-btn" disabled={authSubmitting} style={{ marginTop: "8px" }}>
                {authSubmitting ? "Authenticating..." : "Sign In to Capacity Console"}
              </button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  // ── Signed in, profile NOT complete → Setup Form ────────────────────────────
  if (!hospitalDoc?.isProfileComplete) {
    return (
      <div className="hosp-container">
        <header className="hosp-navbar">
          <div className="hosp-brand">
            <div className="hosp-brand-icon"><CrossIcon /></div>
            <div className="hosp-title-group">
              <h1 className="hosp-title">Facility First-Time Setup</h1>
              <span className="hosp-subtitle">Complete your facility registration</span>
            </div>
          </div>
          <div className="hosp-nav-actions">
            <button className="hosp-logout-btn" onClick={handleSignOut}><LogoutIcon /> Sign Out</button>
          </div>
        </header>

        <main className="hosp-content">
          <div className="hosp-setup-wrapper">
            {/* Progress indicator */}
            <div className="hosp-setup-progress">
              <div className="hosp-setup-step completed">
                <div className="step-dot">✓</div>
                <span>Account Verified</span>
              </div>
              <div className="hosp-setup-connector active" />
              <div className="hosp-setup-step active">
                <div className="step-dot">2</div>
                <span>Facility Details</span>
              </div>
              <div className="hosp-setup-connector" />
              <div className="hosp-setup-step">
                <div className="step-dot">3</div>
                <span>Operational</span>
              </div>
            </div>

            <div className="hosp-setup-card">
              <div className="hosp-setup-header">
                <h2 className="hosp-setup-title">Complete Facility Registration</h2>
                <p className="hosp-setup-desc">
                  Welcome! Your login credentials are verified. Please fill out your facility's emergency capacity details to activate your dashboard.
                </p>
              </div>

              {setupError && <div className="hosp-auth-error">{setupError}</div>}

              <form onSubmit={handleSetupSubmit} className="hosp-setup-form">
                {/* Hospital Name */}
                <div className="hosp-form-group">
                  <label className="hosp-input-label">Official Hospital / Facility Name</label>
                  <input
                    type="text"
                    className="hosp-input"
                    placeholder="e.g. Apollo Emergency Trauma Center"
                    value={setupName}
                    onChange={(e) => setSetupName(e.target.value)}
                    required
                  />
                </div>

                {/* Capacity Fields Row */}
                <div className="hosp-setup-row">
                  <div className="hosp-form-group">
                    <label className="hosp-input-label">Total Emergency Beds</label>
                    <input
                      type="number"
                      className="hosp-input"
                      placeholder="e.g. 50"
                      min="1"
                      value={setupTotalBeds}
                      onChange={(e) => setSetupTotalBeds(e.target.value)}
                      required
                    />
                  </div>
                  <div className="hosp-form-group">
                    <label className="hosp-input-label">Staff for Minor Injuries</label>
                    <input
                      type="number"
                      className="hosp-input"
                      placeholder="e.g. 8"
                      min="0"
                      value={setupStaff}
                      onChange={(e) => setSetupStaff(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* GPS Location */}
                <div className="hosp-form-group">
                  <label className="hosp-input-label">Hospital GPS Location</label>
                  <div className="hosp-gps-row">
                    <input
                      type="text"
                      className="hosp-input"
                      placeholder="Latitude (e.g. 28.6139)"
                      value={setupLat}
                      onChange={(e) => setSetupLat(e.target.value)}
                      required
                    />
                    <input
                      type="text"
                      className="hosp-input"
                      placeholder="Longitude (e.g. 77.2090)"
                      value={setupLng}
                      onChange={(e) => setSetupLng(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="hosp-gps-btn"
                      onClick={handleGetLocation}
                      disabled={gpsLoading}
                      title="Get device GPS coordinates"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <circle cx="12" cy="12" r="3" />
                        <line x1="12" y1="2" x2="12" y2="5" />
                        <line x1="12" y1="19" x2="12" y2="22" />
                        <line x1="2" y1="12" x2="5" y2="12" />
                        <line x1="19" y1="12" x2="22" y2="12" />
                      </svg>
                      {gpsLoading ? "Acquiring..." : "Get My Location"}
                    </button>
                  </div>
                  {gpsError && <span className="hosp-gps-error">{gpsError}</span>}
                  {setupLat && setupLng && !gpsError && (
                    <span className="hosp-gps-confirm">
                      ✓ Location acquired: {setupLat}, {setupLng}
                    </span>
                  )}
                </div>

                <button
                  type="submit"
                  className="hosp-save-btn"
                  disabled={setupSaving}
                  style={{ marginTop: "8px" }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {setupSaving ? "Saving Facility Details..." : "Complete Setup & Activate Dashboard"}
                </button>
              </form>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── Signed in + profile complete → Operational Dashboard ────────────────────
  return (
    <div className="hosp-container">
      <header className="hosp-navbar">
        <div className="hosp-brand">
          <div className="hosp-brand-icon"><CrossIcon /></div>
          <div className="hosp-title-group">
            <h1 className="hosp-title">Hospital Emergency Bed Command</h1>
            <span className="hosp-subtitle">Staff Capacity &amp; Surge Telemetry</span>
          </div>
        </div>
        <div className="hosp-nav-actions">
          <button className="hosp-logout-btn" onClick={handleSignOut}><LogoutIcon /> Sign Out</button>
          <a href="/" className="hosp-nav-link"><HomeIcon /> Home</a>
        </div>
      </header>

      <main className="hosp-content">
        {/* Verified Facility Banner */}
        <div className="hosp-verified-banner">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div className="hosp-verified-badge">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Verified Facility
            </div>
            <strong style={{ fontSize: "1.15rem", color: "#ffffff" }}>
              {hospitalDoc.hospitalName}
            </strong>
          </div>
          <span style={{ fontSize: "0.85rem", color: "var(--hosp-text-muted)" }}>
            Staff: <span style={{ color: "#ffffff" }}>{currentUser.email}</span>
          </span>
        </div>

        {/* Max Occupancy Alert */}
        {isMaxOccupied && (
          <div className="hosp-max-alert-banner" role="alert">
            <div className="hosp-alert-content">
              <div className="hosp-alert-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div>
                <h3 className="hosp-alert-title">MAX OCCUPANCY REACHED — FACILITY SATURATED</h3>
                <p className="hosp-alert-desc">
                  Broadcasting emergency saturation to Authority Incident Command. Incoming dispatches are being rerouted.
                </p>
              </div>
            </div>
            <button
              className="hosp-quick-btn"
              style={{ background: "#EF4444", color: "#FFFFFF", borderColor: "#EF4444" }}
              onClick={() => setIsMaxOccupied(false)}
            >
              Clear Saturation
            </button>
          </div>
        )}

        <div className="hosp-grid">
          {/* ── Main Controls Card ─────────────────────────────────────────── */}
          <div className="hosp-card-main">
            {/* Occupied Beds Stepper */}
            <div className="hosp-metric-box">
              <div className="hosp-metric-header">
                <span className="hosp-metric-label">Occupied Emergency Beds</span>
                <span style={{ fontSize: "0.85rem", color: "var(--hosp-text-muted)" }}>
                  Registry: <strong>{totalBeds} Total Beds</strong>
                </span>
              </div>
              <div className="hosp-stepper-control">
                <button className="hosp-step-btn" onClick={() => handleOccupancyChange(-1)} disabled={occupiedBeds <= 0}>−</button>
                <div className="hosp-stepper-value-wrapper">
                  <div className="hosp-stepper-value">{occupiedBeds}</div>
                  <div className="hosp-stepper-sub">Beds Currently In Use</div>
                </div>
                <button className="hosp-step-btn" onClick={() => handleOccupancyChange(1)} disabled={occupiedBeds >= totalBeds}>+</button>
              </div>
              <div className="hosp-quick-steppers">
                {[-5, -1, +1, +5].map((d) => (
                  <button
                    key={d}
                    className="hosp-quick-btn"
                    onClick={() => handleOccupancyChange(d)}
                    disabled={d < 0 ? occupiedBeds <= 0 : occupiedBeds >= totalBeds}
                  >
                    {d > 0 ? `+${d}` : d} Bed{Math.abs(d) !== 1 ? "s" : ""}
                  </button>
                ))}
              </div>
            </div>

            {/* Capacity Gauge */}
            <div className="hosp-capacity-meter">
              <div className="hosp-capacity-labels">
                <span>Bed Utilization</span>
                <span style={{ fontWeight: 800 }}>{occupancyPct}% Occupied</span>
              </div>
              <div className="hosp-progress-track">
                <div
                  className={`hosp-progress-fill ${progressClass}`}
                  style={{ width: `${Math.min(100, occupancyPct)}%` }}
                />
              </div>
            </div>

            {/* Staff Count Stepper */}
            <div className="hosp-metric-box">
              <div className="hosp-metric-header">
                <span className="hosp-metric-label">Available Staff</span>
                <span style={{ fontSize: "0.8rem", color: "#38bdf8" }}>Trained for Minor Injuries</span>
              </div>
              <div className="hosp-stepper-control">
                <button className="hosp-step-btn" style={{ width: 42, height: 42 }} onClick={() => handleStaffChange(-1)} disabled={staffCount <= 0}>−</button>
                <div className="hosp-stepper-value-wrapper" style={{ minWidth: 100 }}>
                  <div className="hosp-stepper-value" style={{ fontSize: "2.4rem" }}>{staffCount}</div>
                  <div className="hosp-stepper-sub">Medical Personnel On Duty</div>
                </div>
                <button className="hosp-step-btn" style={{ width: 42, height: 42 }} onClick={() => handleStaffChange(1)}>+</button>
              </div>
            </div>

            {/* Max Occupancy Toggle */}
            <div className="hosp-toggle-row">
              <div className="hosp-toggle-label-group">
                <span className="hosp-toggle-title">Manual Max Occupancy Override</span>
                <span className="hosp-toggle-desc">
                  Broadcast "MAX OCCUPANCY REACHED" to Authority Command. Triggers automatically when all beds are occupied.
                </span>
              </div>
              <label className="switch-label">
                <input type="checkbox" checked={isMaxOccupied} onChange={(e) => setIsMaxOccupied(e.target.checked)} />
                <span className="switch-slider"></span>
              </label>
            </div>

            {/* Commit Button */}
            <div>
              <button className="hosp-save-btn" onClick={handleSaveOperational} disabled={saving}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
                {saving ? "Transmitting Updates..." : "Commit Capacity Updates to Firestore"}
              </button>
              {saveSuccess && (
                <p style={{ color: "#34D399", textAlign: "center", fontSize: "0.9rem", marginTop: "8px" }}>
                  ✓ Capacity synchronized to Authority Incident Command!
                </p>
              )}
            </div>
          </div>

          {/* ── Side Telemetry Card ────────────────────────────────────────── */}
          <div className="hosp-card-side">
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800 }}>Live Telemetry Broadcast</h3>

            <div className="hosp-summary-list">
              <div className="hosp-summary-item">
                <span className="hosp-summary-label">Available Free Beds</span>
                <span className="hosp-summary-value" style={{ color: availableBeds > 5 ? "#34D399" : "#EF4444" }}>
                  {availableBeds}
                </span>
              </div>
              <div className="hosp-summary-item">
                <span className="hosp-summary-label">Total Bed Registry</span>
                <span className="hosp-summary-value">{totalBeds}</span>
              </div>
              <div className="hosp-summary-item">
                <span className="hosp-summary-label">Minor Trauma Staff</span>
                <span className="hosp-summary-value" style={{ color: "#38BDF8" }}>{staffCount}</span>
              </div>
              <div className="hosp-summary-item">
                <span className="hosp-summary-label">Network Status</span>
                <span style={{
                  fontSize: "0.85rem",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  color: isMaxOccupied ? "#EF4444" : "#10B981",
                }}>
                  {isMaxOccupied ? "MAX OCCUPIED" : "ACCEPTING PATIENTS"}
                </span>
              </div>
              <div className="hosp-summary-item">
                <span className="hosp-summary-label">GPS Coordinates</span>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.82rem", color: "#58A6FF" }}>
                  {hospitalDoc.location
                    ? `${hospitalDoc.location.lat}, ${hospitalDoc.location.lng}`
                    : "–"}
                </span>
              </div>
            </div>

            <div style={{ marginTop: "auto", padding: "12px", background: "rgba(255,255,255,0.03)", borderRadius: "10px", fontSize: "0.8rem", color: "var(--hosp-text-muted)" }}>
              Firestore Document ID: <code style={{ wordBreak: "break-all" }}>{currentUser.uid}</code>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ── Reusable SVG icon helpers ───────────────────────────────────────────────
function CrossIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 6v12M6 12h12" />
      <rect x="2" y="2" width="20" height="20" rx="4" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
