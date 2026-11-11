import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  Thermometer,
  BellRing,
  AlertOctagon,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Search,
  Filter,
  Eye,
  Volume2,
  VolumeX,
  Clock,
  Droplets,
  Heart,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Flame,
  X,
  FileText,
  Activity,
  Layers,
  Sparkles,
  ChevronRight,
  UserCheck,
  Building2,
  HelpCircle
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';
import { useAuth } from './AuthContext';
import { api } from './api';
import {
  RiskBadge,
  SourceTag,
  WbgtLabelWithTooltip,
  Card,
  Button,
  Modal,
  StatCard,
  Input,
  Select,
  Textarea,
  SeverityBadge,
  RecoveryIndicatorPill,
  playAlertSound
} from './ui';

export function Command() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [workforce, setWorkforce] = useState([]);
  const [zones, setZones] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [interventions, setInterventions] = useState([]);
  const [mapData, setMapData] = useState(null);

  // Sound preference state
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Workforce filter states
  const [selectedSite, setSelectedSite] = useState('');
  const [selectedZone, setSelectedZone] = useState('');
  const [selectedWorkload, setSelectedWorkload] = useState('');
  const [selectedRisk, setSelectedRisk] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals & Drawers
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [workerDrawerOpen, setWorkerDrawerOpen] = useState(false);
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const [falseAlertModalOpen, setFalseAlertModalOpen] = useState(false);
  const [targetAlertId, setTargetAlertId] = useState(null);
  const [falseReason, setFalseReason] = useState('');
  const [startInterventionModalOpen, setStartInterventionModalOpen] = useState(false);
  const [logVitalsModalOpen, setLogVitalsModalOpen] = useState(false);
  const [targetIntervention, setTargetIntervention] = useState(null);
  const [clearInterventionModalOpen, setClearInterventionModalOpen] = useState(false);

  // Intervention forms
  const [vitalsHr, setVitalsHr] = useState(88);
  const [vitalsTemp, setVitalsTemp] = useState(37.2);
  const [vitalsFluids, setVitalsFluids] = useState(250);
  const [vitalsSymptoms, setVitalsSymptoms] = useState([]);
  const [clearanceName, setClearanceName] = useState(user?.full_name || 'Marcus Vance');
  const [clearanceRole, setClearanceRole] = useState(user?.role === 'safety_officer' ? 'Safety Officer' : 'Shift Supervisor');
  const [clearanceNotes, setClearanceNotes] = useState('Worker rested in cooled shelter. Heart rate and temperature normalized to baseline; asymptomatic.');
  const [clearanceVitals, setClearanceVitals] = useState('HR 72 bpm, Core 37.0°C, BP 118/76');
  const [clearanceRestrictions, setClearanceRestrictions] = useState('Light duties for next 2 hours; mandatory 15m water break.');

  // Manual Environmental Entry form
  const [manualZone, setManualZone] = useState('zone-01');
  const [manualTemp, setManualTemp] = useState(33.5);
  const [manualHum, setManualHum] = useState(55.0);
  const [manualWbgt, setManualWbgt] = useState(29.4);
  const [manualInstrument, setManualInstrument] = useState('Calibrated QuestTemp 34 WBGT');

  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'map', 'interventions', 'alerts'

  async function loadAllData() {
    setLoading(true);
    try {
      const [sumRes, wfRes, zRes, altRes, intRes, mapRes] = await Promise.all([
        api.getCommandSummary().catch(() => null),
        api.getWorkforce({
          site_id: selectedSite,
          zone_id: selectedZone,
          workload: selectedWorkload,
          risk_level: selectedRisk,
          search: searchQuery
        }).catch(() => []),
        api.getZones().catch(() => []),
        api.getAlerts().catch(() => []),
        api.getActiveInterventions().catch(() => []),
        api.getMapLayout().catch(() => null)
      ]);

      if (sumRes) setSummary(sumRes);
      setWorkforce(wfRes || []);
      setZones(zRes || []);
      setAlerts(altRes || []);
      setInterventions(intRes || []);
      setMapData(mapRes);

      // Check if critical alert requires sound notification
      const hasEmergency = altRes?.some((a) => a.level === 'Emergency' && a.ack_status === 'Unacknowledged' && !a.is_false_alert);
      if (hasEmergency && soundEnabled) {
        playAlertSound(true);
      }
    } catch (err) {
      console.warn("Failed to load command centre data:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAllData();
    // Auto-escalation check polling every 30 seconds
    const interval = setInterval(async () => {
      try {
        await api.autoEscalateAlerts();
      } catch (e) {
        // quiet
      }
      loadAllData();
    }, 30000);
    return () => clearInterval(interval);
  }, [selectedSite, selectedZone, selectedWorkload, selectedRisk, searchQuery]);

  // Open worker detailed drawer
  const handleOpenWorkerDrawer = async (worker) => {
    try {
      const full = await api.getWorker(worker.id);
      setSelectedWorker(full);
    } catch (e) {
      setSelectedWorker(worker);
    }
    setWorkerDrawerOpen(true);
  };

  // Submit manual calibrated reading
  const handleSubmitManual = async (e) => {
    e.preventDefault();
    try {
      await api.submitManualReading({
        zone_id: manualZone,
        temp_c: parseFloat(manualTemp),
        humidity_pct: parseFloat(manualHum),
        measured_wbgt: parseFloat(manualWbgt),
        instrument_name: manualInstrument
      });
      setManualEntryOpen(false);
      loadAllData();
    } catch (err) {
      alert("Manual entry error: " + err.message);
    }
  };

  // Acknowledge alert
  const handleAcknowledgeAlert = async (alertId) => {
    try {
      await api.acknowledgeAlert(alertId);
      loadAllData();
    } catch (err) {
      alert("Acknowledgment failed: " + err.message);
    }
  };

  // Mark False Alert
  const handleConfirmFalseAlert = async () => {
    if (!falseReason || falseReason.trim().length < 3) {
      alert("Please provide a valid reason for marking false alert.");
      return;
    }
    try {
      await api.markFalseAlert(targetAlertId, falseReason);
      setFalseAlertModalOpen(false);
      setFalseReason('');
      loadAllData();
    } catch (err) {
      alert("Marking false alert failed: " + err.message);
    }
  };

  // Log vitals for intervention
  const handleLogVitals = async () => {
    if (!targetIntervention) return;
    try {
      await api.logInterventionVitals(targetIntervention.id, {
        current_hr: parseInt(vitalsHr),
        current_temp: parseFloat(vitalsTemp),
        fluids_ml: parseInt(vitalsFluids),
        symptoms: vitalsSymptoms
      });
      setLogVitalsModalOpen(false);
      loadAllData();
    } catch (err) {
      alert("Logging vitals failed: " + err.message);
    }
  };

  // Sign and submit clearance for intervention (Rule 8)
  const handleClearIntervention = async () => {
    if (!targetIntervention) return;
    if (!clearanceName || clearanceName.trim().length < 3) {
      alert("Rule 8: Named human signatory is mandatory.");
      return;
    }
    try {
      await api.clearIntervention(targetIntervention.id, {
        cleared_by_name: clearanceName,
        cleared_by_role: clearanceRole,
        assessment_notes: clearanceNotes,
        vital_signs_check: clearanceVitals,
        restrictions: clearanceRestrictions,
        signature_confirmation: true
      });
      setClearInterventionModalOpen(false);
      loadAllData();
    } catch (err) {
      alert("Clearance failed: " + err.message);
    }
  };

  const riskChartData = [
    { name: 'Normal', count: summary?.risk_distribution?.Normal || 0, color: '#10b981' },
    { name: 'Elevated', count: summary?.risk_distribution?.Elevated || 0, color: '#f59e0b' },
    { name: 'High', count: summary?.risk_distribution?.High || 0, color: '#f97316' },
    { name: 'Emergency', count: summary?.risk_distribution?.Emergency || 0, color: '#ef4444' }
  ];

  return (
    <div className="space-y-4">
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-industrial-900 border border-industrial-800 rounded-xl shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-950/80 border border-sky-800 flex items-center justify-center text-sky-400 shadow-inner">
            <LayoutDashboard className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black text-white tracking-wide">COMMAND CENTRE & MULTI-SITE DISPATCH</h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-sky-950 text-sky-300 border border-sky-800">
                LIVE TELEMETRY
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Deterministic OSHA/NIOSH Work-Rest Orchestration & Workforce Monitoring
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* In-App Audible Alert Mute Toggle */}
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
              soundEnabled
                ? 'bg-sky-950/80 border-sky-600/50 text-sky-300'
                : 'bg-industrial-950 border-industrial-800 text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle Audible Alarm Tone on Critical Events"
            aria-label="Toggle Audible Alarm Tone"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-sky-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
            <span>{soundEnabled ? 'Audio Alert: ON' : 'Audio Alert: MUTED'}</span>
          </button>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setManualEntryOpen(true)}
            className="text-xs"
          >
            <FileText className="w-3.5 h-3.5 text-sky-400" />
            <span>Log Calibrated WBGT</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={loadAllData}
            disabled={loading}
            className="text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-sky-400' : ''}`} />
            <span>Sync</span>
          </Button>
        </div>
      </div>

      {/* 1. KPI ROW */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          label="Total Active Workers"
          value={summary?.total_workers || 24}
          unit="workers"
          icon={Users}
          subtext="2 sites • 6 operational zones"
        />
        <StatCard
          label="Max Zone WBGT"
          value={summary?.max_zone_wbgt || 28.5}
          unit="°C"
          icon={Thermometer}
          alertColor={summary?.max_zone_wbgt >= 30.0 ? 'text-orange-400' : 'text-amber-400'}
          subtext="ISO 7243 proxy calculation"
        />
        <StatCard
          label="Elevated / High Strain"
          value={(summary?.risk_distribution?.Elevated || 0) + (summary?.risk_distribution?.High || 0)}
          unit="workers"
          icon={AlertTriangle}
          alertColor="text-amber-300"
          subtext="Action limit screening"
        />
        <StatCard
          label="Possible Emergencies"
          value={summary?.risk_distribution?.Emergency || 0}
          unit="workers"
          icon={Flame}
          alertColor={summary?.risk_distribution?.Emergency > 0 ? 'text-red-400 animate-pulse' : 'text-slate-100'}
          subtext="Rule 4 compliant wording"
        />
        <StatCard
          label="Unacknowledged Alerts"
          value={summary?.active_alerts_count || alerts.filter(a => a.ack_status === 'Unacknowledged').length}
          unit="open"
          icon={BellRing}
          alertColor="text-sky-300"
          subtext="Auto-escalation active"
        />
        <StatCard
          label="Active Interventions"
          value={summary?.active_interventions_count || interventions.length}
          unit="resting"
          icon={Droplets}
          alertColor="text-sky-400"
          subtext="Cooling shelter cycle"
        />
      </div>

      {/* View Mode Tabs: Overview vs SVG Floorplan Map vs Live Interventions */}
      <div className="flex border-b border-industrial-800 text-xs font-semibold gap-2 pb-1">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg transition border-b-2 ${
            activeTab === 'overview'
              ? 'border-sky-500 text-sky-400 font-bold bg-industrial-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Operations & Workforce Grid</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('map')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg transition border-b-2 ${
            activeTab === 'map'
              ? 'border-sky-500 text-sky-400 font-bold bg-industrial-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <MapPin className="w-3.5 h-3.5" />
          <span>SVG Floorplan Heat Map</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('interventions')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg transition border-b-2 ${
            activeTab === 'interventions'
              ? 'border-sky-500 text-sky-400 font-bold bg-industrial-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Droplets className="w-3.5 h-3.5" />
          <span>Active Recovery Shelters ({interventions.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('alerts')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg transition border-b-2 ${
            activeTab === 'alerts'
              ? 'border-sky-500 text-sky-400 font-bold bg-industrial-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <BellRing className="w-3.5 h-3.5" />
          <span>Alert Lifecycle Registry ({alerts.length})</span>
        </button>
      </div>

      {/* 2. OVERVIEW TAB: Environment Panel + Workforce Grid + Risk Distribution */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Environment Panel: 6 Microclimate Zones */}
          <div className="bg-industrial-900 border border-industrial-800 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between border-b border-industrial-800 pb-2">
              <div className="flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-amber-400" />
                <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                  Microclimate Zones Overview (ISO 7243)
                </h2>
              </div>
              <span className="text-[11px] text-slate-400">
                Rule 5 Compliance: Ambient temp & humidity never labeled as measured WBGT without physical instrument.
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {zones.map((z) => (
                <div
                  key={z.id}
                  className="bg-industrial-950 border border-industrial-800/90 rounded-lg p-3 hover:border-industrial-700 transition space-y-2"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-mono text-slate-400 block">{z.site_name}</span>
                      <h3 className="font-semibold text-xs text-white truncate max-w-[200px]">{z.name}</h3>
                    </div>
                    <SourceTag source={z.source_tag || 'Simulated'} />
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1 border-t border-industrial-900">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Dry Bulb / RH</span>
                      <span className="font-mono text-slate-200 font-medium">
                        {z.temp_c}°C / {z.humidity_pct}%
                      </span>
                    </div>
                    <div className="text-right">
                      <WbgtLabelWithTooltip isMeasured={z.is_measured} value={z.wbgt_val} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <RiskBadge level={z.risk_level || 'Normal'} size="sm" />
                    <span className="text-[10px] text-slate-500 font-mono">
                      {z.is_measured ? 'Instrument: Direct' : 'BoM Proxy Formula'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Workforce Grid with Filter Bar & Risk Distribution Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Workforce Grid (3 cols) */}
            <div className="lg:col-span-3 bg-industrial-900 border border-industrial-800 rounded-xl p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-industrial-800 pb-2">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-sky-400" />
                  <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                    Monitored Workforce Fleet ({workforce.length} Workers)
                  </h2>
                </div>
                <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Rule 9 Privacy Active: Unconsented worker coordinates strictly withheld</span>
                </div>
              </div>

              {/* Filter Controls Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search worker name..."
                    className="w-full bg-industrial-950 border border-industrial-700 rounded-md pl-8 pr-2 py-1.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500"
                  />
                </div>

                <select
                  value={selectedSite}
                  onChange={(e) => setSelectedSite(e.target.value)}
                  className="bg-industrial-950 border border-industrial-700 rounded-md px-2 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500"
                >
                  <option value="">All Sites</option>
                  <option value="site-01">Site 1: Delta Casting</option>
                  <option value="site-02">Site 2: North Pier</option>
                </select>

                <select
                  value={selectedWorkload}
                  onChange={(e) => setSelectedWorkload(e.target.value)}
                  className="bg-industrial-950 border border-industrial-700 rounded-md px-2 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500"
                >
                  <option value="">All Workloads</option>
                  <option value="light">Light (&le; 200W)</option>
                  <option value="moderate">Moderate (~300W)</option>
                  <option value="heavy">Heavy (&ge; 415W)</option>
                </select>

                <select
                  value={selectedRisk}
                  onChange={(e) => setSelectedRisk(e.target.value)}
                  className="bg-industrial-950 border border-industrial-700 rounded-md px-2 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500"
                >
                  <option value="">All Risk Tiers</option>
                  <option value="Normal">Normal</option>
                  <option value="Elevated">Elevated</option>
                  <option value="High">High</option>
                  <option value="Emergency">Emergency</option>
                </select>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedSite('');
                    setSelectedZone('');
                    setSelectedWorkload('');
                    setSelectedRisk('');
                    setSearchQuery('');
                  }}
                  className="px-2 py-1.5 bg-industrial-800 hover:bg-industrial-700 text-slate-300 rounded-md transition text-center"
                >
                  Reset Filters
                </button>
              </div>

              {/* Workforce Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300 border-collapse">
                  <thead>
                    <tr className="bg-industrial-950 text-slate-400 border-b border-industrial-800 text-[11px] uppercase tracking-wider">
                      <th className="py-2.5 px-3">Worker ID / Name</th>
                      <th className="py-2.5 px-3">Assigned Zone</th>
                      <th className="py-2.5 px-3">Workload / Acclim</th>
                      <th className="py-2.5 px-3">Heart Rate (&Delta;)</th>
                      <th className="py-2.5 px-3">Risk Tier</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-industrial-800/60 font-mono">
                    {workforce.map((w) => (
                      <tr key={w.id} className="hover:bg-industrial-800/40 transition">
                        <td className="py-2 px-3">
                          <span className="font-bold text-white font-sans block">{w.full_name}</span>
                          <span className="text-[10px] text-slate-500">{w.id}</span>
                        </td>

                        {/* Rule 9 Privacy Check: Location only for consented workers */}
                        <td className="py-2 px-3 font-sans">
                          {w.location_visible ? (
                            <span className="text-slate-300 truncate max-w-[160px] block" title={w.zone_name}>
                              {w.zone_name}
                            </span>
                          ) : (
                            <span className="text-amber-400 text-[11px] italic bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-800/40">
                              Location Withheld (No Consent)
                            </span>
                          )}
                        </td>

                        <td className="py-2 px-3 capitalize font-sans">
                          <span className="text-slate-200">{w.workload}</span>
                          <span className="text-slate-500 text-[10px] block">{w.acclimatization_status}</span>
                        </td>

                        <td className="py-2 px-3">
                          <span className="font-bold text-slate-100">{w.base_heart_rate + (w.heart_rate_delta || 0)} bpm</span>
                          <span className={`text-[10px] block ${w.heart_rate_delta > 20 ? 'text-orange-400 font-bold' : 'text-slate-400'}`}>
                            &Delta; {w.heart_rate_delta > 0 ? `+${w.heart_rate_delta}` : w.heart_rate_delta} bpm
                          </span>
                        </td>

                        <td className="py-2 px-3 font-sans">
                          <RiskBadge level={w.risk_level || 'Normal'} size="sm" />
                        </td>

                        <td className="py-2 px-3 text-right space-x-1 font-sans">
                          <button
                            type="button"
                            onClick={() => handleOpenWorkerDrawer(w)}
                            className="px-2 py-1 rounded bg-industrial-800 hover:bg-sky-900/60 text-slate-300 hover:text-sky-300 border border-industrial-700 transition"
                            title="Open Worker Detail Drawer"
                          >
                            <Eye className="w-3.5 h-3.5 inline mr-1" />
                            <span>Details</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Risk Distribution Chart (1 col) */}
            <div className="bg-industrial-900 border border-industrial-800 rounded-xl p-3.5 space-y-3">
              <div className="border-b border-industrial-800 pb-2">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Risk Tier Distribution
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Active Workforce Heat Strain</p>
              </div>

              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={riskChartData}>
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} />
                    <YAxis stroke="#94a3b8" fontSize={10} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc', fontSize: '11px' }}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {riskChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Distribution Legend List */}
              <div className="space-y-1.5 text-xs pt-1 border-t border-industrial-800/80">
                {riskChartData.map((d) => (
                  <div key={d.name} className="flex items-center justify-between text-slate-300">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                      <span>{d.name} Risk:</span>
                    </div>
                    <span className="font-mono font-bold text-white">{d.count} workers</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. SVG FLOORPLAN HEAT MAP TAB */}
      {activeTab === 'map' && (
        <div className="bg-industrial-900 border border-industrial-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-industrial-800 pb-2.5">
            <div>
              <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <MapPin className="w-4 h-4 text-sky-400" />
                <span>Facility Floorplan SVG Heat Risk Map</span>
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Site 1 (Delta Casting & Smelting) & Site 2 (North Pier Logistics Yard)
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-amber-400 font-semibold bg-amber-950/60 px-2 py-1 rounded border border-amber-800/50">
                Privacy Enforced: {mapData?.withheld_worker_count || 0} unconsented workers hidden from map
              </span>
            </div>
          </div>

          {/* SVG Map Container */}
          <div className="bg-industrial-950 border border-industrial-800 rounded-xl p-2 overflow-x-auto flex justify-center">
            <svg
              viewBox="0 0 740 430"
              className="w-full max-w-4xl h-auto select-none"
              aria-label="Occupational Facility Heat Risk Map"
            >
              <defs>
                <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1e293b" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="740" height="430" fill="#090d16" />
              <rect width="740" height="430" fill="url(#grid)" />

              {/* Site 1 Outline */}
              <text x="50" y="35" fill="#94a3b8" fontSize="12" fontWeight="bold">
                SITE 1: DELTA CASTING & SMELTING WORKS
              </text>
              {/* Site 2 Outline */}
              <text x="50" y="222" fill="#94a3b8" fontSize="12" fontWeight="bold">
                SITE 2: NORTH PIER RIGGING & LOGISTICS YARD
              </text>

              {/* Render Zone Polygons */}
              {mapData?.zones?.map((z) => {
                const isEmergency = z.risk_level === 'Emergency';
                const isHigh = z.risk_level === 'High';
                const isElevated = z.risk_level === 'Elevated';
                const fillColor = isEmergency ? '#7f1d1d' : isHigh ? '#7c2d12' : isElevated ? '#78350f' : '#064e3b';
                const strokeColor = isEmergency ? '#ef4444' : isHigh ? '#f97316' : isElevated ? '#f59e0b' : '#10b981';

                return (
                  <g key={z.id}>
                    <polygon
                      points={z.svg_points}
                      fill={fillColor}
                      fillOpacity="0.45"
                      stroke={strokeColor}
                      strokeWidth="1.5"
                    />
                    <text
                      x={z.label_pos?.x}
                      y={z.label_pos?.y}
                      fill="#f8fafc"
                      fontSize="11"
                      fontWeight="bold"
                      textAnchor="middle"
                    >
                      {z.name.split(':')[0]}
                    </text>
                    <text
                      x={z.label_pos?.x}
                      y={(z.label_pos?.y || 0) + 15}
                      fill="#94a3b8"
                      fontSize="10"
                      textAnchor="middle"
                    >
                      WBGT (proxy): {z.wbgt_val}°C
                    </text>
                  </g>
                );
              })}

              {/* Designated Cooling Shelters */}
              {mapData?.cooling_shelters?.map((cs) => (
                <g key={cs.id} transform={`translate(${cs.x}, ${cs.y})`}>
                  <rect x="-10" y="-10" width="20" height="20" rx="4" fill="#0284c7" stroke="#38bdf8" strokeWidth="1" />
                  <text x="0" y="4" fill="#ffffff" fontSize="10" fontWeight="bold" textAnchor="middle">S</text>
                  <text x="14" y="4" fill="#38bdf8" fontSize="9" fontWeight="semibold">{cs.name.split('(')[0]}</text>
                </g>
              ))}

              {/* Active Incident Flashing Markers */}
              {mapData?.active_incidents?.map((inc, i) => (
                <g key={inc.id} transform={`translate(${180 + i * 180}, ${150 + (i % 2) * 160})`}>
                  <circle r="12" fill="#dc2626" fillOpacity="0.4" className="animate-ping" />
                  <circle r="7" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
                  <text x="0" y="3" fill="#ffffff" fontSize="9" fontWeight="bold" textAnchor="middle">!</text>
                  <text x="10" y="15" fill="#fca5a5" fontSize="9" fontWeight="bold">INCIDENT ACTIVE</text>
                </g>
              ))}

              {/* Consented Worker Dots */}
              {mapData?.consented_worker_dots?.map((w) => {
                const dotColor = w.risk_level === 'Emergency' ? '#ef4444' : w.risk_level === 'High' ? '#f97316' : w.risk_level === 'Elevated' ? '#f59e0b' : '#10b981';
                return (
                  <g key={w.worker_id} transform={`translate(${w.x}, ${w.y})`} className="cursor-pointer" onClick={() => handleOpenWorkerDrawer({ id: w.worker_id, full_name: w.full_name })}>
                    <circle r="5" fill={dotColor} stroke="#0f172a" strokeWidth="1" />
                    <text x="7" y="3" fill="#cbd5e1" fontSize="9">{w.full_name.split(' ')[0]}</text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 px-2 pt-1 border-t border-industrial-800">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Normal</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Elevated</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> High</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Emergency</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-sky-600 text-white font-bold text-[9px] flex items-center justify-center">S</span> Cooling Shelter</span>
            </div>
            <p className="text-[11px] text-slate-500">Click any worker dot to inspect biometric fingerprint and active exposure history.</p>
          </div>
        </div>
      )}

      {/* 4. ACTIVE RECOVERY INTERVENTIONS TAB */}
      {activeTab === 'interventions' && (
        <div className="bg-industrial-900 border border-industrial-800 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-industrial-800 pb-2">
            <div>
              <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Droplets className="w-4 h-4 text-sky-400" />
                <span>Active Cooling Shelter & Recovery Interventions</span>
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Real-time tracking of rest timers, symptom resolution, baseline heart rate recovery, and clearance signoffs.
              </p>
            </div>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setStartInterventionModalOpen(true)}
            >
              <span>+ Dispatch Worker to Cooling Shelter</span>
            </Button>
          </div>

          {interventions.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs bg-industrial-950 rounded-xl border border-industrial-800">
              No active recovery interventions currently in progress. All workers in regular operational status.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {interventions.map((item) => (
                <div
                  key={item.id}
                  className="bg-industrial-950 border border-industrial-800 rounded-xl p-3.5 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-mono text-slate-500">{item.id}</span>
                      <h3 className="font-bold text-sm text-white">{item.worker_name}</h3>
                      <span className="text-xs text-sky-400 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3" />
                        {item.cooling_shelter_id}
                      </span>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded text-xs font-semibold border ${
                      item.status === 'Indicators Met'
                        ? 'bg-emerald-950 text-emerald-300 border-emerald-600 animate-pulse'
                        : 'bg-sky-950 text-sky-300 border-sky-800'
                    }`}>
                      {item.status}
                    </span>
                  </div>

                  {/* Rest Timer vs Target Duration */}
                  <div className="bg-industrial-900/90 p-2.5 rounded-lg border border-industrial-800 flex items-center justify-between text-xs font-mono">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-sans">Elapsed Rest Time:</span>
                      <span className="text-base font-bold text-sky-300">
                        {item.elapsed_minutes} min
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block font-sans">Target Rest Cycle:</span>
                      <span className="text-slate-300">
                        {item.target_duration_minutes} min min.
                      </span>
                    </div>
                  </div>

                  {/* Vitals Recovery Progress */}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-industrial-900 p-2 rounded border border-industrial-800">
                      <span className="text-[10px] text-slate-400 block">Baseline HR</span>
                      <span className="font-mono text-slate-200 font-bold">{item.base_hr} bpm</span>
                    </div>
                    <div className="bg-industrial-900 p-2 rounded border border-industrial-800">
                      <span className="text-[10px] text-slate-400 block">Current HR</span>
                      <span className="font-mono text-white font-bold">{item.current_hr} bpm</span>
                    </div>
                    <div className="bg-industrial-900 p-2 rounded border border-industrial-800">
                      <span className="text-[10px] text-slate-400 block">Fluid Intake</span>
                      <span className="font-mono text-sky-300 font-bold">{item.fluids_ml} ml</span>
                    </div>
                  </div>

                  {/* Recovery Criteria Pills */}
                  <div className="space-y-1 text-xs">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Recovery Indicators:</span>
                    <div className="flex flex-wrap gap-1.5">
                      <RecoveryIndicatorPill
                        met={item.current_hr <= item.base_hr + 20}
                        label={`HR Delta &le; 20 bpm (${item.current_hr - item.base_hr} bpm)`}
                      />
                      <RecoveryIndicatorPill
                        met={!item.symptoms || item.symptoms.length === 0}
                        label={item.symptoms && item.symptoms.length > 0 ? `${item.symptoms.length} symptoms active` : 'Asymptomatic'}
                      />
                      <RecoveryIndicatorPill
                        met={item.elapsed_minutes >= item.target_duration_minutes}
                        label={`Rest &ge; ${item.target_duration_minutes}m`}
                      />
                    </div>
                  </div>

                  {/* Actions: Log vitals or Sign clearance */}
                  <div className="flex gap-2 pt-1 border-t border-industrial-800">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => {
                        setTargetIntervention(item);
                        setVitalsHr(item.current_hr);
                        setLogVitalsModalOpen(true);
                      }}
                    >
                      <Activity className="w-3.5 h-3.5 text-sky-400" />
                      <span>Log Vitals</span>
                    </Button>

                    <Button
                      type="button"
                      variant={item.indicators_met ? 'primary' : 'outline'}
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => {
                        setTargetIntervention(item);
                        setClearanceName(user?.full_name || 'Marcus Vance');
                        setClearInterventionModalOpen(true);
                      }}
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Sign Clearance</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 5. ALERT LIFECYCLE & ACK TRACKING TAB */}
      {activeTab === 'alerts' && (
        <div className="bg-industrial-900 border border-industrial-800 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-industrial-800 pb-2">
            <div>
              <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <BellRing className="w-4 h-4 text-sky-400" />
                <span>Alert Lifecycle & Auto-Escalation Registry</span>
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                All 11 mandatory alert fields, duplicate suppression merging, auto-escalations, and false-alarm audits.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                await api.autoEscalateAlerts();
                loadAllData();
              }}
            >
              <Sparkles className="w-3.5 h-3.5 text-sky-400" />
              <span>Run Auto-Escalation Engine</span>
            </Button>
          </div>

          <div className="space-y-3">
            {alerts.map((a) => {
              const isUnack = a.ack_status === 'Unacknowledged';
              const isFalse = bool(a.is_false_alert);
              return (
                <div
                  key={a.id}
                  className={`border rounded-xl p-3.5 space-y-2 transition ${
                    a.level === 'Emergency'
                      ? 'bg-red-950/20 border-red-500/60'
                      : a.level === 'High'
                      ? 'bg-orange-950/20 border-orange-500/50'
                      : 'bg-industrial-950 border-industrial-800'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-slate-500">{a.id}</span>
                        <RiskBadge level={a.level} size="sm" />
                        <SeverityBadge severity={a.priority || (a.level === 'Emergency' ? 'Critical' : 'High')} />
                        <span className="text-[11px] font-mono text-slate-400">{a.time?.split('T')[1]?.slice(0, 8)}</span>
                      </div>
                      <h3 className="font-bold text-sm text-white mt-1">
                        {a.worker_name} ({a.worker_id}) • {a.location}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                        isFalse
                          ? 'bg-slate-900 border-slate-700 text-slate-400 line-through'
                          : isUnack
                          ? 'bg-red-950 text-red-300 border-red-500 animate-pulse'
                          : 'bg-emerald-950 text-emerald-300 border-emerald-600'
                      }`}>
                        {a.ack_status}
                      </span>

                      {isUnack && (
                        <>
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            className="text-xs"
                            onClick={() => handleAcknowledgeAlert(a.id)}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Acknowledge</span>
                          </Button>

                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="text-xs"
                            onClick={() => {
                              setTargetAlertId(a.id);
                              setFalseAlertModalOpen(true);
                            }}
                          >
                            <span>Mark False Alarm</span>
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* 11 Mandatory Alert Fields Display */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs pt-1 border-t border-industrial-800/80">
                    <div>
                      <span className="text-slate-400 font-semibold block">Conditions:</span>
                      <p className="text-slate-200">{a.conditions}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold block">Physiological Changes:</span>
                      <p className="text-slate-200">{a.physiological_changes}</p>
                    </div>
                    <div className="md:col-span-2">
                      <span className="text-slate-400 font-semibold block">Reason & Action Required:</span>
                      <p className="text-amber-300">{a.reason} — <strong>{a.action}</strong></p>
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold block">Contributing Factors:</span>
                      <p className="text-slate-400 text-[11px]">{a.contributing_factors}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold block">Escalation Status:</span>
                      <p className="text-sky-300 font-medium text-[11px]">{a.escalation_status}</p>
                    </div>
                  </div>

                  {/* Alert Event History */}
                  {a.events_json && (
                    <div className="p-2 bg-industrial-900/80 rounded border border-industrial-800 text-[10px] text-slate-400 space-y-0.5">
                      <span className="font-semibold text-slate-300 block">Event Trail:</span>
                      {(() => {
                        try {
                          const evts = JSON.parse(a.events_json);
                          return evts.map((e, idx) => (
                            <p key={idx}>&bull; {e.time?.split('T')[1]?.slice(0, 5)}: {e.event} ({e.by})</p>
                          ));
                        } catch (err) {
                          return null;
                        }
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Worker Detailed Drawer Modal */}
      {workerDrawerOpen && selectedWorker && (
        <Modal
          isOpen={workerDrawerOpen}
          onClose={() => setWorkerDrawerOpen(false)}
          title={`Worker Health & Heat Safety Dossier: ${selectedWorker.full_name}`}
        >
          <div className="space-y-3.5 text-xs text-slate-200">
            <div className="flex items-center justify-between p-3 bg-industrial-950 rounded-xl border border-industrial-800">
              <div>
                <span className="font-mono text-slate-500 text-[10px]">{selectedWorker.id}</span>
                <h3 className="font-bold text-white text-sm">{selectedWorker.full_name}</h3>
                <p className="text-slate-400 text-[11px]">
                  {selectedWorker.location_visible ? selectedWorker.zone_name : 'Location Withheld (No Consent)'}
                </p>
              </div>
              <RiskBadge level={selectedWorker.risk_level || 'Normal'} size="md" />
            </div>

            {/* Vitals & Acclimatization Status */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-industrial-950 p-2.5 rounded-lg border border-industrial-800">
                <span className="text-[10px] text-slate-400 block">Workload</span>
                <span className="font-bold text-white capitalize">{selectedWorker.workload}</span>
              </div>
              <div className="bg-industrial-950 p-2.5 rounded-lg border border-industrial-800">
                <span className="text-[10px] text-slate-400 block">Acclimatization</span>
                <span className="font-bold text-white capitalize">{selectedWorker.acclimatization_status}</span>
              </div>
              <div className="bg-industrial-950 p-2.5 rounded-lg border border-industrial-800">
                <span className="text-[10px] text-slate-400 block">Resting HR</span>
                <span className="font-bold font-mono text-sky-300">{selectedWorker.base_heart_rate} bpm</span>
              </div>
            </div>

            {/* Biometric ML Fingerprint */}
            {selectedWorker.fingerprint && (
              <div className="p-3 bg-industrial-950 rounded-xl border border-industrial-800 space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between text-sky-400 font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    ML Personalized Fingerprint
                  </span>
                  <span className="font-mono text-[10px]">{selectedWorker.fingerprint.model_version || '2.1.0'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-slate-300 pt-1">
                  <p>Resting HR Median: <strong>{selectedWorker.fingerprint.resting_hr_median} bpm</strong></p>
                  <p>HR Spread (IQR): <strong>&plusmn;{selectedWorker.fingerprint.resting_hr_spread} bpm</strong></p>
                  <p>Recovery Half-Time: <strong>{selectedWorker.fingerprint.recovery_half_time} min</strong></p>
                  <p>Exposure Tolerance: <strong>{selectedWorker.fingerprint.exposure_tolerance}x baseline</strong></p>
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="primary"
                size="md"
                className="flex-1"
                onClick={() => {
                  setWorkerDrawerOpen(false);
                  setStartInterventionModalOpen(true);
                }}
              >
                <Droplets className="w-4 h-4" />
                <span>Send to Cooling Shelter</span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => setWorkerDrawerOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Manual Reading Modal */}
      <Modal
        isOpen={manualEntryOpen}
        onClose={() => setManualEntryOpen(false)}
        title="RECORD CALIBRATED MANUAL WBGT INSTRUMENT READING"
      >
        <form onSubmit={handleSubmitManual} className="space-y-3 text-xs">
          <p className="text-slate-400 text-[11px]">
            Rule 5 Requirement: Only physical readings from calibrated WBGT meters are tagged as 'measured'.
          </p>
          <Select
            label="Target Zone"
            value={manualZone}
            onChange={(e) => setManualZone(e.target.value)}
            options={zones.map(z => ({ value: z.id, label: `${z.site_name} - ${z.name}` }))}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Dry Bulb Temperature (°C)"
              type="number"
              step="0.1"
              value={manualTemp}
              onChange={(e) => setManualTemp(e.target.value)}
              required
            />
            <Input
              label="Relative Humidity (%)"
              type="number"
              step="0.1"
              value={manualHum}
              onChange={(e) => setManualHum(e.target.value)}
              required
            />
          </div>
          <Input
            label="Measured WBGT Reading (°C)"
            type="number"
            step="0.1"
            value={manualWbgt}
            onChange={(e) => setManualWbgt(e.target.value)}
            required
            hint="Measured via natural wet bulb, dry bulb, and black globe instrument complying with ISO 7243."
          />
          <Input
            label="Instrument Model / Serial #"
            value={manualInstrument}
            onChange={(e) => setManualInstrument(e.target.value)}
            required
          />
          <div className="flex gap-2 pt-2">
            <Button type="submit" variant="primary" size="md" className="flex-1">
              Commit Measured Reading
            </Button>
            <Button type="button" variant="secondary" size="md" onClick={() => setManualEntryOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>

      {/* False Alert Reason Modal */}
      <Modal
        isOpen={falseAlertModalOpen}
        onClose={() => setFalseAlertModalOpen(false)}
        title="MARK ALERT AS FALSE ALARM"
      >
        <div className="space-y-3 text-xs">
          <p className="text-slate-300 leading-relaxed">
            Marking an alert as a false alarm will resolve the active notification and write a formal audit entry under your credential: <strong>{user?.full_name} ({user?.role})</strong>.
          </p>
          <Textarea
            label="Reason for False Alarm Determination"
            value={falseReason}
            onChange={(e) => setFalseReason(e.target.value)}
            placeholder="e.g. Temporary sensor detachment, worker was already in air-conditioned office..."
            required
          />
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="danger" size="md" className="flex-1" onClick={handleConfirmFalseAlert}>
              Confirm False Alarm
            </Button>
            <Button type="button" variant="secondary" size="md" onClick={() => setFalseAlertModalOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Start Intervention Modal */}
      <Modal
        isOpen={startInterventionModalOpen}
        onClose={() => setStartInterventionModalOpen(false)}
        title="DISPATCH WORKER TO COOLING SHELTER"
      >
        <div className="space-y-3 text-xs">
          <p className="text-slate-300">
            Initiate active cooling shelter recovery cycle for <strong>{selectedWorker?.full_name || 'Worker'}</strong>.
          </p>
          <Select
            label="Designated Cooling Station"
            value="SHELTER-01"
            onChange={() => {}}
            options={[
              { value: 'SHELTER-01', label: 'Cooling Shelter 1A (Misting + Chilled Air) — Zone 1A' },
              { value: 'SHELTER-02', label: 'Cooling Shelter 1B (Conditioned Annex) — Zone 1B' },
              { value: 'SHELTER-03', label: 'Cooling Shelter 2A (Hydration Station) — Zone 2A' }
            ]}
          />
          <Select
            label="Initial Cooling Regimen"
            value="cooling_shelter"
            onChange={() => {}}
            options={[
              { value: 'cooling_shelter', label: 'Standard Shaded Misting + Rehydration (20 min)' },
              { value: 'cooling_vest', label: 'Phase-Change Cooling Vest + Rest (30 min)' },
              { value: 'medical_triage', label: 'Medical Observation Triage' }
            ]}
          />
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="primary"
              size="md"
              className="flex-1"
              onClick={async () => {
                await api.startIntervention({
                  worker_id: selectedWorker?.id || 'w-01',
                  target_duration_minutes: 20,
                  type: 'cooling_shelter',
                  cooling_shelter_id: 'SHELTER-01'
                });
                setStartInterventionModalOpen(false);
                loadAllData();
              }}
            >
              Confirm Dispatch
            </Button>
            <Button type="button" variant="secondary" size="md" onClick={() => setStartInterventionModalOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Log Vitals Modal for Intervention */}
      <Modal
        isOpen={logVitalsModalOpen}
        onClose={() => setLogVitalsModalOpen(false)}
        title={`Log Recovery Vitals: ${targetIntervention?.worker_name}`}
      >
        <div className="space-y-3 text-xs">
          <p className="text-slate-400 text-[11px]">
            Record periodic heart rate, temperature, and symptom checks during cooling shelter rest.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Current Heart Rate (bpm)"
              type="number"
              value={vitalsHr}
              onChange={(e) => setVitalsHr(e.target.value)}
              required
            />
            <Input
              label="Core Temp Proxy (°C)"
              type="number"
              step="0.1"
              value={vitalsTemp}
              onChange={(e) => setVitalsTemp(e.target.value)}
              required
            />
          </div>
          <Input
            label="Fluid Logged (+ml)"
            type="number"
            step="50"
            value={vitalsFluids}
            onChange={(e) => setVitalsFluids(e.target.value)}
          />
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="primary" size="md" className="flex-1" onClick={handleLogVitals}>
              Commit Vitals & Reassess
            </Button>
            <Button type="button" variant="secondary" size="md" onClick={() => setLogVitalsModalOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Clear Intervention & Return to Work Modal (Rule 8) */}
      <Modal
        isOpen={clearInterventionModalOpen}
        onClose={() => setClearInterventionModalOpen(false)}
        title={`RETURN-TO-WORK CLEARANCE SIGN-OFF: ${targetIntervention?.worker_name}`}
      >
        <div className="space-y-3 text-xs">
          <div className="p-2.5 bg-amber-950/60 border border-amber-600/40 rounded-lg text-amber-200 text-[11px]">
            <strong>Hard Rule 8:</strong> The system NEVER automatically declares a worker fit to return. A named human supervisor or safety officer must record the evaluation and assume sign-off responsibility.
          </div>
          <Input
            label="Cleared By (Full Name)"
            value={clearanceName}
            onChange={(e) => setClearanceName(e.target.value)}
            required
          />
          <Input
            label="Official Role / Medical Title"
            value={clearanceRole}
            onChange={(e) => setClearanceRole(e.target.value)}
            required
          />
          <Input
            label="Vital Signs Check Record"
            value={clearanceVitals}
            onChange={(e) => setClearanceVitals(e.target.value)}
            required
          />
          <Textarea
            label="Assessment Notes & Observations"
            value={clearanceNotes}
            onChange={(e) => setClearanceNotes(e.target.value)}
            required
          />
          <Input
            label="Duty Restrictions (if any)"
            value={clearanceRestrictions}
            onChange={(e) => setClearanceRestrictions(e.target.value)}
          />
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="primary" size="md" className="flex-1" onClick={handleClearIntervention}>
              Sign Return-to-Work Clearance
            </Button>
            <Button type="button" variant="secondary" size="md" onClick={() => setClearInterventionModalOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function bool(val) {
  return Boolean(val);
}

export default Command;
