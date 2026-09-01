import React, { useState, useEffect, useMemo } from "react";
import {
  subscribeToResourceRequests,
  pledgeResourceTransaction,
  calculateDistance,
  RESOURCE_CATEGORIES,
  URGENCY_LEVELS,
} from "../../services/resourceMatchmakingService";
import ResourceClaimQRCode from "./ResourceClaimQRCode";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./ResourceMatchmaking.css";

// Helper Leaflet icon generator for Goods (Green) & Services (Blue)
function createMapMarkerIcon(type, urgency) {
  const isGoods = type === "goods";
  const isCritical = urgency === "CRITICAL";
  const bgColor = isCritical ? "#ef4444" : isGoods ? "#10b981" : "#3b82f6";
  const iconEmoji = isGoods ? "📦" : "🤝";
  const pulseClass = isCritical ? "animate-pulse" : "";

  return new L.DivIcon({
    className: "custom-volunteer-map-pin",
    html: `
      <div style="
        background-color: ${bgColor};
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: 2.5px solid white;
        box-shadow: 0 0 ${isCritical ? "16px rgba(239, 68, 68, 0.9)" : "8px rgba(0,0,0,0.4)"};
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;
      " class="${pulseClass}">
        ${iconEmoji}
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
}

// User current location marker
const userLocationIcon = new L.DivIcon({
  className: "custom-user-location-pin",
  html: `
    <div style="
      background-color: #38bdf8;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 0 12px #38bdf8;
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <div style="width: 6px; height: 6px; background-color: white; border-radius: 50%;"></div>
    </div>
  `,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

// Center map smoothly when location changes
function MapRecenter({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] && center[1]) {
      map.setView(center, map.getZoom());
    }
  }, [center, map]);
  return null;
}

export default function VolunteerResourcePortal({ onNavigateAuthorityPortal }) {
  // Requests Stream
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  // User Geolocation (Defaults to central disaster response coordinates, updates from GPS)
  const [userLocation, setUserLocation] = useState({
    latitude: 28.6139,
    longitude: 77.209,
    isGPSActive: false,
    addressName: "New Delhi Response Sector",
  });

  // Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all"); // 'all' | 'goods' | 'services'
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedUrgency, setSelectedUrgency] = useState("all"); // 'all' | 'CRITICAL' | 'HIGH' | 'MEDIUM'
  const [maxDistanceKm, setMaxDistanceKm] = useState(50); // slider km
  const [sortBy, setSortBy] = useState("urgency"); // 'urgency' | 'distance' | 'progress'

  // Map view toggle on mobile
  const [showMapView, setShowMapView] = useState(true);

  // Pledge Modal State
  const [pledgeTargetItem, setPledgeTargetItem] = useState(null);
  const [pledgeQuantity, setPledgeQuantity] = useState(1);
  const [volunteerName, setVolunteerName] = useState(localStorage.getItem("resq_vol_name") || "");
  const [volunteerPhone, setVolunteerPhone] = useState(localStorage.getItem("resq_vol_phone") || "");
  const [volunteerNotes, setVolunteerNotes] = useState("");
  const [isSubmittingPledge, setIsSubmittingPledge] = useState(false);
  const [pledgeError, setPledgeError] = useState("");

  // Claim Receipt Modal State (after successful transaction)
  const [receiptData, setReceiptData] = useState(null);

  // Volunteer's Local Saved Pledges Drawer
  const [myPledges, setMyPledges] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("resq_my_pledges") || "[]");
    } catch {
      return [];
    }
  });
  const [isMyPledgesDrawerOpen, setIsMyPledgesDrawerOpen] = useState(false);

  // Real-time Firestore subscription
  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeToResourceRequests((data) => {
      setRequests(data);
      setLoading(false);
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  // Detect GPS on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            isGPSActive: true,
            addressName: "Current GPS Location",
          });
        },
        () => {
          console.log("Using default disaster response center coordinates");
        }
      );
    }
  }, []);

  // Filter & Sort Logic
  const filteredRequests = useMemo(() => {
    const list = requests
      .filter((req) => req.status !== "CLOSED") // Only active needs
      .map((req) => {
        const dist = calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          req.location?.latitude,
          req.location?.longitude
        );
        return { ...req, distanceKm: dist };
      })
      .filter((req) => {
        // Type filter
        if (selectedType !== "all" && req.type !== selectedType) return false;
        // Category filter
        if (selectedCategory !== "all" && req.category !== selectedCategory) return false;
        // Urgency filter
        if (selectedUrgency !== "all" && req.urgency !== selectedUrgency) return false;
        // Max distance filter
        if (maxDistanceKm < 50 && req.distanceKm !== null && req.distanceKm > maxDistanceKm) return false;
        // Search text
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchTitle = (req.title || "").toLowerCase().includes(q);
          const matchDesc = (req.description || "").toLowerCase().includes(q);
          const matchCat = (req.category || "").toLowerCase().includes(q);
          const matchAddr = (req.location?.address || "").toLowerCase().includes(q);
          if (!matchTitle && !matchDesc && !matchCat && !matchAddr) return false;
        }
        return true;
      });

    // Sorting
    list.sort((a, b) => {
      if (sortBy === "urgency") {
        const order = { CRITICAL: 1, HIGH: 2, MEDIUM: 3 };
        return (order[a.urgency] || 4) - (order[b.urgency] || 4);
      }
      if (sortBy === "distance") {
        return (a.distanceKm || 9999) - (b.distanceKm || 9999);
      }
      if (sortBy === "progress") {
        const pctA = (a.fulfilledQuantity || 0) / (a.requiredQuantity || 1);
        const pctB = (b.fulfilledQuantity || 0) / (b.requiredQuantity || 1);
        return pctA - pctB; // Lowest progress first
      }
      return 0;
    });

    return list;
  }, [requests, userLocation, selectedType, selectedCategory, selectedUrgency, maxDistanceKm, searchQuery, sortBy]);

  // Open Pledge Modal
  const handleOpenPledge = (item) => {
    const remaining = Math.max(1, (item.requiredQuantity || 0) - (item.fulfilledQuantity || 0));
    setPledgeTargetItem(item);
    setPledgeQuantity(Math.min(10, remaining));
    setPledgeError("");
  };

  // Execute Atomic Pledge Transaction
  const handlePledgeSubmit = async (e) => {
    e.preventDefault();
    setPledgeError("");

    if (!volunteerName.trim()) {
      setPledgeError("Please provide your name or organization name.");
      return;
    }
    if (!volunteerPhone.trim()) {
      setPledgeError("Please provide your contact number for drop-off coordination.");
      return;
    }

    const qty = Number(pledgeQuantity);
    const remaining = (pledgeTargetItem.requiredQuantity || 0) - (pledgeTargetItem.fulfilledQuantity || 0);

    if (isNaN(qty) || qty <= 0) {
      setPledgeError("Please enter a valid quantity greater than 0.");
      return;
    }
    if (qty > remaining) {
      setPledgeError(`Cannot pledge more than remaining need (${remaining} ${pledgeTargetItem.unit}).`);
      return;
    }

    try {
      setIsSubmittingPledge(true);

      // Save to localStorage for convenience
      localStorage.setItem("resq_vol_name", volunteerName.trim());
      localStorage.setItem("resq_vol_phone", volunteerPhone.trim());

      const res = await pledgeResourceTransaction({
        requestId: pledgeTargetItem.id,
        volunteerName: volunteerName.trim(),
        volunteerContact: volunteerPhone.trim(),
        quantityCommitted: qty,
        notes: volunteerNotes.trim(),
      });

      // Append to volunteer's local storage pledge records
      const savedReceipt = {
        commitmentId: res.commitment.commitmentId,
        requestId: pledgeTargetItem.id,
        requestTitle: pledgeTargetItem.title,
        type: pledgeTargetItem.type,
        category: pledgeTargetItem.category,
        quantityCommitted: qty,
        unit: pledgeTargetItem.unit,
        qrToken: res.commitment.qrToken,
        timestamp: res.commitment.timestamp,
        location: pledgeTargetItem.location,
        status: "PLEDGED",
      };

      const updatedPledges = [savedReceipt, ...myPledges];
      setMyPledges(updatedPledges);
      localStorage.setItem("resq_my_pledges", JSON.stringify(updatedPledges));

      // Close pledge modal and open receipt
      setPledgeTargetItem(null);
      setReceiptData(savedReceipt);
      setVolunteerNotes("");
    } catch (err) {
      console.error(err);
      setPledgeError(err.message || "Failed to commit support.");
    } finally {
      setIsSubmittingPledge(false);
    }
  };

  return (
    <div className="resq-resource-system min-h-screen bg-slate-950 text-slate-100 font-sans pb-20">
      {/* Top Volunteer Navigation Bar */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 shadow-xl px-4 sm:px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-emerald-500/20">
              🤝
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                  ResQGrid <span className="text-emerald-400 font-normal">| Volunteer Hub</span>
                </h1>
                <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                  REAL-TIME MATCHMAKING
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Pledge emergency supplies, logistics, or medical & rescue services
              </p>
            </div>
          </div>

          {/* Quick Actions Header */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setIsMyPledgesDrawerOpen(true)}
              className="px-3.5 py-2 text-xs sm:text-sm font-bold rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 flex items-center gap-2 transition"
            >
              <span>🎟️</span> My Pledges ({myPledges.length})
            </button>

            {onNavigateAuthorityPortal && (
              <button
                onClick={onNavigateAuthorityPortal}
                className="px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition"
              >
                <span>⚡</span> Authority Portal
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-5 space-y-5">
        {/* GPS Location & Summary Banner */}
        <section className="bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950/40 p-4 sm:p-5 rounded-2xl border border-slate-800 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400 text-lg">
              📍
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Your Volunteer Base</span>
                {userLocation.isGPSActive && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/60 text-emerald-300 border border-emerald-700">
                    GPS Active
                  </span>
                )}
              </div>
              <p className="text-sm font-bold text-white mt-0.5">{userLocation.addressName}</p>
              <span className="text-xs text-slate-400 font-mono">
                {userLocation.latitude.toFixed(4)}° N, {userLocation.longitude.toFixed(4)}° E
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div className="text-right hidden sm:block">
              <div className="text-slate-400">Active Disaster Demands</div>
              <div className="text-xl font-black text-emerald-400">{filteredRequests.length} Listings</div>
            </div>
            <button
              onClick={() => setShowMapView(!showMapView)}
              className="px-3.5 py-2 text-xs font-bold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-2 transition"
            >
              <span>{showMapView ? "🗺️ Hide Map" : "🗺️ Show Live Map"}</span>
            </button>
          </div>
        </section>

        {/* Interactive Leaflet Map for Active Hubs */}
        {showMapView && (
          <section className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
            <div className="p-3 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-4">
                <span className="font-bold text-slate-300 flex items-center gap-1.5">
                  <span>🗺️</span> Active Drop-off Hubs & Service Demands
                </span>
                <span className="flex items-center gap-1.5 text-slate-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Goods Hubs
                </span>
                <span className="flex items-center gap-1.5 text-slate-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> Service Points
                </span>
                <span className="flex items-center gap-1.5 text-red-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block animate-pulse" /> Critical
                </span>
              </div>
              <span className="text-slate-500">Click any pin to inspect or pledge support</span>
            </div>

            <div className="h-64 sm:h-80 w-full relative z-10">
              <MapContainer
                center={[userLocation.latitude, userLocation.longitude]}
                zoom={12}
                style={{ height: "100%", width: "100%" }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapRecenter center={[userLocation.latitude, userLocation.longitude]} />

                {/* User Location Marker & Circle */}
                <Marker position={[userLocation.latitude, userLocation.longitude]} icon={userLocationIcon}>
                  <Popup>Your Location</Popup>
                </Marker>
                <Circle
                  center={[userLocation.latitude, userLocation.longitude]}
                  radius={maxDistanceKm < 50 ? maxDistanceKm * 1000 : 15000}
                  pathOptions={{ color: "#38bdf8", fillColor: "#38bdf8", fillOpacity: 0.08 }}
                />

                {/* Demand Markers */}
                {filteredRequests.map((item) => {
                  if (!item.location?.latitude || !item.location?.longitude) return null;
                  const icon = createMapMarkerIcon(item.type, item.urgency);
                  const remaining = (item.requiredQuantity || 0) - (item.fulfilledQuantity || 0);

                  return (
                    <Marker
                      key={item.id}
                      position={[Number(item.location.latitude), Number(item.location.longitude)]}
                      icon={icon}
                    >
                      <Popup>
                        <div className="p-1 space-y-1.5 text-slate-900 font-sans" style={{ minWidth: "180px" }}>
                          <div className="flex items-center gap-1 text-[10px] font-bold uppercase">
                            <span
                              className={`px-1.5 py-0.5 rounded text-white ${
                                item.type === "goods" ? "bg-emerald-600" : "bg-blue-600"
                              }`}
                            >
                              {item.type}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-white ${
                                item.urgency === "CRITICAL" ? "bg-red-600 font-black" : "bg-amber-500"
                              }`}
                            >
                              {item.urgency}
                            </span>
                          </div>

                          <div className="font-bold text-xs">{item.title}</div>
                          <div className="text-[11px] text-slate-600">{item.location?.address}</div>

                          <div className="text-[11px] font-bold text-slate-800">
                            Needed: {remaining} {item.unit}
                          </div>

                          <button
                            onClick={() => handleOpenPledge(item)}
                            className="w-full mt-1 py-1 px-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded transition"
                          >
                            🤝 Pledge Support
                          </button>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
            </div>
          </section>
        )}

        {/* Filter Controls Bar */}
        <section className="p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4 shadow-lg">
          {/* Top Row: Search & Type Toggle */}
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            {/* Search */}
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search food, medicines, rescue boats, blankets, tarps..."
                className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Type Quick Selector Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
              <button
                onClick={() => setSelectedType("all")}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                  selectedType === "all"
                    ? "bg-slate-800 text-white shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                All Needs
              </button>
              <button
                onClick={() => setSelectedType("goods")}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1 ${
                  selectedType === "goods"
                    ? "bg-emerald-950 text-emerald-400 border border-emerald-800 shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>📦</span> Goods
              </button>
              <button
                onClick={() => setSelectedType("services")}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1 ${
                  selectedType === "services"
                    ? "bg-blue-950 text-blue-400 border border-blue-800 shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>🤝</span> Services
              </button>
            </div>
          </div>

          {/* Secondary Row: Category, Urgency, Distance, Sort */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-800/80">
            {/* Category Dropdown */}
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Category</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="all">All Categories</option>
                {RESOURCE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Urgency */}
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Urgency</label>
              <select
                value={selectedUrgency}
                onChange={(e) => setSelectedUrgency(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="all">All Urgency</option>
                <option value="CRITICAL">🔴 Critical Only</option>
                <option value="HIGH">🟠 High Only</option>
                <option value="MEDIUM">🔵 Medium Only</option>
              </select>
            </div>

            {/* Distance Radius */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[11px] font-bold text-slate-400 uppercase">Max Distance</label>
                <span className="text-[11px] font-mono text-emerald-400 font-bold">
                  {maxDistanceKm >= 50 ? "Any Dist" : `< ${maxDistanceKm} km`}
                </span>
              </div>
              <input
                type="range"
                min="5"
                max="50"
                step="5"
                value={maxDistanceKm}
                onChange={(e) => setMaxDistanceKm(Number(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-950 rounded-lg"
              />
            </div>

            {/* Sort By */}
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Sort By</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="urgency">⚡ Highest Urgency</option>
                <option value="distance">📍 Nearest to Me</option>
                <option value="progress">📉 Lowest Fulfilled First</option>
              </select>
            </div>
          </div>
        </section>

        {/* Dynamic Request Cards Grid */}
        {loading ? (
          <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-semibold tracking-wide">Finding real-time disaster demands...</p>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="py-16 text-center bg-slate-900/40 rounded-2xl border border-dashed border-slate-800 p-8 space-y-3">
            <div className="text-4xl">🕊️</div>
            <h3 className="text-lg font-bold text-slate-300">No active resource requests matching filters</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Try adjusting your distance slider, category, or search terms to view nearby disaster needs.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {filteredRequests.map((item) => {
              const fulfilled = Number(item.fulfilledQuantity) || 0;
              const required = Number(item.requiredQuantity) || 0;
              const remaining = Math.max(0, required - fulfilled);
              const pct = required > 0 ? Math.min(100, Math.round((fulfilled / required) * 100)) : 0;
              const isGoods = item.type === "goods";
              const isCritical = item.urgency === "CRITICAL";

              return (
                <div
                  key={item.id}
                  className={`rounded-2xl p-5 border flex flex-col justify-between transition-all duration-300 hover:shadow-2xl ${
                    isCritical
                      ? "bg-slate-900/90 border-red-900/50 hover:border-red-500/80 shadow-red-950/20"
                      : "bg-slate-900/90 border-slate-800 hover:border-emerald-600/50 shadow-slate-950/40"
                  }`}
                >
                  {/* Top Badges */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {/* Type Badge */}
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                            isGoods
                              ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                              : "bg-blue-950 text-blue-400 border border-blue-800"
                          }`}
                        >
                          <span>{isGoods ? "📦 Goods" : "🤝 Service"}</span>
                        </span>

                        {/* Category */}
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                          {item.category}
                        </span>
                      </div>

                      {/* Urgency Badge */}
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          isCritical
                            ? "bg-red-600 text-white shadow-sm shadow-red-600/50 animate-pulse"
                            : item.urgency === "HIGH"
                            ? "bg-amber-500 text-slate-950 font-bold"
                            : "bg-blue-600 text-white"
                        }`}
                      >
                        ⚡ {item.urgency}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="text-base sm:text-lg font-bold text-white leading-snug line-clamp-2">
                      {item.title}
                    </h3>

                    {/* Description */}
                    {item.description && (
                      <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                        {item.description}
                      </p>
                    )}

                    {/* Distance & Location */}
                    <div className="space-y-1 text-xs text-slate-400 pt-1">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1 text-slate-300 font-medium">
                          <span>📍</span> {item.location?.address || "Relief Hub"}
                        </span>
                        {item.distanceKm !== null && (
                          <span className="font-mono font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-900">
                            {item.distanceKm} km away
                          </span>
                        )}
                      </div>

                      {item.location?.dropOffInstructions && (
                        <div className="text-[11px] text-slate-500 italic line-clamp-1">
                          ↳ {item.location.dropOffInstructions}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bottom: Progress Bar & Action */}
                  <div className="mt-5 pt-4 border-t border-slate-800 space-y-3">
                    {/* Live Progress Bar */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-baseline text-xs">
                        <span className="text-slate-400 font-semibold">Progress</span>
                        <span className="font-mono font-bold text-white">
                          <span className="text-emerald-400">{fulfilled}</span> / {required} {item.unit || "units"}
                        </span>
                      </div>

                      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ${
                            pct >= 75
                              ? "bg-emerald-400"
                              : pct >= 30
                              ? "bg-amber-400"
                              : "bg-red-500"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-500">{pct}% Provided</span>
                        <span className="font-bold text-amber-400">
                          {remaining} {item.unit} needed
                        </span>
                      </div>
                    </div>

                    {/* Pledge Button */}
                    <button
                      onClick={() => handleOpenPledge(item)}
                      className={`w-full py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold shadow-lg transition flex items-center justify-center gap-2 ${
                        isCritical
                          ? "bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white shadow-red-600/30"
                          : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-600/30"
                      }`}
                    >
                      <span>🤝</span> Pledge Support / Skills
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* PLEDGE COMMITMENT MODAL */}
      {pledgeTargetItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden my-8">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-emerald-950 to-slate-900 p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
                  DISASTER RELIEF COMMITMENT
                </span>
                <h2 className="text-lg font-black text-white mt-0.5">Pledge Support</h2>
              </div>
              <button
                onClick={() => setPledgeTargetItem(null)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg bg-slate-800"
              >
                ✕
              </button>
            </div>

            {/* Target Item Brief */}
            <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex items-start justify-between gap-3">
              <div>
                <h4 className="font-bold text-white text-sm">{pledgeTargetItem.title}</h4>
                <div className="text-xs text-slate-400 mt-0.5">📍 {pledgeTargetItem.location?.address}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <span className="text-[10px] uppercase font-bold text-slate-500">Remaining</span>
                <div className="text-sm font-black text-amber-400">
                  {(pledgeTargetItem.requiredQuantity || 0) - (pledgeTargetItem.fulfilledQuantity || 0)}{" "}
                  {pledgeTargetItem.unit}
                </div>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handlePledgeSubmit} className="p-5 sm:p-6 space-y-4">
              {pledgeError && (
                <div className="p-3 rounded-lg bg-red-950/80 border border-red-800 text-red-300 text-xs font-semibold">
                  ⚠️ {pledgeError}
                </div>
              )}

              {/* Quantity Selector with slider & quick buttons */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Quantity to Pledge ({pledgeTargetItem.unit}) *
                  </label>
                  <span className="text-xs font-mono font-bold text-emerald-400">
                    {pledgeQuantity} {pledgeTargetItem.unit}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    max={(pledgeTargetItem.requiredQuantity || 0) - (pledgeTargetItem.fulfilledQuantity || 0)}
                    value={pledgeQuantity}
                    onChange={(e) => setPledgeQuantity(Number(e.target.value))}
                    className="w-24 px-3 py-2 text-base font-bold font-mono rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500 text-center"
                    required
                  />
                  <input
                    type="range"
                    min="1"
                    max={(pledgeTargetItem.requiredQuantity || 0) - (pledgeTargetItem.fulfilledQuantity || 0)}
                    value={pledgeQuantity}
                    onChange={(e) => setPledgeQuantity(Number(e.target.value))}
                    className="flex-1 accent-emerald-500 cursor-pointer h-2 bg-slate-950 rounded-lg"
                  />
                </div>

                {/* Quick select full remaining */}
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() =>
                      setPledgeQuantity(
                        Math.max(
                          1,
                          Math.min(
                            5,
                            (pledgeTargetItem.requiredQuantity || 0) - (pledgeTargetItem.fulfilledQuantity || 0)
                          )
                        )
                      )
                    }
                    className="px-2.5 py-1 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
                  >
                    Min Pledge
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPledgeQuantity(
                        (pledgeTargetItem.requiredQuantity || 0) - (pledgeTargetItem.fulfilledQuantity || 0)
                      )
                    }
                    className="px-2.5 py-1 text-[11px] font-bold bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 rounded"
                  >
                    Full Remaining (
                    {(pledgeTargetItem.requiredQuantity || 0) - (pledgeTargetItem.fulfilledQuantity || 0)}{" "}
                    {pledgeTargetItem.unit})
                  </button>
                </div>
              </div>

              {/* Volunteer Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Your Name / Org *
                  </label>
                  <input
                    type="text"
                    value={volunteerName}
                    onChange={(e) => setVolunteerName(e.target.value)}
                    placeholder="e.g. Ramesh Patel"
                    className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Phone / Contact *
                  </label>
                  <input
                    type="tel"
                    value={volunteerPhone}
                    onChange={(e) => setVolunteerPhone(e.target.value)}
                    placeholder="e.g. +91 98765 43210"
                    className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
              </div>

              {/* Notes / Special skills */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Logistics & Transport Notes (Optional)
                </label>
                <textarea
                  rows="2"
                  value={volunteerNotes}
                  onChange={(e) => setVolunteerNotes(e.target.value)}
                  placeholder="e.g. Bringing via 4x4 pickup, ETA 2 hours, Medical certificate valid..."
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Safety notice */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
                <div className="font-bold text-slate-300 flex items-center gap-1">
                  <span>🛡️</span> Real-Time Claim Protection
                </div>
                <p>
                  Pledging locks in your quantity through atomic Firestore transactions so duplicate pledges are
                  prevented. A scannable claim receipt with QR token will be generated.
                </p>
              </div>

              {/* Submit Actions */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPledgeTargetItem(null)}
                  className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPledge}
                  className="px-5 py-2 text-xs sm:text-sm font-bold rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-600/30 transition flex items-center gap-2"
                >
                  {isSubmittingPledge ? "Processing..." : "✓ Confirm & Lock Pledge"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CLAIM RECEIPT & QR CODE MODAL (SUCCESS) */}
      {receiptData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm overflow-y-auto">
          <div className="bg-slate-900 border border-emerald-600/40 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-950 to-slate-900 p-5 border-b border-slate-800 text-center relative">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500 text-emerald-400 mx-auto flex items-center justify-center text-2xl mb-2">
                ✓
              </div>
              <h2 className="text-xl font-black text-white">Support Pledge Confirmed!</h2>
              <p className="text-xs text-emerald-400 font-semibold mt-0.5">
                Claim Token Generated & Registered with Incident Command
              </p>
            </div>

            {/* Receipt Body */}
            <div className="p-5 sm:p-6 space-y-4 text-center">
              {/* QR Code */}
              <div className="flex justify-center">
                <ResourceClaimQRCode token={receiptData.qrToken} size={150} />
              </div>

              {/* Details card */}
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-left space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Resource</span>
                  <span className="font-bold text-white">{receiptData.requestTitle}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Committed Amount</span>
                  <span className="font-bold text-emerald-400 font-mono text-sm">
                    {receiptData.quantityCommitted} {receiptData.unit}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Claim Token</span>
                  <span className="font-mono font-bold text-amber-300">{receiptData.qrToken}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Status</span>
                  <span className="font-bold text-emerald-400">ACTIVE PLEDGE</span>
                </div>
                <div className="pt-2 border-t border-slate-800/80">
                  <span className="text-slate-400 block mb-0.5">Drop-off Destination:</span>
                  <span className="font-semibold text-white block">{receiptData.location?.address}</span>
                  {receiptData.location?.dropOffInstructions && (
                    <span className="text-slate-400 text-[11px] block mt-0.5">
                      ↳ {receiptData.location.dropOffInstructions}
                    </span>
                  )}
                </div>
              </div>

              {/* Navigation Action */}
              {receiptData.location?.latitude && receiptData.location?.longitude && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${receiptData.location.latitude},${receiptData.location.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 flex items-center justify-center gap-2 transition"
                >
                  <span>🧭</span> Open Directions in Google Maps
                </a>
              )}

              <button
                onClick={() => setReceiptData(null)}
                className="w-full py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-lg shadow-emerald-600/30"
              >
                Done / View My Pledges
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MY PLEDGES DRAWER */}
      {isMyPledgesDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
            <div className="p-4 sm:p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎟️</span>
                <h3 className="font-black text-white text-base">My Active Pledges</h3>
              </div>
              <button
                onClick={() => setIsMyPledgesDrawerOpen(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {myPledges.length === 0 ? (
                <div className="text-center py-16 text-slate-500 space-y-2">
                  <div className="text-3xl">📭</div>
                  <p className="text-xs">You haven't made any resource pledges yet.</p>
                </div>
              ) : (
                myPledges.map((item, idx) => (
                  <div
                    key={item.commitmentId || idx}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[10px] font-bold uppercase text-emerald-400">{item.category}</span>
                        <h4 className="font-bold text-white text-sm">{item.requestTitle}</h4>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-400 border border-amber-800">
                        {item.status || "PLEDGED"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-300">
                      <span>Pledged:</span>
                      <span className="font-mono font-bold text-emerald-400">
                        {item.quantityCommitted} {item.unit}
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-2 bg-slate-900 rounded border border-slate-800 text-xs">
                      <span className="text-slate-400">Token:</span>
                      <span className="font-mono font-bold text-amber-300">{item.qrToken}</span>
                    </div>

                    <div className="flex justify-center pt-1">
                      <ResourceClaimQRCode token={item.qrToken} size={110} />
                    </div>

                    {item.location?.latitude && (
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${item.location.latitude},${item.location.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-center py-1.5 px-3 text-[11px] font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 rounded border border-slate-700 transition"
                      >
                        🧭 Navigate to Drop-off Hub
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
