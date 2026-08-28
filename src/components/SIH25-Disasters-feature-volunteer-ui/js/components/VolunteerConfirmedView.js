/**
 * Screen 4: Volunteer Confirmation Component
 * Serious, professional confirmation with direction to proceed and meet the on-site supervisor.
 */
import { store } from '../state.js';

export function renderVolunteerConfirmed(state) {
  const incident = state.currentResponse || state.selectedIncident || state.incidents[0];

  return `
    <div class="confirmed-view-container view-enter">
      <div style="display: flex; flex-direction: column; gap: 14px;">
        <!-- Confirmation Card -->
        <div class="confirmed-card">
          <div class="confirmed-badge-row">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <span>Response Registered</span>
          </div>

          <h1 class="confirmed-title">Volunteer confirmed</h1>
          <div style="font-size: 16px; font-weight: 700; color: #1E293B;">${incident.title}</div>

          <p class="confirmed-instruction">
            Please proceed to the location and meet the response supervisor. Your specific task will be assigned when you arrive.
          </p>
        </div>
      </div>

      <!-- Action Button -->
      <div style="margin-top: 20px; padding-bottom: 16px;">
        <button type="button" class="btn btn-primary btn-block" id="btn-start-navigation" style="height: 52px; font-size: 15px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polygon points="3 11 22 2 13 21 11 13 3 11"/>
          </svg>
          START NAVIGATION
        </button>
      </div>
    </div>
  `;
}

export function initVolunteerConfirmedEvents(container) {
  const startNavBtn = container.querySelector('#btn-start-navigation');
  if (startNavBtn) {
    startNavBtn.addEventListener('click', () => {
      store.startNavigation();
    });
  }
}
