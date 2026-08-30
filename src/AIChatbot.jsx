import { useState, useEffect, useRef, useMemo } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { GoogleGenAI } from "@google/genai";
import { db } from "../firebase";
import app from "../firebase";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "firebase/functions";
import "./AIChatbot.css";

export default function AIChatbot() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [shelters, setShelters] = useState([]);
  const [sosRequests, setSosRequests] = useState([]);
  const chatBottomRef = useRef(null);

  // Check for API key presence on mount and warn in chat if missing
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  // Initialize official GoogleGenAI Client
  const aiClient = useMemo(() => {
    if (!apiKey) {
      console.warn("VITE_GEMINI_API_KEY is missing or undefined in environment.");
      return null;
    }
    return new GoogleGenAI({ apiKey });
  }, [apiKey]);

  // Initial greeting + API key status check warning
  const [messages, setMessages] = useState(() => {
    const initial = [
      {
        id: "welcome-1",
        sender: "bot",
        text: "👋 Hello! I am your AI Emergency Dispatch Assistant",
        level: 1,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ];
    if (!import.meta.env.VITE_GEMINI_API_KEY) {
      initial.push({
        id: "warn-apikey-missing",
        sender: "bot",
        text: "⚠️ WARNING: `VITE_GEMINI_API_KEY` is missing or undefined in your `.env` configuration. Please ensure `VITE_GEMINI_API_KEY` is defined.",
        level: 3,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
    }
    return initial;
  });

  // ── 1. Real-Time Firestore Context Ingestion ──────────────────────────────
  useEffect(() => {
    const unsubShelters = onSnapshot(
      collection(db, "shelters"),
      (snap) => {
        const live = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setShelters(live);
      },
      (err) => console.warn("Chatbot shelters snapshot error:", err)
    );

    const unsubSOS = onSnapshot(
      collection(db, "sos_requests"),
      (snap) => {
        const live = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setSosRequests(live);
      },
      (err) => console.warn("Chatbot sos snapshot error:", err)
    );

    return () => {
      unsubShelters();
      unsubSOS();
    };
  }, []);

  // Auto-scroll to latest message
  useEffect(() => {
    if (isOpen) {
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen, isGenerating]);

  // ── 2. Construct Dynamic Context-Aware System Instruction ──────────────────
  const buildSystemInstruction = () => {
    // Truncate telemetry so system instruction stays small and processes quickly.
    const maxShelters = 5;
    const maxSos = 6;
    const trunc = (str, n = 120) => (String(str || '').length > n ? String(str).slice(0, n - 1) + '…' : String(str || ''));

    const activeShelters = (shelters || []).slice(0, maxShelters);
    const activeSheltersSummary = activeShelters.map((s, idx) => {
      const total = Number(s.totalBeds) || 0;
      const avail = s.availableBeds !== undefined ? Number(s.availableBeds) : Math.max(0, total - (Number(s.occupiedBeds) || 0));
      const name = trunc(s.shelterName || s.name || 'Shelter', 40);
      const contact = trunc(s.contactPhone || s.phone || 'N/A', 30);
      const locLat = s.latitude || s.lat || 18.52;
      const locLng = s.longitude || s.lng || 73.85;
      return `${idx + 1}. ${name} — ${s.status || (avail > 0 ? 'Open' : 'Full')} — ${avail}/${total} beds — ${contact} — (${locLat}, ${locLng})`;
    }).join('\n');
    const moreSheltersNote = (shelters || []).length > maxShelters ? `\n...and ${(shelters || []).length - maxShelters} more shelters omitted.` : '';

    const activeSos = (sosRequests || []).slice(0, maxSos);
    const activeSosSummary = activeSos.map((r, idx) => {
      const respCount = r.assignedVolunteers?.length || (r.assignedTo ? 1 : 0);
      const msg = trunc(r.notes || r.message || 'Emergency report', 140);
      return `${idx + 1}. ${trunc(r.id || 'sos', 30)} — ${r.category || r.type || 'GENERAL'} — ${r.status || 'PENDING'} — ${respCount}/${r.requiredVolunteers || 1} responders — "${msg}"`;
    }).join('\n');
    const moreSosNote = (sosRequests || []).length > maxSos ? `\n...and ${(sosRequests || []).length - maxSos} more SOS entries omitted.` : '';

    return `You are the official AI Disaster Dispatch & Safety Assistant operating inside an active Disaster Management Command System.
Your job is to provide fast, life-saving, accurate emergency information to affected citizens and volunteers.

CURRENT REAL-TIME SYSTEM TELEMETRY (LIVE FIRESTORE SNAPSHOT):
=============================================================
OPEN EVACUATION SHELTERS:
${activeSheltersSummary || "No shelter telemetry available yet."}${moreSheltersNote}

ACTIVE SOS DISTRESS REQUESTS:
${activeSosSummary || "No active distress calls registered."}${moreSosNote}

OFFICIAL EMERGENCY HELPLINES:
- National Disaster Response Force (NDRF): 1078
- Police Command: 112
- Ambulance / Medical: 108
- Fire Brigade: 101
- Regional PCMC / Pune Disaster Cell: +91 20 2742 5555

OPERATIONAL PROTOCOL RULES:
---------------------------
RULE 1 (Level 1 - General Info & Shelters): If the user asks about safe shelters, available beds, first aid, or safety protocols, use the live shelter data above. List specific open shelter names, free bed counts, and contact numbers. Keep responses concise, supportive, and formatted with bullet points.

RULE 2 (Level 2 - SOS Status Inquiries): If the user asks about an SOS request ID (e.g. "sos_17...", "#sos-123", or asks "where is help for my request?"), search the active SOS list above by ID or category. State the exact lifecycle status (PENDING, VOLUNTEER_DISPATCHED, IN_PROGRESS, RESOLVED) and how many volunteers are dispatched.

RULE 3 (Level 3 - Critical Life-Threatening Danger): If the user expresses life-threatening danger (e.g. "trapped", "water entering house", "injured", "bleeding", "cannot breathe", "fire", "chest pain", "child in danger"):
1. Give immediate 1-2 sentence calm life-saving advice (e.g. stay on elevated surface, turn off main electricity, avoid flood water).
2. MUST include the exact token string: [TRIGGER_EMERGENCY_SOS] at the end of your response. This token instructs the UI to immediately render an interactive "1-Click Submit Emergency SOS" button for the user.`;
  };

  // ── 3. Dispatch Message to Gemini 3.7 Flash → GPT-4o-mini fallback ──────────
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    const userText = inputValue.trim();
    if (!userText || isGenerating) return;

    const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const userMsg = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: userText,
      timestamp: timeStr,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsGenerating(true);

    let rawReply = null;

    // ── Attempt 1: Gemini 3.7 Flash (5-second timeout) ────────────────────────
    try {
      if (!apiKey || !aiClient) {
        throw new Error("Missing or undefined VITE_GEMINI_API_KEY.");
      }

      const systemInstruction = buildSystemInstruction();

      const geminiRequest = aiClient.models.generateContent({
        model: "gemini-3.7-flash",
        contents: userText,
        config: {
          systemInstruction,
          temperature: 0.2,
        },
      });

      // Await Gemini directly (no artificial timeout); let errors fall through to fallback.
      const response = await geminiRequest;
      rawReply = response.text || null;
    } catch (geminiError) {
      console.error("Gemini Error:", geminiError);

      // ── Attempt 2: AI Backend Fallback via Firebase Callable Function ─────
      try {
        const systemInstruction = buildSystemInstruction();
        const functions = getFunctions(app);
        // If running locally and the Functions emulator is available, connect to it.
        if (window?.location?.hostname === 'localhost') {
          try {
            connectFunctionsEmulator(functions, 'localhost', 5001);
          } catch (e) {
            // ignore if emulator connect not available
          }
        }
        const aiChat = httpsCallable(functions, "aiChat");

        const resp = await aiChat({ message: userText, systemInstruction });
        rawReply = resp?.data?.reply || null;
        if (rawReply) {
          console.info("AIChatbot: Gemini unavailable — response served via Firebase aiChat backend.");
        }
      } catch (backendError) {
        console.error("AI backend error:", backendError);
      }
    }

    // ── Successful AI Response (Gemini or GPT) ────────────────────────────────
    if (rawReply) {
      const hasSosTrigger = rawReply.includes("[TRIGGER_EMERGENCY_SOS]");
      const cleanReply = rawReply.replace(/\[TRIGGER_EMERGENCY_SOS\]/g, "").trim();

      setMessages((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          sender: "bot",
          text: cleanReply,
          showSosButton: hasSosTrigger,
          level: hasSosTrigger ? 3 : userText.toLowerCase().includes("sos") ? 2 : 1,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } else {
      // ── Attempt 3: Offline rule-based last-resort fallback ──────────────────
      const textLower = userText.toLowerCase();
      const isCritical = ["trapped", "injured", "fire", "bleed", "drown", "water rising"].some((k) => textLower.includes(k));
      const isShelter = textLower.includes("shelter") || textLower.includes("bed") || textLower.includes("camp");

      let fallbackText = "⚠️ AI services temporarily unavailable. Emergency Helplines: NDRF (1078), Police (112), Medical (108).";
      if (isShelter) {
        const open = shelters.filter((s) => s.status === "Open" || Number(s.availableBeds) > 0);
        fallbackText = `🏠 Active Open Shelters:\n${open.slice(0, 3).map((s) => `• ${s.shelterName || s.name}: ${s.availableBeds || 50} beds free (📞 ${s.contactPhone || "+91 20 2742 5555"})`).join("\n")}`;
      } else if (isCritical) {
        fallbackText = "🚨 High-risk emergency detected. Tap below to submit an Emergency SOS to notify all nearby rescue units:";
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `bot-fallback-${Date.now()}`,
          sender: "bot",
          text: fallbackText,
          showSosButton: isCritical,
          level: isCritical ? 3 : 1,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    }

    setIsGenerating(false);
  };

  const handleQuickPrompt = (promptText) => {
    setInputValue(promptText);
    setTimeout(() => {
      const sendBtn = document.getElementById("ai-chat-send-btn");
      if (sendBtn) sendBtn.click();
    }, 50);
  };

  return (
    <>
      {/* Floating Widget Trigger Button */}
      <button
        type="button"
        className={`ai-chatbot-toggle ${isOpen ? "active" : ""}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Open AI Emergency Assistant"
        title="AI Emergency Dispatch Assistant (Gemini 3.6 Flash)"
      >
        {!isOpen && <div className="ai-chatbot-pulse" />}
        {isOpen ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            <circle cx="9" cy="10" r="1" fill="currentColor" />
            <circle cx="15" cy="10" r="1" fill="currentColor" />
          </svg>
        )}
      </button>

      {/* Floating Chat Drawer */}
      {isOpen && (
        <div className="ai-chatbot-drawer">
          {/* Header */}
          <div className="ai-chatbot-header">
            <div className="ai-chatbot-header-left">
              <div className="ai-chatbot-avatar">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 14.93V17a1 1 0 0 1-2 0v-.07A8 8 0 0 1 4.07 11H5a1 1 0 0 1 0-2h-.93A8 8 0 0 1 11 4.07V5a1 1 0 0 1 2 0v-.93A8 8 0 0 1 19.93 11H19a1 1 0 0 1 0 2h.93A8 8 0 0 1 13 16.93z" />
                </svg>
              </div>
              <div>
                <h3 className="ai-chatbot-title">Gemini Emergency Dispatcher</h3>
                <span className="ai-chatbot-subtitle">
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10B981" }} />
                  Gemini 3.6 Flash • Live Telemetry Link Active
                </span>
              </div>
            </div>
            <button
              type="button"
              className="ai-chatbot-close"
              onClick={() => setIsOpen(false)}
              title="Close chat"
            >
              &times;
            </button>
          </div>

          {/* Messages Body */}
          <div className="ai-chatbot-body">
            {messages.map((msg) => (
              <div key={msg.id} className={`ai-msg ${msg.sender}`}>
                <div className="ai-msg-bubble">
                  <div style={{ whiteSpace: "pre-line" }}>{msg.text}</div>

                  {/* Level 3: 1-Click SOS Trigger Button */}
                  {msg.showSosButton && (
                    <div className="ai-sos-trigger-card">
                      <span style={{ fontSize: "0.78rem", color: "#FCA5A5", fontWeight: 700 }}>
                        Immediate Action Recommended:
                      </span>
                      <button
                        type="button"
                        className="ai-sos-btn"
                        onClick={() => {
                          setIsOpen(false);
                          navigate("/sos");
                        }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                        </svg>
                        🚨 1-Click Submit Emergency SOS
                      </button>
                    </div>
                  )}
                </div>
                <span className="ai-msg-time">{msg.timestamp}</span>
              </div>
            ))}

            {/* Generating Indicator */}
            {isGenerating && (
              <div className="ai-msg bot">
                <div className="ai-msg-bubble" style={{ display: "flex", alignItems: "center", gap: "6px", color: "#38BDF8" }}>
                  <span className="hosp-spinner" style={{ width: "14px", height: "14px" }} />
                  <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>Gemini is analyzing disaster telemetry...</span>
                </div>
              </div>
            )}

            <div ref={chatBottomRef} />
          </div>

          {/* Quick Prompts */}
          <div className="ai-quick-prompts">
            <button type="button" className="ai-prompt-chip" onClick={() => handleQuickPrompt("Which shelters currently have free beds available?")}>
              🏠 Free Beds
            </button>
            <button type="button" className="ai-prompt-chip" onClick={() => handleQuickPrompt("Help! Water is entering our house and we are trapped.")}>
              🚨 Trapped / Flood
            </button>
            <button type="button" className="ai-prompt-chip" onClick={() => handleQuickPrompt("Emergency helpline numbers")}>
              📞 Helplines
            </button>
          </div>

          {/* Input Bar */}
          <form onSubmit={handleSendMessage} className="ai-chatbot-input-bar">
            <input
              type="text"
              className="ai-chatbot-input"
              placeholder="Ask for shelters, SOS status, or help..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={isGenerating}
            />
            <button
              id="ai-chat-send-btn"
              type="submit"
              className="ai-chatbot-send-btn"
              aria-label="Send message"
              disabled={isGenerating || !inputValue.trim()}
            >
              {isGenerating ? (
                <span className="hosp-spinner" style={{ width: "14px", height: "14px" }} />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              )}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
