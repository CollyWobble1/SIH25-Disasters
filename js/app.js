/**
 * Main Application Orchestrator & View Router
 */
import { store } from './state.js';
import { renderDisasterAlert, initDisasterAlertEvents } from './components/DisasterAlertView.js';
import { renderHome, initHomeEvents } from './components/HomeView.js';
import { renderLocationDetails, initLocationDetailsEvents } from './components/LocationDetailsView.js';
import { renderVolunteerConfirmed, initVolunteerConfirmedEvents } from './components/VolunteerConfirmedView.js';
import { renderTravelling, initTravellingEvents } from './components/TravellingView.js';
import { renderArrived, initArrivedEvents } from './components/ArrivedView.js';
import { renderTaskCompletion, initTaskCompletionEvents } from './components/TaskCompletionView.js';
import { renderMessages, initMessagesEvents } from './components/MessagesView.js';
import { renderProfile, initProfileEvents } from './components/ProfileView.js';

class App {
  constructor() {
    this.contentEl = document.getElementById('app-content');
    this.bottomNavEl = document.getElementById('bottom-nav');
    this.statusTimeEl = document.getElementById('status-time');
    this.connectivityPillEl = document.getElementById('connectivity-pill');
    this.toastContainerEl = document.getElementById('toast-container');
    this.offlineBannerEl = document.getElementById('offline-banner');

    this.initClock();
    this.initStoreSubscription();
    this.render();
  }

  initClock() {
    const updateTime = () => {
      const now = new Date();
      if (this.statusTimeEl) {
        this.statusTimeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    };
    updateTime();
    setInterval(updateTime, 15000);
  }

  initStoreSubscription() {
    store.subscribe((state) => {
      this.render(state);
    });
  }

  render(state = store.getState()) {
    this.renderConnectivity(state);
    this.renderOfflineBanner(state);
    this.renderToasts(state);
    this.renderBottomNav(state);
    this.renderMainContent(state);
  }

  renderConnectivity(state) {
    if (!this.connectivityPillEl) return;

    if (state.syncState === 'syncing') {
      this.connectivityPillEl.className = 'connectivity-pill syncing';
      this.connectivityPillEl.innerHTML = `<span class="pill-dot"></span><span>Syncing...</span>`;
    } else if (state.syncState === 'synced') {
      this.connectivityPillEl.className = 'connectivity-pill online';
      this.connectivityPillEl.innerHTML = `<span class="pill-dot"></span><span>✓ Synced</span>`;
    } else if (!state.isOnline) {
      this.connectivityPillEl.className = 'connectivity-pill offline';
      this.connectivityPillEl.innerHTML = `<span class="pill-dot"></span><span>OFFLINE</span>`;
    } else {
      this.connectivityPillEl.className = 'connectivity-pill online';
      this.connectivityPillEl.innerHTML = `<span class="pill-dot"></span><span>ONLINE</span>`;
    }

    this.connectivityPillEl.onclick = () => {
      store.toggleOffline(state.isOnline);
    };
  }

  renderOfflineBanner(state) {
    if (!this.offlineBannerEl) return;
    if (!state.isOnline) {
      this.offlineBannerEl.style.display = 'flex';
      this.offlineBannerEl.innerHTML = `
        <div class="offline-banner-left">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="1" y1="1" x2="23" y2="23"/>
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
            <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
            <line x1="12" y1="20" x2="12.01" y2="20"/>
          </svg>
          <span>Offline Mesh Active</span>
        </div>
        <span class="offline-banner-tag">Saved locally</span>
      `;
    } else {
      this.offlineBannerEl.style.display = 'none';
    }
  }

  renderMainContent(state) {
    if (!this.contentEl) return;

    // Screen 1: Government Disaster Alert is first screen
    if (state.activeScreen === 'disaster_alert' || state.activeScreen === 'not_now') {
      this.contentEl.innerHTML = renderDisasterAlert(state);
      initDisasterAlertEvents(this.contentEl);
      return;
    }

    // App Main Tabs & Flows
    switch (state.activeTab) {
      case 'home':
        this.contentEl.innerHTML = renderHome(state);
        initHomeEvents(this.contentEl);
        break;

      case 'details':
        this.contentEl.innerHTML = renderLocationDetails(state);
        initLocationDetailsEvents(this.contentEl);
        break;

      case 'confirmed':
        this.contentEl.innerHTML = renderVolunteerConfirmed(state);
        initVolunteerConfirmedEvents(this.contentEl);
        break;

      case 'travelling':
        this.contentEl.innerHTML = renderTravelling(state);
        initTravellingEvents(this.contentEl);
        break;

      case 'arrived':
        this.contentEl.innerHTML = renderArrived(state);
        initArrivedEvents(this.contentEl);
        break;

      case 'completed':
        this.contentEl.innerHTML = renderTaskCompletion(state);
        initTaskCompletionEvents(this.contentEl);
        break;

      case 'messages':
        this.contentEl.innerHTML = renderMessages(state);
        initMessagesEvents(this.contentEl);
        break;

      case 'profile':
        this.contentEl.innerHTML = renderProfile(state);
        initProfileEvents(this.contentEl);
        break;

      default:
        this.contentEl.innerHTML = renderHome(state);
        initHomeEvents(this.contentEl);
        break;
    }
  }

  renderBottomNav(state) {
    if (!this.bottomNavEl) return;

    // Hide bottom nav during the initial disaster alert notification
    if (state.activeScreen === 'disaster_alert' || state.activeScreen === 'not_now') {
      this.bottomNavEl.style.display = 'none';
      return;
    }

    this.bottomNavEl.style.display = 'flex';

    const isHomeActive = ['home', 'details', 'confirmed', 'travelling', 'arrived', 'completed'].includes(state.activeTab);
    const isMessagesActive = state.activeTab === 'messages';
    const isProfileActive = state.activeTab === 'profile';

    this.bottomNavEl.innerHTML = `
      <button type="button" class="nav-item ${isHomeActive ? 'active' : ''}" data-tab="home">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <polyline points="9 22 9 12 15 12 15 22"></polyline>
        </svg>
        <span>Home</span>
      </button>

      <button type="button" class="nav-item ${isMessagesActive ? 'active' : ''}" data-tab="messages">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
        <span>Messages</span>
      </button>

      <button type="button" class="nav-item ${isProfileActive ? 'active' : ''}" data-tab="profile">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
        <span>Profile</span>
      </button>
    `;

    this.bottomNavEl.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        if (tab === 'home') {
          // If currently in active response, navigate appropriately
          if (state.responseStatus === 'TRAVELLING') {
            store.setState({ activeTab: 'travelling' });
          } else if (state.responseStatus === 'ARRIVED' || state.responseStatus === 'TASK_ASSIGNED') {
            store.setState({ activeTab: 'arrived' });
          } else {
            store.setState({ activeTab: 'home', selectedIncident: null });
          }
        } else {
          store.setState({ activeTab: tab });
        }
      });
    });
  }

  renderToasts(state) {
    if (!this.toastContainerEl) return;
    const toasts = state.toasts || [];
    this.toastContainerEl.innerHTML = toasts.map(t => `
      <div class="toast toast-${t.type}">
        <span>${t.message}</span>
      </div>
    `).join('');
  }
}

// Bootstrap application on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
