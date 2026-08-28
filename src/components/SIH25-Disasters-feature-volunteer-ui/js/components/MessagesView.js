/**
 * Operational Messages & Tactical Broadcasts Component
 */
import { store } from '../state.js';

export function renderMessages(state) {
  return `
    <div class="messages-view view-enter">
      <div class="view-header">
        <h1 class="view-title">Messages</h1>
        <p class="view-subtitle">Official disaster response broadcasts & instructions</p>
      </div>

      <div class="messages-list">
        ${state.messages.map(msg => `
          <div class="message-item">
            <div class="message-item-header">
              <span class="message-sender">${msg.sender}</span>
              <span class="message-time">${msg.time}</span>
            </div>
            
            <p class="message-content">"${msg.content}"</p>

            <div class="message-source-footer">
              <span>Source: <strong>${msg.originalSource || msg.source}</strong></span>
              <span class="comm-pill">${msg.commMethod || 'Cellular'}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

export function initMessagesEvents(container) {
  // Read-only operational log
}
