import React, { useState, useEffect } from 'react';
import {
  FileWarning,
  PlusCircle,
  AlertTriangle,
  Flame,
  Clock,
  User,
  MapPin,
  CheckCircle2,
  Activity,
  FileText,
  ShieldAlert,
  Send,
  MessageSquare,
  BookOpen,
  ArrowRight,
  Filter,
  Search,
  RefreshCw,
  X
} from 'lucide-react';
import { useAuth } from './AuthContext';
import { api } from './api';
import {
  Card,
  Button,
  Modal,
  Input,
  Select,
  Textarea,
  SeverityBadge,
  RiskBadge
} from './ui';

export function Incidents() {
  const { user } = useAuth();
  const [incidents, setIncidents] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [protocols, setProtocols] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter & Search
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');

  // Selected incident details
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [newNoteText, setNewNoteText] = useState('');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [protocolModalOpen, setProtocolModalOpen] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState('Under Investigation');
  const [statusNote, setStatusNote] = useState('');

  // Create Form State
  const [newWorkerId, setNewWorkerId] = useState('w-01');
  const [newTitle, setNewTitle] = useState('');
  const [newSeverity, setNewSeverity] = useState('High');
  const [newActions, setNewActions] = useState('Immediately paused work; transferred worker to Cooling Shelter 1A.');
  const [newWitnesses, setNewWitnesses] = useState('');
  const [newSymptoms, setNewSymptoms] = useState(['dizziness', 'fatigue']);
  const [newNotes, setNewNotes] = useState('Worker reported acute thermal exhaustion during continuous heavy workload.');

  const symptomChecklist = [
    { id: 'dizziness', label: 'Dizziness / Lightheadedness' },
    { id: 'nausea', label: 'Nausea / Vomiting' },
    { id: 'headache', label: 'Throbbing Headache' },
    { id: 'fatigue', label: 'Abnormal Exhaustion' },
    { id: 'cramps', label: 'Muscle Spasms / Cramps' },
    { id: 'heavy_sweating', label: 'Profuse Sweating' },
    { id: 'confusion', label: 'Confusion / Disorientation (EMERGENCY)' }
  ];

  async function loadData() {
    setLoading(true);
    try {
      const [incRes, wRes, protoRes] = await Promise.all([
        api.getIncidents().catch(() => []),
        api.getWorkers().catch(() => []),
        api.getEmergencyProtocols().catch(() => ({ protocols: [] }))
      ]);
      setIncidents(incRes || []);
      setWorkers(wRes || []);
      setProtocols(protoRes?.protocols || []);
      if (incRes && incRes.length > 0 && !selectedIncident) {
        setSelectedIncident(incRes[0]);
      }
    } catch (err) {
      console.warn("Failed to load incidents data:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const handleSelectIncident = async (inc) => {
    try {
      const full = await api.getIncident(inc.id);
      setSelectedIncident(full);
    } catch (e) {
      setSelectedIncident(inc);
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await api.createIncident({
        worker_id: newWorkerId,
        title: newTitle,
        severity: newSeverity,
        actions_taken: newActions,
        witnesses: newWitnesses,
        symptoms: newSymptoms,
        notes: newNotes
      });
      setCreateModalOpen(false);
      setNewTitle('');
      loadData();
    } catch (err) {
      alert("Error creating incident: " + err.message);
    }
  };

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!newNoteText.trim() || !selectedIncident) return;
    try {
      await api.addIncidentNote(selectedIncident.id, newNoteText);
      setNewNoteText('');
      const updated = await api.getIncident(selectedIncident.id);
      setSelectedIncident(updated);
      loadData();
    } catch (err) {
      alert("Error adding note: " + err.message);
    }
  };

  const handleUpdateStatus = async () => {
    if (!selectedIncident) return;
    try {
      await api.updateIncidentStatus(selectedIncident.id, {
        status: targetStatus,
        note: statusNote,
        closed_by_name: targetStatus === 'Closed' ? (user?.full_name || 'Dr. Elena Rostova') : null,
        closed_by_role: targetStatus === 'Closed' ? (user?.role === 'safety_officer' ? 'Site Medical Officer' : 'Supervisor') : null
      });
      setStatusModalOpen(false);
      setStatusNote('');
      const updated = await api.getIncident(selectedIncident.id);
      setSelectedIncident(updated);
      loadData();
    } catch (err) {
      alert("Error updating status: " + err.message);
    }
  };

  const filteredIncidents = incidents.filter((inc) => {
    if (search && !inc.title.toLowerCase().includes(search.toLowerCase()) && !inc.worker_name.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (statusFilter && inc.status !== statusFilter) return false;
    if (severityFilter && inc.severity !== severityFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-industrial-900 border border-industrial-800 rounded-xl shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-950/80 border border-rose-800 flex items-center justify-center text-rose-400 shadow-inner">
            <FileWarning className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black text-white tracking-wide">
                INCIDENTS REGISTRY & ROOT CAUSE INVESTIGATION
              </h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-rose-950 text-rose-300 border border-rose-800">
                OSHA 300 / 301 WORKFLOW
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Formal Occupational Heat-Strain Investigation • Auto-Attached Sensor Context • Human Accountability
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={() => setProtocolModalOpen(true)}
            className="text-xs shadow-md shadow-rose-950/60"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Emergency Protocol Screen</span>
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setCreateModalOpen(true)}
            className="text-xs"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Log Heat Incident</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Main Grid: Incident List (Left) + Detail Dossier & Timeline (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Incident List & Search Filter */}
        <div className="bg-industrial-900 border border-industrial-800 rounded-xl p-3.5 space-y-3">
          <div className="flex items-center justify-between border-b border-industrial-800 pb-2">
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">
              Recorded Cases ({filteredIncidents.length})
            </h2>
            <span className="text-[10px] text-slate-500 font-mono">Formal Case Log</span>
          </div>

          {/* Search & Filters */}
          <div className="space-y-2 text-xs">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search cases or worker..."
                className="w-full bg-industrial-950 border border-industrial-700 rounded pl-8 pr-2 py-1.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="bg-industrial-950 border border-industrial-700 rounded p-1.5 text-slate-200 text-xs"
              >
                <option value="">All Severities</option>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-industrial-950 border border-industrial-700 rounded p-1.5 text-slate-200 text-xs"
              >
                <option value="">All Statuses</option>
                <option value="Reported">Reported</option>
                <option value="Under Investigation">Under Investigation</option>
                <option value="First Response / Treatment">First Response</option>
                <option value="Corrective Actions Assigned">Corrective Actions</option>
                <option value="Closed">Closed</option>
              </select>
            </div>
          </div>

          {/* Incidents Scrollable List */}
          <div className="space-y-2 max-h-[550px] overflow-y-auto pr-1">
            {filteredIncidents.map((inc) => {
              const isSelected = selectedIncident?.id === inc.id;
              return (
                <div
                  key={inc.id}
                  onClick={() => handleSelectIncident(inc)}
                  className={`p-3 rounded-lg border text-xs cursor-pointer transition ${
                    isSelected
                      ? 'bg-industrial-800 border-sky-500/80 shadow-md'
                      : 'bg-industrial-950 border-industrial-800 hover:border-industrial-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-slate-500">{inc.id}</span>
                    <SeverityBadge severity={inc.severity} />
                  </div>

                  <h3 className="font-bold text-white text-xs mt-1 leading-snug">{inc.title}</h3>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 pt-1.5 border-t border-industrial-900">
                    <span className="text-slate-300 font-medium">{inc.worker_name}</span>
                    <span className="font-mono text-[10px]">{inc.status}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right 2 Cols: Incident Dossier, Auto-Attached Telemetry & Timeline */}
        <div className="lg:col-span-2 bg-industrial-900 border border-industrial-800 rounded-xl p-4 space-y-4">
          {selectedIncident ? (
            <>
              {/* Header Banner */}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-industrial-800 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-sky-400 font-bold">{selectedIncident.id}</span>
                    <SeverityBadge severity={selectedIncident.severity} />
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-industrial-950 border border-industrial-700 text-slate-200">
                      Status: {selectedIncident.status}
                    </span>
                  </div>
                  <h2 className="text-base font-bold text-white mt-1">{selectedIncident.title}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Worker: <strong className="text-white">{selectedIncident.worker_name}</strong> • Time: <span className="font-mono">{selectedIncident.timestamp?.replace('T', ' ').slice(0, 19)}</span>
                  </p>
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setTargetStatus(selectedIncident.status);
                    setStatusModalOpen(true);
                  }}
                >
                  <span>Update Case Status</span>
                </Button>
              </div>

              {/* Auto-Attached Sensor Context & Readings (Sprint 2 Requirement) */}
              <div className="bg-industrial-950 border border-industrial-800 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between border-b border-industrial-900 pb-1.5">
                  <span className="text-xs font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5" />
                    Auto-Attached Sensor Telemetry & Exposure Context
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">Immutable Snapshot</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <span className="text-slate-400 font-semibold block">Microclimate Conditions:</span>
                    <p className="font-mono text-slate-200 bg-industrial-900 p-2 rounded border border-industrial-800">
                      {selectedIncident.conditions_summary}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-slate-400 font-semibold block">Physiological State:</span>
                    <p className="font-mono text-slate-200 bg-industrial-900 p-2 rounded border border-industrial-800">
                      {selectedIncident.physiological_summary}
                    </p>
                  </div>
                </div>

                {/* Symptoms Reported */}
                {selectedIncident.symptoms && selectedIncident.symptoms.length > 0 && (
                  <div className="text-xs pt-1">
                    <span className="text-slate-400 font-semibold block mb-1">Declared Symptoms:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedIncident.symptoms.map((s, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded bg-amber-950/60 border border-amber-500/50 text-amber-200 text-[11px] font-medium capitalize">
                          {s.replace('_', ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Actions Taken & Witnesses */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="bg-industrial-950 p-3 rounded-xl border border-industrial-800 space-y-1">
                  <span className="text-slate-400 font-semibold block">Immediate First-Aid Actions Taken:</span>
                  <p className="text-slate-200 leading-relaxed">{selectedIncident.actions_taken || 'None recorded'}</p>
                </div>
                <div className="bg-industrial-950 p-3 rounded-xl border border-industrial-800 space-y-1">
                  <span className="text-slate-400 font-semibold block">Witnesses & Co-Workers:</span>
                  <p className="text-slate-200 leading-relaxed">{selectedIncident.witnesses || 'None logged'}</p>
                </div>
              </div>

              {/* Chronological Audit Timeline */}
              <div className="bg-industrial-950 border border-industrial-800 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between border-b border-industrial-900 pb-1.5">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-sky-400" />
                    Case Timeline & Activity Trail
                  </span>
                  <span className="text-[10px] text-slate-500">Immutable Audit Entries</span>
                </div>

                <div className="space-y-2 text-xs">
                  {selectedIncident.timeline?.map((evt, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 p-2 rounded bg-industrial-900/60 border border-industrial-800/80">
                      <div className="w-1.5 h-1.5 rounded-full bg-sky-400 mt-1.5 shrink-0" />
                      <div className="flex-1">
                        <p className="text-slate-200">{evt.event}</p>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5 font-mono">
                          <span>{evt.time?.replace('T', ' ').slice(0, 16)}</span>
                          <span>&bull;</span>
                          <span>Attributed to: <strong>{evt.by}</strong></span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add Note Section */}
              <div className="space-y-2 pt-1 border-t border-industrial-800">
                <span className="text-xs font-semibold text-slate-300 block">Add Investigation Note:</span>
                <form onSubmit={handleAddNote} className="flex gap-2">
                  <input
                    type="text"
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    placeholder="Enter factual observation, medical status, or corrective action..."
                    className="flex-1 bg-industrial-950 border border-industrial-700 rounded px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                  />
                  <Button type="submit" variant="primary" size="sm">
                    <Send className="w-3.5 h-3.5" />
                    <span>Post Note</span>
                  </Button>
                </form>
              </div>
            </>
          ) : (
            <div className="p-12 text-center text-slate-500 text-xs">
              Select an incident from the case list to view full investigation records.
            </div>
          )}
        </div>
      </div>

      {/* Emergency First-Response Protocol Modal (Sprint 2 Requirement) */}
      <Modal
        isOpen={protocolModalOpen}
        onClose={() => setProtocolModalOpen(false)}
        title="EMERGENCY ESCALATION: APPROVED HEAT FIRST-RESPONSE PROTOCOL"
      >
        <div className="space-y-4 text-xs text-slate-200">
          <div className="p-3 bg-red-950/80 border border-red-500/60 rounded-xl space-y-1">
            <span className="font-bold text-red-300 text-sm flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-red-400" />
              OSHA / NIOSH Heat Stress Emergency Standard (OSHA-HEAT-PROTOCOL-01)
            </span>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              Mandatory life-safety directives. Sourced from OSHA Technical Manual (OTM) Sec III: Ch 4 and NIOSH Criteria Pub 2016-106.
            </p>
          </div>

          <div className="space-y-2 bg-industrial-950 p-3 rounded-xl border border-industrial-800 text-slate-200">
            {protocols[0]?.steps?.map((step, idx) => (
              <div key={idx} className="p-2 rounded bg-industrial-900 border border-industrial-800/80 leading-relaxed">
                {step}
              </div>
            )) || (
              <p className="text-slate-400">Loading protocol records...</p>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <Button type="button" variant="primary" size="md" onClick={() => setProtocolModalOpen(false)}>
              Acknowledge & Close Protocol
            </Button>
          </div>
        </div>
      </Modal>

      {/* Create Incident Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="LOG OCCUPATIONAL HEAT-STRAIN INCIDENT REPORT"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-3 text-xs">
          <Select
            label="Involved Worker"
            value={newWorkerId}
            onChange={(e) => setNewWorkerId(e.target.value)}
            options={workers.map(w => ({ value: w.id, label: `${w.full_name} (${w.id}) - ${w.zone_name || 'Zone 1'}` }))}
          />
          <Input
            label="Incident Title / Summary Description"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="e.g. Acute heat exhaustion during furnace maintenance"
            required
          />
          <Select
            label="Severity Classification"
            value={newSeverity}
            onChange={(e) => setNewSeverity(e.target.value)}
            options={[
              { value: 'Low', label: 'Low — Early thermal discomfort / fatigue' },
              { value: 'Medium', label: 'Medium — Moderate strain; mandatory rest required' },
              { value: 'High', label: 'High — Heat exhaustion; dizziness, chills, or nausea' },
              { value: 'Critical', label: 'Critical — Possible heat emergency; confusion or syncope' }
            ]}
          />
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Declared Symptoms:</label>
            <div className="grid grid-cols-2 gap-1.5 p-2 bg-industrial-950 rounded border border-industrial-800">
              {symptomChecklist.map((sym) => {
                const checked = newSymptoms.includes(sym.id);
                return (
                  <label key={sym.id} className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        if (checked) setNewSymptoms(newSymptoms.filter(s => s !== sym.id));
                        else setNewSymptoms([...newSymptoms, sym.id]);
                      }}
                      className="rounded bg-industrial-900 border-industrial-700 text-sky-500"
                    />
                    <span>{sym.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <Textarea
            label="Immediate First-Aid Actions Taken"
            value={newActions}
            onChange={(e) => setNewActions(e.target.value)}
            required
          />
          <Input
            label="Witnesses / Coworkers Present"
            value={newWitnesses}
            onChange={(e) => setNewWitnesses(e.target.value)}
            placeholder="e.g. Carlos Mendez, Marcus Vance"
          />
          <div className="flex gap-2 pt-2">
            <Button type="submit" variant="primary" size="md" className="flex-1">
              File Official Incident Record
            </Button>
            <Button type="button" variant="secondary" size="md" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>

      {/* Update Status Modal */}
      <Modal
        isOpen={statusModalOpen}
        onClose={() => setStatusModalOpen(false)}
        title={`UPDATE INCIDENT STATUS: ${selectedIncident?.id}`}
      >
        <div className="space-y-3 text-xs">
          <Select
            label="New Status Stage"
            value={targetStatus}
            onChange={(e) => setTargetStatus(e.target.value)}
            options={[
              { value: 'Reported', label: 'Reported — Initial case intake' },
              { value: 'Under Investigation', label: 'Under Investigation — Root cause evaluation' },
              { value: 'First Response / Treatment', label: 'First Response / Treatment — Triage in progress' },
              { value: 'Corrective Actions Assigned', label: 'Corrective Actions Assigned — Engineering controls pending' },
              { value: 'Closed', label: 'Closed (Human Signoff Required)' }
            ]}
          />
          <Textarea
            label="Status Transition Justification / Notes"
            value={statusNote}
            onChange={(e) => setStatusNote(e.target.value)}
            placeholder="e.g. Corrective cooling fans installed in Bay 2B; worker cleared for light duties."
            required
          />
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="primary" size="md" className="flex-1" onClick={handleUpdateStatus}>
              Commit Status Change
            </Button>
            <Button type="button" variant="secondary" size="md" onClick={() => setStatusModalOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default Incidents;
