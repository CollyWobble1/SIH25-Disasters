/**
 * Screen 5: Travelling Component (Active Navigation & Arrival Trigger)
 * Shows current destination, map route, and the critical "I'M HERE" arrival control.
 */
import { store } from '../state.js';
import { renderTacticalMap } from './MapComponent.js';

export function renderTravelling(state) {
  const incident = state.currentResponse || state.selectedIncident || state.incidents[0];

  return `
    <div class="travelling-view-container view-enter">
      <!-- Travelling Status & Location Header -->
      <div class="travelling-header-card">
        <div class="travelling-top-bar">
          <span class="badge badge-travelling">
            <span class="pulse-dot" style="width: 6px; height: 6px; border-radius: 50%; background: #D97706; display: inline-block;"></span>
            TRAVELLING
          </span>

          <!-- Top-Right Arrival Control -->
          <button type="button" class="arrival-control-btn unreached" id="btn-mark-here" title="Tap when you reach the response site">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
            I'M HERE
          </button>
        </div>

        <h1 style="font-size: 20px; font-weight: 800; color: #0F172A; margin-top: 4px;">On the way</h1>
        <div style="font-size: 15px; font-weight: 700; color: #334155;">${incident.title}</div>
        <div style="font-size: 13px; font-weight: 600; color: #64748B;">${incident.distance} to destination</div>
      </div>

      <!-- Tactical Navigation Map (YOU -> DESTINATION) -->
      ${renderTacticalMap({
        destinationName: incident.title,
        distanceText: incident.distance,
        height: '200px'
      })}

      <!-- Meeting Direction Note -->
      <div class="supervisor-instruction-banner">
        <div class="supervisor-banner-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          Checkpoint Instruction
        </div>
        <p class="supervisor-banner-text">
          Meet the response supervisor at the designated point.
        </p>
      </div>

      <!-- Helper button to return to overview if needed -->
      <div style="display: flex; justify-content: center; margin-top: 6px; padding-bottom: 14px;">
        <button type="button" class="btn btn-secondary btn-sm" id="btn-back-to-home-from-travel">
          View Nearby Incident List
        </button>
      </div>
    </div>
  `;
}

export function initTravellingEvents(container) {
  const markHereBtn = container.querySelector('#btn-mark-here');
  if (markHereBtn) {
    markHereBtn.addEventListener('click', () => {
      store.markArrived();
    });
  }

  const backHomeBtn = container.querySelector('#btn-back-to-home-from-travel');
  if (backHomeBtn) {
    backHomeBtn.addEventListener('click', () => {
      store.setState({ activeTab: 'home' });
    });
  }
}
