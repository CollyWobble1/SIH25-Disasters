import { useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

export default function SosPage() {
  const [type, setType] = useState("medical");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("idle");

  const handleSubmit = async () => {
    setStatus("sending");

    const saveToFirestore = async (coords = null) => {
      try {
        await addDoc(collection(db, "sos_requests"), {
          type,
          note,
          location: coords ? { lat: coords.latitude, lng: coords.longitude } : null,
          status: "pending",
          createdAt: serverTimestamp(),
        });
        setStatus("sent");
      } catch (err) {
        console.error("Firestore Error:", err);
        setStatus("idle");
      }
    };

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => saveToFirestore(position.coords),
        (error) => {
          console.warn("Location error, sending without GPS:", error);
          saveToFirestore(null);
        }
      );
    } else {
      saveToFirestore(null);
    }
  };

  if (status === "sent") {
    return <h2>Help is on the way. Stay where you are if it's safe.</h2>;
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>What's happening?</h1>
      <select value={type} onChange={(e) => setType(e.target.value)}>
        <option value="medical">Medical</option>
        <option value="trapped">Trapped / Stuck</option>
        <option value="fire">Fire</option>
        <option value="other">Other</option>
      </select>
      <br /><br />
      <textarea
        placeholder="Anything else responders should know (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={4}
        cols={30}
      />
      <br /><br />
      <button onClick={handleSubmit} disabled={status === "sending"}>
        {status === "sending" ? "Sending..." : "Send SOS"}
      </button>
    </div>
  );
}