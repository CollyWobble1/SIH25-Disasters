import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  runTransaction,
  serverTimestamp,
  getDocs,
  getDoc
} from "firebase/firestore";
import { db } from "../../firebase";

export const RESOURCE_COLLECTION = "resource_requests";

/**
 * Valid Urgency Levels
 */
export const URGENCY_LEVELS = {
  CRITICAL: {
    label: "CRITICAL",
    color: "bg-red-600 text-white border-red-700",
    badgeBg: "#ef4444",
    textClass: "text-red-500",
    borderClass: "border-red-500",
  },
  HIGH: {
    label: "HIGH",
    color: "bg-amber-500 text-white border-amber-600",
    badgeBg: "#f59e0b",
    textClass: "text-amber-500",
    borderClass: "border-amber-500",
  },
  MEDIUM: {
    label: "MEDIUM",
    color: "bg-blue-600 text-white border-blue-700",
    badgeBg: "#3b82f6",
    textClass: "text-blue-500",
    borderClass: "border-blue-500",
  },
};

/**
 * Standard Categories
 */
export const RESOURCE_CATEGORIES = [
  "Food & Water",
  "Medical Supplies",
  "Rescue Operations",
  "Shelter & Blankets",
  "Logistics & Transport",
  "Hygiene & Sanitation",
  "Power & Telecom",
  "Child & Elderly Care",
];

/**
 * Standard Units
 */
export const RESOURCE_UNITS = [
  "units",
  "packs",
  "boxes",
  "kg",
  "litres",
  "volunteers",
  "hours",
  "kits",
  "pallets",
  "vehicles",
];

/**
 * Haversine Distance Formula (calculates distance in km between two GPS coordinates)
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371; // Radius of the Earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10; // 1 decimal place
}

/**
 * Generates a unique verification token for volunteer claim receipts
 */
export function generateClaimToken(prefix = "RESQ") {
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  const ts = Date.now().toString(36).slice(-4).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

/**
 * Real-time subscription to resource requests
 */
export function subscribeToResourceRequests(callback) {
  try {
    const q = query(
      collection(db, RESOURCE_COLLECTION),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const requests = [];
        snapshot.forEach((docSnap) => {
          requests.push({
            id: docSnap.id,
            ...docSnap.data(),
          });
        });
        callback(requests);
      },
      (error) => {
        console.error("Error subscribing to resource_requests:", error);
        // If index or query fails, fall back to simple collection snapshot
        const fallbackUnsub = onSnapshot(
          collection(db, RESOURCE_COLLECTION),
          (fallbackSnap) => {
            const fallbackRequests = [];
            fallbackSnap.forEach((docSnap) => {
              fallbackRequests.push({
                id: docSnap.id,
                ...docSnap.data(),
              });
            });
            fallbackRequests.sort((a, b) => {
              const tA = a.createdAt?.seconds || a.createdAt || 0;
              const tB = b.createdAt?.seconds || b.createdAt || 0;
              return tB - tA;
            });
            callback(fallbackRequests);
          }
        );
        return fallbackUnsub;
      }
    );

    return unsubscribe;
  } catch (err) {
    console.error("Failed to initialize resource listener:", err);
    return () => {};
  }
}

/**
 * Authority: Publish a new Resource Request
 */
export async function createResourceRequest({
  authorityId = "DISASTER_HQ_01",
  type = "goods", // 'goods' | 'services'
  category = "Food & Water",
  title,
  description = "",
  requiredQuantity,
  unit = "units",
  urgency = "HIGH", // 'CRITICAL' | 'HIGH' | 'MEDIUM'
  location = {
    latitude: 28.6139,
    longitude: 77.209,
    address: "Central Relief Hub, Sector 4",
    dropOffInstructions: "Deliver to Gate B - Loading Bay 2",
  },
}) {
  if (!title || !requiredQuantity || Number(requiredQuantity) <= 0) {
    throw new Error("Title and a valid positive required quantity are required.");
  }

  const newDoc = {
    authorityId,
    type: type.toLowerCase() === "services" ? "services" : "goods",
    category,
    title: title.trim(),
    description: description.trim(),
    requiredQuantity: Number(requiredQuantity),
    fulfilledQuantity: 0,
    unit: unit.trim() || "units",
    urgency: ["CRITICAL", "HIGH", "MEDIUM"].includes(urgency) ? urgency : "HIGH",
    location: {
      latitude: Number(location.latitude) || 28.6139,
      longitude: Number(location.longitude) || 77.209,
      address: location.address || "Relief Center",
      dropOffInstructions: location.dropOffInstructions || "Report to reception coordinator.",
    },
    status: "OPEN", // 'OPEN' | 'PARTIALLY_FULFILLED' | 'CLOSED'
    commitments: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, RESOURCE_COLLECTION), newDoc);
  return docRef.id;
}

