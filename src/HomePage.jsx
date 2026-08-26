import { useNavigate } from "react-router-dom";

export default function HomePage() {
  const navigate = useNavigate();
  return (
    <div style={{ padding: 20 }}>
      <h1>Emergency Portal</h1>
      <button 
        onClick={() => navigate("/sos")}
        style={{ padding: "10px 20px", fontSize: "18px", backgroundColor: "red", color: "white" }}
      >
        Send SOS
      </button>
    </div>
  );
}