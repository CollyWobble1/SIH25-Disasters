/**
 * Mock Operational Messages (Structured with sources and communication channels)
 */
export const INITIAL_MESSAGES = [
  {
    id: 'msg-01',
    sender: 'Government Emergency Response',
    content: 'Emergency assistance is required near Wakad.',
    time: '11:40 AM',
    timestamp: '2026-08-28T11:40:00Z',
    source: 'Government Emergency Response',
    originalSource: 'NDRF-04',
    commMethod: 'Cellular Broadcast',
    unread: false
  },
  {
    id: 'msg-02',
    sender: 'Response Team A',
    content: 'Meet us at the relief camp entrance. We will brief you on the assistance required.',
    time: '11:49 AM',
    timestamp: '2026-08-28T11:49:00Z',
    source: 'Response Team A',
    originalSource: 'Field Commander Unit',
    commMethod: 'Offline Mesh',
    unread: false,
    incidentId: 'inc-wakad-01'
  },
  {
    id: 'msg-03',
    sender: 'Response Team A',
    content: 'You have been assigned to evacuation assistance.',
    time: '11:50 AM',
    timestamp: '2026-08-28T11:50:00Z',
    source: 'Response Team A',
    originalSource: 'Field Commander Unit',
    commMethod: 'Tactical Radio / Mesh',
    unread: false,
    incidentId: 'inc-wakad-01'
  },
  {
    id: 'msg-04',
    sender: 'NDRF Field Unit',
    content: 'Relief staging area activated in Sector 4. Medical kits available at primary canopy.',
    time: '11:32 AM',
    timestamp: '2026-08-28T11:32:00Z',
    source: 'NDRF Field Unit',
    originalSource: 'NDRF-04',
    commMethod: 'Offline Mesh',
    unread: false
  }
];
