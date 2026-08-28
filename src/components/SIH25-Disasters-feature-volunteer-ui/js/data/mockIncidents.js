/**
 * Mock Incident Locations Dataset (Structured for Firebase Firestore compatibility)
 */
export const INITIAL_INCIDENTS = [
  {
    incidentId: 'inc-wakad-01',
    title: 'Wakad Response Zone',
    location: 'Wakad, Pune',
    distance: '2.8 km',
    distanceKm: 2.8,
    severity: 'HIGH',
    priority: 'HIGH',
    situation: 'Flood emergency',
    volunteersNeeded: 10,
    source: 'Government Emergency Response',
    originalSource: 'NDRF-04',
    commMethod: 'Cellular & Mesh',
    description: 'Emergency assistance is required in this area.',
    status: 'ACTIVE',
    createdAt: '2026-08-28T09:15:00Z',
    coordinates: { lat: 18.5987, lng: 73.7684 },
    defaultTask: {
      taskId: 'task-wakad-evac',
      title: 'Evacuation Assistance',
      assignedBy: 'Response Team A',
      status: 'IN PROGRESS',
      supervisorNote: 'Meet us at the relief camp entrance. We will brief you on the assistance required.'
    }
  },
  {
    incidentId: 'inc-ravet-02',
    title: 'Ravet Relief Shelter',
    location: 'Ravet, Pune',
    distance: '4.1 km',
    distanceKm: 4.1,
    severity: 'CRITICAL',
    priority: 'CRITICAL',
    situation: 'Emergency assistance required',
    volunteersNeeded: 6,
    source: 'Government Emergency Response',
    originalSource: 'Disaster Cell PCMC',
    commMethod: 'Emergency Cellular Broadcast',
    description: 'Emergency assistance is required in this area.',
    status: 'ACTIVE',
    createdAt: '2026-08-28T09:10:00Z',
    coordinates: { lat: 18.6472, lng: 73.7432 },
    defaultTask: {
      taskId: 'task-ravet-med',
      title: 'First Aid Support',
      assignedBy: 'Medical Response Unit 2',
      status: 'IN PROGRESS',
      supervisorNote: 'Report to the primary medical triage desk near Gate 2.'
    }
  },
  {
    incidentId: 'inc-punawale-03',
    title: 'Punawale Response Zone',
    location: 'Punawale, Pune',
    distance: '3.6 km',
    distanceKm: 3.6,
    severity: 'HIGH',
    priority: 'HIGH',
    situation: 'Evacuation support required',
    volunteersNeeded: 15,
    source: 'Government Emergency Response',
    originalSource: 'NDRF Field Unit',
    commMethod: 'Offline Mesh',
    description: 'Emergency assistance is required in this area.',
    status: 'ACTIVE',
    createdAt: '2026-08-28T09:20:00Z',
    coordinates: { lat: 18.6189, lng: 73.7498 },
    defaultTask: {
      taskId: 'task-punawale-shelter',
      title: 'Shelter Support',
      assignedBy: 'Response Team C',
      status: 'IN PROGRESS',
      supervisorNote: 'Coordinate with community leaders at the school gymnasium.'
    }
  },
  {
    incidentId: 'inc-tathawade-04',
    title: 'Tathawade Relief Point',
    location: 'Tathawade, Pune',
    distance: '5.2 km',
    distanceKm: 5.2,
    severity: 'MEDIUM',
    priority: 'MEDIUM',
    situation: 'Relief assistance required',
    volunteersNeeded: 8,
    source: 'Government Emergency Response',
    originalSource: 'Civil Defense Pune',
    commMethod: 'Cellular Broadcast',
    description: 'Emergency assistance is required in this area.',
    status: 'ACTIVE',
    createdAt: '2026-08-28T09:25:00Z',
    coordinates: { lat: 18.6143, lng: 73.7601 },
    defaultTask: {
      taskId: 'task-tathawade-supply',
      title: 'Supply Distribution',
      assignedBy: 'Civil Defense Logistics',
      status: 'IN PROGRESS',
      supervisorNote: 'Help organize clean water and packaged ration distribution.'
    }
  }
];
