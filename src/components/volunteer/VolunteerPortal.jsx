import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../firebase";
import "./Volunteer.css";

// Helper to extract real GPS coordinates from any incident/request structure without hardcoded defaults
function extractCoordinates(item) {
  if (!item) return null;

  let lat = null;
  let lng = null;

  if (item.latitude !== undefined && item.latitude !== null) {
    lat = Number(item.latitude);
  } else if (item.lat !== undefined && item.lat !== null) {
    lat = Number(item.lat);
  } else if (item.location && typeof item.location === "object") {
    if (item.location.latitude !== undefined && item.location.latitude !== null) {
      lat = Number(item.location.latitude);
    } else if (item.location.lat !== undefined && item.location.lat !== null) {
      lat = Number(item.location.lat);
    }
  } else if (item.coordinates && typeof item.coordinates === "object") {
    if (item.coordinates.latitude !== undefined && item.coordinates.latitude !== null) {
      lat = Number(item.coordinates.latitude);
    } else if (item.coordinates.lat !== undefined && item.coordinates.lat !== null) {
      lat = Number(item.coordinates.lat);
    }
  }

  if (item.longitude !== undefined && item.longitude !== null) {
    lng = Number(item.longitude);
  } else if (item.lng !== undefined && item.lng !== null) {
    lng = Number(item.lng);
  } else if (item.location && typeof item.location === "object") {
    if (item.location.longitude !== undefined && item.location.longitude !== null) {
      lng = Number(item.location.longitude);
    } else if (item.location.lng !== undefined && item.location.lng !== null) {
      lng = Number(item.location.lng);
    }
  } else if (item.coordinates && typeof item.coordinates === "object") {
    if (item.coordinates.longitude !== undefined && item.coordinates.longitude !== null) {
      lng = Number(item.coordinates.longitude);
    } else if (item.coordinates.lng !== undefined && item.coordinates.lng !== null) {
      lng = Number(item.coordinates.lng);
    }
  }

  if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
    return {
      lat,
      lng,
      latitude: lat,
      longitude: lng,
    };
  }

  return null;
}

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

