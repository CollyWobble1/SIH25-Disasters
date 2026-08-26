import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

export default function AuthorityDashboard() {
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    const q = query(
      collection(db, "sos_requests"),
      where("status", "==", "pending")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRequests(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>Active SOS Requests</h1>
      {requests.length === 0 ? <p>No active requests.</p> : null}
      {requests.map((r) => (
        <div key={r.id} style={{ border: "1px solid #ccc", margin: "10px 0", padding: "10px" }}>
          <strong>{r.type.toUpperCase()}</strong> — {r.note || "No notes"}
          <br />
          Location: {r.location ? `${r.location.lat}, ${r.location.lng}` : "Location unavailable"}
        </div>
      ))}
    </div>
  );
}