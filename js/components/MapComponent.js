/**
 * Tactical Mobile Map Component
 * Renders a lightweight, high-performance simulated vector route map
 */
export function renderTacticalMap({
  destinationName = 'Wakad Response Zone',
  distanceText = '2.8 km',
  height = '180px'
} = {}) {
  return `
    <div class="map-container" style="height: ${height};">
      <!-- Tactical Top Badge -->
      <div class="map-badge-overlay">
        <span class="dot-green"></span>
        <span>GPS ROUTE • SIMULATED</span>
      </div>

      <!-- Distance Overlay -->
      <div class="map-distance-overlay">
        <span>${distanceText}</span>
      </div>

      <!-- Tactical SVG Vector Map -->
      <svg class="map-svg" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <!-- Subtle Grid Pattern -->
          <pattern id="tactical-grid" width="25" height="25" patternUnits="userSpaceOnUse">
            <path d="M 25 0 L 0 0 0 25" fill="none" class="map-grid-line" />
          </pattern>
          
          <linearGradient id="route-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#38BDF8" />
            <stop offset="100%" stop-color="#2563EB" />
          </linearGradient>
        </defs>

        <!-- Base Background & Grid -->
        <rect width="100%" height="100%" fill="#0B132B" />
        <rect width="100%" height="100%" fill="url(#tactical-grid)" />

        <!-- Minor Road Network Lines -->
        <path d="M 0,60 Q 120,80 200,40 T 400,90" class="map-road-base" />
        <path d="M 50,200 Q 150,140 220,160 T 400,120" class="map-road-base" />
        <path d="M 120,0 Q 140,90 100,200" class="map-road-base" />
        <path d="M 290,0 Q 270,110 320,200" class="map-road-base" />

        <path d="M 0,60 Q 120,80 200,40 T 400,90" class="map-road-main" />
        <path d="M 50,200 Q 150,140 220,160 T 400,120" class="map-road-main" />
        <path d="M 120,0 Q 140,90 100,200" class="map-road-main" />
        <path d="M 290,0 Q 270,110 320,200" class="map-road-main" />

        <!-- Active Navigation Route: User (60, 150) -> Dest (310, 65) -->
        <path d="M 65,145 C 130,145 160,115 200,105 S 260,65 305,65" class="map-route-line" />

        <!-- User Origin Pin (Blue Pulse) -->
        <g transform="translate(65, 145)">
          <circle cx="0" cy="0" r="10" class="user-marker-pulse" />
          <circle cx="0" cy="0" r="5" class="user-marker-dot" />
          <rect x="-35" y="10" width="70" height="18" rx="4" fill="#0F172A" stroke="#38BDF8" stroke-width="1" />
          <text x="0" y="22" fill="#F8FAFC" font-size="8.5" font-weight="700" text-anchor="middle" font-family="sans-serif">YOUR LOCATION</text>
        </g>

        <!-- Destination Target Pin (Red Pulse) -->
        <g transform="translate(305, 65)">
          <circle cx="0" cy="0" r="10" class="dest-marker-pulse" />
          <circle cx="0" cy="0" r="5" class="dest-marker-dot" />
          <rect x="-42" y="-28" width="84" height="18" rx="4" fill="#0F172A" stroke="#EF4444" stroke-width="1" />
          <text x="0" y="-16" fill="#FCA5A5" font-size="8" font-weight="800" text-anchor="middle" font-family="sans-serif">${destinationName.toUpperCase()}</text>
        </g>
      </svg>
    </div>
  `;
}
