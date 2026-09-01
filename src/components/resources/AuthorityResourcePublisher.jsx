import React, { useState, useEffect, useMemo } from "react";
import {
  subscribeToResourceRequests,
  createResourceRequest,
  updateCommitmentStatus,
  updateRequestStatus,
  deleteResourceRequest,
  seedInitialResourceRequestsIfEmpty,
  RESOURCE_CATEGORIES,
  RESOURCE_UNITS,
  URGENCY_LEVELS,
} from "../../services/resourceMatchmakingService";
import ResourceClaimQRCode from "./ResourceClaimQRCode";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./ResourceMatchmaking.css";

// Custom Leaflet Icons for map picker
const customAuthorityPin = new L.DivIcon({
  className: "custom-authority-map-pin",
  html: `<div style="background-color: #ef4444; width: 28px; height: 28px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 12px rgba(239, 68, 68, 0.8); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px;">📍</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -28],
});

// Map click listener to select coordinates
function LocationPickerMapEvents({ onLocationSelect }) {
  useMapEvents({
    click(e) {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function AuthorityResourcePublisher({ onNavigateVolunteerPortal }) {
  // State for requests stream
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterUrgency, setFilterUrgency] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // Form State
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  const [formData, setFormData] = useState({
    authorityId: "HQ-INCIDENT-COMMAND",
    type: "goods",
    category: "Food & Water",
    title: "",
    description: "",
    requiredQuantity: "",
    unit: "packs",
    urgency: "CRITICAL",
    address: "Central Disaster Relief Hub, Gate 2",
    dropOffInstructions: "Report to Logistics Desk A upon arrival.",
    latitude: 28.6139,
    longitude: 77.209,
  });

  // Accordion expanded state for commitments view
  const [expandedRequestId, setExpandedRequestId] = useState(null);
  const [actionMessage, setActionMessage] = useState({ id: "", text: "", type: "" });

  // Subscribe to real-time resource requests
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

  // Filter requests
  const filteredRequests = useMemo(() => {
    return requests.filter((req) => {
      // Type filter
      if (filterType !== "all" && req.type !== filterType) return false;
      // Urgency filter
      if (filterUrgency !== "all" && req.urgency !== filterUrgency) return false;
      // Status filter
      if (filterStatus !== "all" && req.status !== filterStatus) return false;
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const titleMatch = (req.title || "").toLowerCase().includes(q);
        const descMatch = (req.description || "").toLowerCase().includes(q);
        const catMatch = (req.category || "").toLowerCase().includes(q);
        const addrMatch = (req.location?.address || "").toLowerCase().includes(q);
        if (!titleMatch && !descMatch && !catMatch && !addrMatch) return false;
      }
      return true;
    });
  }, [requests, filterType, filterUrgency, filterStatus, searchQuery]);

  // Analytics Metrics
  const metrics = useMemo(() => {
    const total = requests.length;
    const openCount = requests.filter((r) => r.status === "OPEN" || r.status === "PARTIALLY_FULFILLED").length;
    const criticalCount = requests.filter((r) => r.urgency === "CRITICAL" && r.status !== "CLOSED").length;
    
    let totalReqQty = 0;
    let totalFulfilledQty = 0;
    let totalCommitmentsCount = 0;

    requests.forEach((r) => {
      totalReqQty += Number(r.requiredQuantity) || 0;
      totalFulfilledQty += Number(r.fulfilledQuantity) || 0;
      if (Array.isArray(r.commitments)) {
        totalCommitmentsCount += r.commitments.length;
      }
    });

    const fulfillmentRate = totalReqQty > 0 ? Math.round((totalFulfilledQty / totalReqQty) * 100) : 0;

    return {
      total,
      openCount,
      criticalCount,
      fulfillmentRate,
      totalCommitmentsCount,
    };
  }, [requests]);

  // Form input handlers
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleLocationSelect = (lat, lng) => {
    setFormData((prev) => ({
      ...prev,
      latitude: parseFloat(lat.toFixed(6)),
      longitude: parseFloat(lng.toFixed(6)),
    }));
  };

  const handleUseCurrentGPS = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setFormData((prev) => ({
            ...prev,
            latitude: parseFloat(pos.coords.latitude.toFixed(6)),
            longitude: parseFloat(pos.coords.longitude.toFixed(6)),
          }));
        },
        (err) => {
          alert("Could not access GPS location. Please pick location on the map.");
        }
      );
    }
  };

  // Submit new resource request
  const handleSubmitNewRequest = async (e) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");

    if (!formData.title.trim()) {
      setFormError("Please enter a title for the resource request.");
      return;
    }
    if (!formData.requiredQuantity || Number(formData.requiredQuantity) <= 0) {
      setFormError("Please provide a valid required quantity greater than 0.");
      return;
    }

    try {
      setIsSubmitting(true);
      await createResourceRequest({
        authorityId: formData.authorityId,
        type: formData.type,
        category: formData.category,
        title: formData.title,
        description: formData.description,
        requiredQuantity: Number(formData.requiredQuantity),
        unit: formData.unit,
        urgency: formData.urgency,
        location: {
          latitude: formData.latitude,
          longitude: formData.longitude,
          address: formData.address,
          dropOffInstructions: formData.dropOffInstructions,
        },
      });

      setFormSuccess("Resource demand published to live network!");
      setFormData({
        authorityId: "HQ-INCIDENT-COMMAND",
        type: "goods",
        category: "Food & Water",
        title: "",
        description: "",
        requiredQuantity: "",
        unit: "packs",
        urgency: "CRITICAL",
        address: "Central Disaster Relief Hub, Gate 2",
        dropOffInstructions: "Report to Logistics Desk A upon arrival.",
        latitude: 28.6139,
        longitude: 77.209,
      });

      setTimeout(() => {
        setIsPublishModalOpen(false);
        setFormSuccess("");
      }, 1200);
    } catch (err) {
      console.error(err);
      setFormError(err.message || "Failed to publish request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Verify drop-off or fulfill commitment
  const handleVerifyCommitment = async (requestId, commitmentId) => {
    try {
      await updateCommitmentStatus({
        requestId,
        commitmentId,
        newStatus: "VERIFIED_DELIVERED",
        authorityNotes: "Verified & received at dispatch center.",
      });
      setActionMessage({ id: commitmentId, text: "Verified & Delivered!", type: "success" });
      setTimeout(() => setActionMessage({ id: "", text: "", type: "" }), 3000);
    } catch (err) {
      alert("Error verifying: " + err.message);
    }
  };

  // Cancel commitment
  const handleCancelCommitment = async (requestId, commitmentId) => {
    if (!window.confirm("Are you sure you want to cancel this commitment? The required quantity will be restored.")) {
      return;
    }
    try {
      await updateCommitmentStatus({
        requestId,
        commitmentId,
        newStatus: "CANCELLED",
        authorityNotes: "Cancelled by authority due to non-fulfillment.",
      });
      setActionMessage({ id: commitmentId, text: "Commitment Cancelled", type: "warn" });
      setTimeout(() => setActionMessage({ id: "", text: "", type: "" }), 3000);
    } catch (err) {
      alert("Error cancelling: " + err.message);
    }
  };

  // Toggle status (Close/Reopen)
  const handleToggleStatus = async (requestId, currentStatus) => {
    try {
      const nextStatus = currentStatus === "CLOSED" ? "OPEN" : "CLOSED";
      await updateRequestStatus(requestId, nextStatus);
    } catch (err) {
      alert("Error updating status: " + err.message);
    }
  };

  // Delete Request
  const handleDelete = async (requestId) => {
    if (window.confirm("Are you sure you want to delete this resource listing permanently?")) {
      try {
        await deleteResourceRequest(requestId);
      } catch (err) {
        alert("Error deleting listing: " + err.message);
      }
    }
  };

  // Quick Seed
  const handleQuickSeed = async () => {
    try {
      const res = await seedInitialResourceRequestsIfEmpty();
      if (res.seeded) {
        alert(`Successfully seeded ${res.count} realistic disaster demands!`);
      } else {
        alert(`Collection already has ${res.count} items.`);
      }
    } catch (err) {
      alert("Seed error: " + err.message);
    }
  };

  return (
    <div className="resq-resource-system min-h-screen bg-slate-950 text-slate-100 font-sans pb-16">
      {/* Header Bar */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 shadow-xl px-4 sm:px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-amber-600 flex items-center justify-center shadow-lg shadow-red-500/20 text-white font-black text-xl">
              ⚡
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                  ResQGrid <span className="text-red-500 font-normal">| Authority Command</span>
                </h1>
                <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-red-950 text-red-400 border border-red-800 animate-pulse">
                  LIVE SYSTEM
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Resource Demands & Volunteer Matchmaking Operations Center
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {onNavigateVolunteerPortal && (
              <button
                onClick={onNavigateVolunteerPortal}
                className="px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center gap-2"
              >
                <span>🤝</span> Switch to Volunteer Hub
              </button>
            )}

            {requests.length === 0 && (
              <button
                onClick={handleQuickSeed}
                className="px-3.5 py-2 text-xs sm:text-sm font-bold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg transition"
              >
                🌱 Seed Mock Disaster Needs
              </button>
            )}

            <button
              onClick={() => setIsPublishModalOpen(true)}
              className="px-4 py-2 text-xs sm:text-sm font-bold rounded-lg bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white shadow-lg shadow-red-600/30 transition flex items-center gap-2"
            >
              <span className="text-base leading-none font-black">+</span> Publish New Request
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* KPI Metrics Strip */}
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80 shadow-md">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Listings</span>
            <div className="text-2xl sm:text-3xl font-black text-white mt-1">{metrics.total}</div>
            <span className="text-[11px] text-slate-500">Resource requirements</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-amber-900/30 shadow-md">
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Active Demands</span>
            <div className="text-2xl sm:text-3xl font-black text-amber-400 mt-1">{metrics.openCount}</div>
            <span className="text-[11px] text-amber-500/80">Pending full fulfillment</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-red-900/30 shadow-md">
            <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">Critical Urgency</span>
            <div className="text-2xl sm:text-3xl font-black text-red-500 mt-1">{metrics.criticalCount}</div>
            <span className="text-[11px] text-red-400/80">Immediate attention</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-emerald-900/30 shadow-md">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Overall Fulfill %</span>
            <div className="text-2xl sm:text-3xl font-black text-emerald-400 mt-1">{metrics.fulfillmentRate}%</div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
              <div
                className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, metrics.fulfillmentRate)}%` }}
              />
            </div>
          </div>

          <div className="col-span-2 sm:col-span-1 p-4 rounded-xl bg-slate-900/80 border border-blue-900/30 shadow-md">
            <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Pledges Logged</span>
            <div className="text-2xl sm:text-3xl font-black text-blue-400 mt-1">{metrics.totalCommitmentsCount}</div>
            <span className="text-[11px] text-blue-400/80">Volunteer commitments</span>
          </div>
        </section>

        {/* Filter & Search Bar */}
        <section className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, category, address or need..."
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
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

          <div className="flex flex-wrap items-center gap-2">
            {/* Type Filter */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-slate-950 border border-slate-800 text-slate-300 focus:outline-none focus:border-red-500"
            >
              <option value="all">📦 All Types</option>
              <option value="goods">📦 Goods / Supplies Only</option>
              <option value="services">🤝 Services / Skills Only</option>
            </select>

            {/* Urgency Filter */}
            <select
              value={filterUrgency}
              onChange={(e) => setFilterUrgency(e.target.value)}
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-slate-950 border border-slate-800 text-slate-300 focus:outline-none focus:border-red-500"
            >
              <option value="all">⚡ All Urgencies</option>
              <option value="CRITICAL">🔴 Critical Only</option>
              <option value="HIGH">🟠 High Only</option>
              <option value="MEDIUM">🔵 Medium Only</option>
            </select>

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-slate-950 border border-slate-800 text-slate-300 focus:outline-none focus:border-red-500"
            >
              <option value="all">📋 All Statuses</option>
              <option value="OPEN">🟢 Open</option>
              <option value="PARTIALLY_FULFILLED">🟡 In Progress</option>
              <option value="CLOSED">⚫ Closed / Met</option>
            </select>
          </div>
        </section>

        {/* Requests Management Grid / List */}
        {loading ? (
          <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-semibold tracking-wide">Syncing real-time Firestore resource feeds...</p>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="py-16 text-center bg-slate-900/40 rounded-2xl border border-dashed border-slate-800 p-8 space-y-4">
            <div className="text-4xl">📦</div>
            <h3 className="text-lg font-bold text-slate-300">No resource requests found</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              No matching listings for current filters. Click "Publish New Request" or "Seed Mock Disaster Needs" to create requests.
            </p>
            <button
              onClick={() => setIsPublishModalOpen(true)}
              className="px-4 py-2 text-sm font-bold rounded-lg bg-red-600 hover:bg-red-500 text-white transition"
            >
              + Publish First Demand
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRequests.map((item) => {
              const fulfilled = Number(item.fulfilledQuantity) || 0;
              const required = Number(item.requiredQuantity) || 0;
              const pct = required > 0 ? Math.min(100, Math.round((fulfilled / required) * 100)) : 0;
              const isClosed = item.status === "CLOSED" || pct >= 100;
              const isGoods = item.type === "goods";
              const commitments = Array.isArray(item.commitments) ? item.commitments : [];
              const isExpanded = expandedRequestId === item.id;

              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border transition-all duration-300 overflow-hidden shadow-lg ${
                    isClosed
                      ? "bg-slate-900/60 border-slate-800 opacity-80"
                      : item.urgency === "CRITICAL"
                      ? "bg-slate-900 border-red-900/40 hover:border-red-600/60 shadow-red-950/20"
                      : "bg-slate-900 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  {/* Card Header & Summary Bar */}
                  <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Left: Info */}
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Type Badge */}
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1 ${
                            isGoods
                              ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                              : "bg-blue-950 text-blue-400 border border-blue-800"
                          }`}
                        >
                          <span>{isGoods ? "📦 Goods" : "🤝 Service"}</span>
                        </span>

                        {/* Category */}
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
                          {item.category || "General"}
                        </span>

                        {/* Urgency Badge */}
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider ${
                            item.urgency === "CRITICAL"
                              ? "bg-red-600 text-white shadow-sm shadow-red-600/50 animate-pulse"
                              : item.urgency === "HIGH"
                              ? "bg-amber-500 text-slate-950 font-bold"
                              : "bg-blue-600 text-white"
                          }`}
                        >
                          ⚡ {item.urgency}
                        </span>

                        {/* Status */}
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            isClosed
                              ? "bg-slate-800 text-slate-400"
                              : item.status === "PARTIALLY_FULFILLED"
                              ? "bg-amber-950 text-amber-300 border border-amber-800"
                              : "bg-emerald-950 text-emerald-300 border border-emerald-800"
                          }`}
                        >
                          {isClosed ? "CLOSED" : item.status === "PARTIALLY_FULFILLED" ? "IN PROGRESS" : "OPEN"}
                        </span>
                      </div>

                      <h3 className="text-lg font-bold text-white tracking-tight">{item.title}</h3>

                      {item.description && (
                        <p className="text-xs sm:text-sm text-slate-400 line-clamp-2 leading-relaxed">
                          {item.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <span>📍</span> {item.location?.address || "Disaster Relief Zone"}
                        </span>
                        {item.location?.dropOffInstructions && (
                          <span className="flex items-center gap-1 text-slate-500">
                            <span>ℹ️</span> {item.location.dropOffInstructions}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Middle: Progress Bar & Quantities */}
                    <div className="w-full lg:w-72 bg-slate-950/80 p-3.5 rounded-xl border border-slate-800/80 flex flex-col justify-center space-y-2">
                      <div className="flex justify-between items-baseline text-xs">
                        <span className="font-semibold text-slate-300">Fulfillment Status</span>
                        <span className="font-mono font-bold text-white">
                          <span className="text-emerald-400">{fulfilled}</span> / {required} {item.unit || "units"}
                        </span>
                      </div>

                      {/* Bar */}
                      <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                        <div
                          className={`h-2.5 rounded-full transition-all duration-500 ${
                            isClosed
                              ? "bg-emerald-500"
                              : pct >= 50
                              ? "bg-amber-400"
                              : "bg-red-500"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      <div className="flex justify-between items-center text-[11px] text-slate-400">
                        <span>{pct}% Completed</span>
                        <span className={pct >= 100 ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                          {Math.max(0, required - fulfilled)} {item.unit} remaining
                        </span>
                      </div>
                    </div>

                    {/* Right: Quick Action Buttons */}
                    <div className="flex items-center gap-2 self-end lg:self-center">
                      <button
                        onClick={() => setExpandedRequestId(isExpanded ? null : item.id)}
                        className={`px-3 py-2 text-xs font-bold rounded-lg border transition flex items-center gap-1.5 ${
                          isExpanded
                            ? "bg-slate-700 text-white border-slate-600"
                            : "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700"
                        }`}
                      >
                        <span>👥</span> Pledges ({commitments.length})
                        <span className="text-[10px] transform transition-transform duration-200">
                          {isExpanded ? "▲" : "▼"}
                        </span>
                      </button>

                      <button
                        onClick={() => handleToggleStatus(item.id, item.status)}
                        className={`px-3 py-2 text-xs font-semibold rounded-lg border transition ${
                          isClosed
                            ? "bg-emerald-950 text-emerald-300 border-emerald-800 hover:bg-emerald-900"
                            : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
                        }`}
                      >
                        {isClosed ? "Reopen" : "Close"}
                      </button>

                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-2 text-xs font-bold rounded-lg bg-slate-800 text-red-400 border border-slate-700 hover:bg-red-950/60 hover:border-red-800 transition"
                        title="Delete Request"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  {/* Accordion: Commitments & Volunteer Verification Table */}
                  {isExpanded && (
                    <div className="border-t border-slate-800 bg-slate-950/90 p-4 sm:p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                          <span>📋</span> Volunteer Support Commitments & Verification Queue ({commitments.length})
                        </h4>
                        <span className="text-xs text-slate-500">
                          Inspect QR tokens and verify drop-offs to confirm inventory
                        </span>
                      </div>

                      {commitments.length === 0 ? (
                        <div className="py-6 text-center text-xs text-slate-500 bg-slate-900/50 rounded-xl border border-slate-800">
                          No volunteer pledges received yet for this listing.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs text-slate-300 border-collapse">
                            <thead>
                              <tr className="border-b border-slate-800 text-[11px] text-slate-400 font-bold uppercase">
                                <th className="py-2.5 px-3">Volunteer</th>
                                <th className="py-2.5 px-3">Contact</th>
                                <th className="py-2.5 px-3">Pledged Qty</th>
                                <th className="py-2.5 px-3">Claim Token / QR</th>
                                <th className="py-2.5 px-3">Status</th>
                                <th className="py-2.5 px-3 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                              {commitments.map((cmt) => {
                                const isDelivered = cmt.status === "VERIFIED_DELIVERED";
                                const isCancelled = cmt.status === "CANCELLED";

                                return (
                                  <tr key={cmt.commitmentId || cmt.timestamp} className="hover:bg-slate-900/40">
                                    <td className="py-3 px-3">
                                      <div className="font-bold text-white">{cmt.volunteerName}</div>
                                      {cmt.notes && (
                                        <div className="text-[11px] text-slate-400 italic mt-0.5">
                                          "{cmt.notes}"
                                        </div>
                                      )}
                                      <div className="text-[10px] text-slate-500 mt-0.5">
                                        {new Date(cmt.timestamp).toLocaleString()}
                                      </div>
                                    </td>
                                    <td className="py-3 px-3 font-mono text-slate-300">
                                      {cmt.volunteerContact || "—"}
                                    </td>
                                    <td className="py-3 px-3 font-mono font-bold text-emerald-400 text-sm">
                                      +{cmt.quantityCommitted} {item.unit || "units"}
                                    </td>
                                    <td className="py-3 px-3">
                                      <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-900 rounded border border-slate-800 font-mono text-[11px] text-amber-300">
                                        <span>🔑</span> {cmt.qrToken || "RESQ-CLAIM"}
                                      </div>
                                    </td>
                                    <td className="py-3 px-3">
                                      <span
                                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                          isDelivered
                                            ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                                            : isCancelled
                                            ? "bg-red-950 text-red-400 border border-red-800"
                                            : "bg-amber-950 text-amber-400 border border-amber-800"
                                        }`}
                                      >
                                        {isDelivered ? "✓ Delivered / Verified" : isCancelled ? "Cancelled" : "Pledged"}
                                      </span>
                                    </td>
                                    <td className="py-3 px-3 text-right">
                                      <div className="flex items-center justify-end gap-2">
                                        {!isDelivered && !isCancelled && (
                                          <button
                                            onClick={() => handleVerifyCommitment(item.id, cmt.commitmentId)}
                                            className="px-2.5 py-1 text-[11px] font-bold rounded bg-emerald-600 hover:bg-emerald-500 text-white transition shadow"
                                          >
                                            ✓ Verify Delivery
                                          </button>
                                        )}

                                        {!isCancelled && (
                                          <button
                                            onClick={() => handleCancelCommitment(item.id, cmt.commitmentId)}
                                            className="px-2 py-1 text-[10px] font-semibold rounded bg-slate-800 hover:bg-red-950 text-slate-400 hover:text-red-400 border border-slate-700 transition"
                                          >
                                            Cancel
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* PUBLISH NEW REQUEST MODAL */}
      {isPublishModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden my-8">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-red-950 to-slate-900 p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
                  <span>📢</span> Publish Critical Resource Need
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Broadcasts in real-time to all connected disaster relief volunteers
                </p>
              </div>
              <button
                onClick={() => setIsPublishModalOpen(false)}
                className="text-slate-400 hover:text-white text-lg p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700"
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmitNewRequest} className="p-5 sm:p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {formError && (
                <div className="p-3 rounded-lg bg-red-950/80 border border-red-800 text-red-300 text-xs font-semibold">
                  ⚠️ {formError}
                </div>
              )}
              {formSuccess && (
                <div className="p-3 rounded-lg bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs font-semibold">
                  ✓ {formSuccess}
                </div>
              )}

              {/* Type Toggle: Goods vs Services */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Request Type *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData((p) => ({ ...p, type: "goods" }))}
                    className={`py-3 px-4 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition ${
                      formData.type === "goods"
                        ? "bg-emerald-950/80 border-emerald-500 text-emerald-400 shadow-md"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <span className="text-lg">📦</span> Goods / Physical Supplies
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData((p) => ({ ...p, type: "services" }))}
                    className={`py-3 px-4 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition ${
                      formData.type === "services"
                        ? "bg-blue-950/80 border-blue-500 text-blue-400 shadow-md"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <span className="text-lg">🤝</span> Services / Volunteer Skills
                  </button>
                </div>
              </div>

              {/* Category & Urgency */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Category *
                  </label>
                  <select
                    name="category"
                    value={formData.category}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-sm focus:outline-none focus:border-red-500"
                  >
                    {RESOURCE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Urgency Level *
                  </label>
                  <select
                    name="urgency"
                    value={formData.urgency}
                    onChange={handleInputChange}
                    className={`w-full px-3 py-2.5 rounded-lg border text-sm font-bold focus:outline-none ${
                      formData.urgency === "CRITICAL"
                        ? "bg-red-950/60 border-red-600 text-red-300"
                        : formData.urgency === "HIGH"
                        ? "bg-amber-950/60 border-amber-600 text-amber-300"
                        : "bg-blue-950/60 border-blue-600 text-blue-300"
                    }`}
                  >
                    <option value="CRITICAL">🔴 CRITICAL (Immediate triage/hours)</option>
                    <option value="HIGH">🟠 HIGH (Same-day fulfillment)</option>
                    <option value="MEDIUM">🔵 MEDIUM (24-48 hour window)</option>
                  </select>
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Item / Service Title *
                </label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  placeholder="e.g. Bottled Drinking Water (1L), Emergency Pediatrician, Heavy Tarps..."
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-sm focus:outline-none focus:border-red-500"
                  required
                />
              </div>

              {/* Quantity & Unit */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Required Quantity *
                  </label>
                  <input
                    type="number"
                    name="requiredQuantity"
                    value={formData.requiredQuantity}
                    onChange={handleInputChange}
                    placeholder="e.g. 500"
                    min="1"
                    className="w-full px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-sm focus:outline-none focus:border-red-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Unit of Measurement *
                  </label>
                  <select
                    name="unit"
                    value={formData.unit}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-sm focus:outline-none focus:border-red-500"
                  >
                    {RESOURCE_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Description & Specifications
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows="2"
                  placeholder="Provide clarity on packaging, certifications, skills required, or condition..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs sm:text-sm focus:outline-none focus:border-red-500"
                />
              </div>

              {/* Location Address & Drop-Off Instructions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Drop-off / Reporting Address *
                  </label>
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    placeholder="e.g. Community Center, Sector 4"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs sm:text-sm focus:outline-none focus:border-red-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Specific Gate / Drop-off Instructions
                  </label>
                  <input
                    type="text"
                    name="dropOffInstructions"
                    value={formData.dropOffInstructions}
                    onChange={handleInputChange}
                    placeholder="e.g. Unload at Bay 2, Ask for Officer Ramesh"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs sm:text-sm focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              {/* Interactive Map Coordinates Picker */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Pin Exact GPS Hub Location (Click map to adjust)
                  </label>
                  <button
                    type="button"
                    onClick={handleUseCurrentGPS}
                    className="text-xs text-red-400 hover:text-red-300 font-semibold flex items-center gap-1"
                  >
                    📍 Use Current Device GPS
                  </button>
                </div>

                <div className="h-44 w-full rounded-xl overflow-hidden border border-slate-800 relative z-10">
                  <MapContainer
                    center={[formData.latitude, formData.longitude]}
                    zoom={12}
                    style={{ height: "100%", width: "100%" }}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <LocationPickerMapEvents onLocationSelect={handleLocationSelect} />
                    <Marker position={[formData.latitude, formData.longitude]} icon={customAuthorityPin}>
                      <Popup>Selected Drop-off Location</Popup>
                    </Marker>
                  </MapContainer>
                </div>

                <div className="flex items-center gap-4 text-xs text-slate-400 font-mono">
                  <span>Lat: {formData.latitude}</span>
                  <span>Lng: {formData.longitude}</span>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsPublishModalOpen(false)}
                  className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs sm:text-sm font-bold rounded-lg bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white shadow-lg shadow-red-600/30 transition flex items-center gap-2"
                >
                  {isSubmitting ? "Publishing..." : "⚡ Broadcast Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
