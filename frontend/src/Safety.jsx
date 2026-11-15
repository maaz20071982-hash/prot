import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Users,
  Building,
  History,
  Trash2,
  ArrowRightLeft,
  Plus,
  Download,
  Printer,
  Lock,
  AlertOctagon,
  RefreshCw,
  Eye,
  BookOpen,
  Scale,
  Sparkles,
  UserCheck,
  UserX,
  Clock,
  Layers,
  Thermometer,
  Shield,
  KeyRound,
  Copy,
  Settings,
  Server,
  MapPin,
  Search,
  Filter,
  Check
} from 'lucide-react';
import {
  Card,
  RiskBadge,
  SeverityBadge,
  SourceTag,
  StatCard,
  EmptyState,
  Skeleton,
  Toast,
  Drawer,
  ConfirmDialog,
  Button,
  Input,
  Select,
  Textarea,
  Modal
} from './ui';
import { api } from './api';

export function Safety() {
  const [activeTab, setActiveTab] = useState('protocols'); // protocols | policies | workforce | compliance | retention | limitations
  const [loading, setLoading] = useState(false);
  const [protocols, setProtocols] = useState([]);
  const [workforceData, setWorkforceData] = useState({ sites: [], zones: [], users: [] });
  const [auditLogs, setAuditLogs] = useState([]);
  const [loginHistory, setLoginHistory] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [purgeModalOpen, setPurgeModalOpen] = useState(false);
  const [compareResult, setCompareResult] = useState(null);
  const [selectedProtocolA, setSelectedProtocolA] = useState('');
  const [selectedProtocolB, setSelectedProtocolB] = useState('');

  // Form states
  const [newVersion, setNewVersion] = useState('2.4.0');
  const [newTitle, setNewTitle] = useState('Enhanced Radiant Heat Protection Standard');
  const [newDesc, setNewDesc] = useState('Tailored mitigation standard for steel smelters.');
  const [purgeDays, setPurgeDays] = useState(30);
  const [purgeReason, setPurgeReason] = useState('Scheduled automated GDPR & OSHA 30-day telemetry retention cleanup');

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [protos, wf, audits, logins, incs] = await Promise.all([
        api.getProtocols().catch(() => []),
        api.getWorkforceAdmin().catch(() => ({ sites: [], zones: [], users: [] })),
        api.getAuditViewer(50).catch(() => []),
        api.getLoginHistory(30).catch(() => []),
        api.getIncidents().catch(() => [])
      ]);
      setProtocols(protos || []);
      setWorkforceData(wf || { sites: [], zones: [], users: [] });
      setAuditLogs(audits || []);
      setLoginHistory(logins || []);
      setIncidents(incs || []);

      if (protos && protos.length >= 2) {
        setSelectedProtocolA(protos[0].id);
        setSelectedProtocolB(protos[1].id);
      }
    } catch (err) {
      setErrorMessage(err.message || 'Failed to load safety management records.');
    } finally {
      setLoading(false);
    }
  };

  const handleActivateProtocol = async (protoId) => {
    try {
      setLoading(true);
      const res = await api.activateProtocol(protoId);
      setMessage(res.message || 'Protocol activated successfully.');
      await loadAllData();
    } catch (err) {
      setErrorMessage(err.message || 'Failed to activate protocol.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProtocolSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      await api.createProtocol({
        version: newVersion,
        title: newTitle,
        description: newDesc,
        work_rest_json: {
          continuous: { max_wbgt: 27.5 },
          standard_cycle: { min_wbgt: 27.6, max_wbgt: 29.5, rest_minutes_per_hour: 15 },
          moderate_cycle: { min_wbgt: 29.6, max_wbgt: 31.0, rest_minutes_per_hour: 30 },
          heavy_cycle: { min_wbgt: 31.1, max_wbgt: 32.0, rest_minutes_per_hour: 45 },
          stop_work: { min_wbgt: 32.1, rest_minutes_per_hour: 60 }
        },
        acclimatization_json: { day1_pct: 20, day2_pct: 40, day3_pct: 60, day4_pct: 80, day5_pct: 100 },
        ppe_caf_json: { standard_work_clothes: 0.0, cotton_coveralls: 1.0, double_layer: 2.0, vapor_barrier_impermeable: 3.5 },
        escalation_minutes_json: { high_unack_minutes: 5, emergency_unack_minutes: 2 }
      });
      setMessage(`Draft protocol v${newVersion} created successfully.`);
      setCreateModalOpen(false);
      await loadAllData();
    } catch (err) {
      setErrorMessage(err.message || 'Failed to create protocol version.');
    } finally {
      setLoading(false);
    }
  };

  const handleCompareProtocols = async () => {
    if (!selectedProtocolA || !selectedProtocolB) return;
    try {
      setLoading(true);
      const res = await api.compareProtocols(selectedProtocolA, selectedProtocolB);
      setCompareResult(res);
      setCompareModalOpen(true);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to compare protocols.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleUserStatus = async (userId, currentStatus) => {
    const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      await api.toggleUserStatus(userId, nextStatus);
      setMessage(`User account status updated to ${nextStatus}.`);
      await loadAllData();
    } catch (err) {
      setErrorMessage(err.message || 'Failed to update user account status.');
    }
  };

  const handlePurgeSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const res = await api.purgeRetention(purgeDays, purgeReason);
      setMessage(`Retention purge complete: purged ${res.purged_records_total} telemetry records. Audit entry logged.`);
      setPurgeModalOpen(false);
      await loadAllData();
    } catch (err) {
      setErrorMessage(err.message || 'Purge failed.');
    } finally {
      setLoading(false);
    }
  };

  const activeProtocol = protocols.find((p) => p.status === 'active') || protocols[0];

  return (
    <div className="space-y-6">
      {/* 1. Header & Active Standard Indicator */}
      <div className="bg-industrial-900 border border-industrial-800 rounded-xl p-5 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-950 border border-emerald-600/40 flex items-center justify-center text-emerald-400 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white tracking-wide">Safety & Compliance Lead</h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-700">
                  OSHA / ACGIH / ISO 7243
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Standard Operating Procedures, Acclimatization Policies, Incident Investigations, and Audited Compliance Records
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {activeProtocol && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-industrial-950 border border-industrial-700 text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-slate-400">Active Standard:</span>
                <strong className="text-emerald-300 font-mono">{activeProtocol.version}</strong>
              </div>
            )}
            <button
              onClick={loadAllData}
              disabled={loading}
              className="p-2 rounded-lg bg-industrial-950 border border-industrial-700 hover:border-slate-500 text-slate-300 text-xs flex items-center gap-1.5 transition-colors"
              title="Refresh Safety Records"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* Global Feedback Alert */}
        {message && (
          <div className="mt-4 p-3 rounded-lg bg-emerald-950/60 border border-emerald-600/50 text-emerald-200 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{message}</span>
            </div>
            <button onClick={() => setMessage('')} className="text-emerald-400 hover:text-emerald-200 text-xs">Dismiss</button>
          </div>
        )}
        {errorMessage && (
          <div className="mt-4 p-3 rounded-lg bg-red-950/60 border border-red-500/50 text-red-200 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage('')} className="text-red-400 hover:text-red-200 text-xs">Dismiss</button>
          </div>
        )}
      </div>

      {/* 2. Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-industrial-800 pb-2">
        {[
          { id: 'protocols', label: 'Safety Protocols & Versioning', icon: Layers },
          { id: 'policies', label: 'Work-Rest, Acclimatization & PPE', icon: Thermometer },
          { id: 'workforce', label: 'Workforce & Permissions', icon: Users },
          { id: 'compliance', label: 'OSHA 300 / 301 Logs & Queue', icon: FileText },
          { id: 'retention', label: 'Data Retention & Audit Viewer', icon: History },
          { id: 'limitations', label: 'Evaluation & Limitations', icon: Scale },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'bg-industrial-800 text-sky-300 border border-sky-500/50 shadow-sm'
                  : 'bg-industrial-900/60 text-slate-400 hover:text-slate-200 hover:bg-industrial-800/50 border border-transparent'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-sky-400' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ---------------------------------------------------------------------- */}
      {/* TAB 1: SAFETY PROTOCOLS & VERSIONING */}
      {/* ---------------------------------------------------------------------- */}
      {activeTab === 'protocols' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Protocol Version Registry</h2>
              <p className="text-xs text-slate-400">Formal heat stress operating standards, version comparison, and activation pipeline</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCreateModalOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Draft Version</span>
              </button>
              <button
                onClick={handleCompareProtocols}
                className="px-3 py-1.5 rounded-lg bg-industrial-900 hover:bg-industrial-800 border border-industrial-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                <ArrowRightLeft className="w-3.5 h-3.5 text-sky-400" />
                <span>Compare Versions</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {protocols.map((p) => {
              const isActive = p.status === 'active';
              const isDraft = p.status === 'draft';
              return (
                <Card key={p.id} className={`${isActive ? 'border-emerald-600/60 bg-emerald-950/10' : ''}`}>
                  <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                          isActive
                            ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500'
                            : isDraft
                            ? 'bg-amber-950/80 text-amber-300 border-amber-500'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>
                          {p.status}
                        </span>
                        <h3 className="text-sm font-bold text-white">{p.title}</h3>
                        <span className="text-xs font-mono text-sky-300 font-semibold bg-sky-950/50 px-1.5 py-0.5 rounded border border-sky-800">
                          v{p.version}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 max-w-3xl">{p.description}</p>
                      <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-400 pt-1">
                        <span>Created by: <strong className="text-slate-300">{p.created_by}</strong></span>
                        <span>Date: <span className="font-mono">{new Date(p.created_at).toLocaleDateString()}</span></span>
                        {p.activated_at && (
                          <span>Activated: <span className="font-mono text-emerald-400">{new Date(p.activated_at).toLocaleDateString()}</span></span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {!isActive && (
                        <button
                          onClick={() => handleActivateProtocol(p.id)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Activate Standard</span>
                        </button>
                      )}
                      {isActive && (
                        <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold px-3 py-1.5 rounded-lg bg-emerald-950/50 border border-emerald-700">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Active Production Standard</span>
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* TAB 2: WORK-REST, ACCLIMATIZATION & PPE POLICIES */}
      {/* ---------------------------------------------------------------------- */}
      {activeTab === 'policies' && (
        <div className="space-y-6">
          {/* Work-Rest Schedule Matrix */}
          <Card>
            <div className="p-4 border-b border-industrial-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Clock className="w-4 h-4 text-sky-400" />
                  <span>Work-Rest Schedule Policy (ISO 7243 / ACGIH Matrix)</span>
                </h3>
                <p className="text-xs text-slate-400">Mandatory rest periods per hour based on WBGT estimate proxy and metabolic exertion rate</p>
              </div>
              <SourceTag tag="Verified external" />
            </div>
            <div className="p-4 overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-industrial-950 text-slate-400 border-b border-industrial-800">
                  <tr>
                    <th className="p-2.5">WBGT Estimate Proxy</th>
                    <th className="p-2.5">Light Work (&lt;200W)</th>
                    <th className="p-2.5">Moderate Work (200-350W)</th>
                    <th className="p-2.5">Heavy Work (350-500W)</th>
                    <th className="p-2.5">Very Heavy (&gt;500W)</th>
                    <th className="p-2.5">Cooling Requirement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-industrial-800/60 text-slate-300">
                  <tr className="hover:bg-industrial-800/20">
                    <td className="p-2.5 font-mono text-emerald-400 font-bold">&lt; 28.0°C</td>
                    <td className="p-2.5 text-emerald-300">Continuous</td>
                    <td className="p-2.5 text-emerald-300">Continuous</td>
                    <td className="p-2.5 text-emerald-300">Continuous</td>
                    <td className="p-2.5">45m Work / 15m Rest</td>
                    <td className="p-2.5 text-slate-400">Normal hydration</td>
                  </tr>
                  <tr className="hover:bg-industrial-800/20">
                    <td className="p-2.5 font-mono text-amber-400 font-bold">28.0°C - 30.0°C</td>
                    <td className="p-2.5 text-emerald-300">Continuous</td>
                    <td className="p-2.5">45m Work / 15m Rest</td>
                    <td className="p-2.5 text-amber-300 font-semibold">30m Work / 30m Rest</td>
                    <td className="p-2.5 text-orange-400 font-semibold">15m Work / 45m Rest</td>
                    <td className="p-2.5 text-slate-300">Shaded rest break</td>
                  </tr>
                  <tr className="hover:bg-industrial-800/20">
                    <td className="p-2.5 font-mono text-orange-400 font-bold">30.1°C - 31.5°C</td>
                    <td className="p-2.5">45m Work / 15m Rest</td>
                    <td className="p-2.5 text-amber-300 font-semibold">30m Work / 30m Rest</td>
                    <td className="p-2.5 text-orange-400 font-semibold">15m Work / 45m Rest</td>
                    <td className="p-2.5 text-red-400 font-bold">Mandatory Stoppage</td>
                    <td className="p-2.5 text-amber-300">Cooling Shelter 1B (A/C)</td>
                  </tr>
                  <tr className="hover:bg-industrial-800/20 bg-red-950/20">
                    <td className="p-2.5 font-mono text-red-400 font-bold">&gt; 31.5°C</td>
                    <td className="p-2.5 text-orange-400 font-semibold">15m Work / 45m Rest</td>
                    <td className="p-2.5 text-red-400 font-bold">Stop Heavy Tasks</td>
                    <td className="p-2.5 text-red-400 font-bold">Stop Work</td>
                    <td className="p-2.5 text-red-400 font-bold">Stop Work</td>
                    <td className="p-2.5 text-red-300 font-bold">Active cooling & buddy check</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          {/* Acclimatization Schedules & PPE CAF */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* NIOSH 5-Day Acclimatization Ramp */}
            <Card>
              <div className="p-4 border-b border-industrial-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">NIOSH 5-Day Acclimatization Schedule</h3>
                  <p className="text-xs text-slate-400">Progressive metabolic physiological adaptation schedule</p>
                </div>
                <span className="text-[10px] font-mono bg-sky-950 text-sky-300 border border-sky-800 px-2 py-0.5 rounded">NIOSH (2016)</span>
              </div>
              <div className="p-4 space-y-3">
                {[
                  { day: 'Day 1', pct: 20, desc: 'Maximum 20% normal duration in direct heat. 250ml electrolyte water/hr.' },
                  { day: 'Day 2', pct: 40, desc: 'Maximum 40% normal shift duration. Assigned to non-critical auxiliary stations.' },
                  { day: 'Day 3', pct: 60, desc: 'Maximum 60% exposure. Buddy pairing mandatory throughout shift.' },
                  { day: 'Day 4', pct: 80, desc: 'Maximum 80% exposure. Normal work-rest cycles enforced.' },
                  { day: 'Day 5', pct: 100, desc: 'Full shift permitted subject to standard ambient WBGT triggers.' },
                ].map((item) => (
                  <div key={item.day} className="flex items-center gap-3 p-2.5 rounded-lg bg-industrial-950 border border-industrial-800">
                    <div className="w-12 text-center font-bold text-white text-xs">{item.day}</div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-300 font-semibold">{item.pct}% Maximum Exposure</span>
                        <span className="text-slate-400 text-[10px]">{item.desc}</span>
                      </div>
                      <div className="w-full bg-industrial-800 rounded-full h-1.5">
                        <div className="bg-sky-500 h-1.5 rounded-full" style={{ width: `${item.pct}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
                <p className="text-[11px] text-amber-300 bg-amber-950/30 p-2.5 rounded border border-amber-600/30">
                  Workers absent for 14+ consecutive days lose acclimatization and must repeat the 5-day ramp from Day 1.
                </p>
              </div>
            </Card>

            {/* PPE Clothing Adjustment Factors (CAF) */}
            <Card>
              <div className="p-4 border-b border-industrial-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">PPE Clothing Adjustments (CAF)</h3>
                  <p className="text-xs text-slate-400">ISO 9920 / ACGIH thermal resistance penalties added to WBGT</p>
                </div>
                <span className="text-[10px] font-mono bg-sky-950 text-sky-300 border border-sky-800 px-2 py-0.5 rounded">ISO 9920</span>
              </div>
              <div className="p-4 space-y-3">
                {[
                  { name: 'Standard Work Clothes (Long Pants & Shirt)', caf: '+0.0°C', icon: ShieldCheck, color: 'text-emerald-400' },
                  { name: 'Woven Cotton Coveralls (Over undergarments)', caf: '+1.0°C', icon: Shield, color: 'text-sky-400' },
                  { name: 'Double-Layer Woven Clothing (Chemical / FR)', caf: '+2.0°C', icon: AlertTriangle, color: 'text-amber-400' },
                  { name: 'Vapor-Barrier Impermeable Encapsulating Suits', caf: '+3.0°C', icon: AlertOctagon, color: 'text-red-400' },
                ].map((ppe) => {
                  const Icon = ppe.icon;
                  return (
                    <div key={ppe.name} className="flex items-center justify-between p-3 rounded-lg bg-industrial-950 border border-industrial-800">
                      <div className="flex items-center gap-2.5">
                        <Icon className={`w-4 h-4 ${ppe.color}`} />
                        <span className="text-xs text-slate-200 font-medium">{ppe.name}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${ppe.color} bg-industrial-900 border border-industrial-700`}>
                        {ppe.caf} WBGT
                      </span>
                    </div>
                  );
                })}
                <p className="text-[11px] text-slate-400 bg-industrial-950 p-2.5 rounded border border-industrial-800">
                  Rule 3: Clothing adjustment factors are applied directly into <code className="text-sky-300">engine.personal_limit()</code> to determine effective environmental burden before physiological evaluation.
                </p>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* TAB 3: WORKFORCE, SITES & USER PERMISSIONS */}
      {/* ---------------------------------------------------------------------- */}
      {activeTab === 'workforce' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Workforce & Permissions Directory</h2>
              <p className="text-xs text-slate-400">Account status control, role permissions matrix, and organizational layout</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>Total Users: <strong className="text-white">{workforceData.users.length}</strong></span>
              <span>•</span>
              <span>Sites: <strong className="text-white">{workforceData.sites.length}</strong></span>
              <span>•</span>
              <span>Zones: <strong className="text-white">{workforceData.zones.length}</strong></span>
            </div>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-industrial-950 text-slate-400 border-b border-industrial-800">
                  <tr>
                    <th className="p-3">User & Contact</th>
                    <th className="p-3">Role</th>
                    <th className="p-3">Workload / Acclimation</th>
                    <th className="p-3">Consent (Rule 9)</th>
                    <th className="p-3">Account Status</th>
                    <th className="p-3 text-right">Administrative Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-industrial-800/60 text-slate-300">
                  {workforceData.users.map((u) => {
                    const isActive = u.status === 'active';
                    return (
                      <tr key={u.id} className="hover:bg-industrial-800/20">
                        <td className="p-3">
                          <div className="font-semibold text-white">{u.full_name}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{u.username} • {u.email}</div>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            u.role === 'admin'
                              ? 'bg-purple-950 text-purple-300 border border-purple-700'
                              : u.role === 'safety_officer'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                              : u.role === 'supervisor'
                              ? 'bg-sky-950 text-sky-300 border border-sky-700'
                              : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}>
                            {u.role.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="p-3">
                          {u.workload ? (
                            <div>
                              <span className="capitalize text-slate-200">{u.workload}</span>
                              <span className="text-slate-500 mx-1">|</span>
                              <span className="text-[11px] text-slate-400 capitalize">{u.acclimatization_status}</span>
                            </div>
                          ) : (
                            <span className="text-slate-500 italic">Operations Lead</span>
                          )}
                        </td>
                        <td className="p-3">
                          {u.consent_given ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400 text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Consented
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-400 text-[11px]">
                              <Lock className="w-3.5 h-3.5" /> Withheld
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            isActive
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-700'
                              : 'bg-red-950 text-red-400 border border-red-700 font-bold'
                          }`}>
                            {u.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleToggleUserStatus(u.id, u.status)}
                            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                              isActive
                                ? 'bg-red-950/60 hover:bg-red-900 border border-red-600/50 text-red-200'
                                : 'bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-600/50 text-emerald-200'
                            }`}
                          >
                            {isActive ? 'Suspend User' : 'Activate User'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* TAB 4: COMPLIANCE & OSHA 300 / 301 LOGS */}
      {/* ---------------------------------------------------------------------- */}
      {activeTab === 'compliance' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">OSHA 300 / 301 Regulatory Compliance Logs</h2>
              <p className="text-xs text-slate-400">Formal recordkeeping of work-related heat illness cases and corrective action follow-ups</p>
            </div>
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded-lg bg-industrial-900 hover:bg-industrial-800 border border-industrial-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors print:hidden"
            >
              <Printer className="w-3.5 h-3.5 text-sky-400" />
              <span>Print Form 300 Summary</span>
            </button>
          </div>

          <Card>
            <div className="p-4 border-b border-industrial-800 flex items-center justify-between bg-industrial-950/60">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-sky-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">OSHA Form 300: Log of Work-Related Injuries and Illnesses</h3>
                  <p className="text-xs text-slate-400">Occupational Heat Incident Investigation Queue</p>
                </div>
              </div>
              <span className="text-xs font-mono text-slate-400">Year: 2026 | Standard: 1904</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-industrial-950 text-slate-400 border-b border-industrial-800">
                  <tr>
                    <th className="p-3">Case ID</th>
                    <th className="p-3">Employee Name</th>
                    <th className="p-3">Date / Zone</th>
                    <th className="p-3">Severity & Classification</th>
                    <th className="p-3">Environmental Context</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-industrial-800/60 text-slate-300">
                  {incidents.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="p-6 text-center text-slate-500 italic">No recorded OSHA recordable heat events in current cycle.</td>
                    </tr>
                  ) : (
                    incidents.map((inc) => (
                      <tr key={inc.id} className="hover:bg-industrial-800/20">
                        <td className="p-3 font-mono text-sky-300 font-semibold">{inc.id}</td>
                        <td className="p-3 font-semibold text-white">{inc.worker_name}</td>
                        <td className="p-3">
                          <div>{new Date(inc.timestamp).toLocaleDateString()}</div>
                          <div className="text-[11px] text-slate-500 font-mono">{inc.zone_id}</div>
                        </td>
                        <td className="p-3">
                          <SeverityBadge severity={inc.severity} />
                          <div className="text-[11px] text-slate-400 mt-1">{inc.title}</div>
                        </td>
                        <td className="p-3 text-[11px] text-slate-400 max-w-xs truncate">
                          {inc.conditions_summary}
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-industrial-950 border border-industrial-700 text-slate-300">
                            {inc.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* TAB 5: DATA RETENTION CONTROLS & AUDIT VIEWER */}
      {/* ---------------------------------------------------------------------- */}
      {activeTab === 'retention' && (
        <div className="space-y-6">
          {/* Data Retention Controls */}
          <Card>
            <div className="p-4 border-b border-industrial-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-red-400" />
                  <span>Data-Retention Controls & Purge Policy</span>
                </h3>
                <p className="text-xs text-slate-400">Automated retention window policy with audited immutable execution</p>
              </div>
              <button
                onClick={() => setPurgeModalOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-red-950 hover:bg-red-900 border border-red-600/60 text-red-200 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                <span>Execute Purge Now</span>
              </button>
            </div>
            <div className="p-4 text-xs text-slate-300 space-y-2">
              <p>
                THERMOSENSE maintains an automated <strong>30-day rolling window</strong> for raw high-frequency environmental and physiological sensor telemetry. Aggregated shift summaries and regulatory incident records are retained indefinitely for OSHA compliance.
              </p>
              <div className="p-3 rounded-lg bg-industrial-950 border border-industrial-800 text-[11px] text-slate-400 flex items-center gap-3">
                <Lock className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Rule 9 Protection: Every execution of 'Purge Now' records an immutable entry in the system <code className="text-sky-300">audit_log</code> with timestamp, acting administrator, and total deleted records count.
                </span>
              </div>
            </div>
          </Card>

          {/* Audit Viewer & Login History */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Real-Time Audit Log */}
            <Card>
              <div className="p-4 border-b border-industrial-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <History className="w-4 h-4 text-sky-400" />
                    <span>System Audit Trail (Rule 9)</span>
                  </h3>
                  <p className="text-xs text-slate-400">Sensitive access and administrative actions</p>
                </div>
                <span className="text-[10px] font-mono text-slate-400">{auditLogs.length} events</span>
              </div>
              <div className="max-h-96 overflow-y-auto divide-y divide-industrial-800/60">
                {auditLogs.map((log) => (
                  <div key={log.id} className="p-3 text-xs hover:bg-industrial-800/20">
                    <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
                      <span className="font-mono text-sky-400 font-bold">{log.action}</span>
                      <span className="font-mono">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="text-slate-200 text-xs">{log.details}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      By: <strong className="text-slate-400">{log.username}</strong> ({log.role}) • IP: {log.ip_address}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Login & Access Logs */}
            <Card>
              <div className="p-4 border-b border-industrial-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Lock className="w-4 h-4 text-emerald-400" />
                    <span>Authentication & Access History</span>
                  </h3>
                  <p className="text-xs text-slate-400">Login attempts, IP tracking, and role sessions</p>
                </div>
                <span className="text-[10px] font-mono text-slate-400">{loginHistory.length} logins</span>
              </div>
              <div className="max-h-96 overflow-y-auto divide-y divide-industrial-800/60">
                {loginHistory.map((lh) => (
                  <div key={lh.id} className="p-3 text-xs hover:bg-industrial-800/20 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-white flex items-center gap-2">
                        <span>{lh.username}</span>
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                          lh.success ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' : 'bg-red-950 text-red-300 border border-red-700'
                        }`}>
                          {lh.success ? 'SUCCESS' : 'FAILED'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        IP: {lh.ip_address} • UA: {lh.user_agent.substring(0, 24)}...
                      </div>
                    </div>
                    <div className="text-right text-[11px] text-slate-500 font-mono">
                      {new Date(lh.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* TAB 6: EVALUATION & LIMITATIONS SECTION */}
      {/* ---------------------------------------------------------------------- */}
      {activeTab === 'limitations' && (
        <div className="space-y-5">
          <Card className="border-amber-500/50 bg-amber-950/10">
            <div className="p-5 border-b border-industrial-800 flex items-center gap-3">
              <Scale className="w-6 h-6 text-amber-400 shrink-0" />
              <div>
                <h2 className="text-base font-bold text-white">System Evaluation and Operational Limitations</h2>
                <p className="text-xs text-amber-200/80">Ethical AI boundary constraints, hardware-agnostic proxy approximations, and safety guarantees</p>
              </div>
            </div>
            <div className="p-5 space-y-4 text-xs text-slate-300 leading-relaxed">
              <div className="p-4 rounded-lg bg-industrial-950 border border-industrial-800">
                <h3 className="font-bold text-amber-300 text-sm mb-1">1. Non-Medical Device Designation (Rule 4)</h3>
                <p className="text-slate-400">
                  THERMOSENSE is an occupational safety decision-support tool, not a clinical diagnostic system. It does not measure internal blood biomarkers, direct core temperature via ingestible telemetric pills, or medical vital signs. Risk indicators must never be interpreted as heat stroke or clinical heat exhaustion diagnoses. In all acute thermal distress cases, immediate medical attention must be sought via certified first-responders.
                </p>
              </div>

              <div className="p-4 rounded-lg bg-industrial-950 border border-industrial-800">
                <h3 className="font-bold text-amber-300 text-sm mb-1">2. Hardware-Free WBGT Proxy Approximations (Rule 5)</h3>
                <p className="text-slate-400">
                  Unless calibrated physical WBGT instruments are explicitly entered via the manual ingest terminal, all environmental thresholds are derived from the Australian Bureau of Meteorology (BoM) vapor pressure approximation and diurnal solar radiation estimations. Microclimate anomalies, radiant furnace reflection, and local airflow obstructions can cause physical microclimates to deviate from regional ambient proxy calculations.
                </p>
              </div>

              <div className="p-4 rounded-lg bg-industrial-950 border border-industrial-800">
                <h3 className="font-bold text-amber-300 text-sm mb-1">3. Human Sign-Off Invariant (Rule 8)</h3>
                <p className="text-slate-400">
                  Automated return-to-work clearance is strictly prohibited by platform architecture. Even when digital twin and physiological vitals satisfy recovery criteria (e.g. heart rate within 20 bpm of baseline for 3 minutes), the system solely illuminates an advisory recommendation. Re-deployment requires physical assessment and digital signature from a named supervisor or medical officer.
                </p>
              </div>

              <div className="p-4 rounded-lg bg-industrial-950 border border-industrial-800">
                <h3 className="font-bold text-amber-300 text-sm mb-1">4. Privacy Wall & Supervisor Health Blindness (Rule 9)</h3>
                <p className="text-slate-400">
                  Pre-existing chronic medical conditions, medications, and private medical histories are encrypted with AES-256 Fernet at rest. Shift supervisors receive operational accommodations only (e.g. mandated break frequencies, buddy pairing requirements), and are cryptographically prevented from receiving diagnosis names or prescription records.
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* MODAL 1: CREATE PROTOCOL VERSION */}
      {/* ---------------------------------------------------------------------- */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-industrial-900 border border-industrial-700 rounded-xl w-full max-w-lg p-5 shadow-2xl">
            <h3 className="text-sm font-bold text-white mb-2">Create Safety Protocol Draft Version</h3>
            <p className="text-xs text-slate-400 mb-4">Define a new revision of site heat illness prevention standards.</p>
            <form onSubmit={handleCreateProtocolSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 mb-1">Version String</label>
                <input
                  type="text"
                  value={newVersion}
                  onChange={(e) => setNewVersion(e.target.value)}
                  className="w-full bg-industrial-950 border border-industrial-700 rounded p-2 text-white font-mono"
                  placeholder="e.g. 2.4.0"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Protocol Title</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-industrial-950 border border-industrial-700 rounded p-2 text-white"
                  placeholder="e.g. Smelter High-Radiant Heat Standard"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Description & Regulatory Rationale</label>
                <textarea
                  rows="3"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full bg-industrial-950 border border-industrial-700 rounded p-2 text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-3 py-1.5 rounded bg-industrial-800 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-semibold"
                >
                  Create Protocol Draft
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* MODAL 2: COMPARE PROTOCOL VERSIONS */}
      {/* ---------------------------------------------------------------------- */}
      {compareModalOpen && compareResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-industrial-900 border border-industrial-700 rounded-xl w-full max-w-2xl p-5 shadow-2xl">
            <h3 className="text-sm font-bold text-white mb-1">Side-by-Side Protocol Comparison</h3>
            <p className="text-xs text-slate-400 mb-4">{compareResult.summary}</p>
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4 p-3 rounded-lg bg-industrial-950 border border-industrial-800">
                <div>
                  <h4 className="font-bold text-sky-400 mb-1">{compareResult.protocol_a.version} ({compareResult.protocol_a.id})</h4>
                  <p className="text-slate-400">{compareResult.protocol_a.title}</p>
                </div>
                <div>
                  <h4 className="font-bold text-emerald-400 mb-1">{compareResult.protocol_b.version} ({compareResult.protocol_b.id})</h4>
                  <p className="text-slate-400">{compareResult.protocol_b.title}</p>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-200 mb-1">PPE Clothing Adjustment Factors (CAF):</h4>
                <div className="grid grid-cols-2 gap-4 p-2 bg-industrial-950 rounded border border-industrial-800 font-mono text-[11px]">
                  <div>
                    {Object.entries(compareResult.ppe_caf_differences.version_a || {}).map(([k, v]) => (
                      <div key={k} className="flex justify-between py-0.5">
                        <span className="text-slate-400">{k}:</span>
                        <span className="text-sky-300">+{v}°C</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    {Object.entries(compareResult.ppe_caf_differences.version_b || {}).map(([k, v]) => (
                      <div key={k} className="flex justify-between py-0.5">
                        <span className="text-slate-400">{k}:</span>
                        <span className="text-emerald-300">+{v}°C</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end pt-4">
              <button
                onClick={() => setCompareModalOpen(false)}
                className="px-3 py-1.5 rounded bg-industrial-800 text-slate-200 text-xs font-semibold"
              >
                Close Comparison
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* MODAL 3: AUDITED RETENTION PURGE */}
      {/* ---------------------------------------------------------------------- */}
      {purgeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="bg-industrial-900 border border-red-700/60 rounded-xl w-full max-w-md p-5 shadow-2xl">
            <div className="flex items-center gap-2.5 text-red-400 mb-2">
              <AlertOctagon className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold text-white">Execute Audited Telemetry Purge</h3>
            </div>
            <p className="text-xs text-slate-300 mb-4">
              This action will permanently delete all raw environmental and physiological sensor records older than the selected retention period.
            </p>
            <form onSubmit={handlePurgeSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 mb-1">Retention Cutoff Threshold</label>
                <select
                  value={purgeDays}
                  onChange={(e) => setPurgeDays(Number(e.target.value))}
                  className="w-full bg-industrial-950 border border-industrial-700 rounded p-2 text-white"
                >
                  <option value={30}>Older than 30 Days (Standard Policy)</option>
                  <option value={60}>Older than 60 Days</option>
                  <option value={90}>Older than 90 Days</option>
                  <option value={365}>Older than 1 Year</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Administrative Reason (Mandatory Audit Entry)</label>
                <input
                  type="text"
                  value={purgeReason}
                  onChange={(e) => setPurgeReason(e.target.value)}
                  className="w-full bg-industrial-950 border border-industrial-700 rounded p-2 text-white"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPurgeModalOpen(false)}
                  className="px-3 py-1.5 rounded bg-industrial-800 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white font-bold"
                >
                  Confirm & Purge Telemetry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Sprint 1: Administrator Control Plane Screen
 * Guarded: Only 'admin' role has access.
 */
export function Admin() {
  const [activeTab, setActiveTab] = useState('sites'); // sites | users | retention | logins | audits | config
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState([]);

  // Data states
  const [orgs, setOrgs] = useState([]);
  const [sites, setSites] = useState([]);
  const [users, setUsers] = useState([]);
  const [loginHistory, setLoginHistory] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [sysConfig, setSysConfig] = useState(null);

  // Filters
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [auditActionFilter, setAuditActionFilter] = useState('');

  // Modals / Drawers
  const [createSiteOpen, setCreateSiteOpen] = useState(false);
  const [editCoordsOpen, setEditCoordsOpen] = useState(false);
  const [selectedSite, setSelectedSite] = useState(null);
  const [createOrgOpen, setCreateOrgOpen] = useState(false);
  const [resetTokenData, setResetTokenData] = useState(null);
  const [resetTokenOpen, setResetTokenOpen] = useState(false);
  const [purgeConfirmOpen, setPurgeConfirmOpen] = useState(false);
  const [deleteSiteConfirmOpen, setDeleteSiteConfirmOpen] = useState(false);
  const [siteToDelete, setSiteToDelete] = useState(null);

  // Form states
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteOrgId, setNewSiteOrgId] = useState(1);
  const [newSiteLocation, setNewSiteLocation] = useState('');
  const [newSiteLat, setNewSiteLat] = useState('40.7128');
  const [newSiteLon, setNewSiteLon] = useState('-74.0060');
  const [newSiteTz, setNewSiteTz] = useState('America/New_York');

  const [editLat, setEditLat] = useState('');
  const [editLon, setEditLon] = useState('');

  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgSlug, setNewOrgSlug] = useState('');

  const [purgeDays, setPurgeDays] = useState(30);
  const [purgeReason, setPurgeReason] = useState('Routine 30-day telemetry retention cleanup per policy');

  const [copiedToken, setCopiedToken] = useState(false);

  function addToast(type, title, message) {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }

  function dismissToast(id) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  useEffect(() => {
    loadAllAdminData();
  }, []);

  async function loadAllAdminData() {
    setLoading(true);
    try {
      const [o, s, u, lh, al, sc] = await Promise.all([
        api.admin.getOrgs().catch(() => []),
        api.admin.getSites().catch(() => []),
        api.admin.getUsers().catch(() => []),
        api.admin.getLoginHistory(50).catch(() => []),
        api.admin.getAuditLogs(50).catch(() => []),
        api.admin.getConfig().catch(() => null),
      ]);
      setOrgs(o || []);
      setSites(s || []);
      setUsers(u || []);
      setLoginHistory(lh || []);
      setAuditLogs(al || []);
      setSysConfig(sc);
    } catch (err) {
      addToast('error', 'Error Loading Admin Data', err.message || 'Failed to fetch administration data.');
    } finally {
      setLoading(false);
    }
  }

  // --- Sites & Orgs Handlers ---
  async function handleCreateOrg(e) {
    e.preventDefault();
    if (!newOrgName) return;
    try {
      setLoading(true);
      await api.admin.createOrg({
        name: newOrgName,
        slug: newOrgSlug || newOrgName.toLowerCase().replace(/\s+/g, '-'),
      });
      addToast('success', 'Organization Created', `Organization '${newOrgName}' successfully provisioned.`);
      setCreateOrgOpen(false);
      setNewOrgName('');
      setNewOrgSlug('');
      const o = await api.admin.getOrgs();
      setOrgs(o);
    } catch (err) {
      addToast('error', 'Create Failed', err.message || 'Could not create organization.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateSite(e) {
    e.preventDefault();
    if (!newSiteName) return;
    try {
      setLoading(true);
      await api.admin.createSite({
        org_id: Number(newSiteOrgId),
        name: newSiteName,
        location: newSiteLocation,
        latitude: parseFloat(newSiteLat) || 0.0,
        longitude: parseFloat(newSiteLon) || 0.0,
        timezone: newSiteTz,
      });
      addToast('success', 'Site Created', `Site '${newSiteName}' added with coordinates (${newSiteLat}, ${newSiteLon}).`);
      setCreateSiteOpen(false);
      setNewSiteName('');
      setNewSiteLocation('');
      const s = await api.admin.getSites();
      setSites(s);
    } catch (err) {
      addToast('error', 'Site Creation Failed', err.message || 'Could not create site.');
    } finally {
      setLoading(false);
    }
  }

  function openEditCoords(site) {
    setSelectedSite(site);
    setEditLat(site.latitude != null ? String(site.latitude) : '');
    setEditLon(site.longitude != null ? String(site.longitude) : '');
    setEditCoordsOpen(true);
  }

  async function handleUpdateCoords(e) {
    e.preventDefault();
    if (!selectedSite) return;
    try {
      setLoading(true);
      await api.admin.updateSite(selectedSite.id, {
        latitude: parseFloat(editLat),
        longitude: parseFloat(editLon),
      });
      addToast('success', 'Coordinates Updated', `Site '${selectedSite.name}' updated to (${editLat}, ${editLon}).`);
      setEditCoordsOpen(false);
      const s = await api.admin.getSites();
      setSites(s);
    } catch (err) {
      addToast('error', 'Update Failed', err.message || 'Could not update site coordinates.');
    } finally {
      setLoading(false);
    }
  }

  async function confirmDeleteSite() {
    if (!siteToDelete) return;
    try {
      setLoading(true);
      await api.admin.deleteSite(siteToDelete.id);
      addToast('success', 'Site Deleted', `Site '${siteToDelete.name}' has been deleted.`);
      setDeleteSiteConfirmOpen(false);
      setSiteToDelete(null);
      const s = await api.admin.getSites();
      setSites(s);
    } catch (err) {
      addToast('error', 'Delete Failed', err.message || 'Could not delete site.');
    } finally {
      setLoading(false);
    }
  }

  // --- Users Handlers ---
  async function handleToggleStatus(userId, currentStatus) {
    const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      setLoading(true);
      await api.admin.setUserStatus(userId, nextStatus);
      addToast('success', 'Account Status Updated', `User account status changed to ${nextStatus}.`);
      const u = await api.admin.getUsers();
      setUsers(u);
    } catch (err) {
      addToast('error', 'Status Update Failed', err.message || 'Could not toggle user status.');
    } finally {
      setLoading(false);
    }
  }

  async function handleChangeRole(userId, newRole) {
    try {
      setLoading(true);
      await api.admin.setUserRole(userId, newRole);
      addToast('success', 'Role Changed', `User role successfully assigned to ${newRole}.`);
      const u = await api.admin.getUsers();
      setUsers(u);
    } catch (err) {
      addToast('error', 'Role Assignment Failed', err.message || 'Could not change user role.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateResetToken(userId) {
    try {
      setLoading(true);
      const res = await api.admin.generateResetToken(userId);
      setResetTokenData(res);
      setResetTokenOpen(true);
      setCopiedToken(false);
      addToast('success', 'Reset Token Generated', `Token generated for ${res.username}.`);
    } catch (err) {
      addToast('error', 'Token Generation Failed', err.message || 'Could not generate reset token.');
    } finally {
      setLoading(false);
    }
  }

  // --- Purge Handlers ---
  async function handleExecutePurge() {
    try {
      setLoading(true);
      const res = await api.admin.purgeRetention(purgeDays, purgeReason);
      addToast('success', 'Purge Executed', `Purged ${res.purged_records_total} telemetry records. Audit entry logged.`);
      setPurgeConfirmOpen(false);
      const al = await api.admin.getAuditLogs(50);
      setAuditLogs(al);
    } catch (err) {
      addToast('error', 'Purge Failed', err.message || 'Purge operation failed.');
    } finally {
      setLoading(false);
    }
  }

  // Filtered users
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      !userSearch ||
      (u.full_name && u.full_name.toLowerCase().includes(userSearch.toLowerCase())) ||
      (u.username && u.username.toLowerCase().includes(userSearch.toLowerCase())) ||
      (u.email && u.email.toLowerCase().includes(userSearch.toLowerCase()));
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || u.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  // Filtered audit logs
  const filteredAuditLogs = auditLogs.filter((al) => {
    return !auditActionFilter || al.action.toLowerCase().includes(auditActionFilter.toLowerCase());
  });

  return (
    <div className="space-y-6">
      <Toast toasts={toasts} onDismiss={dismissToast} />

      {/* 1. Header & Quick Stat Counters */}
      <div className="bg-industrial-900 border border-industrial-800 rounded-xl p-5 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-950 border border-purple-600/40 flex items-center justify-center text-purple-400 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white tracking-wide">Administration</h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-950 text-purple-300 border border-purple-700">
                  SYSTEM CONTROL PLANE
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Organizations, Sites, Lat/Long Coordinates, User Roles & Status, Retention Purge, Audit Trails & System Configuration
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={loadAllAdminData}
              disabled={loading}
              className="flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Control Plane</span>
            </Button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-industrial-800/80">
          <StatCard label="Total Users" value={users.length} icon={Users} />
          <StatCard label="Configured Sites" value={sites.length} icon={Building} />
          <StatCard label="Audit Records" value={auditLogs.length} icon={History} />
          <StatCard label="Retention Policy" value="30-Day Rolling" icon={Trash2} />
        </div>
      </div>

      {/* 2. Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-industrial-800 pb-2">
        {[
          { id: 'sites', label: 'Organizations & Sites', icon: Building },
          { id: 'users', label: 'Workforce & Permissions', icon: Users },
          { id: 'retention', label: 'Data Retention & Purge', icon: Trash2 },
          { id: 'logins', label: 'Authentication History', icon: Lock },
          { id: 'audits', label: 'System Audit Trail', icon: History },
          { id: 'config', label: 'System Configuration', icon: Settings },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-purple-950/80 border border-purple-500/50 text-purple-300 shadow-sm'
                  : 'bg-industrial-900 border border-industrial-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-purple-400' : 'text-slate-500'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ---------------------------------------------------------------------- */}
      {/* TAB 1: SITES & ORGANIZATIONS CRUD */}
      {/* ---------------------------------------------------------------------- */}
      {activeTab === 'sites' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Industrial Facilities & Sites</h2>
              <p className="text-xs text-slate-400">Manage site geographical coordinates for real-time Open-Meteo weather lookups</p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => setCreateOrgOpen(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Organization
              </Button>
              <Button size="sm" variant="primary" onClick={() => setCreateSiteOpen(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Add New Site
              </Button>
            </div>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-industrial-950 text-slate-400 border-b border-industrial-800">
                  <tr>
                    <th className="p-3">Site ID / Name</th>
                    <th className="p-3">Location & Timezone</th>
                    <th className="p-3">Latitude / Longitude (Open-Meteo)</th>
                    <th className="p-3">Organization ID</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-industrial-800/60 text-slate-300">
                  {sites.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="p-6 text-center">
                        <EmptyState title="No Sites Configured" description="Create your first industrial facility to enable weather monitoring." />
                      </td>
                    </tr>
                  ) : (
                    sites.map((site) => (
                      <tr key={site.id} className="hover:bg-industrial-800/20">
                        <td className="p-3">
                          <div className="font-semibold text-white">{site.name}</div>
                          <div className="text-[11px] text-slate-400 font-mono">ID: {site.id}</div>
                        </td>
                        <td className="p-3">
                          <div className="text-slate-200">{site.location || 'Industrial Plant'}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{site.timezone || 'UTC'}</div>
                        </td>
                        <td className="p-3">
                          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-industrial-950 border border-industrial-800 font-mono text-[11px] text-sky-300">
                            <MapPin className="w-3 h-3 text-sky-400" />
                            <span>{site.latitude != null ? `${site.latitude.toFixed(4)}, ${site.longitude.toFixed(4)}` : 'Not configured'}</span>
                          </div>
                        </td>
                        <td className="p-3 font-mono text-slate-400">
                          Org #{site.org_id}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button size="sm" variant="secondary" onClick={() => openEditCoords(site)} className="text-[11px] py-1 px-2">
                              Edit Coordinates
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => {
                                setSiteToDelete(site);
                                setDeleteSiteConfirmOpen(true);
                              }}
                              className="text-[11px] py-1 px-2"
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* TAB 2: USERS & ACCESS CONTROL */}
      {/* ---------------------------------------------------------------------- */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Workforce & Identity Management</h2>
              <p className="text-xs text-slate-400">User accounts, role assignment, account activation, and password reset tokens</p>
            </div>
            <div className="text-xs text-slate-400">
              Showing <strong className="text-white">{filteredUsers.length}</strong> of {users.length} users
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-industrial-900 border border-industrial-800 p-3 rounded-lg">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Search Users</label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Filter by name, username or email..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full bg-industrial-950 border border-industrial-700 rounded pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Filter by Role</label>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-full bg-industrial-950 border border-industrial-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
              >
                <option value="all">All Roles</option>
                <option value="worker">Worker</option>
                <option value="supervisor">Supervisor</option>
                <option value="safety_officer">Safety Officer</option>
                <option value="admin">Administrator</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Filter by Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full bg-industrial-950 border border-industrial-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active Only</option>
                <option value="suspended">Suspended Only</option>
              </select>
            </div>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-industrial-950 text-slate-400 border-b border-industrial-800">
                  <tr>
                    <th className="p-3">User & Contact</th>
                    <th className="p-3">Role Assignment</th>
                    <th className="p-3">Account Status</th>
                    <th className="p-3 text-right">Administrative Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-industrial-800/60 text-slate-300">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="p-6 text-center">
                        <EmptyState title="No Matching Users" description="No user accounts matched the filter criteria." />
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const isActive = u.status === 'active';
                      return (
                        <tr key={u.id} className="hover:bg-industrial-800/20">
                          <td className="p-3">
                            <div className="font-semibold text-white">{u.full_name}</div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              {u.username} • {u.email}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  u.role === 'admin'
                                    ? 'bg-purple-950 text-purple-300 border border-purple-700'
                                    : u.role === 'safety_officer'
                                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                                    : u.role === 'supervisor'
                                    ? 'bg-sky-950 text-sky-300 border border-sky-700'
                                    : 'bg-slate-800 text-slate-300 border border-slate-700'
                                }`}
                              >
                                {u.role.replace('_', ' ')}
                              </span>
                              <select
                                value={u.role}
                                onChange={(e) => handleChangeRole(u.id, e.target.value)}
                                className="bg-industrial-950 border border-industrial-700 rounded px-1.5 py-0.5 text-[11px] text-slate-300 focus:outline-none"
                              >
                                <option value="worker">Worker</option>
                                <option value="supervisor">Supervisor</option>
                                <option value="safety_officer">Safety Officer</option>
                                <option value="admin">Administrator</option>
                              </select>
                            </div>
                          </td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                isActive
                                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-700'
                                  : 'bg-red-950 text-red-400 border border-red-700 font-bold'
                              }`}
                            >
                              {u.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant={isActive ? 'danger' : 'primary'}
                                onClick={() => handleToggleStatus(u.id, u.status)}
                                className="text-[11px] py-1 px-2"
                              >
                                {isActive ? 'Suspend' : 'Activate'}
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleGenerateResetToken(u.id)}
                                className="text-[11px] py-1 px-2"
                                title="Generate Password Reset Token"
                              >
                                <KeyRound className="w-3 h-3 mr-1" /> Reset Token
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* TAB 3: DATA RETENTION & PURGE */}
      {/* ---------------------------------------------------------------------- */}
      {activeTab === 'retention' && (
        <div className="space-y-5">
          <Card>
            <div className="p-4 border-b border-industrial-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-red-400" />
                  <span>Automated Data Retention & Audited Purge</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Enforces automated rolling telemetry deletion while preserving regulatory incident records
                </p>
              </div>
              <Button size="sm" variant="danger" onClick={() => setPurgeConfirmOpen(true)}>
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Purge Telemetry Now
              </Button>
            </div>
            <div className="p-4 text-xs text-slate-300 space-y-3">
              <p>
                THERMOSENSE operates under strict data minimization guidelines. Raw high-frequency biometric and environmental data is retained for a maximum of 30 days before immutable purge.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div className="p-3 rounded-lg bg-industrial-950 border border-industrial-800">
                  <h4 className="font-semibold text-slate-200 mb-1">Purge Invariant</h4>
                  <p className="text-slate-400 text-[11px]">
                    Every purge invocation records a tamper-evident audit record in <code className="text-sky-300">audit_logs</code> detailing the executing administrator, deletion timestamp, and record count.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-industrial-950 border border-industrial-800">
                  <h4 className="font-semibold text-slate-200 mb-1">Exempt From Purge</h4>
                  <p className="text-slate-400 text-[11px]">
                    OSHA 300 / 301 incident records, user credentials, organizational configuration, and compliance audit logs are strictly preserved.
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* TAB 4: AUTHENTICATION HISTORY */}
      {/* ---------------------------------------------------------------------- */}
      {activeTab === 'logins' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Authentication & Access Logs</h2>
              <p className="text-xs text-slate-400">Track successful and failed sign-in attempts across all roles</p>
            </div>
            <span className="text-xs font-mono text-slate-400">{loginHistory.length} records recorded</span>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-industrial-950 text-slate-400 border-b border-industrial-800">
                  <tr>
                    <th className="p-3">User</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">IP Address</th>
                    <th className="p-3">Client User-Agent</th>
                    <th className="p-3 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-industrial-800/60 text-slate-300">
                  {loginHistory.map((lh) => (
                    <tr key={lh.id} className="hover:bg-industrial-800/20">
                      <td className="p-3 font-semibold text-white">{lh.username}</td>
                      <td className="p-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            lh.success
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                              : 'bg-red-950 text-red-300 border border-red-700'
                          }`}
                        >
                          {lh.success ? 'SUCCESS' : 'FAILED'}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-slate-300">{lh.ip_address}</td>
                      <td className="p-3 font-mono text-slate-400 text-[11px] max-w-xs truncate" title={lh.user_agent}>
                        {lh.user_agent}
                      </td>
                      <td className="p-3 text-right font-mono text-slate-400">
                        {new Date(lh.timestamp).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* TAB 5: SYSTEM AUDIT TRAIL */}
      {/* ---------------------------------------------------------------------- */}
      {activeTab === 'audits' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Immutable System Audit Trail</h2>
              <p className="text-xs text-slate-400">Administrative and security operations log</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Filter by action..."
                value={auditActionFilter}
                onChange={(e) => setAuditActionFilter(e.target.value)}
                className="bg-industrial-950 border border-industrial-700 rounded px-2.5 py-1 text-xs text-slate-200"
              />
            </div>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-industrial-950 text-slate-400 border-b border-industrial-800">
                  <tr>
                    <th className="p-3">Timestamp</th>
                    <th className="p-3">User & Role</th>
                    <th className="p-3">Action</th>
                    <th className="p-3">Details</th>
                    <th className="p-3 text-right">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-industrial-800/60 text-slate-300">
                  {filteredAuditLogs.map((al) => (
                    <tr key={al.id} className="hover:bg-industrial-800/20">
                      <td className="p-3 font-mono text-slate-400 whitespace-nowrap">
                        {new Date(al.timestamp).toLocaleString()}
                      </td>
                      <td className="p-3">
                        <span className="font-semibold text-white">{al.username}</span>
                        <span className="text-[11px] text-slate-500 ml-1 font-mono">({al.role})</span>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-industrial-950 border border-industrial-700 text-sky-300">
                          {al.action}
                        </span>
                      </td>
                      <td className="p-3 text-slate-300">{al.details}</td>
                      <td className="p-3 text-right font-mono text-slate-400">{al.ip_address}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* TAB 6: SYSTEM CONFIGURATION */}
      {/* ---------------------------------------------------------------------- */}
      {activeTab === 'config' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">System & Environmental Configuration</h2>
            <p className="text-xs text-slate-400">Engine parameters, JWT secrets status, and Open-Meteo cache parameters</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card title="Environment & Operational Settings">
              <div className="space-y-2 text-xs font-mono text-slate-300">
                <div className="flex justify-between py-1 border-b border-industrial-800">
                  <span className="text-slate-400">JWT Secret Configured:</span>
                  <span className="text-emerald-400 font-bold">{sysConfig?.jwt_secret_configured ? 'YES (from env)' : 'DEFAULT'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-industrial-800">
                  <span className="text-slate-400">Demo Mode:</span>
                  <span className={sysConfig?.demo_mode ? 'text-amber-400' : 'text-slate-400'}>{String(sysConfig?.demo_mode)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-industrial-800">
                  <span className="text-slate-400">Database Engine:</span>
                  <span className="text-slate-200">SQLite ({sysConfig?.db_path})</span>
                </div>
                <div className="flex justify-between py-1 border-b border-industrial-800">
                  <span className="text-slate-400">Weather Cache TTL:</span>
                  <span className="text-sky-300">{sysConfig?.weather_cache_minutes} Minutes</span>
                </div>
                <div className="flex justify-between py-1 border-b border-industrial-800">
                  <span className="text-slate-400">Weather Stale Threshold:</span>
                  <span className="text-amber-300">{sysConfig?.weather_stale_minutes} Minutes</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Manual Entry Validity:</span>
                  <span className="text-emerald-300">{sysConfig?.manual_reading_valid_minutes} Minutes (60m Countdown)</span>
                </div>
              </div>
            </Card>

            <Card title="Regulatory Standards & Reference Thresholds">
              <div className="space-y-2 text-xs text-slate-300">
                <div className="p-2.5 rounded bg-industrial-950 border border-industrial-800">
                  <div className="font-semibold text-sky-400">OSHA Technical Manual Sec III: Ch 4</div>
                  <p className="text-[11px] text-slate-400 mt-0.5">Work/Rest regimens at 27.5°C, 29.5°C, 31.0°C, and 32.0°C WBGT</p>
                </div>
                <div className="p-2.5 rounded bg-industrial-950 border border-industrial-800">
                  <div className="font-semibold text-emerald-400">NIOSH Criteria Pub 2016-106</div>
                  <p className="text-[11px] text-slate-400 mt-0.5">Recommended Alert Limits (RAL) and 5-day acclimatization schedule</p>
                </div>
                <div className="p-2.5 rounded bg-industrial-950 border border-industrial-800">
                  <div className="font-semibold text-amber-400">ACGIH TLVs &amp; ISO 7243:2017</div>
                  <p className="text-[11px] text-slate-400 mt-0.5">Metabolic rate workload adjustments &amp; clothing adjustment factors</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* --- MODALS & DRAWERS --- */}

      {/* Create Site Drawer */}
      <Drawer
        isOpen={createSiteOpen}
        onClose={() => setCreateSiteOpen(false)}
        title="Add Industrial Site"
      >
        <form onSubmit={handleCreateSite} className="space-y-3 text-xs">
          <Input label="Site Name" value={newSiteName} onChange={(e) => setNewSiteName(e.target.value)} required placeholder="e.g. Apex Smelter - Sector 4" />
          <Select
            label="Organization"
            value={newSiteOrgId}
            onChange={(e) => setNewSiteOrgId(e.target.value)}
            options={orgs.map((o) => ({ value: o.id, label: o.name }))}
          />
          <Input label="Facility Location" value={newSiteLocation} onChange={(e) => setNewSiteLocation(e.target.value)} placeholder="e.g. Newark, NJ" />
          <div className="grid grid-cols-2 gap-2">
            <Input label="Latitude" value={newSiteLat} onChange={(e) => setNewSiteLat(e.target.value)} required placeholder="40.7128" />
            <Input label="Longitude" value={newSiteLon} onChange={(e) => setNewSiteLon(e.target.value)} required placeholder="-74.0060" />
          </div>
          <Input label="Timezone" value={newSiteTz} onChange={(e) => setNewSiteTz(e.target.value)} placeholder="America/New_York" />
          <div className="pt-2 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setCreateSiteOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" size="sm" disabled={loading}>Create Site</Button>
          </div>
        </form>
      </Drawer>

      {/* Edit Coordinates Modal */}
      <Modal
        isOpen={editCoordsOpen}
        onClose={() => setEditCoordsOpen(false)}
        title={`Edit Coordinates: ${selectedSite?.name}`}
      >
        <form onSubmit={handleUpdateCoords} className="space-y-3 text-xs">
          <p className="text-slate-400">
            Set accurate geographical coordinates for Open-Meteo automated weather and solar radiation ingestion.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Latitude" value={editLat} onChange={(e) => setEditLat(e.target.value)} required placeholder="e.g. 40.7128" />
            <Input label="Longitude" value={editLon} onChange={(e) => setEditLon(e.target.value)} required placeholder="e.g. -74.0060" />
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditCoordsOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" size="sm" disabled={loading}>Save Coordinates</Button>
          </div>
        </form>
      </Modal>

      {/* Create Org Modal */}
      <Modal
        isOpen={createOrgOpen}
        onClose={() => setCreateOrgOpen(false)}
        title="Add Organization"
      >
        <form onSubmit={handleCreateOrg} className="space-y-3 text-xs">
          <Input label="Organization Name" value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} required placeholder="e.g. Apex Industrial Systems" />
          <Input label="Slug" value={newOrgSlug} onChange={(e) => setNewOrgSlug(e.target.value)} placeholder="apex-industrial" />
          <div className="pt-2 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setCreateOrgOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" size="sm" disabled={loading}>Create Organization</Button>
          </div>
        </form>
      </Modal>

      {/* Reset Token Modal */}
      <Modal
        isOpen={resetTokenOpen}
        onClose={() => setResetTokenOpen(false)}
        title="Password Reset Token Generated"
      >
        <div className="space-y-3 text-xs">
          <p className="text-slate-300">
            A one-time secure password reset token has been generated for <strong>{resetTokenData?.username}</strong> ({resetTokenData?.email}).
          </p>
          <div className="p-3 rounded bg-industrial-950 border border-industrial-800 font-mono text-sky-300 break-all select-all">
            {resetTokenData?.reset_token}
          </div>
          <p className="text-[11px] text-slate-400">
            Valid for 1 hour. Provide this token to the user to reset their password on the login screen.
          </p>
          <div className="pt-2 flex justify-end gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(resetTokenData?.reset_token || '');
                setCopiedToken(true);
              }}
            >
              {copiedToken ? 'Copied!' : 'Copy Token'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setResetTokenOpen(false)}>Close</Button>
          </div>
        </div>
      </Modal>

      {/* Purge Confirmation Dialog */}
      <ConfirmDialog
        isOpen={purgeConfirmOpen}
        onClose={() => setPurgeConfirmOpen(false)}
        onConfirm={handleExecutePurge}
        title="Confirm Audited Telemetry Purge"
        message={`Are you sure you want to permanently purge all raw sensor telemetry older than ${purgeDays} days? This action cannot be undone and will write an immutable record to the audit trail.`}
        confirmText="Confirm Purge"
        danger={true}
        loading={loading}
      />

      {/* Delete Site Confirm */}
      <ConfirmDialog
        isOpen={deleteSiteConfirmOpen}
        onClose={() => setDeleteSiteConfirmOpen(false)}
        onConfirm={confirmDeleteSite}
        title="Confirm Site Deletion"
        message={`Are you sure you want to delete site '${siteToDelete?.name}'?`}
        confirmText="Delete Site"
        danger={true}
        loading={loading}
      />
    </div>
  );
}

export default Safety;

