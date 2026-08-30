import { useState, useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import "./AlertBanner.css";

// Initial regional flash flood emergency broadcast fallback
export const INITIAL_ACTIVE_ALERT = {
  id: "alert-default-01",
  title: "RED FLASH FLOOD & DAM DISCHARGE WARNING",
  severity: "CRITICAL",
  affectedZone: "Khadakwasla Dam & Mula-Mutha Basin (Wakad / Sangvi / Dapodi)",
  instructions: "Evacuate low-lying riverbanks immediately. Move to designated emergency shelters.",
  isActive: true,
  createdAt: new Date(),
};

export default function AlertBanner() {
  const [activeAlert, setActiveAlert] = useState(INITIAL_ACTIVE_ALERT);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const q = collection(db, "alerts");
    const unsub = onSnapshot(
      q,
      (snap) => {
        if (!snap.empty) {
          const liveAlerts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          // Look for active alerts
          const current = liveAlerts.find((a) => a.isActive !== false);
          if (current) {
            setActiveAlert(current);
            setIsDismissed(false);
          } else {
            setActiveAlert(null);
          }
        }
      },
      (err) => {
        console.warn("Alerts listener error in AlertBanner:", err);
      }
    );

    return () => unsub();
  }, []);

  if (!activeAlert || !activeAlert.isActive || isDismissed) {
    return null;
  }

  return (
    <aside className="alert-banner-wrapper" role="alert" aria-live="assertive">
      <div className="alert-banner-container">
        <div className="alert-banner-left">
          <div className="alert-siren-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L1 21h22L12 2zm0 3.5L19.8 19H4.2L12 5.5zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z" />
            </svg>
            EMERGENCY BROADCAST
          </div>

          <div>
            <h2 className="alert-banner-headline">
              <span>{activeAlert.title}</span>
              {activeAlert.affectedZone && (
                <span className="alert-sector-tag">📍 {activeAlert.affectedZone}</span>
              )}
            </h2>
            <div className="alert-instructions-text">
              ⚠️ {activeAlert.instructions || "Follow official evacuation orders immediately."}
            </div>
          </div>
        </div>

        <div className="alert-banner-right">
          <button
            type="button"
            className="alert-dismiss-btn"
            onClick={() => setIsDismissed(true)}
            aria-label="Dismiss alert"
          >
            Acknowledge ✕
          </button>
        </div>
      </div>
    </aside>
  );
}
