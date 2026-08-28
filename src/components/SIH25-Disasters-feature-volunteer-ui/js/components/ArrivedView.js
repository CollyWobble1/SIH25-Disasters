/**
 * Screen 6 & 7: Arrived & On-Site Task Assignment Component
 * Displays arrival confirmation, on-site supervisor message, and supervisor-assigned task.
 */
import { store } from '../state.js';

export function renderArrived(state) {
  const incident = state.currentResponse || state.selectedIncident || state.incidents[0];
  const arrivedTime = state.arrivedAt || '11:48 AM';
  const task = state.assignedTask || {
    taskId: 'task-wakad-evac',
    title: 'Evacuation Assistance',
    assignedBy: 'Response Team A',
    status: 'IN PROGRESS',
    supervisorNote: 'Meet us at the relief camp entrance. We will brief you on the assistance required.'
  };

  return `
    <div class="travelling-view-container view-enter">
      <!-- Arrived Header Card -->
      <div class="travelling-header-card" style="border-color: #6EE7B7;">
        <div class="travelling-top-bar">
          <span class="badge badge-arrived">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
            ARRIVED
          </span>

          <!-- Top-Right Arrival Status Indicator -->
          <div class="arrival-control-btn arrived">
            <span>ARRIVED ✓</span>
          </div>
        </div>

        <h1 style="font-size: 20px; font-weight: 800; color: #0F172A; margin-top: 4px;">You've arrived</h1>
        <div style="font-size: 15px; font-weight: 700; color: #334155;">${incident.title}</div>
        <div class="arrival-timestamp">Arrived at ${arrivedTime}</div>
      </div>

      <!-- Designated Meeting Instruction -->
      <div class="supervisor-instruction-banner">
        <div class="supervisor-banner-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          Supervisor Briefing Point
        </div>
        <p class="supervisor-banner-text">
          Please meet the response supervisor or authorities at the designated point.
        </p>
        <div style="font-size: 12px; font-weight: 700; color: #1E3A8A; margin-top: 6px;">
          Supervisor: ${task.assignedBy}
        </div>
      </div>

      <!-- Supervisor Message Bubble -->
      <div class="supervisor-msg-card">
        <div class="supervisor-msg-header">
          <span class="supervisor-sender-name">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            ${task.assignedBy}
          </span>
          <span class="supervisor-msg-time">11:49 AM</span>
        </div>
        <p class="supervisor-msg-text">
          "${task.supervisorNote || 'Meet us at the relief camp entrance. We will brief you on the assistance required.'}"
        </p>
      </div>

      <!-- Actual Task Assigned On-Site by Supervisor -->
      <div class="assigned-task-card">
        <div class="assigned-task-header">
          <div>
            <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #047857; letter-spacing: 0.5px;">
              On-Site Task Assigned
            </div>
            <h2 class="assigned-task-title">${task.title}</h2>
          </div>
          <span class="badge badge-progress">${task.status}</span>
        </div>

        <div class="assigned-task-status-row">
          <span>Assigned by:</span>
          <span class="assigned-by-badge">${task.assignedBy}</span>
        </div>

        <div style="font-size: 12px; color: #4B5563; font-style: italic; background: #F9FAFB; padding: 8px 10px; border-radius: 6px; border: 1px dashed #D1D5DB;">
          This operational task was assigned on-site by the response supervisor upon your arrival.
        </div>
      </div>

      <!-- Mark Task Complete Action Button -->
      <div style="margin-top: 6px; padding-bottom: 20px;">
        <button type="button" class="btn btn-success btn-block" id="btn-mark-task-complete" style="height: 52px; font-size: 15px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          MARK TASK COMPLETE
        </button>
      </div>
    </div>
  `;
}

export function initArrivedEvents(container) {
  const markCompleteBtn = container.querySelector('#btn-mark-task-complete');
  if (markCompleteBtn) {
    markCompleteBtn.addEventListener('click', () => {
      store.completeTask();
    });
  }
}
