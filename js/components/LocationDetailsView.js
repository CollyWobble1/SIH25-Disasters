/**
 * Screen 3: Location Details Component
 * Displays location overview, simulated mobile route map, and supervisor on-site briefing notice.
 */
import { store } from '../state.js';
import { renderTacticalMap } from './MapComponent.js';

export function renderLocationDetails(state) {
  const incident = state.selectedIncident || state.incidents[0];
  const isAlreadyActive = state.currentResponse && state.currentResponse.incidentId === incident.incidentId;
  const priorityClass = incident.priority.toLowerCase();

  return `
    <div class="location-details-container view-enter">
      <!-- Back Navigation Row -->
      <div class="btn-back-row">
        <button type="button" class="btn-back" id="btn-back-from-details">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          Back to list
        </button>
      </div>

      <!-- Location Header Card -->
      <div class="details-header-card">
        <div class="details-title-row">
          <div>
            <h1 class="details-title">${incident.title}</h1>
            <span style="font-size: 13px; font-weight: 700; color: #475569;">${incident.distance} away</span>
          </div>
          <span class="badge badge-${priorityClass}">${incident.priority} PRIORITY</span>
        </div>

        <div class="details-meta-chips">
          <span class="badge badge-medium">${incident.situation}</span>
          <span class="badge badge-volunteers">${incident.volunteersNeeded} volunteers needed</span>
        </div>

        <div class="details-source-text">
          Source: ${incident.source}
        </div>

        <!-- Help Needed Section -->
        <div class="details-help-needed-box">
          <div style="font-weight: 700; font-size: 12px; text-transform: uppercase; color: #475569; margin-bottom: 4px;">Help needed</div>
          <div>${incident.description || 'Emergency assistance is required in this area.'}</div>
        </div>
      </div>

      <!-- Simulated Mobile Route Map -->
      ${renderTacticalMap({
        destinationName: incident.title,
        distanceText: incident.distance,
        height: '160px'
      })}

      <!-- Prominent Main Instruction: Supervisor Briefing Notice -->
      <div class="supervisor-instruction-banner">
        <div class="supervisor-banner-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          Important Instructions
        </div>
        <p class="supervisor-banner-text">
          Go to this location and meet the response supervisor or authorities. They will brief you and assign your specific task when you arrive.
        </p>
      </div>

      <!-- Action Buttons -->
      <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 4px; padding-bottom: 16px;">
        ${!isAlreadyActive ? `
          <button type="button" class="btn btn-primary" id="btn-volunteer-here" style="height: 50px; font-size: 15px;">
            I CAN HELP HERE
          </button>
          <button type="button" class="btn btn-secondary" id="btn-secondary-back">
            BACK
          </button>
        ` : `
          <button type="button" class="btn btn-primary" id="btn-resume-navigation" style="height: 50px; font-size: 15px;">
            CONTINUE TO LOCATION
          </button>
        `}
      </div>
    </div>
  `;
}

export function initLocationDetailsEvents(container) {
  const backBtn = container.querySelector('#btn-back-from-details') || container.querySelector('#btn-secondary-back');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      store.backToNearbyList();
    });
  }

  const volunteerHereBtn = container.querySelector('#btn-volunteer-here');
  if (volunteerHereBtn) {
    volunteerHereBtn.addEventListener('click', () => {
      const state = store.getState();
      const incident = state.selectedIncident || state.incidents[0];
      store.volunteerHere(incident);
    });
  }

  const resumeBtn = container.querySelector('#btn-resume-navigation');
  if (resumeBtn) {
    resumeBtn.addEventListener('click', () => {
      const state = store.getState();
      if (state.responseStatus === 'ARRIVED' || state.responseStatus === 'TASK_ASSIGNED') {
        store.setState({ activeTab: 'arrived' });
      } else {
        store.setState({ activeTab: 'travelling' });
      }
    });
  }
}
