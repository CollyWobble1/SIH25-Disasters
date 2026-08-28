/**
 * Screen 1: Government Disaster Alert Notification Component
 * This is the FIRST screen the user sees when opening the app.
 */
import { store } from '../state.js';

export function renderDisasterAlert(state) {
  if (state.activeScreen === 'not_now') {
    return `
      <div class="not-now-container view-enter">
        <div class="not-now-icon-circle">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
        </div>
        <h2 style="font-size: 18px; font-weight: 800; color: #0F172A;">Response Deferred</h2>
        <p class="not-now-message">You can volunteer later if assistance is still required.</p>
        <button type="button" class="btn-return-alert" id="btn-return-alert">
          Return to Alert
        </button>
      </div>
    `;
  }

  return `
    <div class="alert-view-container view-enter">
      <!-- Emergency Official Alert Card -->
      <div class="emergency-alert-card">
        <!-- Official Banner -->
        <div class="alert-header-banner">
          <svg class="alert-shield-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div class="alert-header-text">
            <span class="alert-top-title">Disaster Alert</span>
            <span class="alert-gov-source">Government Emergency Response</span>
          </div>
        </div>

        <!-- Alert Core Body -->
        <div class="alert-body">
          <p class="alert-primary-msg">A disaster has been reported in your nearby area.</p>

          <!-- Incident Highlight Box -->
          <div class="alert-incident-box">
            <div class="alert-zone-row">
              <span class="alert-zone-title">Wakad Response Zone</span>
              <span class="alert-distance-badge">2.8 km away</span>
            </div>

            <div class="alert-meta-row">
              <span class="alert-pill flood">Flood emergency</span>
              <span class="alert-pill high-prio">High priority</span>
            </div>

            <p class="alert-requirement-text">Emergency assistance is currently required.</p>
          </div>
        </div>
      </div>

      <!-- Action Prompt Box -->
      <div class="alert-prompt-section">
        <h3 class="alert-prompt-title">Can you volunteer to help?</h3>
        
        <div class="alert-btn-stack">
          <button type="button" class="btn-emergency-yes" id="btn-alert-yes">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            YES, I WANT TO HELP
          </button>
          
          <button type="button" class="btn-emergency-no" id="btn-alert-no">
            NOT NOW
          </button>
        </div>
      </div>
    </div>
  `;
}

export function initDisasterAlertEvents(container) {
  const yesBtn = container.querySelector('#btn-alert-yes');
  if (yesBtn) {
    yesBtn.addEventListener('click', () => {
      store.acceptAlert();
    });
  }

  const noBtn = container.querySelector('#btn-alert-no');
  if (noBtn) {
    noBtn.addEventListener('click', () => {
      store.declineAlert();
    });
  }

  const returnBtn = container.querySelector('#btn-return-alert');
  if (returnBtn) {
    returnBtn.addEventListener('click', () => {
      store.returnToAlert();
    });
  }
}
