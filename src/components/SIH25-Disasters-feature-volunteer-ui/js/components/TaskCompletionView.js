/**
 * Screen 8: Task Completed Component
 * Displays completion gratitude and smooth return to available nearby locations.
 */
import { store } from '../state.js';

export function renderTaskCompletion(state) {
  return `
    <div class="completion-view-container view-enter">
      <div>
        <div class="completion-icon-box">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>

        <h1 class="completion-title">Task completed</h1>
        <div style="font-size: 16px; font-weight: 700; color: #059669; margin-bottom: 12px;">Thank you for helping.</div>

        <p class="completion-desc">
          You can now view other nearby locations where assistance is needed.
        </p>
      </div>

      <div style="padding-bottom: 20px;">
        <button type="button" class="btn btn-primary btn-block" id="btn-return-to-nearby" style="height: 52px; font-size: 15px;">
          View Nearby Locations
        </button>
      </div>
    </div>
  `;
}

export function initTaskCompletionEvents(container) {
  const returnBtn = container.querySelector('#btn-return-to-nearby');
  if (returnBtn) {
    returnBtn.addEventListener('click', () => {
      store.finishCompletionAndReturnHome();
    });
  }
}
