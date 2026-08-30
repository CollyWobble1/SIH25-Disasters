import { useNavigate } from "react-router-dom";
import "./HomePage.css";

export default function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="mobile-app-wrapper">
      <div className="mobile-phone-container">
        {/* Top Header: Title RISK */}
        <header className="home-header">
          <h1 className="app-title-risk">RAKSHAQ</h1>
        </header>

        {/* Center Area: Large Red (#A61919) SOS Square Card */}
        <main className="sos-card-wrapper">
          <button
            className="sos-square-card"
            onClick={() => navigate("/sos")}
            aria-label="Send Emergency SOS Transmission"
          >
            <p className="sos-card-top-text">Press if you need help</p>
            <h2 className="sos-card-main-text">SOS</h2>
            <div className="sos-card-indicator">
              <span>Emergency Action</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </div>
          </button>
        </main>

        {/* Bottom Section: Register or Log in as & Role Buttons */}
        <section className="home-roles-section">
          <h3 className="home-subheader">Register or Log in as</h3>

          <div className="role-buttons-group">
            <button
              className="role-btn-grey"
              onClick={() => navigate("/volunteer")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
              Volunteer
            </button>

            <button
              className="role-btn-grey"
              onClick={() => navigate("/shelter")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
              </svg>
              Shelter
            </button>

            <button
              className="role-btn-grey"
              onClick={() => navigate("/map")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon>
                <line x1="8" y1="2" x2="8" y2="18"></line>
                <line x1="16" y1="6" x2="16" y2="22"></line>
              </svg>
              Evacuation Map
            </button>

            <button
              className="role-btn-grey"
              onClick={() => navigate("/feed")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
              </svg>
              Citizen Feed
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}