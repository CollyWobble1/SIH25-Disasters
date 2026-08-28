/**
 * SIH Demo Presenter Controller Component
 * Floating toolbar on presentation canvas for step jumps, offline toggle, and authority assignment triggers.
 */
import { store } from '../state.js';

export function renderDemoPresenterBar(state) {
  const isAlertScreen = state.activeScreen === 'disaster_alert' || state.activeScreen === 'not_now';
  const currentStep = getCurrentStepKey(state);

  return `
    <div class="demo-presenter-bar">
      <div class="demo-bar-title">
        <span class="sih-badge">SIH DEMO</span>
        <span>Flow Stepper</span>
      </div>

      <!-- Step-by-Step Jump Buttons -->
      <div class="demo-step-btns">
        <button type="button" class="btn-demo-step ${currentStep === 'alert' ? 'active' : ''}" data-step="alert" title="Step 1: Emergency Alert Screen">
          1. Alert
        </button>
        <button type="button" class="btn-demo-step ${currentStep === 'home' ? 'active' : ''}" data-step="home" title="Step 2: Help Needed Nearby">
          2. Nearby
        </button>
        <button type="button" class="btn-demo-step ${currentStep === 'details' ? 'active' : ''}" data-step="details" title="Step 3: Location Details & Route">
          3. Details
        </button>
        <button type="button" class="btn-demo-step ${currentStep === 'confirmed' ? 'active' : ''}" data-step="confirmed" title="Step 4: Volunteer Confirmed">
          4. Confirmed
        </button>
        <button type="button" class="btn-demo-step ${currentStep === 'travelling' ? 'active' : ''}" data-step="travelling" title="Step 5: Travelling / Navigation">
          5. Travelling
        </button>
        <button type="button" class="btn-demo-step ${currentStep === 'arrived' ? 'active' : ''}" data-step="arrived" title="Step 6: Arrived & On-Site Task">
          6. Arrived
        </button>
        <button type="button" class="btn-demo-step ${currentStep === 'completed' ? 'active' : ''}" data-step="completed" title="Step 7: Task Completed">
          7. Done
        </button>
      </div>

      <!-- Quick Action Buttons -->
      <div class="demo-bar-actions">
        <button type="button" class="btn-demo-action btn-authority" id="btn-demo-authority" title="Simulate Authority Direct Assignment">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          Authority Assign
        </button>

        <button type="button" class="btn-demo-action" id="btn-demo-toggle-offline" title="Toggle Mesh Offline Simulation">
          <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: ${state.isOnline ? '#22C55E' : '#D97706'};"></span>
          ${state.isOnline ? 'Go Offline' : 'Go Online'}
        </button>

        <button type="button" class="btn-demo-action btn-reset" id="btn-demo-reset" title="Reset Prototype to Initial Alert">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
            <path d="M8 16H3v5"/>
          </svg>
          Reset
        </button>
      </div>
    </div>
  `;
}

function getCurrentStepKey(state) {
  if (state.activeScreen === 'disaster_alert' || state.activeScreen === 'not_now') return 'alert';
  if (state.activeTab === 'home') return 'home';
  if (state.activeTab === 'details') return 'details';
  if (state.activeTab === 'confirmed') return 'confirmed';
  if (state.activeTab === 'travelling') return 'travelling';
  if (state.activeTab === 'arrived') return 'arrived';
  if (state.activeTab === 'completed') return 'completed';
  return 'home';
}

export function initDemoPresenterEvents(container) {
  // Step navigation buttons
  container.querySelectorAll('.btn-demo-step').forEach(btn => {
    btn.addEventListener('click', () => {
      const step = btn.dataset.step;
      const state = store.getState();
      const wakad = state.incidents.find(i => i.incidentId === 'inc-wakad-01') || state.incidents[0];

      switch (step) {
        case 'alert':
          store.setState({
            activeScreen: 'disaster_alert',
            selectedIncident: null,
            currentResponse: null,
            responseStatus: 'IDLE'
          });
          break;
        case 'home':
          store.setState({
            activeScreen: 'app_main',
            activeTab: 'home',
            selectedIncident: null
          });
          break;
        case 'details':
          store.setState({
            activeScreen: 'app_main',
            selectedIncident: wakad,
            activeTab: 'details'
          });
          break;
        case 'confirmed':
          store.setState({
            activeScreen: 'app_main',
            selectedIncident: wakad,
            currentResponse: wakad,
            responseStatus: 'CONFIRMED',
            activeTab: 'confirmed'
          });
          break;
        case 'travelling':
          store.setState({
            activeScreen: 'app_main',
            selectedIncident: wakad,
            currentResponse: wakad,
            responseStatus: 'TRAVELLING',
            activeTab: 'travelling'
          });
          break;
        case 'arrived':
          store.setState({
            activeScreen: 'app_main',
            selectedIncident: wakad,
            currentResponse: wakad,
            responseStatus: 'ARRIVED',
            arrivedAt: '11:48 AM',
            assignedTask: wakad.defaultTask,
            activeTab: 'arrived'
          });
          break;
        case 'completed':
          store.setState({
            activeScreen: 'app_main',
            responseStatus: 'COMPLETED',
            activeTab: 'completed'
          });
          break;
      }
    });
  });

  // Authority direct assignment
  const authorityBtn = container.querySelector('#btn-demo-authority');
  if (authorityBtn) {
    authorityBtn.addEventListener('click', () => {
      store.simulateAuthorityAssignment();
    });
  }

  // Toggle offline mode
  const offlineBtn = container.querySelector('#btn-demo-toggle-offline');
  if (offlineBtn) {
    offlineBtn.addEventListener('click', () => {
      const state = store.getState();
      store.toggleOffline(state.isOnline);
    });
  }

  // Reset prototype
  const resetBtn = container.querySelector('#btn-demo-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      store.resetDemo();
    });
  }
}
