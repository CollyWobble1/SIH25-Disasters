import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Polyline, Popup, Tooltip } from "react-leaflet";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import "leaflet/dist/leaflet.css";
import "./DisasterMap.css";

// Initial regional emergency evacuation and hazard route overlays
export const INITIAL_MAP_OVERLAYS = [
  {
    id: "overlay-evac-01",
    name: "Expressway Evacuation Corridor (Aundh - Wakad)",
    type: "ACCESSIBLE", // ACCESSIBLE = Safe Evacuation Route (Green)
    points: [
      [18.5590, 73.8073],
      [18.5750, 73.7850],
      [18.5987, 73.7684],
      [18.6189, 73.7498],
    ],
    statusDetails: "Cleared by Tactical Traffic Command. Open for emergency convoys & evacuees.",
    speedLimit: "40 km/h",
    lastReported: "10 mins ago",
  },
  {
    id: "overlay-evac-02",
    name: "North Evacuation Highway (Ravet Relief Hub Link)",
    type: "ACCESSIBLE",
    points: [
      [18.6189, 73.7498],
      [18.6350, 73.7460],
      [18.6472, 73.7432],
    ],
    statusDetails: "Priority ambulance transit lane active.",
    speedLimit: "50 km/h",
    lastReported: "5 mins ago",
  },
  {
    id: "overlay-damaged-01",
    name: "Old Sangvi Low Bridge (Mula River)",
    type: "DAMAGED", // DAMAGED = Damaged/Blocked Route (Red)
    points: [
      [18.5720, 73.8180],
      [18.5780, 73.8120],
      [18.5830, 73.8050],
    ],
    statusDetails: "Bridge submerged under 1.8m flash flood water. Structural crack reported.",
    hazardType: "FLASH_FLOOD_SUBMERSION",
    lastReported: "2 mins ago",
  },
  {
    id: "overlay-damaged-02",
    name: "Hinjawadi Phase 2 Hill Road Cut",
    type: "DAMAGED",
    points: [
      [18.5880, 73.7250],
      [18.5950, 73.7180],
      [18.6020, 73.7120],
    ],
    statusDetails: "Debris & power lines fallen. Impassable for heavy vehicles.",
    hazardType: "DEBRIS_FALL",
    lastReported: "15 mins ago",
  },
];

