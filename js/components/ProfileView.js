/**
 * Volunteer Profile Component (Minimal & Operational)
 */
import { store } from '../state.js';

export function renderProfile(state) {
  const p = state.profile;

  return `
    <div class="profile-view view-enter">
      <div class="view-header">
        <h1 class="view-title">Profile</h1>
        <p class="view-subtitle">Registered disaster volunteer credentials</p>
      </div>

      <div class="profile-card">
        <div class="profile-avatar-row">
          <div class="profile-avatar">
            RS
          </div>
          <div class="profile-info">
            <h2 class="profile-name">${p.name}</h2>
            <span class="profile-id-badge">${p.volunteerId}</span>
          </div>
        </div>

        <div style="height: 1px; background: var(--border-subtle); margin: 4px 0;"></div>

        <div class="profile-field-group">
          <span class="profile-field-label">Registered Location</span>
          <span class="profile-field-val">${p.location}</span>
        </div>

        <div class="profile-field-group">
          <span class="profile-field-label">Primary Contact</span>
          <span class="profile-field-val">${p.phone}</span>
        </div>

        <div class="profile-field-group">
          <span class="profile-field-label">Blood Group</span>
          <span class="profile-field-val">${p.bloodGroup}</span>
        </div>

        <div class="profile-field-group">
          <span class="profile-field-label">Certified Response Skills</span>
          <div class="profile-skills-row">
            ${p.skills.map(s => `<span class="skill-tag">${s}</span>`).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

export function initProfileEvents(container) {
  // Minimal read-only profile
}
