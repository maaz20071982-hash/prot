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
  Shield
} from 'lucide-react';
import { Card, RiskBadge, SeverityBadge, SourceTag } from './ui';
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

export default Safety;