export default function DisasterMap({ isEmbedded = false, customCenter = [18.5900, 73.7600], customZoom = 12 }) {
  const [overlays, setOverlays] = useState([]);
  const [filterType, setFilterType] = useState("ALL"); // 'ALL' | 'ACCESSIBLE' | 'DAMAGED'

  // Subscribe to `map_overlays` in Firestore
  useEffect(() => {
    const q = collection(db, "map_overlays");
    const unsub = onSnapshot(
      q,
      (snap) => {
        if (!snap.empty) {
          const liveOverlays = snap.docs.map((docSnap) => {
            const data = docSnap.data();
            let points = data.points;
            if (typeof points === "string") {
              try {
                points = JSON.parse(points);
              } catch {
                points = [];
              }
            }
            return {
              id: docSnap.id,
              ...data,
              points: points || [],
            };
          });
          setOverlays(liveOverlays);
        } else {
          setOverlays(INITIAL_MAP_OVERLAYS);
        }
      },
      (err) => {
        console.warn("map_overlays Firestore error, fallback to defaults:", err);
        setOverlays(INITIAL_MAP_OVERLAYS);
      }
    );

    return () => unsub();
  }, []);

  const filteredOverlays = overlays.filter((o) => {
    if (filterType === "ALL") return true;
    return o.type === filterType;
  });

  const accessibleCount = overlays.filter((o) => o.type === "ACCESSIBLE").length;
  const damagedCount = overlays.filter((o) => o.type === "DAMAGED").length;
  const cartoKey = import.meta.env.VITE_CARTO_API_KEY || "cb1_2ie4_1_cec3ad904a316b395a35bea2";

  return (
    <div className={`disaster-map-wrapper ${isEmbedded ? "embedded" : ""}`}>
      {/* Floating Header Toolbar */}
      <div className="disaster-map-header">
        <div className="disaster-map-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
            <line x1="8" y1="2" x2="8" y2="18" />
            <line x1="16" y1="6" x2="16" y2="22" />
          </svg>
          <span>Disaster Road &amp; Route Telemetry Overlay</span>
        </div>

        <div className="disaster-map-controls">
          <button
            type="button"
            className={`disaster-map-pill ${filterType === "ALL" ? "active" : ""}`}
            onClick={() => setFilterType("ALL")}
          >
            All Routes ({overlays.length})
          </button>
          <button
            type="button"
            className={`disaster-map-pill ${filterType === "ACCESSIBLE" ? "active" : ""}`}
            onClick={() => setFilterType("ACCESSIBLE")}
            style={{ color: filterType === "ACCESSIBLE" ? "#FFFFFF" : "#34D399" }}
          >
            🟢 Accessible ({accessibleCount})
          </button>
          <button
            type="button"
            className={`disaster-map-pill ${filterType === "DAMAGED" ? "active" : ""}`}
            onClick={() => setFilterType("DAMAGED")}
            style={{ color: filterType === "DAMAGED" ? "#FFFFFF" : "#EF4444" }}
          >
            🔴 Damaged / Blocked ({damagedCount})
          </button>
        </div>
      </div>

      {/* Leaflet Map */}
      <MapContainer
        center={customCenter}
        zoom={customZoom}
        className="disaster-map-container"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?api_key=cb1_2ie4_1_cec3ad904a316b395a35bea2"
        />

        {/* Polylines for Damaged & Accessible Routes */}
        {filteredOverlays.map((overlay) => {
          const isDamaged = overlay.type === "DAMAGED";
          const lineColor = isDamaged ? "#EF4444" : "#10B981";

          return (
            <Polyline
              key={overlay.id}
              positions={overlay.points}
              pathOptions={{
                color: lineColor,
                weight: isDamaged ? 5 : 6,
                opacity: 0.9,
                dashArray: isDamaged ? "8, 8" : undefined,
              }}
            >
              <Tooltip sticky direction="top">
                <span style={{ fontWeight: 700, color: lineColor }}>
                  {isDamaged ? "⛔ DAMAGED: " : "🟢 SAFE ROUTE: "}
                </span>
                {overlay.name}
              </Tooltip>

              <Popup className="overlay-popup">
                <div className="overlay-popup-content">
                  <span className={`overlay-badge ${isDamaged ? "damaged" : "accessible"}`}>
                    {isDamaged ? "⛔ DAMAGED / BLOCKED" : "🟢 ACCESSIBLE EVACUATION ROUTE"}
                  </span>
                  <h4 style={{ margin: "4px 0", fontSize: "0.92rem", color: "#FFFFFF", fontWeight: 800 }}>
                    {overlay.name}
                  </h4>
                  <p style={{ margin: "4px 0", fontSize: "0.8rem", color: "#CBD5E1" }}>
                    {overlay.statusDetails}
                  </p>
                  {overlay.speedLimit && (
                    <div style={{ fontSize: "0.74rem", color: "#94A3B8", marginTop: "4px" }}>
                      Safe Speed Limit: <strong style={{ color: "#34D399" }}>{overlay.speedLimit}</strong>
                    </div>
                  )}
                  {overlay.hazardType && (
                    <div style={{ fontSize: "0.74rem", color: "#F87171", marginTop: "2px" }}>
                      Hazard Category: <strong>{overlay.hazardType}</strong>
                    </div>
                  )}
                </div>
              </Popup>
            </Polyline>
          );
        })}
      </MapContainer>

      {/* Floating Legend */}
      <div className="disaster-map-legend">
        <div className="legend-line-item">
          <div className="legend-line-sample accessible" />
          <span>Accessible Evacuation Corridor (Green)</span>
        </div>
        <div className="legend-line-item">
          <div className="legend-line-sample damaged" />
          <span>Damaged / Blocked Transit Route (Red)</span>
        </div>
      </div>
    </div>
  );
}
