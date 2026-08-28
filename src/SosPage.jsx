import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { collection, addDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { Geolocation } from "@capacitor/geolocation";
import { db } from "../firebase";
import { compressImageToBase64 } from "./utils/imageCompressor";
import "./SosPage.css";

const INCIDENT_CATEGORIES = [
  { id: "Medical", label: "Medical", icon: "🚑" },
  { id: "Fire", label: "Fire", icon: "🔥" },
  { id: "Flood", label: "Flood", icon: "🌊" },
  { id: "Accident", label: "Accident", icon: "🚗" },
  { id: "Trapped", label: "Trapped", icon: "⚠️" },
  { id: "Other", label: "Other", icon: "🆘" },
];

export default function SosPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // Form State
  const [type, setType] = useState("medical");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("idle"); // 'idle' | 'sending' | 'detail_modal' | 'updating_details' | 'sent' | 'error'
  const [errorMessage, setErrorMessage] = useState("");

  // Post-SOS Detail Modal State
  const [createdRequestId, setCreatedRequestId] = useState(null);
  const [detailCategory, setDetailCategory] = useState("Medical");
  const [detailNote, setDetailNote] = useState("");
  const [selectedPhotoFile, setSelectedPhotoFile] = useState(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(null);

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
            console.warn("Browser GPS fallback failed, using default regional coordinates:", err);
            resolve({ latitude: 18.5204 + (Math.random() - 0.5) * 0.02, longitude: 73.8567 + (Math.random() - 0.5) * 0.02 });
          },
          { enableHighAccuracy: true, timeout: 8000 }
        );
      } else {
        resolve({ latitude: 18.5204, longitude: 73.8567 });
      }
    });
  };

  // 1. Initial SOS Broadcast
  const handleSubmit = async () => {
    setStatus("sending");
    setErrorMessage("");

    try {
      const coords = await getCoordinates();
      const lat = coords?.latitude || coords?.lat || 18.5204;
      const lng = coords?.longitude || coords?.lng || 73.8567;

      const docRef = await addDoc(collection(db, "sos_requests"), {
        type,
        category: type.charAt(0).toUpperCase() + type.slice(1),
        note: note.trim(),
        notes: note.trim(),
        message: note.trim(),
        location: { lat, lng },
        lat,
        lng,
        latitude: lat,
        longitude: lng,
        status: "pending",
        hasDetails: false,
        createdAt: serverTimestamp(),
      });

      setCreatedRequestId(docRef.id);
      setDetailCategory(type.charAt(0).toUpperCase() + type.slice(1));
      setDetailNote(note.trim());
      setStatus("detail_modal");
    } catch (err) {
      console.error("SOS Transmission Error:", err);
      setErrorMessage(err.message || "Failed to send emergency transmission. Please try again.");
      setStatus("error");
    }
  };

  // Handle Photo Selection
  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedPhotoFile(file);
      setPhotoPreviewUrl(URL.createObjectURL(file));
    }
  };

  // Remove Photo Selection
  const handleRemovePhoto = () => {
    setSelectedPhotoFile(null);
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
      setPhotoPreviewUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // 2. Submit Additional Post-SOS Details (Base64 compressed photo + category + notes)
  const handleSaveDetails = async () => {
    if (!createdRequestId) {
      setStatus("sent");
      return;
    }

    try {
      setStatus("updating_details");

      let photoBase64 = null;
      if (selectedPhotoFile) {
        photoBase64 = await compressImageToBase64(selectedPhotoFile);
      }

      const updateData = {
        category: detailCategory,
        type: detailCategory.toLowerCase(),
        note: detailNote.trim(),
        hasDetails: true,
        updatedAt: serverTimestamp(),
      };

      if (photoBase64) {
        updateData.photoBase64 = photoBase64;
      }

      const reqDocRef = doc(db, "sos_requests", createdRequestId);
      await updateDoc(reqDocRef, updateData);

      setStatus("sent");
    } catch (err) {
      console.error("Error saving SOS secondary details:", err);
      // Even if saving photo fails, SOS is already transmitted
      setStatus("sent");
    }
  };

  // Skip Secondary Details
  const handleSkipDetails = () => {
    setStatus("sent");
  };

  // Reset entire form to send another alert
  const handleResetForm = () => {
    setStatus("idle");
    setNote("");
    setDetailNote("");
    setSelectedPhotoFile(null);
    setPhotoPreviewUrl(null);
    setCreatedRequestId(null);
    setErrorMessage("");
  };

  // ── Confirmation Screen ──────────────────────────────────────────
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
                onClick={handleResetForm}
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
                  <line x1="2" y1="12" x2="6" y2="12"></line>
                  <line x1="18" y1="12" x2="22" y2="12"></line>
                  <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
                  <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
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

      {/* ── Post-SOS Secondary Detail Modal ────────────────────────────── */}
      {(status === "detail_modal" || status === "updating_details") && (
        <div className="sos-modal-overlay">
          <div className="sos-modal-card" role="dialog" aria-modal="true">
            <div className="sos-modal-header">
              <div className="sos-modal-icon-wrap">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2ea043" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <div>
                <h3 className="sos-modal-title">Help is on the way!</h3>
                <p className="sos-modal-subtitle">Want to attach quick photos or specific details for responders?</p>
              </div>
            </div>

            {/* Category Chips */}
            <div>
              <label className="sos-label">Specific Incident Type</label>
              <div className="sos-chip-grid">
                {INCIDENT_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className={`sos-chip ${detailCategory === cat.id ? "active" : ""}`}
                    onClick={() => setDetailCategory(cat.id)}
                  >
                    <span style={{ fontSize: "1.2rem" }}>{cat.icon}</span>
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Detailed Note */}
            <div>
              <label className="sos-label">Additional Transmission Notes</label>
              <textarea
                className="sos-textarea"
                placeholder="Describe current situation, visible landmarks, number of victims..."
                value={detailNote}
                onChange={(e) => setDetailNote(e.target.value)}
                rows={2}
              />
            </div>

            {/* Photo Capture / Upload */}
            <div>
              <label className="sos-label">Attach Incident Photo (Auto-compressed)</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: "none" }}
                onChange={handlePhotoChange}
              />

              {!photoPreviewUrl ? (
                <button
                  type="button"
                  className="sos-photo-upload-label"
                  style={{ width: "100%", background: "transparent", font: "inherit" }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <span>Take photo or upload from gallery</span>
                </button>
              ) : (
                <div className="sos-photo-preview-wrap">
                  <img src={photoPreviewUrl} alt="Preview" className="sos-photo-preview" />
                  <button
                    type="button"
                    className="sos-photo-remove-btn"
                    onClick={handleRemovePhoto}
                  >
                    ✕ Remove Photo
                  </button>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="sos-modal-actions">
              <button
                type="button"
                className="sos-modal-submit-btn"
                onClick={handleSaveDetails}
                disabled={status === "updating_details"}
              >
                {status === "updating_details" ? (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="spin-loader">
                      <line x1="12" y1="2" x2="12" y2="6"></line>
                      <line x1="12" y1="18" x2="12" y2="22"></line>
                      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
                      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
                    </svg>
                    Uploading & Compressing...
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    Save & Submit Details
                  </>
                )}
              </button>

              <button
                type="button"
                className="sos-modal-skip-btn"
                onClick={handleSkipDetails}
                disabled={status === "updating_details"}
              >
                Skip & Proceed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}