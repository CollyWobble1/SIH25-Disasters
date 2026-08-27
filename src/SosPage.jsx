import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { Geolocation } from "@capacitor/geolocation";
import { db } from "../firebase";
import "./SosPage.css";

export default function SosPage() {
  const navigate = useNavigate();
  const [type, setType] = useState("medical");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("idle"); // 'idle' | 'sending' | 'sent' | 'error'
  const [errorMessage, setErrorMessage] = useState("");

  // Acquire coordinates using @capacitor/geolocation (native) with browser fallback
  const getCoordinates = async () => {
    try {
      if (typeof Geolocation.checkPermissions === "function") {
        const check = await Geolocation.checkPermissions();
        if (check.location !== "granted" && typeof Geolocation.requestPermissions === "function") {
          await Geolocation.requestPermissions();
        }
      }

      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
      });

      if (position && position.coords) {
        return {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
      }
    } catch (nativeErr) {
      console.warn("Capacitor Geolocation failed, attempting browser fallback:", nativeErr);
    }

    // Web Browser Geolocation Fallback
    return new Promise((resolve) => {
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos.coords),
          (err) => {
            console.warn("Browser GPS fallback failed:", err);
            resolve(null);
          },
          { enableHighAccuracy: true, timeout: 8000 }
        );
      } else {
        resolve(null);
      }
    });
  };

  const handleSubmit = async () => {
    setStatus("sending");
    setErrorMessage("");

    try {
      const coords = await getCoordinates();

      await addDoc(collection(db, "sos_requests"), {
        type,
        note: note.trim(),
        location: coords ? { lat: coords.latitude, lng: coords.longitude } : null,
        status: "pending",
        createdAt: serverTimestamp(),
      });

      setStatus("sent");
    } catch (err) {
      console.error("SOS Transmission Error:", err);
      setErrorMessage(err.message || "Failed to send emergency transmission. Please try again.");
      setStatus("error");
    }
  };

  if (status === "sent") {
    return (
      <div className="sos-page-wrapper">
        <div className="sos-page-container">
          <div className="sos-sent-screen">
            <div className="sent-beacon-icon">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
            <h2 className="sent-heading">Emergency Signal Transmitted</h2>
            <p className="sent-instructions">
              Authority Incident Command has received your location fix and transmission. Responders are being dispatched.
              <strong> Stay calm and remain where you are if safe.</strong>
            </p>

            <div className="sent-actions">
              <button
                className="role-btn-grey"
                onClick={() => {
                  setStatus("idle");
                  setNote("");
                }}
              >
                Send Additional Update
              </button>

              <button
                className="sos-back-btn"
                style={{ justifyContent: "center" }}
                onClick={() => navigate("/")}
              >
                Return to Home Screen
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sos-page-wrapper">
      <div className="sos-page-container">
        {/* Top Nav with Back Button and Alert Beacon */}
        <div className="sos-top-nav">
          <button className="sos-back-btn" onClick={() => navigate("/")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            Back
          </button>
          <div className="sos-alert-beacon">
            <span className="beacon-dot"></span>
            LIVE SOS
          </div>
        </div>

        {/* Page Headings */}
        <h1 className="sos-page-title">What is your emergency?</h1>
        <p className="sos-page-subtitle">Select emergency category and submit for instant response dispatch.</p>

        {/* SOS Form Section */}
        <div className="sos-form-section">
          <div>
            <label className="sos-label">Select Incident Type</label>
            <div className="type-grid">
              <button
                type="button"
                className={`type-card-btn ${type === "medical" ? "active" : ""}`}
                onClick={() => setType("medical")}
              >
                <span className="type-icon">🚑</span>
                Medical
              </button>

              <button
                type="button"
                className={`type-card-btn ${type === "trapped" ? "active" : ""}`}
                onClick={() => setType("trapped")}
              >
                <span className="type-icon">⚠️</span>
                Trapped / Stuck
              </button>

              <button
                type="button"
                className={`type-card-btn ${type === "fire" ? "active" : ""}`}
                onClick={() => setType("fire")}
              >
                <span className="type-icon">🔥</span>
                Fire Hazard
              </button>

              <button
                type="button"
                className={`type-card-btn ${type === "other" ? "active" : ""}`}
                onClick={() => setType("other")}
              >
                <span className="type-icon">🆘</span>
                Other Crisis
              </button>
            </div>
          </div>

          <div>
            <label className="sos-label">Caller Notes (Optional)</label>
            <textarea
              className="sos-textarea"
              placeholder="Describe injuries, hazards, floor number, or any critical details..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
          </div>

          <div className="gps-status-box">
            <svg className="gps-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            <span>Native GPS Fix will be attached automatically</span>
          </div>

          {errorMessage && (
            <p style={{ color: "#ff8080", fontSize: "0.85rem", margin: 0 }}>
              {errorMessage}
            </p>
          )}

          <button
            type="button"
            className="sos-submit-btn"
            onClick={handleSubmit}
            disabled={status === "sending"}
          >
            {status === "sending" ? (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="spin-loader">
                  <line x1="12" y1="2" x2="12" y2="6"></line>
                  <line x1="12" y1="18" x2="12" y2="22"></line>
                  <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
                  <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
                </svg>
                Transmitting SOS...
              </>
            ) : (
              <>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                Transmit SOS Alert
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}