// Visual 4-Step Incident Lifecycle Progress Stepper Component
export function IncidentLifecycleStepper({ status }) {
  const currentStep = getIncidentStepIndex(getUnifiedStatus(status));
  const steps = [
    { num: 1, label: "1. Reported", key: "PENDING" },
    { num: 2, label: "2. Dispatched", key: "VOLUNTEER_DISPATCHED" },
    { num: 3, label: "3. On Scene", key: "IN_PROGRESS" },
    { num: 4, label: "4. Resolved", key: "RESOLVED" },
  ];

  return (
    <div style={{ margin: "8px 0 6px 0", background: "rgba(15, 23, 42, 0.4)", borderRadius: "8px", padding: "8px 10px", border: "1px solid rgba(148, 163, 184, 0.15)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative" }}>
        {/* Step Connector Line */}
        <div
          style={{
            position: "absolute",
            top: "9px",
            left: "12%",
            right: "12%",
            height: "2px",
            background: "#CBD5E1",
            zIndex: 1,
          }}
        />
        {steps.map((step) => {
          const isDone = currentStep >= step.num;
          const isCurrent = currentStep === step.num;
          const stepColor = isDone ? (step.num === 4 ? "#10B981" : step.num === 3 ? "#0284C7" : step.num === 2 ? "#D97706" : "#2563EB") : "#94A3B8";

          return (
            <div key={step.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, position: "relative", zIndex: 2 }}>
              <div
                style={{
                  width: "19px",
                  height: "19px",
                  borderRadius: "50%",
                  background: isDone ? stepColor : "#FFFFFF",
                  border: `2px solid ${stepColor}`,
                  color: isDone ? "#FFFFFF" : "#64748B",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "9px",
                  fontWeight: 800,
                  boxShadow: isCurrent ? `0 0 6px ${stepColor}` : "none",
                  transition: "all 0.2s ease",
                }}
              >
                {isDone && currentStep > step.num ? "✓" : step.num}
              </div>
              <span
                style={{
                  fontSize: "9px",
                  fontWeight: isCurrent ? 800 : 600,
                  color: isDone ? (isCurrent ? "#0F172A" : stepColor) : "#64748B",
                  marginTop: "3px",
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

// Initial Mock Regional Hazard Incidents
const INITIAL_MOCK_INCIDENTS = [
  {
    incidentId: "inc-wakad-01",
    title: "Wakad Response Zone",
    category: "FLOOD",
    type: "flood",
    location: "Wakad, Pune",
    distance: "2.8 km",
    severity: "HIGH",
    priority: "HIGH",
    situation: "Flood emergency assistance",
    note: "Evacuation support is required in low-lying residential clusters.",
    notes: "Evacuation support is required in low-lying residential clusters.",
    message: "Evacuation support is required in low-lying residential clusters.",
    requiredVolunteers: 10,
    volunteersNeeded: 10,
    claimedCount: 2,
    isFull: false,
    source: "Government Emergency Response",
    commMethod: "Cellular & Mesh",
    callerContact: "NDRF Command Post (020-27425555)",
    description: "Emergency assistance and evacuation support is required in low-lying residential clusters.",
    status: "ACTIVE",
    coordinates: { lat: 18.5987, lng: 73.7684 },
    defaultTask: {
      taskId: "task-wakad-evac",
      title: "Evacuation Assistance",
      assignedBy: "NDRF Response Team A",
      status: "IN PROGRESS",
      supervisorNote: "Meet us at the relief camp entrance. We will brief you on sector evacuation priority.",
    },
  },
  {
    incidentId: "inc-ravet-02",
    title: "Ravet Relief Shelter",
    category: "MEDICAL",
    type: "medical",
    location: "Ravet, Pune",
    distance: "4.1 km",
    severity: "CRITICAL",
    priority: "CRITICAL",
    situation: "First aid & medical triage",
    note: "Medical first aid triage and victim intake coordination needed.",
    notes: "Medical first aid triage and victim intake coordination needed.",
    message: "Medical first aid triage and victim intake coordination needed.",
    requiredVolunteers: 6,
    volunteersNeeded: 6,
    claimedCount: 1,
    isFull: false,
    source: "Disaster Cell PCMC",
    commMethod: "Emergency Broadcast",
    callerContact: "PCMC Control Room",
    description: "Medical first aid triage and victim intake coordination needed at the shelter gymnasium.",
    status: "ACTIVE",
    coordinates: { lat: 18.6472, lng: 73.7432 },
    defaultTask: {
      taskId: "task-ravet-med",
      title: "First Aid Triage Support",
      assignedBy: "Medical Unit 2",
      status: "IN PROGRESS",
      supervisorNote: "Report to the primary medical triage desk near Gate 2 for patient registration.",
    },
  },
  {
    incidentId: "inc-punawale-03",
    title: "Punawale Response Zone",
    category: "SUPPLY",
    type: "other",
    location: "Punawale, Pune",
    distance: "3.6 km",
    severity: "HIGH",
    priority: "HIGH",
    situation: "Relief food & water supply",
    note: "Distribution of clean potable water packages and emergency food rations.",
    notes: "Distribution of clean potable water packages and emergency food rations.",
    message: "Distribution of clean potable water packages and emergency food rations.",
    requiredVolunteers: 15,
    volunteersNeeded: 15,
    claimedCount: 4,
    isFull: false,
    source: "NDRF Field Unit",
    commMethod: "Offline Mesh",
    callerContact: "Civil Defense Logistics",
    description: "Distribution of clean potable water packages and emergency food rations.",
    status: "ACTIVE",
    coordinates: { lat: 18.6189, lng: 73.7498 },
    defaultTask: {
      taskId: "task-punawale-shelter",
      title: "Ration Logistics Support",
      assignedBy: "NDRF Logistics",
      status: "IN PROGRESS",
      supervisorNote: "Help unload relief trucks and organize family supply distribution queues.",
    },
  },
];

const INITIAL_MOCK_MESSAGES = [
  {
    id: "msg-01",
    sender: "Government Emergency Response",
    content: "Disaster alert issued for Pune Metropolitan Region. Citizen SOS channels active.",
    time: "11:40 AM",
    source: "NDRF Command",
    commMethod: "Cellular Broadcast",
  },
  {
    id: "msg-02",
    sender: "Response Team A",
    content: "Volunteers responding to Wakad: please check in at the north entrance triage post.",
    time: "11:49 AM",
    source: "Field Commander Unit",
    commMethod: "Offline Mesh",
  },
  {
    id: "msg-03",
    sender: "Disaster Management Cell",
    content: "Emergency medical supplies replenished at Ravet Relief Shelter staging desk.",
    time: "11:55 AM",
    source: "PCMC Operations",
    commMethod: "Tactical Radio / Mesh",
  },
];

export default function VolunteerPortal() {
  // Navigation & Screen Flow States
  const [activeScreen, setActiveScreen] = useState("disaster_alert"); // 'disaster_alert' | 'not_now' | 'app_main'
  const [activeTab, setActiveTab] = useState("home"); // 'home' | 'details' | 'confirmed' | 'travelling' | 'arrived' | 'completed' | 'messages' | 'profile'

  // Volunteer Profile State
  const [profile] = useState({
    name: "Rahul Sharma",
    volunteerId: "VOL-1024",
    location: "Wakad, Pune",
    skills: ["First Aid & CPR", "Rescue Assistance", "Logistics Coordination"],
    phone: "+91 98765 43210",
    bloodGroup: "O+",
  });

  // Connectivity & Offline Mesh Simulation State
  const [isOnline, setIsOnline] = useState(true);
  const [syncState, setSyncState] = useState("idle"); // 'idle' | 'syncing' | 'synced'

  // Real-time Firestore SOS Requests State
  const [firestoreRequests, setFirestoreRequests] = useState([]);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [currentResponse, setCurrentResponse] = useState(null);
  const [responseStatus, setResponseStatus] = useState("IDLE"); // 'IDLE' | 'CONFIRMED' | 'TRAVELLING' | 'ARRIVED' | 'TASK_ASSIGNED' | 'COMPLETED'
  const [arrivedAt, setArrivedAt] = useState(null);
  const [assignedTask, setAssignedTask] = useState(null);
  const [messages] = useState(INITIAL_MOCK_MESSAGES);
  const [toasts, setToasts] = useState([]);
  const [lightboxPhoto, setLightboxPhoto] = useState(null);

  // Time display
  const [currentTime, setCurrentTime] = useState("09:41");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    };
    updateTime();
    const timer = setInterval(updateTime, 15000);
    return () => clearInterval(timer);
  }, []);

  // Toast Helper
  const addToast = (message, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  };

  // 1. Subscribe to Firestore `sos_requests` in real time with dynamic capacity & quota extraction
  useEffect(() => {
    const q = collection(db, "sos_requests");
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const liveItems = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          const statusLower = (data.status || "pending").toLowerCase();
          const isDispatched = data.status === "DISPATCHED" || statusLower === "dispatched" || data.volunteerRequested === true;
          const isEnRoute = data.status === "RESPONDER_EN_ROUTE" || statusLower === "in_progress";
          const isResolved = statusLower === "resolved";
          const isPending = statusLower === "pending";

          // Dynamically extract real coordinates without hardcoding
          const coords = extractCoordinates(data);

          // Dynamic field mapping: category, type, notes/message, photo
          const category = (data.category || data.type || "OTHER").toUpperCase();
          const callerNotes = data.notes || data.note || data.message || "Emergency assistance requested.";

          // Volunteer Quota & Active Claim Calculations
          const rawAssignedVolunteers = Array.isArray(data.assignedVolunteers)
            ? data.assignedVolunteers
            : data.assignedVolunteer
            ? [data.assignedVolunteer]
            : data.responder
            ? [data.responder]
            : [];

          const claimedCount = Array.isArray(data.assignedVolunteers)
            ? data.assignedVolunteers.length
            : data.assignedTo || data.assignedVolunteer || data.responder
            ? 1
            : 0;

          const requiredVolunteers = Number(data.requiredVolunteers || data.volunteersNeeded) || 1;
          const isFull = claimedCount >= requiredVolunteers;
          const isAlreadyClaimedByMe = rawAssignedVolunteers.some(
            (v) => v.responderId === profile.volunteerId || v.volunteerId === profile.volunteerId || v.phone === profile.phone
          );

          return {
            id: docSnap.id,
            firestoreId: docSnap.id,
            isFirestore: true,
            isDispatched,
            isEnRoute,
            category,
            type: data.type || category.toLowerCase(),
            note: callerNotes,
            notes: callerNotes,
            message: callerNotes,
            title: `${category} Emergency`,
            location: coords ? `${coords.lat.toFixed(4)}°, ${coords.lng.toFixed(4)}°` : "Coordinates Pending",
            distance: coords ? "1.2 km" : "Pending GPS Fix",
            distanceKm: 1.2,
            severity: isDispatched ? "CRITICAL" : isPending ? "HIGH" : isEnRoute ? "HIGH" : "RESOLVED",
            priority: isDispatched ? "DISPATCHED" : isPending ? "CRITICAL" : isEnRoute ? "EN ROUTE" : "NORMAL",
            situation: callerNotes,
            requiredVolunteers,
            claimedCount,
            isFull,
            isAlreadyClaimedByMe,
            rawAssignedVolunteers,
            volunteersNeeded: Math.max(0, requiredVolunteers - claimedCount),
            source: isDispatched ? "Authority Command Dispatch" : "Citizen SOS Transmission",
            callerContact: data.contact || data.phone || data.callerContact || "Emergency SOS Channel",
            commMethod: "Citizen Emergency Link",
            description: callerNotes,
            status: isResolved ? "RESOLVED" : isEnRoute ? "RESPONDER_EN_ROUTE" : isDispatched ? "DISPATCHED" : "ACTIVE",
            photoBase64: data.photoBase64 || null,
            responder: data.responder || data.assignedVolunteer || null,
            assignedVolunteers: rawAssignedVolunteers,
            coordinates: coords,
            lat: coords?.lat || null,
            lng: coords?.lng || null,
            latitude: coords?.lat || null,
            longitude: coords?.lng || null,
            defaultTask: {
              taskId: `task-live-${docSnap.id.slice(0, 5)}`,
              title: `${category} Field Response`,
              assignedBy: isDispatched ? "Emergency Incident Command (Dispatched)" : "NDRF Field Coordination",
              status: "IN PROGRESS",
              supervisorNote: "Proceed directly to victim coordinate. Provide immediate triage and assist responders.",
            },
          };
        });

        setFirestoreRequests(liveItems);
      },
      (err) => {
        console.error("Firestore SOS subscription error in VolunteerPortal:", err);
      }
    );

    return () => unsubscribe();
  }, [profile.volunteerId, profile.phone]);

  // Combined incident list: Capacity Filter Logic (Hides full quota items in real time)
  const allIncidents = useMemo(() => {
    // Filter out resolved requests AND filter out full quota requests (claimedCount >= requiredVolunteers),
    // EXCEPT if currently claimed by this user so they can still manage/view their response.
    const availableLive = firestoreRequests.filter((r) => {
      if (r.status === "RESOLVED") return false;
      const isCapacityFull = (r.claimedCount || 0) >= (r.requiredVolunteers || 1);
      if (isCapacityFull && !r.isAlreadyClaimedByMe) return false;
      return true;
    });

    // Sort so DISPATCHED by command appear at the very top
    const sortedLive = [...availableLive].sort((a, b) => {
      if (a.isDispatched && !b.isDispatched) return -1;
      if (!a.isDispatched && b.isDispatched) return 1;
      return 0;
    });

    // Also filter mock incidents if full
    const availableMocks = INITIAL_MOCK_INCIDENTS.filter((inc) => {
      const claimed = inc.claimedCount || 0;
      const req = inc.requiredVolunteers || inc.volunteersNeeded || 1;
      return claimed < req;
    });

    return [...sortedLive, ...availableMocks];
  }, [firestoreRequests]);

  // Dynamic Disaster Alert Incident for Screen 1 (Driven by Firestore real-time listener)
  const activeDisasterAlert = useMemo(() => {
    const availableLive = firestoreRequests.filter((r) => {
      if (r.status === "RESOLVED") return false;
      const isCapacityFull = (r.claimedCount || 0) >= (r.requiredVolunteers || 1);
      if (isCapacityFull && !r.isAlreadyClaimedByMe) return false;
      return true;
    });

    const dispatched = availableLive.find((r) => r.isDispatched);
    if (dispatched) return dispatched;

    const activePending = availableLive.find((r) => !r.isFull);
    if (activePending) return activePending;

    if (availableLive.length > 0) return availableLive[0];

    return allIncidents[0] || INITIAL_MOCK_INCIDENTS[0];
  }, [firestoreRequests, allIncidents]);

  // Handle Offline Simulation Toggle
  const toggleOffline = () => {
    if (isOnline) {
      setIsOnline(false);
      setSyncState("idle");
      addToast("Switched to OFFLINE mode. Data available locally via Mesh.", "mesh");
    } else {
      setIsOnline(true);
      setSyncState("syncing");
      addToast("Internet connection restored. Synchronizing...", "mesh");

      setTimeout(() => {
        setSyncState("synced");
        addToast("✓ Synced with central emergency command.", "success");
        setTimeout(() => {
          setSyncState("idle");
        }, 2000);
      }, 1400);
    }
  };

  // Google Maps Direction Launcher: Dynamically extracts coordinates from activeRequest
  const openGoogleMapsDirections = (itemOrCoords) => {
    const coords = extractCoordinates(itemOrCoords);
    if (coords && coords.lat !== null && coords.lng !== null && !isNaN(coords.lat) && !isNaN(coords.lng)) {
      const targetLat = coords.lat;
      const targetLng = coords.lng;
      const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${targetLat},${targetLng}`;
      window.open(mapsUrl, "_blank", "noopener,noreferrer");
    } else {
      addToast("Valid destination coordinates are not available for this request.", "alert");
    }
  };

  // Workflow Action: Volunteer clicks "YES, I WANT TO HELP" or "Accept Emergency & En Route"
  const handleAcceptEmergencyAndEnRoute = async (incident) => {
    const target = incident || activeDisasterAlert;
    if (!target) return;

    const targetClaimed = target.claimedCount || 0;
    const targetReq = target.requiredVolunteers || 1;
    if (targetClaimed >= targetReq && !target.isAlreadyClaimedByMe) {
      addToast("This emergency response quota has already been filled.", "alert");
      return;
    }

    try {
      if (target.isFirestore && target.firestoreId) {
        const reqRef = doc(db, "sos_requests", target.firestoreId);
        const existingVolunteers = Array.isArray(target.rawAssignedVolunteers)
          ? target.rawAssignedVolunteers
          : target.assignedVolunteer
          ? [target.assignedVolunteer]
          : target.responder
          ? [target.responder]
          : [];

        const newVolunteerEntry = {
          responderId: profile.volunteerId,
          volunteerId: profile.volunteerId,
          name: profile.name,
          phone: profile.phone,
          respondedAt: new Date().toISOString(),
        };

        const updatedVolunteers = existingVolunteers.some(
          (v) => v.responderId === profile.volunteerId || v.volunteerId === profile.volunteerId
        )
          ? existingVolunteers
          : [...existingVolunteers, newVolunteerEntry];

        await updateDoc(reqRef, {
          status: "IN_PROGRESS",
          assignedVolunteers: updatedVolunteers,
          assignedVolunteer: newVolunteerEntry,
          responder: newVolunteerEntry,
          claimedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      setCurrentResponse(target);
      setSelectedIncident(target);
      setResponseStatus("CONFIRMED");
      setActiveScreen("app_main");
      setActiveTab("confirmed");
      addToast(`Emergency accepted for ${target.title}. Status updated to IN_PROGRESS (On Scene).`, "success");
    } catch (err) {
      console.error("Error accepting emergency:", err);
      addToast(`Could not update status: ${err.message}`, "alert");
    }
  };

  // Start Navigation Action
  const handleStartNavigation = () => {
    setResponseStatus("TRAVELLING");
    setActiveTab("travelling");
    addToast("Navigation active. Proceed to the designated point.", "mesh");
  };

  // Mark Arrival Action
  const handleMarkArrived = async () => {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    const formattedHours = (hours % 12 || 12).toString();
    const timeStr = `${formattedHours}:${minutes} ${ampm}`;

    const incident = currentResponse || selectedIncident || allIncidents[0];
    const task = incident.defaultTask || {
      taskId: "task-gen-01",
      title: "Field Assistance",
      assignedBy: "NDRF Response Unit",
      status: "IN PROGRESS",
      supervisorNote: "Meet us at the relief staging entrance.",
    };

    if (incident.isFirestore && incident.firestoreId) {
      try {
        const reqRef = doc(db, "sos_requests", incident.firestoreId);
        await updateDoc(reqRef, {
          status: "IN_PROGRESS",
          arrivedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.warn("Firestore arrival status update failed:", err);
      }
    }

    setResponseStatus("ARRIVED");
    setArrivedAt(timeStr);
    setAssignedTask(task);
    setActiveTab("arrived");
    addToast("Status updated: ARRIVED at response zone.", "success");
  };

  // Complete Task Action
  const handleCompleteTask = async () => {
    const incident = currentResponse || selectedIncident;
    if (incident && incident.isFirestore && incident.firestoreId) {
      try {
        const reqRef = doc(db, "sos_requests", incident.firestoreId);
        await updateDoc(reqRef, {
          status: "RESOLVED",
          resolvedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.warn("Firestore resolved status update failed:", err);
      }
    }

    setResponseStatus("COMPLETED");
    setActiveTab("completed");
    addToast("Task marked complete. Thank you for your service!", "success");
  };

  // Finish and return to home
  const handleFinishAndReturnHome = () => {
    setCurrentResponse(null);
    setSelectedIncident(null);
    setResponseStatus("IDLE");
    setArrivedAt(null);
    setAssignedTask(null);
    setActiveTab("home");
  };

  // View Location Details
  const handleViewIncident = (incident) => {
    setSelectedIncident(incident);
    setActiveTab("details");
  };

  const isResponding = currentResponse && (responseStatus === "TRAVELLING" || responseStatus === "ARRIVED" || responseStatus === "TASK_ASSIGNED");

  // Dynamic coordinates for currently active views
  const alertCoords = extractCoordinates(activeDisasterAlert);
  const selectedCoords = extractCoordinates(selectedIncident);
  const responseCoords = extractCoordinates(currentResponse);

  return (
    <div className="volunteer-portal-wrapper">
      {/* Photo Lightbox Modal */}
      {lightboxPhoto && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.9)",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
          onClick={() => setLightboxPhoto(null)}
        >
          <img
            src={lightboxPhoto}
            alt="Expanded Incident Attachment"
            style={{ maxWidth: "90vw", maxHeight: "80vh", borderRadius: "12px", objectFit: "contain", border: "2px solid #38BDF8" }}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ marginTop: "16px", background: "#1E293B", color: "#FFFFFF", border: "1px solid #475569" }}
            onClick={() => setLightboxPhoto(null)}
          >
            Close Fullscreen Preview
          </button>
        </div>
      )}

      {/* Outer Presentation Canvas */}
      <div className="presentation-canvas">
        {/* SIH Presentation Top Badge */}
        <div className="presentation-badge">
          <span className="dot" />
          <span>Smart India Hackathon • Field Volunteer Emergency Portal</span>
        </div>

        {/* Smartphone Mockup Frame */}
        <div className="phone-mockup" role="region" aria-label="Simulated Mobile Smartphone">
          <div className="phone-screen">
            {/* 1. Phone Status Bar */}
            <header className="phone-status-bar" aria-label="Status Bar">
              <span className="status-time">{currentTime}</span>

              {/* Dynamic Island Notch */}
              <div className="dynamic-island" aria-hidden="true">
                <span className="camera" />
                <span className="sensor" />
              </div>

              {/* Signal & Battery Icons */}
              <div className="status-icons" aria-label="Signal and Battery">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4.35 19.4c-.22.28-.15.69.15.89.28.18.66.12.87-.15l1.4-1.78C8.24 19.34 10.04 20 12 20c4.97 0 9-4.03 9-9s-4.03-9-9-9zm0 15c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z" />
                </svg>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="1" y="6" width="18" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
                  <path d="M23 10v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <rect x="3" y="8" width="12" height="8" rx="1" fill="currentColor" />
                </svg>
              </div>
            </header>

            {/* 2. App Header: Brand & Connectivity Mode */}
            <div className="app-header">
              <div className="header-brand">
                <div className="header-logo-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <path d="M12 8v8M8 12h8" />
                  </svg>
                </div>
                <div className="header-title-wrap">
                  <span className="header-app-name">SIH RESCUE</span>
                  <span className="header-app-sub">Volunteer Field Unit</span>
                </div>
              </div>

              {/* Online/Offline Toggle Button */}
              <button
                type="button"
                className={`connectivity-pill ${syncState === "syncing" ? "syncing" : isOnline ? "online" : "offline"}`}
                onClick={toggleOffline}
                title="Click to toggle offline mode simulation"
              >
                <span className="pill-dot" />
                <span>{syncState === "syncing" ? "Syncing..." : isOnline ? "ONLINE" : "OFFLINE"}</span>
              </button>
            </div>

            {/* 3. Offline Floating Mesh Banner */}
            {!isOnline && (
              <div className="offline-banner">
                <div className="offline-banner-left">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="1" y1="1" x2="23" y2="23" />
                    <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
                    <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
                    <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
                    <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
                    <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                    <line x1="12" y1="20" x2="12.01" y2="20" />
                  </svg>
                  <span>Offline Mesh Active</span>
                </div>
                <span className="offline-banner-tag">Saved locally</span>
              </div>
            )}

            {/* 4. Toast Notifications */}
            <div className="toast-container" aria-live="polite">
              {toasts.map((t) => (
                <div key={t.id} className={`toast toast-${t.type}`}>
                  <span>{t.message}</span>
                </div>
              ))}
            </div>

            {/* 5. Main Screen Content Routing */}
            <main className="app-content">
              {/* SCREEN 1: DYNAMIC GOVERNMENT DISASTER ALERT (DRIVEN BY FIRESTORE) */}
              {activeScreen === "disaster_alert" && (
                <div className="alert-view-container view-enter">
                  <div className="emergency-alert-card" style={activeDisasterAlert.isDispatched ? { borderColor: "#DC2626" } : {}}>
                    <div className="alert-header-banner">
                      <svg className="alert-shield-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <div className="alert-header-text">
                        <span className="alert-top-title">Live Disaster Alert</span>
                        <span className="alert-gov-source">{activeDisasterAlert.source || "Government Emergency Response"}</span>
                      </div>
                    </div>

                    <div className="alert-body">
                      <p className="alert-primary-msg">
                        {activeDisasterAlert.isDispatched
                          ? "Authority Incident Command has dispatched a volunteer response request to your location."
                          : "A live emergency SOS alert has been transmitted in your nearby area."}
                      </p>

                      <div className="alert-incident-box">
                        <div className="alert-zone-row">
                          <span className="alert-zone-title">{activeDisasterAlert.title}</span>
                          <span className="alert-distance-badge">{activeDisasterAlert.distance || "Nearby"}</span>
                        </div>

                        <div className="alert-meta-row">
                          <span className="alert-pill flood">{activeDisasterAlert.category || activeDisasterAlert.type || "EMERGENCY"}</span>
                          <span className="alert-pill high-prio">{activeDisasterAlert.priority || "HIGH PRIORITY"}</span>
                          <span style={{ fontSize: "10.5px", fontWeight: 800, background: "#EFF6FF", color: "#1D4ED8", padding: "2px 7px", borderRadius: "4px", border: "1px solid #BFDBFE" }}>
                            {activeDisasterAlert.claimedCount || 0}/{activeDisasterAlert.requiredVolunteers || 1} RESPONDING
                          </span>
                        </div>

                        {/* Visual 4-Step Incident Lifecycle Progress Stepper */}
                        <IncidentLifecycleStepper status={activeDisasterAlert.status || (activeDisasterAlert.isDispatched ? "VOLUNTEER_DISPATCHED" : "PENDING")} />

                        {/* Dynamic Caller Notes */}
                        <p className="alert-requirement-text" style={{ fontWeight: 600, color: "#1E293B" }}>
                          "{activeDisasterAlert.notes || activeDisasterAlert.note || activeDisasterAlert.message || "Emergency assistance and field volunteers are urgently required."}"
                        </p>

                        {/* Photo Attachment Thumbnail Preview */}
                        {activeDisasterAlert.photoBase64 && (
                          <div
                            style={{ borderRadius: "6px", overflow: "hidden", border: "1px solid #FCA5A5", height: "90px", marginTop: "4px", position: "relative", cursor: "pointer" }}
                            onClick={() => setLightboxPhoto(activeDisasterAlert.photoBase64)}
                            title="Click to view full photo"
                          >
                            <img src={activeDisasterAlert.photoBase64} alt="Incident media" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            <span style={{ position: "absolute", bottom: "4px", right: "6px", background: "rgba(0,0,0,0.7)", color: "#FFFFFF", fontSize: "10px", padding: "2px 6px", borderRadius: "4px" }}>
                              ⛶ View Photo
                            </span>
                          </div>
                        )}

                        {/* Coordinates & Google Maps Link */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "6px", borderTop: "1px solid #FECACA", marginTop: "4px" }}>
                          <span style={{ fontSize: "11.5px", color: "#64748B", fontFamily: "monospace" }}>
                            {alertCoords ? `GPS: ${alertCoords.lat.toFixed(4)}°, ${alertCoords.lng.toFixed(4)}°` : "GPS Fix: Pending"}
                          </span>
                          {alertCoords && (
                            <button
                              type="button"
                              className="btn btn-sm"
                              style={{ background: "#2563EB", color: "#FFFFFF", padding: "4px 8px", fontSize: "11px" }}
                              onClick={() => openGoogleMapsDirections(alertCoords)}
                            >
                              Navigate (Google Maps)
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Claim Button Protection */}
                  {activeDisasterAlert.isFull && !activeDisasterAlert.isAlreadyClaimedByMe ? (
                    <div style={{ marginTop: "12px", background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: "10px", padding: "14px", textAlign: "center" }}>
                      <div style={{ fontSize: "13.5px", fontWeight: 800, color: "#991B1B" }}>
                        🔒 Response Quota Filled ({activeDisasterAlert.claimedCount}/{activeDisasterAlert.requiredVolunteers})
                      </div>
                      <p style={{ fontSize: "12px", color: "#7F1D1D", marginTop: "4px", margin: 0 }}>
                        The required number of field volunteers have already accepted this emergency incident.
                      </p>
                      <button
                        type="button"
                        className="btn btn-secondary btn-block"
                        style={{ marginTop: "10px", height: "42px" }}
                        onClick={() => {
                          setActiveScreen("app_main");
                          setActiveTab("home");
                        }}
                      >
                        View Open Incidents
                      </button>
                    </div>
                  ) : (
                    <div className="alert-prompt-section">
                      <h3 className="alert-prompt-title">Can you volunteer to help?</h3>
                      <div className="alert-btn-stack">
                        <button
                          type="button"
                          className="btn-emergency-yes"
                          onClick={() => handleAcceptEmergencyAndEnRoute(activeDisasterAlert)}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          YES, I WANT TO HELP ({activeDisasterAlert.claimedCount || 0}/{activeDisasterAlert.requiredVolunteers || 1})
                        </button>

                        <button
                          type="button"
                          className="btn-emergency-no"
                          onClick={() => setActiveScreen("not_now")}
                        >
                          NOT NOW
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* SCREEN 1B: NOT NOW / RESPONSE DEFERRED */}
              {activeScreen === "not_now" && (
                <div className="not-now-container view-enter">
                  <div className="not-now-icon-circle">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </div>
                  <h2 style={{ fontSize: "18px", fontWeight: 800, color: "#0F172A" }}>Response Deferred</h2>
                  <p className="not-now-message">You can volunteer later when available if assistance is still required.</p>
                  <button
                    type="button"
                    className="btn-return-alert"
                    onClick={() => setActiveScreen("disaster_alert")}
                  >
                    Return to Alert
                  </button>
                </div>
              )}

              {/* SCREEN 2: HOME TAB - NEARBY OPEN INCIDENTS */}
              {activeScreen === "app_main" && activeTab === "home" && (
                <div className="home-view view-enter">
                  <div className="view-header">
                    <h1 className="view-title">Help needed nearby</h1>
                    <p className="view-subtitle">Select an open emergency location to provide assistance.</p>
                  </div>

                  {/* Active Response Banner */}
                  {isResponding && currentResponse && (
                    <div className="current-response-card">
                      <div className="current-response-top">
                        <span className="current-response-label">
                          <span className="pulse-dot" />
                          Current Response
                        </span>
                        <span className={`badge ${responseStatus === "ARRIVED" ? "badge-arrived" : "badge-travelling"}`}>
                          {responseStatus === "ARRIVED" ? "ARRIVED ✓" : "TRAVELLING"}
                        </span>
                      </div>

                      <div className="current-response-title">{currentResponse.title}</div>

                      <div className="current-response-bottom">
                        <span className="current-response-meta">{currentResponse.distance} • {currentResponse.category || currentResponse.type}</span>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => {
                            if (responseStatus === "ARRIVED" || responseStatus === "TASK_ASSIGNED") {
                              setActiveTab("arrived");
                            } else {
                              setActiveTab("travelling");
                            }
                          }}
                        >
                          OPEN
                        </button>
                      </div>
                    </div>
                  )}

                  {isResponding && <div className="divider-label">Other open locations needing help</div>}

                  {/* Empty state if all quotas filled */}
                  {allIncidents.length === 0 && (
                    <div style={{ textAlign: "center", padding: "30px 16px", background: "#FFFFFF", borderRadius: "12px", border: "1px solid #E2E8F0" }}>
                      <div style={{ fontSize: "28px", marginBottom: "8px" }}>✅</div>
                      <div style={{ fontSize: "15px", fontWeight: 800, color: "#0F172A" }}>All Response Quotas Filled</div>
                      <p style={{ fontSize: "12.5px", color: "#64748B", marginTop: "4px" }}>
                        There are currently no unfilled emergency requests in your area. New dispatches will appear in real time.
                      </p>
                    </div>
                  )}

                  {/* Location Cards */}
                  <div className="location-list">
                    {allIncidents.map((inc) => {
                      const isThisActive = isResponding && currentResponse && (currentResponse.id === inc.id || currentResponse.incidentId === inc.incidentId);
                      const priorityClass = (inc.priority || "HIGH").toLowerCase();
                      const incCoords = extractCoordinates(inc);
                      const reqCount = inc.requiredVolunteers || inc.volunteersNeeded || 1;
                      const cCount = inc.claimedCount || 0;

                      return (
                        <div
                          key={inc.id || inc.incidentId}
                          className="location-card"
                          style={inc.isDispatched ? { border: "2px solid #DC2626", background: "#FEF2F2" } : {}}
                        >
                          <div className="location-card-header">
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                                <h3 className="location-card-title">{inc.title}</h3>
                                {inc.isDispatched && (
                                  <span className="badge badge-critical" style={{ fontSize: "10px", padding: "1px 6px" }}>
                                    🚨 DISPATCHED
                                  </span>
                                )}
                                <span style={{ fontSize: "10.5px", fontWeight: 800, color: "#2563EB", background: "#EFF6FF", padding: "1px 6px", borderRadius: "4px", border: "1px solid #BFDBFE" }}>
                                  {cCount}/{reqCount} Volunteers
                                </span>
                              </div>
                              <div className="location-card-situation" style={{ fontWeight: 600 }}>
                                {inc.category || inc.type ? `${(inc.category || inc.type).toUpperCase()}: ` : ""}
                                {inc.notes || inc.note || inc.message || inc.situation}
                              </div>
                            </div>
                            <span className="location-card-distance">{inc.distance}</span>
                          </div>

                          {/* Photo preview if attached in citizen SOS */}
                          {inc.photoBase64 && (
                            <div
                              style={{ marginTop: "4px", borderRadius: "8px", overflow: "hidden", border: "1px solid #CBD5E1", height: "80px", cursor: "pointer", position: "relative" }}
                              onClick={() => setLightboxPhoto(inc.photoBase64)}
                              title="Click to expand photo"
                            >
                              <img src={inc.photoBase64} alt="Incident media" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              <span style={{ position: "absolute", bottom: "4px", right: "6px", background: "rgba(0,0,0,0.7)", color: "#FFFFFF", fontSize: "10px", padding: "2px 6px", borderRadius: "4px" }}>
                                ⛶ View Photo
                              </span>
                            </div>
                          )}

                          <div className="location-card-meta">
                            <div className="location-card-badges">
                              <span className={`badge badge-${priorityClass}`}>{inc.priority}</span>
                              {incCoords && (
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  style={{ background: "#F1F5F9", border: "1px solid #CBD5E1", color: "#2563EB", fontSize: "11px", padding: "2px 8px" }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openGoogleMapsDirections(incCoords);
                                  }}
                                  title={`Navigate to ${incCoords.lat.toFixed(4)}, ${incCoords.lng.toFixed(4)}`}
                                >
                                  🗺️ Maps
                                </button>
                              )}
                            </div>
                            <button
                              type="button"
                              className={`btn ${inc.isDispatched ? "btn-primary" : "btn-secondary"} btn-sm`}
                              onClick={() => {
                                if (isThisActive) {
                                  if (responseStatus === "ARRIVED") setActiveTab("arrived");
                                  else setActiveTab("travelling");
                                } else {
                                  handleViewIncident(inc);
                                }
                              }}
                            >
                              {isThisActive ? "ACTIVE" : inc.isDispatched ? "RESPOND NOW" : "VIEW"}
                            </button>
                          </div>

                          <div className="location-card-source">
                            Source: {inc.source} • Contact: {inc.callerContact}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SCREEN 3: LOCATION DETAILS VIEW */}
              {activeScreen === "app_main" && activeTab === "details" && selectedIncident && (
                <div className="location-details-container view-enter">
                  <div className="btn-back-row">
                    <button
                      type="button"
                      className="btn-back"
                      onClick={() => setActiveTab("home")}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="15 18 9 12 15 6" />
                      </svg>
                      Back to list
                    </button>
                  </div>

                  <div className="details-header-card" style={selectedIncident.isDispatched ? { borderColor: "#DC2626" } : {}}>
                    {selectedIncident.isDispatched && (
                      <div style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: "6px", padding: "6px 10px", fontSize: "11.5px", fontWeight: 800, color: "#991B1B", display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="dot" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#DC2626" }} />
                        COMMAND DISPATCH: Dispatchers have requested emergency field volunteer response.
                      </div>
                    )}

                    <div className="details-title-row">
                      <div>
                        <h1 className="details-title">{selectedIncident.title}</h1>
                        <span style={{ fontSize: "13px", fontWeight: 700, color: "#475569" }}>
                          {selectedIncident.distance} away • {selectedIncident.location}
                        </span>
                      </div>
                      <span className={`badge badge-${(selectedIncident.priority || "HIGH").toLowerCase()}`}>
                        {selectedIncident.priority} PRIORITY
                      </span>
                    </div>

                    <div className="details-meta-chips">
                      <span className="badge badge-medium">{selectedIncident.category || selectedIncident.type || "EMERGENCY"}</span>
                      <span className="badge badge-volunteers">
                        {selectedIncident.claimedCount || 0}/{selectedIncident.requiredVolunteers || 1} Volunteers Responding
                      </span>
                    </div>

                    {/* Visual 4-Step Incident Lifecycle Progress Stepper */}
                    <IncidentLifecycleStepper status={selectedIncident.status || (selectedIncident.isDispatched ? "VOLUNTEER_DISPATCHED" : "PENDING")} />

                    {/* Caller Notes */}
                    <div className="details-help-needed-box">
                      <div style={{ fontWeight: 700, fontSize: "12px", textTransform: "uppercase", color: "#475569", marginBottom: "4px" }}>
                        Caller Transmission Notes
                      </div>
                      <div style={{ fontWeight: 600, color: "#1E293B" }}>
                        "{selectedIncident.notes || selectedIncident.note || selectedIncident.message || selectedIncident.description || "Emergency field assistance required."}"
                      </div>
                      <div style={{ marginTop: "6px", fontSize: "11.5px", color: "#64748B" }}>
                        Caller Contact / Source: <strong>{selectedIncident.callerContact || selectedIncident.source}</strong>
                      </div>
                    </div>

                    {/* Photo preview with click to expand */}
                    {selectedIncident.photoBase64 && (
                      <div
                        style={{ borderRadius: "8px", overflow: "hidden", border: "1px solid #CBD5E1", height: "130px", marginTop: "4px", position: "relative", cursor: "pointer" }}
                        onClick={() => setLightboxPhoto(selectedIncident.photoBase64)}
                        title="Click to view full photo"
                      >
                        <img src={selectedIncident.photoBase64} alt="Incident media" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        <span style={{ position: "absolute", bottom: "6px", right: "8px", background: "rgba(0,0,0,0.75)", color: "#FFFFFF", fontSize: "11px", fontWeight: 700, padding: "3px 8px", borderRadius: "4px" }}>
                          ⛶ Expand Photo
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Destination Coordinates & Google Maps Navigation Button */}
                  <div style={{ background: "#0F172A", color: "#FFFFFF", borderRadius: "12px", padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                    <div>
                      <div style={{ fontSize: "10.5px", fontWeight: 700, color: "#94A3B8", textTransform: "uppercase" }}>Destination Coordinates</div>
                      <div style={{ fontSize: "13px", fontWeight: 800, color: "#38BDF8", fontFamily: "monospace" }}>
                        {selectedCoords ? `${selectedCoords.lat.toFixed(5)}°, ${selectedCoords.lng.toFixed(5)}°` : "Coordinates unavailable"}
                      </div>
                    </div>
                    {selectedCoords ? (
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{ background: "#2563EB", color: "#FFFFFF", border: "none", fontSize: "12px", padding: "8px 12px" }}
                        onClick={() => openGoogleMapsDirections(selectedCoords)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polygon points="3 11 22 2 13 21 11 13 3 11" />
                        </svg>
                        Navigate (Google Maps)
                      </button>
                    ) : (
                      <span style={{ fontSize: "11px", color: "#64748B" }}>No GPS Fix</span>
                    )}
                  </div>

                  {/* Simulated Tactical Route Map */}
                  <TacticalVectorMap
                    destinationName={selectedIncident.title}
                    distanceText={selectedIncident.distance}
                    coordinates={selectedCoords}
                    height="160px"
                  />

                  {/* Supervisor Briefing Instruction Notice */}
                  <div className="supervisor-instruction-banner">
                    <div className="supervisor-banner-title">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      Important Instructions
                    </div>
                    <p className="supervisor-banner-text">
                      Go to this location and meet the response supervisor or authorities. They will brief you and assign your specific task when you arrive.
                    </p>
                  </div>

                  {/* Action Buttons with Quota Protection */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "4px", paddingBottom: "16px" }}>
                    {selectedIncident.isFull && !selectedIncident.isAlreadyClaimedByMe ? (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ height: "50px", fontSize: "14px", background: "#475569", color: "#CBD5E1", cursor: "not-allowed", border: "none", fontWeight: 700 }}
                        disabled
                      >
                        🔒 RESPONSE QUOTA FILLED ({selectedIncident.claimedCount}/{selectedIncident.requiredVolunteers})
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ height: "50px", fontSize: "15px" }}
                        onClick={() => handleAcceptEmergencyAndEnRoute(selectedIncident)}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Accept Emergency & En Route ({selectedIncident.claimedCount || 0}/{selectedIncident.requiredVolunteers || 1})
                      </button>
                    )}

                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setActiveTab("home")}
                    >
                      BACK
                    </button>
                  </div>
                </div>
              )}

              {/* SCREEN 4: VOLUNTEER CONFIRMED VIEW */}
              {activeScreen === "app_main" && activeTab === "confirmed" && (
                <div className="confirmed-view-container view-enter">
                  <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    <div className="confirmed-card">
                      <div className="confirmed-badge-row">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                          <polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                        <span>Response Registered</span>
                      </div>

                      <h1 className="confirmed-title">Volunteer confirmed</h1>
                      <div style={{ fontSize: "16px", fontWeight: 700, color: "#1E293B" }}>
                        {currentResponse?.title || "Response Location"}
                      </div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#64748B" }}>
                        {currentResponse?.category || currentResponse?.type || "EMERGENCY"} • {currentResponse?.distance || "1.2 km"}
                      </div>

                      {/* Visual 4-Step Incident Lifecycle Progress Stepper */}
                      <IncidentLifecycleStepper status="IN_PROGRESS" />

                      <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "8px", padding: "10px 14px", width: "100%", textAlign: "left", marginTop: "6px" }}>
                        <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748B", textTransform: "uppercase" }}>Incident Notes</div>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "#1E293B", marginTop: "2px" }}>
                          "{currentResponse?.notes || currentResponse?.note || currentResponse?.message || "Assistance in progress."}"
                        </div>
                        {responseCoords && (
                          <div style={{ fontSize: "11.5px", color: "#38BDF8", fontFamily: "monospace", marginTop: "6px", fontWeight: 700 }}>
                            Target GPS: {responseCoords.lat.toFixed(5)}°, {responseCoords.lng.toFixed(5)}°
                          </div>
                        )}
                      </div>

                      <p className="confirmed-instruction">
                        Please proceed to the location and meet the response supervisor. Your specific task will be assigned when you arrive.
                      </p>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "20px", paddingBottom: "16px" }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-block"
                      style={{ height: "52px", fontSize: "15px" }}
                      onClick={handleStartNavigation}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polygon points="3 11 22 2 13 21 11 13 3 11" />
                      </svg>
                      START NAVIGATION
                    </button>

                    {responseCoords && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-block"
                        style={{ height: "46px", fontSize: "13.5px" }}
                        onClick={() => openGoogleMapsDirections(responseCoords)}
                      >
                        Navigate (Google Maps)
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* SCREEN 5: TRAVELLING / NAVIGATION VIEW */}
              {activeScreen === "app_main" && activeTab === "travelling" && currentResponse && (
                <div className="travelling-view-container view-enter">
                  <div className="travelling-header-card">
                    <div className="travelling-top-bar">
                      <span className="badge badge-travelling">
                        <span className="pulse-dot" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#D97706", display: "inline-block" }} />
                        TRAVELLING
                      </span>

                      <button
                        type="button"
                        className="arrival-control-btn unreached"
                        onClick={handleMarkArrived}
                        title="Tap when you reach the response site"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                        I'M HERE
                      </button>
                    </div>

                    <h1 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginTop: "4px" }}>On the way</h1>
                    <div style={{ fontSize: "15px", fontWeight: 700, color: "#334155" }}>{currentResponse.title}</div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#64748B" }}>{currentResponse.distance} to destination</div>
                  </div>

                  {/* Primary Google Maps Navigation Action */}
                  {responseCoords && (
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-block"
                        style={{ height: "46px", fontSize: "14px", background: "#2563EB" }}
                        onClick={() => openGoogleMapsDirections(responseCoords)}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polygon points="3 11 22 2 13 21 11 13 3 11" />
                        </svg>
                        Navigate (Google Maps)
                      </button>
                    </div>
                  )}

                  <TacticalVectorMap
                    destinationName={currentResponse.title}
                    distanceText={currentResponse.distance}
                    coordinates={responseCoords}
                    height="200px"
                  />

                  <div className="supervisor-instruction-banner">
                    <div className="supervisor-banner-title">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                      Checkpoint Instruction
                    </div>
                    <p className="supervisor-banner-text">
                      Meet the response supervisor at the designated point upon arrival.
                    </p>
                  </div>

                  <div style={{ display: "flex", justifyContent: "center", marginTop: "6px", paddingBottom: "14px" }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setActiveTab("home")}
                    >
                      View Nearby Incident List
                    </button>
                  </div>
                </div>
              )}

              {/* SCREEN 6: ARRIVED & ON-SITE TASK VIEW */}
              {activeScreen === "app_main" && activeTab === "arrived" && currentResponse && (
                <div className="travelling-view-container view-enter">
                  <div className="travelling-header-card" style={{ borderColor: "#6EE7B7" }}>
                    <div className="travelling-top-bar">
                      <span className="badge badge-arrived">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                        ARRIVED
                      </span>

                      <div className="arrival-control-btn arrived">
                        <span>ARRIVED ✓</span>
                      </div>
                    </div>

                    <h1 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginTop: "4px" }}>You've arrived</h1>
                    <div style={{ fontSize: "15px", fontWeight: 700, color: "#334155" }}>{currentResponse.title}</div>
                    <div className="arrival-timestamp">Arrived at {arrivedAt || "11:48 AM"}</div>
                  </div>

                  <div className="supervisor-instruction-banner">
                    <div className="supervisor-banner-title">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                      Supervisor Briefing Point
                    </div>
                    <p className="supervisor-banner-text">
                      Please meet the response supervisor or authorities at the designated point.
                    </p>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#1E3A8A", marginTop: "6px" }}>
                      Supervisor: {assignedTask?.assignedBy || "Response Team Leader"}
                    </div>
                  </div>

                  {/* Supervisor Message Bubble */}
                  <div className="supervisor-msg-card">
                    <div className="supervisor-msg-header">
                      <span className="supervisor-sender-name">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        {assignedTask?.assignedBy || "Supervisor"}
                      </span>
                      <span className="supervisor-msg-time">Just now</span>
                    </div>
                    <p className="supervisor-msg-text">
                      "{assignedTask?.supervisorNote || "Meet us at the entrance. We will brief you on the assistance required."}"
                    </p>
                  </div>

                  {/* Assigned Task Card */}
                  <div className="assigned-task-card">
                    <div className="assigned-task-header">
                      <div>
                        <div style={{ fontSize: "11px", fontWeight: 800, textTransform: "uppercase", color: "#047857", letterSpacing: "0.5px" }}>
                          On-Site Task Assigned
                        </div>
                        <h2 className="assigned-task-title">{assignedTask?.title || "Evacuation Support"}</h2>
                      </div>
                      <span className="badge badge-progress">{assignedTask?.status || "IN PROGRESS"}</span>
                    </div>

                    <div className="assigned-task-status-row">
                      <span>Assigned by:</span>
                      <span className="assigned-by-badge">{assignedTask?.assignedBy || "Team Lead"}</span>
                    </div>

                    <div style={{ fontSize: "12px", color: "#4B5563", fontStyle: "italic", background: "#F9FAFB", padding: "8px 10px", borderRadius: "6px", border: "1px dashed #D1D5DB" }}>
                      This operational task was assigned on-site by the response supervisor upon your arrival.
                    </div>
                  </div>

                  <div style={{ marginTop: "6px", paddingBottom: "20px" }}>
                    <button
                      type="button"
                      className="btn btn-success btn-block"
                      style={{ height: "52px", fontSize: "15px" }}
                      onClick={handleCompleteTask}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      MARK TASK COMPLETE
                    </button>
                  </div>
                </div>
              )}

              {/* SCREEN 7: TASK COMPLETION VIEW */}
              {activeScreen === "app_main" && activeTab === "completed" && (
                <div className="completion-view-container view-enter">
                  <div>
                    <div className="completion-icon-box">
                      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <h1 className="completion-title">Task completed</h1>
                    <div style={{ fontSize: "16px", fontWeight: 700, color: "#059669", marginBottom: "12px" }}>
                      Thank you for helping.
                    </div>
                    <p className="completion-desc">
                      Your response has been marked resolved. You can now view other nearby locations where assistance is needed.
                    </p>
                  </div>

                  <div style={{ paddingBottom: "20px" }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-block"
                      style={{ height: "52px", fontSize: "15px" }}
                      onClick={handleFinishAndReturnHome}
                    >
                      View Nearby Locations
                    </button>
                  </div>
                </div>
              )}

              {/* SCREEN 8: MESSAGES TAB */}
              {activeScreen === "app_main" && activeTab === "messages" && (
                <div className="messages-view view-enter">
                  <div className="view-header">
                    <h1 className="view-title">Messages</h1>
                    <p className="view-subtitle">Official disaster response broadcasts & field instructions</p>
                  </div>

                  <div className="messages-list">
                    {messages.map((msg) => (
                      <div key={msg.id} className="message-item">
                        <div className="message-item-header">
                          <span className="message-sender">{msg.sender}</span>
                          <span className="message-time">{msg.time}</span>
                        </div>
                        <p className="message-content">"{msg.content}"</p>
                        <div className="message-source-footer">
                          <span>Source: <strong>{msg.source}</strong></span>
                          <span className="comm-pill">{msg.commMethod}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SCREEN 9: PROFILE TAB */}
              {activeScreen === "app_main" && activeTab === "profile" && (
                <div className="profile-view view-enter">
                  <div className="view-header">
                    <h1 className="view-title">Profile</h1>
                    <p className="view-subtitle">Registered disaster volunteer credentials</p>
                  </div>

                  <div className="profile-card">
                    <div className="profile-avatar-row">
                      <div className="profile-avatar">RS</div>
                      <div className="profile-info">
                        <h2 className="profile-name">{profile.name}</h2>
                        <span className="profile-id-badge">{profile.volunteerId}</span>
                      </div>
                    </div>

                    <div style={{ height: "1px", background: "var(--border-subtle)", margin: "4px 0" }} />

                    <div className="profile-field-group">
                      <span className="profile-field-label">Registered Base</span>
                      <span className="profile-field-val">{profile.location}</span>
                    </div>

                    <div className="profile-field-group">
                      <span className="profile-field-label">Primary Contact</span>
                      <span className="profile-field-val">{profile.phone}</span>
                    </div>

                    <div className="profile-field-group">
                      <span className="profile-field-label">Blood Group</span>
                      <span className="profile-field-val">{profile.bloodGroup}</span>
                    </div>

                    <div className="profile-field-group">
                      <span className="profile-field-label">Certified Response Skills</span>
                      <div className="profile-skills-row">
                        {profile.skills.map((s) => (
                          <span key={s} className="skill-tag">{s}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </main>

            {/* 6. Bottom Navigation Bar */}
            {activeScreen === "app_main" && (
              <nav className="bottom-nav" aria-label="Bottom Navigation">
                <button
                  type="button"
                  className={`nav-item ${["home", "details", "confirmed", "travelling", "arrived", "completed"].includes(activeTab) ? "active" : ""}`}
                  onClick={() => {
                    if (responseStatus === "TRAVELLING") setActiveTab("travelling");
                    else if (responseStatus === "ARRIVED") setActiveTab("arrived");
                    else setActiveTab("home");
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                  <span>Home</span>
                </button>

                <button
                  type="button"
                  className={`nav-item ${activeTab === "messages" ? "active" : ""}`}
                  onClick={() => setActiveTab("messages")}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <span>Messages</span>
                </button>

                <button
                  type="button"
                  className={`nav-item ${activeTab === "profile" ? "active" : ""}`}
                  onClick={() => setActiveTab("profile")}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <span>Profile</span>
                </button>
              </nav>
            )}

            {/* 7. Home Indicator Bar (iOS Style) */}
            <div className="home-indicator" />
          </div>
        </div>
      </div>
    </div>
  );
}

// Tactical SVG Vector Route Map Component (Dynamic GPS Coordinates Overlay & Destination Centering)
function TacticalVectorMap({ destinationName = "Response Zone", distanceText = "Calculating...", coordinates, height = "180px" }) {
  const coords = extractCoordinates({ coordinates });
  const hasCoords = coords !== null;
  const latFormatted = hasCoords ? `${coords.lat.toFixed(4)}°N` : "GPS PENDING";
  const lngFormatted = hasCoords ? `${coords.lng.toFixed(4)}°E` : "AWAITING FIX";
  const headerOverlayText = hasCoords ? `GPS ROUTE • ${latFormatted}, ${lngFormatted}` : "GPS ROUTE • PENDING FIX";

  return (
    <div className="map-container" style={{ height }}>
      <div className="map-badge-overlay">
        <span className="dot-green" />
        <span>{headerOverlayText}</span>
      </div>

      <div className="map-distance-overlay">
        <span>{distanceText}</span>
      </div>

      <svg className="map-svg" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="tactical-grid-react" width="25" height="25" patternUnits="userSpaceOnUse">
            <path d="M 25 0 L 0 0 0 25" fill="none" className="map-grid-line" />
          </pattern>
        </defs>

        <rect width="100%" height="100%" fill="#0B132B" />
        <rect width="100%" height="100%" fill="url(#tactical-grid-react)" />

        <path d="M 0,60 Q 120,80 200,40 T 400,90" className="map-road-base" />
        <path d="M 50,200 Q 150,140 220,160 T 400,120" className="map-road-base" />
        <path d="M 120,0 Q 140,90 100,200" className="map-road-base" />
        <path d="M 290,0 Q 270,110 320,200" className="map-road-base" />

        <path d="M 0,60 Q 120,80 200,40 T 400,90" className="map-road-main" />
        <path d="M 50,200 Q 150,140 220,160 T 400,120" className="map-road-main" />
        <path d="M 120,0 Q 140,90 100,200" className="map-road-main" />
        <path d="M 290,0 Q 270,110 320,200" className="map-road-main" />

        <path d="M 65,145 C 130,145 160,115 200,105 S 260,65 305,65" className="map-route-line" />

        <g transform="translate(65, 145)">
          <circle cx="0" cy="0" r="10" className="user-marker-pulse" />
          <circle cx="0" cy="0" r="5" className="user-marker-dot" />
          <rect x="-35" y="10" width="70" height="18" rx="4" fill="#0F172A" stroke="#38BDF8" strokeWidth="1" />
          <text x="0" y="22" fill="#F8FAFC" fontSize="8.5" fontWeight="700" textAnchor="middle" fontFamily="sans-serif">
            YOUR LOCATION
          </text>
        </g>

        <g transform="translate(305, 65)">
          <circle cx="0" cy="0" r="10" className="dest-marker-pulse" />
          <circle cx="0" cy="0" r="5" className="dest-marker-dot" />
          <rect x="-48" y="-28" width="96" height="18" rx="4" fill="#0F172A" stroke="#EF4444" strokeWidth="1" />
          <text x="0" y="-16" fill="#FCA5A5" fontSize="8" fontWeight="800" textAnchor="middle" fontFamily="sans-serif">
            {destinationName ? destinationName.slice(0, 16).toUpperCase() : "SOS TARGET"}
          </text>
          {hasCoords && (
            <text x="0" y="3" fill="#38BDF8" fontSize="7" fontWeight="700" textAnchor="middle" fontFamily="monospace">
              {coords.lat.toFixed(3)}°, {coords.lng.toFixed(3)}°
            </text>
          )}
        </g>
      </svg>
    </div>
  );
}
