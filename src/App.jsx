import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import HomePage from "./HomePage";
import SosPage from "./SosPage";
import AuthorityDashboard from "./AuthorityDashboard";
import HospitalDashboard from "./HospitalDashboard";
import VolunteerPortal from './components/volunteer/VolunteerPortal';
import ShelterTracker from "./ShelterTracker";
import ShelterRegistration from "./ShelterRegistration";
import DisasterMap from "./DisasterMap";
import DisasterFeed from "./DisasterFeed";
import AlertBanner from "./AlertBanner";
import AIChatbot from "./AIChatbot";

// Route Guard Component: Strictly isolates and protects the Authority Incident Command
function ProtectedAuthorityRoute({ children }) {
  // Check for explicit authority authorization key in localStorage
  const isAuthorized = localStorage.getItem("isAuthorityUser") === "true";

  // If unauthorized user attempts direct URL navigation, redirect immediately to home (/)
  if (!isAuthorized) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function App() {
  return (
    <BrowserRouter>
      {/* 4. Emergency Alerts System: Flashing Top Warning Banner */}
      <AlertBanner />

      <Routes>
        {/* Public & Mobile-First User Portals */}
        <Route path="/" element={<HomePage />} />
        <Route path="/sos" element={<SosPage />} />
        <Route path="/hospital" element={<HospitalDashboard />} />
        <Route path="/volunteer" element={<VolunteerPortal />} />
        <Route path="/shelter" element={<ShelterRegistration />} />
        <Route path="/shelters" element={<ShelterTracker />} />
        <Route path="/map" element={<DisasterMap />} />
        <Route path="/feed" element={<DisasterFeed />} />

        {/* Protected Authority Operations Console */}
        <Route
          path="/authority"
          element={
            <ProtectedAuthorityRoute>
              <AuthorityDashboard />
            </ProtectedAuthorityRoute>
          }
        />

        {/* Catch-all route: Redirects any unknown paths back to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* 2. Level-Based AI Emergency Chatbot: Global Floating Drawer */}
      <AIChatbot />
    </BrowserRouter>
  );
}

export default App;