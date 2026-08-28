/**
 * Screen 2: Volunteer Home Component ("Help needed nearby")
 * Shows multiple nearby emergency response zones.
 */
import { store } from '../state.js';

export function renderHome(state) {
  const currentResponse = state.currentResponse;
  const isResponding = currentResponse && (state.responseStatus === 'TRAVELLING' || state.responseStatus === 'ARRIVED' || state.responseStatus === 'TASK_ASSIGNED');

  return `
    <div class="home-view view-enter">
      <!-- Title -->
      <div class="view-header">
        <h1 class="view-title">Help needed nearby</h1>
        <p class="view-subtitle">Select a location to provide disaster assistance.</p>
      </div>

      <!-- Current Response Card (If active response in progress) -->
      ${isResponding ? `
        <div class="current-response-card">
          <div class="current-response-top">
            <span class="current-response-label">
              <span class="pulse-dot"></span>
              Current Response
            </span>
            <span class="badge ${state.responseStatus === 'ARRIVED' ? 'badge-arrived' : 'badge-travelling'}">
              ${state.responseStatus === 'ARRIVED' ? 'ARRIVED ✓' : 'TRAVELLING'}
            </span>
          </div>

          <div class="current-response-title">${currentResponse.title}</div>

          <div class="current-response-bottom">
            <span class="current-response-meta">${currentResponse.distance} • ${currentResponse.situation}</span>
            <button type="button" class="btn btn-primary btn-sm" id="btn-open-current-response">
              OPEN
            </button>
          </div>
        </div>

        <div class="divider-label">Other locations needing help</div>
      ` : ''}

      <!-- List of Nearby Disaster Locations -->
      <div class="location-list">
        ${state.incidents.map(inc => {
          const isThisActive = isResponding && currentResponse && currentResponse.incidentId === inc.incidentId;
          const priorityClass = inc.priority.toLowerCase();

          return `
            <div class="location-card" data-incident-id="${inc.incidentId}">
              <div class="location-card-header">
                <div>
                  <h3 class="location-card-title">${inc.title}</h3>
                  <div class="location-card-situation">${inc.situation}</div>
                </div>
                <span class="location-card-distance">${inc.distance}</span>
              </div>

              <div class="location-card-meta">
                <div class="location-card-badges">
                  <span class="badge badge-${priorityClass}">${inc.priority}</span>
                  <span class="badge badge-volunteers">${inc.volunteersNeeded} volunteers needed</span>
                </div>
                <button type="button" class="btn btn-secondary btn-sm btn-view-location" data-incident-id="${inc.incidentId}">
                  ${isThisActive ? 'ACTIVE' : 'VIEW'}
                </button>
              </div>

              <div class="location-card-source">
                Source: ${inc.source}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

export function initHomeEvents(container) {
  // Open current response button
  const openCurrentBtn = container.querySelector('#btn-open-current-response');
  if (openCurrentBtn) {
    openCurrentBtn.addEventListener('click', () => {
      const state = store.getState();
      if (state.responseStatus === 'ARRIVED' || state.responseStatus === 'TASK_ASSIGNED') {
        store.setState({ activeTab: 'arrived' });
      } else {
        store.setState({ activeTab: 'travelling' });
      }
    });
  }

  // View Location buttons
  container.querySelectorAll('.btn-view-location').forEach(btn => {
    btn.addEventListener('click', () => {
      const incidentId = btn.dataset.incidentId;
      const state = store.getState();
      const incident = state.incidents.find(i => i.incidentId === incidentId);
      if (incident) {
        if (state.currentResponse && state.currentResponse.incidentId === incidentId) {
          if (state.responseStatus === 'ARRIVED' || state.responseStatus === 'TASK_ASSIGNED') {
            store.setState({ activeTab: 'arrived' });
          } else {
            store.setState({ activeTab: 'travelling' });
          }
        } else {
          store.viewIncidentDetails(incident);
        }
      }
    });
  });
}
