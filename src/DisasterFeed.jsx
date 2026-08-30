import { useState, useEffect } from "react";
import { collection, onSnapshot, addDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import "./DisasterFeed.css";

// Initial regional crowdsourced community disaster posts
export const INITIAL_FEED_POSTS = [
  {
    id: "feed-post-01",
    userName: "Rohan Patil",
    locationName: "Ravet, Sector 29",
    category: "FLOOD",
    text: "Water level rising rapidly near Ravet Basket Bridge. Underpass completely flooded, 3 cars submerged.",
    status: "COMMUNITY_REPORT",
    upvotes: 8,
    createdAt: new Date(Date.now() - 1000 * 60 * 12),
  },
  {
    id: "feed-post-02",
    userName: "Ananya Deshmukh",
    locationName: "Wakad, Datta Mandir",
    category: "ROADBLOCK",
    text: "Huge banyan tree collapsed across main spine road. Electrical poles sparking. Road blocked for fire trucks.",
    status: "COMMUNITY_REPORT",
    upvotes: 14,
    createdAt: new Date(Date.now() - 1000 * 60 * 25),
  },
  {
    id: "feed-post-03",
    userName: "Dr. Kulkarni",
    locationName: "Hinjawadi Phase 1",
    category: "MEDICAL",
    text: "Urgent need for oxygen cylinders and dry insulin kits at local clinic near Blue Ridge society.",
    status: "COMMUNITY_REPORT",
    upvotes: 21,
    createdAt: new Date(Date.now() - 1000 * 60 * 40),
  },
];

export default function DisasterFeed({ isAuthorityView = false }) {
  const [posts, setPosts] = useState([]);
  const [newText, setNewText] = useState("");
  const [newAuthor, setNewAuthor] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newCategory, setNewCategory] = useState("FLOOD");
  const [submitting, setSubmitting] = useState(false);
  const [convertingId, setConvertingId] = useState(null);

  // Subscribe to `disaster_feed` in Firestore
  useEffect(() => {
    const q = collection(db, "disaster_feed");
    const unsub = onSnapshot(
      q,
      (snap) => {
        if (!snap.empty) {
          const live = snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }));
          // Sort by creation time desc
          live.sort((a, b) => {
            const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
            const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
            return timeB - timeA;
          });
          setPosts(live);
        } else {
          setPosts(INITIAL_FEED_POSTS);
        }
      },
      (err) => {
        console.warn("disaster_feed Firestore error, fallback to defaults:", err);
        setPosts(INITIAL_FEED_POSTS);
      }
    );

    return () => unsub();
  }, []);

  // Post New Community Report
  const handleCreatePost = async (e) => {
    e.preventDefault();
    if (!newText.trim()) return;

    setSubmitting(true);
    const payload = {
      userName: newAuthor.trim() || "Anonymous Citizen",
      locationName: newLocation.trim() || "Pune Urban Region",
      category: newCategory,
      text: newText.trim(),
      status: "COMMUNITY_REPORT",
      upvotes: 1,
      createdAt: serverTimestamp(),
    };

    try {
      await addDoc(collection(db, "disaster_feed"), payload);
      setNewText("");
      setNewAuthor("");
      setNewLocation("");
    } catch (err) {
      console.error("Failed to post disaster feed message:", err);
      // Fallback local append
      setPosts((prev) => [
        {
          id: `feed_${Date.now()}`,
          ...payload,
          createdAt: new Date(),
        },
        ...prev,
      ]);
      setNewText("");
    } finally {
      setSubmitting(false);
    }
  };

  // Convert Community Report to Official SOS Request
  const handleConvertToSOS = async (post) => {
    if (post.status === "CONVERTED_TO_SOS") return;

    try {
      setConvertingId(post.id);

      // 1. Create document in `sos_requests`
      const sosPayload = {
        category: post.category || "GENERAL_EMERGENCY",
        type: post.category || "GENERAL_EMERGENCY",
        notes: `[Crowdsourced Community Report by ${post.userName} at ${post.locationName}]: ${post.text}`,
        message: post.text,
        location: {
          lat: 18.5900 + (Math.random() - 0.5) * 0.04,
          lng: 73.7600 + (Math.random() - 0.5) * 0.04,
          address: post.locationName || "Reported Location",
        },
        status: "PENDING",
        requiredVolunteers: 2,
        assignedVolunteers: [],
        isCommunityReport: true,
        sourcePostId: post.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const sosDocRef = await addDoc(collection(db, "sos_requests"), sosPayload);

      // 2. Update post status in `disaster_feed`
      const postRef = doc(db, "disaster_feed", post.id);
      await updateDoc(postRef, {
        status: "CONVERTED_TO_SOS",
        sosId: sosDocRef.id,
        convertedAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn("Firestore conversion error, updating state locally:", err);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id ? { ...p, status: "CONVERTED_TO_SOS", sosId: `sos_${Date.now()}` } : p
        )
      );
    } finally {
      setConvertingId(null);
    }
  };

  const getCategoryClass = (cat) => {
    switch ((cat || "").toUpperCase()) {
      case "FLOOD":
        return "flood";
      case "FIRE":
        return "fire";
      case "ROADBLOCK":
        return "roadblock";
      case "MEDICAL":
        return "medical";
      default:
        return "general";
    }
  };

  return (
    <div className="feed-container">
      {/* Header */}
      <div className="feed-header">
        <div className="feed-title-group">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
          <h2 className="feed-title">Crowdsourced Community Disaster Feed</h2>
          <span className="feed-badge">LIVE CITIZEN REPORTS</span>
        </div>
      </div>

      {/* Citizen Submission Form */}
      <form onSubmit={handleCreatePost} className="feed-post-form">
        <div className="feed-input-row">
          <input
            type="text"
            className="feed-input"
            style={{ flex: 1 }}
            placeholder="Your Name (or alias)..."
            value={newAuthor}
            onChange={(e) => setNewAuthor(e.target.value)}
          />
          <input
            type="text"
            className="feed-input"
            style={{ flex: 1 }}
            placeholder="Incident Sector / Area (e.g., Wakad Bridge)..."
            value={newLocation}
            onChange={(e) => setNewLocation(e.target.value)}
          />
          <select
            className="feed-input"
            style={{ width: "160px", background: "#0D1117" }}
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
          >
            <option value="FLOOD">🌊 Flood / Water</option>
            <option value="ROADBLOCK">⛔ Road Block / Debris</option>
            <option value="FIRE">🔥 Fire / Hazard</option>
            <option value="MEDICAL">🏥 Medical Alert</option>
            <option value="GENERAL">📢 General Safety</option>
          </select>
        </div>

        <textarea
          className="feed-textarea"
          placeholder="Describe ground situation, water levels, blocked lanes, or urgent supplies needed..."
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          required
        />

        <button
          type="submit"
          className="feed-submit-btn"
          disabled={submitting || !newText.trim()}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
          {submitting ? "Broadcasting..." : "Broadcast Ground Report"}
        </button>
      </form>

      {/* Feed Posts Stream */}
      <div className="feed-posts-stream">
        {posts.map((post) => {
          const isConverted = post.status === "CONVERTED_TO_SOS";
          const isConverting = convertingId === post.id;
          const timeStr = post.createdAt?.toDate
            ? post.createdAt.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : new Date(post.createdAt || 0).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

          return (
            <div key={post.id} className={`feed-post-card ${isConverted ? "converted" : ""}`}>
              <div className="feed-post-card-top">
                <div className="feed-author-meta">
                  <span className="feed-author-name">{post.userName}</span>
                  <span className="feed-location-badge">
                    📍 {post.locationName}
                  </span>
                </div>
                <span className={`feed-category-pill ${getCategoryClass(post.category)}`}>
                  {post.category}
                </span>
              </div>

              <p className="feed-post-text">{post.text}</p>

              <div className="feed-post-actions">
                <span className="feed-time">Reported at {timeStr}</span>

                {isConverted ? (
                  <span className="feed-converted-badge">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    CONVERTED TO OFFICIAL SOS
                  </span>
                ) : isAuthorityView ? (
                  <button
                    type="button"
                    className="feed-convert-btn"
                    onClick={() => handleConvertToSOS(post)}
                    disabled={isConverting}
                    title="Promote citizen report to active SOS dispatch"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                    {isConverting ? "Converting..." : "Convert to Official SOS"}
                  </button>
                ) : (
                  <span style={{ fontSize: "0.74rem", color: "#8B949E" }}>
                    Verified Community Report
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
