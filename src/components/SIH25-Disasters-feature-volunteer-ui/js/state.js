/**
 * Central Reactive State Management for SIH Disaster Response Volunteer Prototype
 */
import { INITIAL_INCIDENTS } from './data/mockIncidents.js';
import { INITIAL_MESSAGES } from './data/mockMessages.js';

const STORAGE_KEY = 'sih_volunteer_app_state_v2';

class AppStore {
  constructor() {
    this.listeners = new Set();
    this.state = this.loadInitialState();
  }

  loadInitialState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Could not load saved state from localStorage:', e);
    }
    return this.getDefaultState();
  }

  getDefaultState() {
    return {
      // First screen is STRICTLY the Government Disaster Alert
      activeScreen: 'disaster_alert', // 'disaster_alert' | 'not_now' | 'app_main'
      activeTab: 'home',               // 'home' | 'messages' | 'profile'
      
      // Volunteer Profile (Minimal, no active/shift toggles)
      profile: {
        name: 'Rahul Sharma',
        volunteerId: 'VOL-1024',
        location: 'Wakad, Pune',
        skills: ['First Aid', 'Rescue Assistance'],
        phone: '+91 98765 43210',
        bloodGroup: 'O+'
      },

      // Incident & Response State
      incidents: [...INITIAL_INCIDENTS],
      selectedIncident: null,
      currentResponse: null, // Active incident the volunteer is currently assisting with
      responseStatus: 'IDLE', // 'IDLE' | 'CONFIRMED' | 'TRAVELLING' | 'ARRIVED' | 'TASK_ASSIGNED' | 'COMPLETED'
      arrivedAt: null,        // e.g. "11:48 AM"
      
      // On-site task assigned by supervisor upon arrival
      assignedTask: null,

      // Messages & Operational Log
      messages: [...INITIAL_MESSAGES],

      // Connectivity & Offline Mesh Simulation
      isOnline: true,
      syncState: 'idle', // 'idle' | 'syncing' | 'synced'

      // Toast Notifications
      toasts: []
    };
  }

  getState() {
    return this.state;
  }

  setState(partialState) {
    this.state = { ...this.state, ...partialState };
    this.saveState();
    this.notify();
  }

  saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.error('Failed to save state to localStorage:', e);
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  // ==========================================
  // Government Disaster Alert Actions (Screen 1)
  // ==========================================
  acceptAlert() {
    this.setState({
      activeScreen: 'app_main',
      activeTab: 'home',
      selectedIncident: null
    });
    this.addToast('Thank you for volunteering! Help is needed at several nearby locations.', 'success');
  }

  declineAlert() {
    this.setState({
      activeScreen: 'not_now'
    });
  }

  returnToAlert() {
    this.setState({
      activeScreen: 'disaster_alert'
    });
  }

  // ==========================================
  // Volunteer Location Flow Actions
  // ==========================================
  viewIncidentDetails(incident) {
    this.setState({
      selectedIncident: incident,
      activeTab: 'details'
    });
  }

  backToNearbyList() {
    this.setState({
      selectedIncident: null,
      activeTab: 'home'
    });
  }

  volunteerHere(incident) {
    this.setState({
      currentResponse: incident,
      selectedIncident: incident,
      responseStatus: 'CONFIRMED',
      activeTab: 'confirmed'
    });
    this.addToast(`Volunteer confirmed for ${incident.title}.`, 'mesh');
  }

  startNavigation() {
    this.setState({
      responseStatus: 'TRAVELLING',
      activeTab: 'travelling'
    });
    this.addToast('Navigation active. Please proceed to the designated point.', 'mesh');
  }

  markArrived() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = (hours % 12 || 12).toString();
    const timeStr = `${formattedHours}:${minutes} ${ampm}`;

    const incident = this.state.currentResponse || this.state.incidents[0];
    const task = incident.defaultTask || {
      taskId: 'task-gen-01',
      title: 'Evacuation Assistance',
      assignedBy: 'Response Team A',
      status: 'IN PROGRESS',
      supervisorNote: 'Meet us at the relief camp entrance. We will brief you on the assistance required.'
    };

    this.setState({
      responseStatus: 'ARRIVED',
      arrivedAt: timeStr,
      assignedTask: task,
      activeTab: 'arrived'
    });

    this.addToast('Status updated: ARRIVED at response zone.', 'success');
  }

  completeTask() {
    this.setState({
      responseStatus: 'COMPLETED',
      activeTab: 'completed'
    });
    this.addToast('Task marked complete. Thank you for your service!', 'success');
  }

  finishCompletionAndReturnHome() {
    this.setState({
      currentResponse: null,
      selectedIncident: null,
      responseStatus: 'IDLE',
      arrivedAt: null,
      assignedTask: null,
      activeTab: 'home'
    });
  }

  // ==========================================
  // Authority Direct Assignment Simulation
  // ==========================================
  simulateAuthorityAssignment() {
    const wakadIncident = this.state.incidents.find(i => i.incidentId === 'inc-wakad-01') || this.state.incidents[0];
    this.setState({
      activeScreen: 'app_main',
      currentResponse: wakadIncident,
      selectedIncident: wakadIncident,
      responseStatus: 'TRAVELLING',
      activeTab: 'travelling'
    });
    this.addToast('Emergency Command: You have been assigned to Wakad Response Zone.', 'alert');
  }

  // ==========================================
  // Offline Simulation Actions
  // ==========================================
  toggleOffline(targetOfflineState) {
    const isNowOnline = !targetOfflineState;
    if (!isNowOnline) {
      // Switching to Offline
      this.setState({
        isOnline: false,
        syncState: 'idle'
      });
      this.addToast('Switched to OFFLINE mode. All data available locally via Mesh.', 'mesh');
    } else {
      // Restoring Online with realistic sync cycle
      this.setState({
        isOnline: true,
        syncState: 'syncing'
      });
      this.addToast('Internet connection restored. Synchronizing...', 'mesh');

      setTimeout(() => {
        this.setState({ syncState: 'synced' });
        this.addToast('✓ Synced with central emergency command.', 'success');

        setTimeout(() => {
          this.setState({ syncState: 'idle' });
        }, 2000);
      }, 1400);
    }
  }

  // ==========================================
  // Toast Helper
  // ==========================================
  addToast(message, type = 'info') {
    const id = Date.now() + Math.random();
    const newToast = { id, message, type };
    this.setState({
      toasts: [...this.state.toasts, newToast]
    });

    setTimeout(() => {
      this.setState({
        toasts: this.state.toasts.filter(t => t.id !== id)
      });
    }, 3200);
  }

  // ==========================================
  // Reset Prototype
  // ==========================================
  resetDemo() {
    localStorage.removeItem(STORAGE_KEY);
    this.state = this.getDefaultState();
    this.saveState();
    this.notify();
  }
}

export const store = new AppStore();
window.appStore = store;