/**
 * Volunteer: Atomic Transaction to Pledge Support
 * Prevents over-fulfillment and race conditions.
 */
export async function pledgeResourceTransaction({
  requestId,
  volunteerId = null,
  volunteerName,
  volunteerContact = "",
  quantityCommitted,
  notes = "",
}) {
  if (!requestId) throw new Error("Request ID is missing.");
  const commitQty = Number(quantityCommitted);
  if (isNaN(commitQty) || commitQty <= 0) {
    throw new Error("Pledged quantity must be a positive number.");
  }
  if (!volunteerName || !volunteerName.trim()) {
    throw new Error("Volunteer name is required.");
  }

  const vId = volunteerId || `VOL-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
  const qrToken = generateClaimToken("CLAIM");
  const docRef = doc(db, RESOURCE_COLLECTION, requestId);

  return await runTransaction(db, async (transaction) => {
    const docSnap = await transaction.get(docRef);

    if (!docSnap.exists()) {
      throw new Error("This resource request no longer exists.");
    }

    const data = docSnap.data();

    if (data.status === "CLOSED") {
      throw new Error("This request is already fully fulfilled or closed.");
    }

    const currentFulfilled = Number(data.fulfilledQuantity) || 0;
    const required = Number(data.requiredQuantity) || 0;
    const remaining = Math.max(0, required - currentFulfilled);

    if (commitQty > remaining) {
      throw new Error(
        `Pledge exceeds remaining requirement! Only ${remaining} ${data.unit || "units"} still needed.`
      );
    }

    const newFulfilled = currentFulfilled + commitQty;
    const newStatus = newFulfilled >= required ? "CLOSED" : "PARTIALLY_FULFILLED";

    const newCommitment = {
      commitmentId: `CMT-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      volunteerId: vId,
      volunteerName: volunteerName.trim(),
      volunteerContact: volunteerContact.trim(),
      quantityCommitted: commitQty,
      timestamp: new Date().toISOString(),
      status: "PLEDGED", // 'PLEDGED' | 'VERIFIED_DELIVERED' | 'CANCELLED'
      qrToken,
      notes: notes.trim(),
    };

    const existingCommitments = Array.isArray(data.commitments) ? data.commitments : [];
    const updatedCommitments = [newCommitment, ...existingCommitments];

    transaction.update(docRef, {
      fulfilledQuantity: newFulfilled,
      status: newStatus,
      commitments: updatedCommitments,
      updatedAt: serverTimestamp(),
    });

    return {
      success: true,
      commitment: newCommitment,
      newFulfilled,
      remaining: Math.max(0, required - newFulfilled),
      requestTitle: data.title,
      unit: data.unit,
      location: data.location,
    };
  });
}

/**
 * Authority: Verify volunteer drop-off / completion or cancel commitment
 */
export async function updateCommitmentStatus({
  requestId,
  commitmentId,
  newStatus, // 'VERIFIED_DELIVERED' | 'CANCELLED' | 'PLEDGED'
  authorityNotes = "",
}) {
  const docRef = doc(db, RESOURCE_COLLECTION, requestId);

  return await runTransaction(db, async (transaction) => {
    const docSnap = await transaction.get(docRef);
    if (!docSnap.exists()) {
      throw new Error("Resource request not found.");
    }

    const data = docSnap.data();
    const commitments = Array.isArray(data.commitments) ? [...data.commitments] : [];
    const idx = commitments.findIndex((c) => c.commitmentId === commitmentId);

    if (idx === -1) {
      throw new Error("Commitment record not found.");
    }

    const oldCommitment = commitments[idx];
    const prevStatus = oldCommitment.status;
    const qty = Number(oldCommitment.quantityCommitted) || 0;

    let fulfilledDelta = 0;

    // If cancelling an active pledge, decrease fulfilled quantity
    if (newStatus === "CANCELLED" && prevStatus !== "CANCELLED") {
      fulfilledDelta = -qty;
    } else if (prevStatus === "CANCELLED" && newStatus !== "CANCELLED") {
      fulfilledDelta = +qty;
    }

    const currentFulfilled = Number(data.fulfilledQuantity) || 0;
    const newFulfilled = Math.max(0, currentFulfilled + fulfilledDelta);
    const required = Number(data.requiredQuantity) || 0;

    let newDocStatus = data.status;
    if (newFulfilled >= required) {
      newDocStatus = "CLOSED";
    } else if (newFulfilled > 0) {
      newDocStatus = "PARTIALLY_FULFILLED";
    } else {
      newDocStatus = "OPEN";
    }

    commitments[idx] = {
      ...oldCommitment,
      status: newStatus,
      authorityNotes,
      verifiedAt: newStatus === "VERIFIED_DELIVERED" ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    };

    transaction.update(docRef, {
      commitments,
      fulfilledQuantity: newFulfilled,
      status: newDocStatus,
      updatedAt: serverTimestamp(),
    });

    return { success: true };
  });
}

/**
 * Authority: Update overall status of request (e.g. Manually Close / Reopen)
 */
export async function updateRequestStatus(requestId, newStatus) {
  const docRef = doc(db, RESOURCE_COLLECTION, requestId);
  await updateDoc(docRef, {
    status: newStatus,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Authority: Delete request
 */
export async function deleteResourceRequest(requestId) {
  const docRef = doc(db, RESOURCE_COLLECTION, requestId);
  await deleteDoc(docRef);
}

/**
 * Seed realistic initial disaster resource requests if collection is currently empty
 */
export async function seedInitialResourceRequestsIfEmpty() {
  try {
    const snap = await getDocs(collection(db, RESOURCE_COLLECTION));
    if (!snap.empty) {
      return { seeded: false, count: snap.size };
    }

    const mockSeed = [
      {
        authorityId: "NDRF_DELHI_COMMAND",
        type: "goods",
        category: "Food & Water",
        title: "Clean Drinking Water Bottles (1L Packs)",
        description: "Severe clean water shortage in flood relief camp. Standard bottled drinking water required immediately.",
        requiredQuantity: 1000,
        fulfilledQuantity: 420,
        unit: "packs",
        urgency: "CRITICAL",
        location: {
          latitude: 28.625,
          longitude: 77.215,
          address: "Govt Relief Camp 3, Kashmiri Gate, New Delhi",
          dropOffInstructions: "Enter through Gate 2, unstack at Logistics Storage Tent A.",
        },
        status: "PARTIALLY_FULFILLED",
        commitments: [
          {
            commitmentId: "CMT-SEED-01",
            volunteerId: "VOL-RAJESH-98",
            volunteerName: "Rajesh Sharma (Rotary Club)",
            volunteerContact: "+91 98112 34567",
            quantityCommitted: 300,
            timestamp: new Date(Date.now() - 3600000 * 5).toISOString(),
            status: "VERIFIED_DELIVERED",
            qrToken: "CLAIM-8F3K-92A1",
            notes: "Delivered via 2 mini-trucks. Verified at hub.",
          },
          {
            commitmentId: "CMT-SEED-02",
            volunteerId: "VOL-PRIYA-44",
            volunteerName: "Priya Menon",
            volunteerContact: "+91 98450 11223",
            quantityCommitted: 120,
            timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
            status: "PLEDGED",
            qrToken: "CLAIM-1P9X-77Z4",
            notes: "Dispatching from Noida warehouse, ETA 45 mins.",
          },
        ],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      {
        authorityId: "AIIMS_DISASTER_CELL",
        type: "services",
        category: "Medical Supplies",
        title: "Pediatricians & Emergency Nurses",
        description: "Need licensed medical volunteers for mobile triage camp treating hypothermia and viral infections in displaced families.",
        requiredQuantity: 12,
        fulfilledQuantity: 5,
        unit: "volunteers",
        urgency: "CRITICAL",
        location: {
          latitude: 28.5672,
          longitude: 77.21,
          address: "Field Hospital Unit 4, AIIMS Trauma Annex",
          dropOffInstructions: "Report to Dr. Verma, Emergency Room In-Charge at Triage Desk.",
        },
        status: "PARTIALLY_FULFILLED",
        commitments: [
          {
            commitmentId: "CMT-SEED-03",
            volunteerId: "VOL-DR-KUMAR",
            volunteerName: "Dr. Arvind Kumar (MD Pediatrics)",
            volunteerContact: "+91 99100 88776",
            quantityCommitted: 2,
            timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
            status: "VERIFIED_DELIVERED",
            qrToken: "CLAIM-MED-4481",
            notes: "Reporting with 1 resident doctor for night shift.",
          },
          {
            commitmentId: "CMT-SEED-04",
            volunteerId: "VOL-NURSE-ANITA",
            volunteerName: "Anita Singh & Care Team",
            volunteerContact: "+91 97110 55443",
            quantityCommitted: 3,
            timestamp: new Date(Date.now() - 3600000 * 1).toISOString(),
            status: "PLEDGED",
            qrToken: "CLAIM-MED-9902",
            notes: "Trained in emergency triage and IV administration.",
          },
        ],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      {
        authorityId: "DISASTER_HQ_LOGISTICS",
        type: "goods",
        category: "Shelter & Blankets",
        title: "Heavy-Duty Tarpaulins & Waterproof Tents",
        description: "Over 200 families need dry temporary shelter materials after cyclone warnings. Standard 12x18ft waterproof sheets.",
        requiredQuantity: 250,
        fulfilledQuantity: 180,
        unit: "units",
        urgency: "HIGH",
        location: {
          latitude: 28.64,
          longitude: 77.24,
          address: "Yamuna Flood Relief Depot, Vikas Marg",
          dropOffInstructions: "Offload on ground pallets near Shelter Zone 3.",
        },
        status: "PARTIALLY_FULFILLED",
        commitments: [
          {
            commitmentId: "CMT-SEED-05",
            volunteerId: "VOL-SEWA-ORG",
            volunteerName: "Sewa Bharti Relief Wing",
            volunteerContact: "+91 98101 22334",
            quantityCommitted: 180,
            timestamp: new Date(Date.now() - 3600000 * 8).toISOString(),
            status: "VERIFIED_DELIVERED",
            qrToken: "CLAIM-SHT-3310",
            notes: "All 180 heavy grade tarps verified and distributed.",
          },
        ],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      {
        authorityId: "CIVIL_DEFENSE_CORPS",
        type: "services",
        category: "Rescue Operations",
        title: "Inflatable Motorboat Operators & Divers",
        description: "Search and evacuation operations in submerged low-lying settlements. Need experienced boat handlers with personal safety gear.",
        requiredQuantity: 8,
        fulfilledQuantity: 2,
        unit: "volunteers",
        urgency: "CRITICAL",
        location: {
          latitude: 28.68,
          longitude: 77.22,
          address: "Wazirabad Boat Launch Station, North Delhi",
          dropOffInstructions: "Briefing at Boat Ramp 1 with Civil Defense Commander.",
        },
        status: "PARTIALLY_FULFILLED",
        commitments: [
          {
            commitmentId: "CMT-SEED-06",
            volunteerId: "VOL-KERALA-RESCUE",
            volunteerName: "Sunil & Team (Fishermen Volunteer Squad)",
            volunteerContact: "+91 94470 12345",
            quantityCommitted: 2,
            timestamp: new Date(Date.now() - 3600000 * 3).toISOString(),
            status: "VERIFIED_DELIVERED",
            qrToken: "CLAIM-RSC-8812",
            notes: "Operating 2 rescue zodiac boats on Sector 2 corridor.",
          },
        ],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      {
        authorityId: "RED_CROSS_DISTRICT",
        type: "goods",
        category: "Hygiene & Sanitation",
        title: "Emergency Sanitation & First-Aid Family Kits",
        description: "Includes antiseptic soap, sanitary pads, chlorine tablets, band-aids, ORS packets and mosquito repellent.",
        requiredQuantity: 500,
        fulfilledQuantity: 0,
        unit: "kits",
        urgency: "HIGH",
        location: {
          latitude: 28.59,
          longitude: 77.19,
          address: "Sarojini Nagar Community Center Distribution Hub",
          dropOffInstructions: "Stack inside Hall 2. Volunteers available to help unload.",
        },
        status: "OPEN",
        commitments: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    ];

    for (const item of mockSeed) {
      await addDoc(collection(db, RESOURCE_COLLECTION), item);
    }

    return { seeded: true, count: mockSeed.length };
  } catch (e) {
    console.warn("Could not seed initial resource requests:", e);
    return { seeded: false, error: e.message };
  }
}
