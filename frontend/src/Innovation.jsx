import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  Send,
  MessageSquare,
  FileCheck2,
  Clock,
  RefreshCw,
  Play,
  RotateCcw,
  AlertTriangle,
  Flame,
  CheckCircle2,
  Building,
  Heart,
  Droplet,
  Layers,
  Scale,
  Languages,
  Printer,
  Download,
  Info,
  Check,
  Zap,
  Globe
} from 'lucide-react';
import { Card, RiskBadge, SeverityBadge, SourceTag } from './ui';
import { api } from './api';

export function Innovation() {
  const [activeTab, setActiveTab] = useState('assistant'); // assistant | passport | handover | near_miss | insights | nudges | benchmark | walkthrough
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // 1. Multilingual Assistant state
  const [selectedLanguage, setSelectedLanguage] = useState('en'); // en | hi | gu
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([
    {
      sender: 'assistant',
      text: 'Welcome to the THERMOSENSE Occupational Heat-Safety Assistant. Ask me about active work-rest cycles, NIOSH 5-day acclimatization schedules, hydration requirements, or first-response emergency procedures.',
      in_scope: true,
      disclaimer: 'Decision support, not a medical device. Not medical advice.',
      source: 'OSHA-HEAT-PROTOCOL-01'
    }
  ]);

  // 2. Heat Safety Passport state
  const [selectedWorkerId, setSelectedWorkerId] = useState('w-01');
  const [passportData, setPassportData] = useState(null);
  const [passportSharingEnabled, setPassportSharingEnabled] = useState(true);

  // 3. Shift Handover state
  const [handovers, setHandovers] = useState([]);
  const [handoverShift, setHandoverShift] = useState('Afternoon');
  const [handoverSite, setHandoverSite] = useState('site-01');
  const [handoverNotes, setHandoverNotes] = useState('Zone 1A furnace tapping scheduled for 14:30. Priya Sharma on Day 2 acclimatization.');
  const [handoverSignature, setHandoverSignature] = useState(true);

  // 4. Near-Miss Intelligence state
  const [nearMisses, setNearMisses] = useState([]);
  const [nmCategory, setNmCategory] = useState('Dehydration Onset');
  const [nmZone, setNmZone] = useState('zone-01');
  const [nmWorkload, setNmWorkload] = useState('heavy');
  const [nmDesc, setNmDesc] = useState('');
  const [nmFactors, setNmFactors] = useState('');
  const [nmActions, setNmActions] = useState('');

  // 5. AI Safety Insights state
  const [insights, setInsights] = useState([]);

  // 6. Personalised Nudges state
  const [workerNudges, setWorkerNudges] = useState([]);
  const [nudgeMessage, setNudgeMessage] = useState('Remember to take a 250ml electrolyte water intake at the Cooling Shelter.');
  const [nudgeType, setNudgeType] = useState('Hydration');
  const [nudgeCritical, setNudgeCritical] = useState(false);

  // 7. Benchmark Evaluation state
  const [benchmarkResult, setBenchmarkResult] = useState(null);

  // 8. Judge Walkthrough state
  const [walkthroughStep, setWalkthroughStep] = useState(1);
  const [walkthroughStory, setWalkthroughStory] = useState([]);
  const [currentWalkthroughData, setCurrentWalkthroughData] = useState(null);

  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    if (tabParam && ['assistant', 'passport', 'handover', 'near_miss', 'insights', 'nudges', 'benchmark', 'walkthrough'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [location.search]);

  useEffect(() => {
    loadInitialData();
  }, [selectedWorkerId]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [hList, nmList, insList, wStory, evalRes] = await Promise.all([
        api.getHandovers().catch(() => []),
        api.getNearMisses().catch(() => []),
        api.getSafetyInsights().catch(() => []),
        api.getWalkthroughSteps().catch(() => []),
        api.getBenchmarkEvaluation(60).catch(() => null)
      ]);
      setHandovers(hList || []);
      setNearMisses(nmList || []);
      setInsights(insList || []);
      setWalkthroughStory(wStory || []);
      setBenchmarkResult(evalRes);

      // Load passport for selected worker
      try {
        const pass = await api.getPassport(selectedWorkerId);
        setPassportData(pass);
        setPassportSharingEnabled(pass.sharing_enabled);
      } catch (e) {
        setPassportData(null);
        setPassportSharingEnabled(false);
      }

      // Load nudges
      try {
        const nudges = await api.getWorkerNudges(selectedWorkerId);
        setWorkerNudges(nudges || []);
      } catch (e) {
        setWorkerNudges([]);
      }

      // Load walkthrough step 1
      try {
        const stepRes = await api.executeWalkthroughStep(walkthroughStep);
        setCurrentWalkthroughData(stepRes.data);
      } catch (e) {}
    } catch (err) {
      setErrorMessage(err.message || 'Failed to load innovation lab records.');
    } finally {
      setLoading(false);
    }
  };

  // Chat Submission
  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userText = chatInput.trim();
    const newChat = [...chatMessages, { sender: 'user', text: userText, language: selectedLanguage }];
    setChatMessages(newChat);
    setChatInput('');

    try {
      const res = await api.sendAssistantChat(userText, selectedLanguage, selectedWorkerId);
      setChatMessages([
        ...newChat,
        {
          sender: 'assistant',
          text: res.answer,
          in_scope: res.in_scope,
          disclaimer: res.disclaimer,
          source: res.source_protocol
        }
      ]);
    } catch (err) {
      setChatMessages([
        ...newChat,
        {
          sender: 'assistant',
          text: 'Assistant connection error. Please try again.',
          in_scope: false,
          disclaimer: 'Decision support, not a medical device.'
        }
      ]);
    }
  };

  // Toggle Passport Permission
  const handleTogglePassport = async (val) => {
    try {
      await api.togglePassportPermission(selectedWorkerId, val);
      setPassportSharingEnabled(val);
      setMessage(`Passport sharing ${val ? 'enabled' : 'disabled'} for ${selectedWorkerId}.`);
      if (val) {
        const p = await api.getPassport(selectedWorkerId);
        setPassportData(p);
      } else {
        setPassportData(null);
      }
    } catch (err) {
      setErrorMessage(err.message || 'Failed to update passport permission.');
    }
  };

  // Handover Creation
  const handleCreateHandover = async (e) => {
    e.preventDefault();
    try {
      await api.createHandover({
        shift_name: handoverShift,
        site_id: handoverSite,
        summary_json: {
          active_high_risk: ['Alex Morgan (w-01)'],
          open_incidents: 1,
          peak_wbgt: 32.4
        },
        notes: handoverNotes
      });
      setMessage('Shift handover report created successfully. Pending incoming supervisor acknowledgment.');
      const updated = await api.getHandovers();
      setHandovers(updated);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to create handover.');
    }
  };

  // Acknowledge Handover
  const handleAcknowledgeHandover = async (hoId) => {
    try {
      await api.acknowledgeHandover(hoId, 'Acknowledged on site by incoming supervisor.');
      setMessage(`Handover ${hoId} successfully acknowledged with digital signature.`);
      const updated = await api.getHandovers();
      setHandovers(updated);
    } catch (err) {
      setErrorMessage(err.message || 'Acknowledgment failed.');
    }
  };

  // Report Near Miss
  const handleReportNearMiss = async (e) => {
    e.preventDefault();
    try {
      await api.reportNearMiss({
        site_id: 'site-01',
        zone_id: nmZone,
        category: nmCategory,
        description: nmDesc,
        workload: nmWorkload,
        contributing_factors: nmFactors,
        preventive_actions: nmActions
      });
      setMessage('Near-miss intelligence record submitted and queued for safety review.');
      setNmDesc('');
      setNmFactors('');
      setNmActions('');
      const updated = await api.getNearMisses();
      setNearMisses(updated);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to submit near-miss.');
    }
  };

  // Send Nudge
  const handleSendNudge = async (e) => {
    e.preventDefault();
    try {
      await api.sendNudge({
        worker_id: selectedWorkerId,
        nudge_type: nudgeType,
        message: nudgeMessage,
        is_critical: nudgeCritical
      });
      setMessage(`Advisory nudge dispatched to worker ${selectedWorkerId}.`);
      const updated = await api.getWorkerNudges(selectedWorkerId);
      setWorkerNudges(updated);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to send nudge. (30-minute rate limit active for non-critical advisories).');
    }
  };

  // Walkthrough step controller
  const handleStepWalkthrough = async (stepNum) => {
    try {
      setWalkthroughStep(stepNum);
      const res = await api.executeWalkthroughStep(stepNum);
      setCurrentWalkthroughData(res.data);
    } catch (err) {
      setErrorMessage('Walkthrough step error.');
    }
  };

  const handleResetWalkthrough = async () => {
    try {
      await api.resetWalkthrough();
      setWalkthroughStep(1);
      const res = await api.executeWalkthroughStep(1);
      setCurrentWalkthroughData(res.data);
      setMessage('Judge Walkthrough reset to baseline (Step 1).');
    } catch (err) {
      setErrorMessage('Walkthrough reset error.');
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Navigation */}
      <div className="bg-industrial-900 border border-industrial-800 rounded-xl p-5 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-950 border border-purple-600/40 flex items-center justify-center text-purple-400 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white tracking-wide">Innovation & Research Lab</h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-950 text-purple-300 border border-purple-700">
                  Sprint 3 Breakthroughs
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Heat Safety Passport, Shift Handover Sign-Off, Near-Miss Intelligence, Multilingual AI Assistant, and Judge Walkthrough
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('walkthrough')}
              className="px-3.5 py-2 rounded-lg bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-orange-950/40 transition-all"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Judge Walkthrough</span>
            </button>
          </div>
        </div>

        {/* Global Feedback */}
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

      {/* 2. Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-industrial-800 pb-2">
        {[
          { id: 'assistant', label: 'Multilingual Assistant (en/hi/gu)', icon: Languages },
          { id: 'passport', label: 'Heat Safety Passport', icon: FileCheck2 },
          { id: 'handover', label: 'Shift Handover Sign-Off', icon: Clock },
          { id: 'near_miss', label: 'Near-Miss Intelligence', icon: AlertTriangle },
          { id: 'insights', label: 'AI Safety Insights', icon: Sparkles },
          { id: 'nudges', label: 'Personalised Nudges', icon: Zap },
          { id: 'benchmark', label: '60-Shift Benchmark & Card', icon: Scale },
          { id: 'walkthrough', label: 'Judge Walkthrough Story', icon: Play },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'bg-industrial-800 text-purple-300 border border-purple-500/50 shadow-sm'
                  : 'bg-industrial-900/60 text-slate-400 hover:text-slate-200 hover:bg-industrial-800/50 border border-transparent'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-purple-400' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ---------------------------------------------------------------------- */}
      {/* MODULE 1: MULTILINGUAL SAFETY ASSISTANT */}
      {/* ---------------------------------------------------------------------- */}
      {activeTab === 'assistant' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Card className="flex flex-col h-[520px]">
              <div className="p-3.5 border-b border-industrial-800 flex items-center justify-between bg-industrial-950/60">
                <div className="flex items-center gap-2.5">
                  <Globe className="w-4 h-4 text-sky-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Multilingual Heat Safety Assistant</span>
                </div>
                {/* Language Picker */}
                <div className="flex items-center gap-1.5 bg-industrial-900 border border-industrial-700 rounded-lg p-1 text-xs">
                  <button
                    onClick={() => setSelectedLanguage('en')}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                      selectedLanguage === 'en' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    English
                  </button>
                  <button
                    onClick={() => setSelectedLanguage('hi')}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                      selectedLanguage === 'hi' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    हिन्दी
                  </button>
                  <button
                    onClick={() => setSelectedLanguage('gu')}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                      selectedLanguage === 'gu' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    ગુજરાતી
                  </button>
                </div>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3.5 text-xs">
                {chatMessages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] rounded-xl p-3.5 ${
                        msg.sender === 'user'
                          ? 'bg-sky-600 text-white rounded-br-none shadow-md'
                          : 'bg-industrial-950 border border-industrial-800 text-slate-200 rounded-bl-none shadow-md space-y-2'
                      }`}
                    >
                      <p className="whitespace-pre-line leading-relaxed">{msg.text}</p>
                      {msg.sender === 'assistant' && (
                        <div className="pt-2 border-t border-industrial-800/80 text-[10px] space-y-1">
                          {msg.source && (
                            <div className="text-sky-300 font-mono flex items-center gap-1">
                              <span>Source:</span>
                              <strong>{msg.source}</strong>
                            </div>
                          )}
                          <div className="text-amber-400 font-medium italic">
                            ⚠️ {msg.disclaimer}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Chat Input */}
              <form onSubmit={handleChatSubmit} className="p-3 border-t border-industrial-800 bg-industrial-950 flex items-center gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={
                    selectedLanguage === 'hi'
                      ? 'गर्मी सुरक्षा या कार्य-विश्राम समय के बारे में पूछें...'
                      : selectedLanguage === 'gu'
                      ? 'ગરમી-સુરક્ષા અથવા કાર્ય-વિરામ સમયપત્રક વિશે પૂછો...'
                      : 'Ask about work-rest cycles, acclimatization, or first-aid...'
                  }
                  className="flex-1 bg-industrial-900 border border-industrial-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </button>
              </form>
            </Card>
          </div>

          {/* Sample Prompts & Boundary Enforcer */}
          <div className="space-y-4">
            <Card className="p-4 space-y-3">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-sky-400" />
                <span>In-Scope Sample Prompts</span>
              </h3>
              <p className="text-[11px] text-slate-400">Click any prompt to ask in current active language:</p>
              <div className="space-y-2 text-xs">
                {[
                  'What is the recommended work rest cycle for heavy work in Zone 1A?',
                  'How does the NIOSH 5-day acclimatization schedule work?',
                  'How much electrolyte water should a worker drink in 32°C WBGT?',
                  'What are the first-response steps for heat exhaustion?'
                ].map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setChatInput(prompt);
                    }}
                    className="w-full text-left p-2.5 rounded bg-industrial-950 border border-industrial-800 hover:border-sky-500/50 text-slate-300 hover:text-white transition-colors text-[11px]"
                  >
                    • {prompt}
                  </button>
                ))}
              </div>
            </Card>

            <Card className="p-4 space-y-2 border-red-500/40 bg-red-950/10">
              <h3 className="text-xs font-bold text-red-300 uppercase tracking-wider flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-400" />
                <span>Strict Boundary Enforcement (Rule 3 & 4)</span>
              </h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                The assistant refuses non-heat medical diagnosis, medications, or generic trivia. Test out-of-scope refusal:
              </p>
              <button
                onClick={() => {
                  setChatInput('Can you diagnose my chest pain and recommend medication?');
                }}
                className="w-full text-left p-2 rounded bg-industrial-950 border border-red-700/50 text-red-300 hover:bg-red-950/40 text-[11px] font-mono"
              >
                Test: "Can you diagnose my chest pain and recommend medication?"
              </button>
            </Card>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* MODULE 2: HEAT SAFETY PASSPORT */}
      {/* ---------------------------------------------------------------------- */}
      {activeTab === 'passport' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Portable Heat Safety Passport</h2>
              <p className="text-xs text-slate-400">Verifiable worker thermal resilience profile with privacy permission gating</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">Worker:</span>
              <select
                value={selectedWorkerId}
                onChange={(e) => setSelectedWorkerId(e.target.value)}
                className="bg-industrial-900 border border-industrial-700 rounded-lg px-3 py-1.5 text-xs text-white"
              >
                <option value="w-01">Alex Morgan (Heavy, w-01)</option>
                <option value="w-02">Carlos Mendez (Moderate, w-02)</option>
                <option value="w-03">Priya Sharma (Unacclimatized, w-03)</option>
                <option value="w-04">David Kim (Light, w-04)</option>
              </select>
            </div>
          </div>

          {/* Permission Toggle */}
          <Card className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-industrial-950/60">
            <div className="flex items-center gap-3">
              <FileCheck2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-white">Worker Consent for Heat Safety Passport Sharing</h4>
                <p className="text-[11px] text-slate-400">
                  Worker authorization is mandatory before generating or exporting biometric resilience credentials to external health databases.
                </p>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={passportSharingEnabled}
                onChange={(e) => handleTogglePassport(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-industrial-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 relative" />
              <span className="text-xs font-semibold text-slate-300">
                {passportSharingEnabled ? 'Sharing Enabled' : 'Sharing Disabled'}
              </span>
            </label>
          </Card>

          {/* Passport Content or Disabled Banner */}
          {!passportSharingEnabled || !passportData ? (
            <Card className="p-12 text-center border-amber-600/40 bg-amber-950/10 space-y-3">
              <ShieldAlert className="w-8 h-8 text-amber-400 mx-auto" />
              <h3 className="text-sm font-bold text-white">Heat Safety Passport Sharing Disabled</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                The worker has withheld sharing permissions for their portable heat profile. Toggle the permission above to generate or print the official Heat Safety Passport.
              </p>
            </Card>
          ) : (
            <div className="max-w-2xl mx-auto">
              <Card className="border-emerald-600/50 bg-gradient-to-b from-industrial-900 to-industrial-950 p-6 shadow-2xl space-y-5 print:border-black print:text-black">
                {/* Passport Card Header */}
                <div className="flex items-center justify-between border-b border-industrial-800 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-950 border border-emerald-600/40 flex items-center justify-center text-emerald-400">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-white tracking-wider">OCCUPATIONAL HEAT SAFETY PASSPORT</h3>
                      <p className="text-[11px] text-slate-400 font-mono">ID: {passportData.passport_id}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => window.print()}
                    className="px-3 py-1.5 rounded-lg bg-industrial-900 hover:bg-industrial-800 border border-industrial-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 print:hidden"
                  >
                    <Printer className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Print Card</span>
                  </button>
                </div>

                {/* Worker Identity */}
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Worker Name</span>
                    <strong className="text-white text-sm">{passportData.worker_name}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Worker ID</span>
                    <strong className="text-sky-300 font-mono text-sm">{passportData.worker_id}</strong>
                  </div>
                </div>

                {/* Resilience Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-industrial-950 border border-industrial-800">
                    <span className="text-slate-400 block text-[10px]">Acclimatization</span>
                    <strong className="text-emerald-400 font-semibold">{passportData.acclimatization_stage}</strong>
                  </div>
                  <div className="p-3 rounded-lg bg-industrial-950 border border-industrial-800">
                    <span className="text-slate-400 block text-[10px]">Resting HR Baseline</span>
                    <strong className="text-white font-mono">{passportData.baseline_resting_hr} bpm</strong>
                  </div>
                  <div className="p-3 rounded-lg bg-industrial-950 border border-industrial-800">
                    <span className="text-slate-400 block text-[10px]">Sweat Rate Estimate</span>
                    <strong className="text-sky-300 font-mono">{passportData.estimated_sweat_rate_l_hr} L/hr</strong>
                  </div>
                  <div className="p-3 rounded-lg bg-industrial-950 border border-industrial-800">
                    <span className="text-slate-400 block text-[10px]">Max Continuous Work</span>
                    <strong className="text-amber-400 font-semibold">{passportData.max_recommended_continuous_work_minutes} min bracket</strong>
                  </div>
                  <div className="p-3 rounded-lg bg-industrial-950 border border-industrial-800">
                    <span className="text-slate-400 block text-[10px]">Hydration Streak</span>
                    <strong className="text-emerald-400 font-mono">{passportData.hydration_compliance_streak_days} days verified</strong>
                  </div>
                  <div className="p-3 rounded-lg bg-industrial-950 border border-industrial-800">
                    <span className="text-slate-400 block text-[10px]">Safe Recovery Profile</span>
                    <strong className="text-slate-300 text-[11px]">{passportData.safe_cooling_recovery_profile}</strong>
                  </div>
                </div>

                <div className="text-[10px] text-slate-500 text-center pt-2 border-t border-industrial-800">
                  {passportData.disclaimer} • Standardized ISO 7243 / NIOSH (2016)
                </div>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* MODULE 3: SHIFT HANDOVER REPORTS & SIGN-OFF */}
      {/* ---------------------------------------------------------------------- */}
      {activeTab === 'handover' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Create Handover */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <Clock className="w-5 h-5 text-sky-400" />
              <div>
                <h3 className="text-sm font-bold text-white">Generate End-of-Shift Handover Report</h3>
                <p className="text-xs text-slate-400">Transfer thermal load intelligence to incoming shift leadership</p>
              </div>
            </div>
            <form onSubmit={handleCreateHandover} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">Shift Name</label>
                  <select
                    value={handoverShift}
                    onChange={(e) => setHandoverShift(e.target.value)}
                    className="w-full bg-industrial-950 border border-industrial-700 rounded p-2 text-white"
                  >
                    <option value="Morning">Morning (06:00-14:00)</option>
                    <option value="Afternoon">Afternoon (14:00-22:00)</option>
                    <option value="Night">Night (22:00-06:00)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Site</label>
                  <select
                    value={handoverSite}
                    onChange={(e) => setHandoverSite(e.target.value)}
                    className="w-full bg-industrial-950 border border-industrial-700 rounded p-2 text-white"
                  >
                    <option value="site-01">Plant 1: Steel Smelter</option>
                    <option value="site-02">Plant 2: Logistics Hub</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Operational Hand-Off Notes</label>
                <textarea
                  rows="3"
                  value={handoverNotes}
                  onChange={(e) => setHandoverNotes(e.target.value)}
                  className="w-full bg-industrial-950 border border-industrial-700 rounded p-2 text-white"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold transition-colors"
              >
                Submit End-of-Shift Handover
              </button>
            </form>
          </Card>

          {/* Recent Handovers & Acknowledgment Queue */}
          <Card className="p-5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center justify-between">
              <span>Shift Handover Queue & Sign-Offs</span>
              <span className="text-xs font-mono text-slate-400">{handovers.length} records</span>
            </h3>
            <div className="space-y-3.5 max-h-96 overflow-y-auto">
              {handovers.map((ho) => {
                const isPending = ho.status === 'Pending Acknowledgment';
                return (
                  <div key={ho.id} className="p-3.5 rounded-lg bg-industrial-950 border border-industrial-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{ho.shift_name} Shift</span>
                        <span className="text-[10px] text-slate-400 font-mono">({ho.shift_date})</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        isPending ? 'bg-amber-950 text-amber-400 border border-amber-600' : 'bg-emerald-950 text-emerald-400 border border-emerald-600'
                      }`}>
                        {ho.status}
                      </span>
                    </div>
                    <p className="text-slate-300 text-[11px] italic">"{ho.notes}"</p>
                    <div className="text-[10px] text-slate-400 flex justify-between items-center pt-1 border-t border-industrial-800">
                      <span>Outgoing: <strong className="text-slate-300">{ho.outgoing_supervisor_name}</strong></span>
                      {ho.incoming_supervisor_name && (
                        <span>Ack By: <strong className="text-emerald-400">{ho.incoming_supervisor_name}</strong></span>
                      )}
                    </div>

                    {isPending && (
                      <button
                        onClick={() => handleAcknowledgeHandover(ho.id)}
                        className="w-full mt-2 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Sign & Acknowledge Handover (Incoming Lead)</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* MODULE 4: NEAR-MISS INTELLIGENCE REGISTRY */}
      {/* ---------------------------------------------------------------------- */}
      {activeTab === 'near_miss' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Near-Miss Report Form */}
            <Card className="p-5 space-y-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>Log Near-Miss Incident</span>
              </h3>
              <form onSubmit={handleReportNearMiss} className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-slate-300 mb-1">Category</label>
                  <select
                    value={nmCategory}
                    onChange={(e) => setNmCategory(e.target.value)}
                    className="w-full bg-industrial-950 border border-industrial-700 rounded p-2 text-white"
                  >
                    <option value="Dehydration Onset">Dehydration Onset</option>
                    <option value="Heat Exhaustion Prodrome">Heat Exhaustion Prodrome</option>
                    <option value="Cooling Station Access Delay">Cooling Station Access Delay</option>
                    <option value="PPE Thermal Trap">PPE Thermal Trap</option>
                    <option value="Exertion Spike">Exertion Spike</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Zone Location</label>
                  <select
                    value={nmZone}
                    onChange={(e) => setNmZone(e.target.value)}
                    className="w-full bg-industrial-950 border border-industrial-700 rounded p-2 text-white"
                  >
                    <option value="zone-01">Zone 1A: Blast Furnace & Pouring Deck</option>
                    <option value="zone-02">Zone 1B: Casting & Mold Cooling Annex</option>
                    <option value="zone-04">Zone 2A: High-Bay Loading & Cross-Dock</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Description of Incident</label>
                  <textarea
                    rows="2"
                    value={nmDesc}
                    onChange={(e) => setNmDesc(e.target.value)}
                    placeholder="Worker reported sudden lightheadedness near the ladle..."
                    className="w-full bg-industrial-950 border border-industrial-700 rounded p-2 text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Contributing Factors</label>
                  <input
                    type="text"
                    value={nmFactors}
                    onChange={(e) => setNmFactors(e.target.value)}
                    placeholder="Radiant heat spike, distance to water station..."
                    className="w-full bg-industrial-950 border border-industrial-700 rounded p-2 text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Preventive Actions Taken</label>
                  <input
                    type="text"
                    value={nmActions}
                    onChange={(e) => setNmActions(e.target.value)}
                    placeholder="Deployed portable insulated electrolyte cooler..."
                    className="w-full bg-industrial-950 border border-industrial-700 rounded p-2 text-white"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold transition-colors"
                >
                  Submit Near-Miss Report
                </button>
              </form>
            </Card>

            {/* Near-Miss Intelligence Clustering */}
            <div className="lg:col-span-2 space-y-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center justify-between">
                <span>Near-Miss Intelligence Registry</span>
                <span className="text-xs font-mono text-slate-400">{nearMisses.length} records</span>
              </h3>
              <div className="space-y-3.5">
                {nearMisses.map((nm) => (
                  <Card key={nm.id} className="p-4 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-600">
                          {nm.category}
                        </span>
                        <span className="font-mono text-slate-400 text-[11px]">{nm.id}</span>
                      </div>
                      <span className="font-mono text-slate-400 text-[11px]">{new Date(nm.timestamp).toLocaleDateString()}</span>
                    </div>
                    <p className="text-xs text-white leading-relaxed">{nm.description}</p>
                    <div className="grid grid-cols-2 gap-3 text-[11px] pt-2 border-t border-industrial-800">
                      <div>
                        <span className="text-slate-500 block text-[10px]">Contributing Root Factors:</span>
                        <span className="text-slate-300">{nm.contributing_factors}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Preventive Corrective Action:</span>
                        <span className="text-emerald-400 font-medium">{nm.preventive_actions}</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-slate-500 pt-1">
                      <span>Reporter: {nm.reporter_name}</span>
                      <span className="font-mono">Proxy WBGT: {nm.wbgt_proxy}°C</span>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* MODULE 5: AI SAFETY INSIGHT GENERATOR */}
      {/* ---------------------------------------------------------------------- */}
      {activeTab === 'insights' && (
        <div className="space-y-5">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Rule-Driven AI Safety Insights</h2>
            <p className="text-xs text-slate-400">Prescriptive interventions with transparent historical data evidence</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {insights.map((ins) => (
              <Card key={ins.id} className="p-5 space-y-3.5 border-sky-600/30">
                <div className="flex items-center justify-between">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    ins.severity === 'High' ? 'bg-red-950 text-red-300 border border-red-600' : 'bg-amber-950 text-amber-300 border border-amber-600'
                  }`}>
                    {ins.severity} Severity
                  </span>
                  <span className="text-xs font-mono text-sky-400 font-semibold">{ins.category}</span>
                </div>
                <h3 className="text-sm font-bold text-white">{ins.title}</h3>
                <div className="p-3 rounded-lg bg-industrial-950 border border-industrial-800 space-y-1 text-xs">
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Prescriptive Recommendation:</span>
                  <p className="text-emerald-300 font-medium">{ins.recommendation}</p>
                </div>
                <div className="text-[11px] text-slate-400 space-y-1">
                  <span className="text-slate-500 block text-[10px] font-semibold uppercase">Visible Data Evidence:</span>
                  <p className="italic bg-industrial-950 p-2.5 rounded border border-industrial-800 text-slate-300">{ins.evidence}</p>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-industrial-800">
                  <span>Impact: <strong className="text-slate-200">{ins.impact}</strong></span>
                  <span className="font-mono text-sky-400">Confidence: {(ins.confidence * 100).toFixed(0)}%</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* MODULE 6: PERSONALISED SAFETY NUDGES */}
      {/* ---------------------------------------------------------------------- */}
      {activeTab === 'nudges' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-5 space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Dispatch Worker Safety Advisory Nudge</span>
            </h3>
            <p className="text-xs text-slate-400">
              Proactive micro-interventions. Non-critical nudges are strictly rate-limited to 1 per 30 minutes to eliminate alert fatigue. Critical alerts are never throttled.
            </p>
            <form onSubmit={handleSendNudge} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 mb-1">Target Worker</label>
                <select
                  value={selectedWorkerId}
                  onChange={(e) => setSelectedWorkerId(e.target.value)}
                  className="w-full bg-industrial-950 border border-industrial-700 rounded p-2 text-white"
                >
                  <option value="w-01">Alex Morgan (Heavy, w-01)</option>
                  <option value="w-02">Carlos Mendez (Moderate, w-02)</option>
                  <option value="w-03">Priya Sharma (Unacclimatized, w-03)</option>
                  <option value="w-04">David Kim (Light, w-04)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Advisory Category</label>
                <select
                  value={nudgeType}
                  onChange={(e) => setNudgeType(e.target.value)}
                  className="w-full bg-industrial-950 border border-industrial-700 rounded p-2 text-white"
                >
                  <option value="Hydration">Hydration Reminder</option>
                  <option value="Rest Break">Shaded Rest Advisory</option>
                  <option value="Acclimatization">Acclimatization Ramp Enforcement</option>
                  <option value="Buddy Check">Buddy Pairing Check</option>
                  <option value="Emergency Escalation">Emergency Critical Escalation</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Message Body</label>
                <textarea
                  rows="3"
                  value={nudgeMessage}
                  onChange={(e) => setNudgeMessage(e.target.value)}
                  className="w-full bg-industrial-950 border border-industrial-700 rounded p-2 text-white"
                  required
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="critNudge"
                  checked={nudgeCritical}
                  onChange={(e) => setNudgeCritical(e.target.checked)}
                  className="rounded bg-industrial-950 border-industrial-700 text-red-600 focus:ring-0"
                />
                <label htmlFor="critNudge" className="text-xs text-red-300 font-semibold cursor-pointer">
                  Mark as Critical Alert (Bypasses 30-minute rate limit)
                </label>
              </div>

              <button
                type="submit"
                className="w-full py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold transition-colors"
              >
                Dispatch Personalised Nudge
              </button>
            </form>
          </Card>

          {/* Active Nudges Log */}
          <Card className="p-5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center justify-between">
              <span>Dispatched Nudges History</span>
              <span className="text-xs font-mono text-slate-400">{workerNudges.length} sent</span>
            </h3>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {workerNudges.map((n) => (
                <div key={n.id} className="p-3 rounded-lg bg-industrial-950 border border-industrial-800 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      n.is_critical ? 'bg-red-950 text-red-300 border border-red-600' : 'bg-sky-950 text-sky-300 border border-sky-600'
                    }`}>
                      {n.nudge_type} {n.is_critical ? '(CRITICAL)' : ''}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">{new Date(n.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-slate-200">{n.message}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* MODULE 7: 60-SHIFT BENCHMARK EVALUATION & MODEL CARD */}
      {/* ---------------------------------------------------------------------- */}
      {activeTab === 'benchmark' && benchmarkResult && (
        <div className="space-y-6">
          <Card className="p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Scale className="w-4 h-4 text-sky-400" />
                  <span>60-Shift Tri-Modal Detection Benchmark</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Evaluated across 60 seeded industrial shifts ({benchmarkResult.total_timesteps} timesteps) with injected thermal distress events
                </p>
              </div>
              <span className="px-3 py-1 rounded bg-amber-950/60 text-amber-300 border border-amber-600/50 text-xs font-semibold">
                Label: {benchmarkResult.label}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-industrial-950 text-slate-400 border-b border-industrial-800">
                  <tr>
                    <th className="p-3">Safety Detection Methodology</th>
                    <th className="p-3">Precision</th>
                    <th className="p-3">Recall</th>
                    <th className="p-3">F1 Score</th>
                    <th className="p-3">Median Advance Warning Lead Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-industrial-800/60 text-slate-300">
                  <tr className="hover:bg-industrial-800/20">
                    <td className="p-3 font-semibold text-slate-400">
                      (a) Ambient Air Temp &gt; 40.0°C (Simple Threshold)
                    </td>
                    <td className="p-3 font-mono">{benchmarkResult.method_comparison.air_temp_threshold_40c.precision}</td>
                    <td className="p-3 font-mono text-red-400">{benchmarkResult.method_comparison.air_temp_threshold_40c.recall}</td>
                    <td className="p-3 font-mono">{benchmarkResult.method_comparison.air_temp_threshold_40c.f1_score}</td>
                    <td className="p-3 font-mono text-slate-400">{benchmarkResult.method_comparison.air_temp_threshold_40c.median_lead_time_minutes} min</td>
                  </tr>
                  <tr className="hover:bg-industrial-800/20">
                    <td className="p-3 font-semibold text-sky-300">
                      (b) Deterministic Personal Rules (ISO 7243 / ACGIH Engine)
                    </td>
                    <td className="p-3 font-mono">{benchmarkResult.method_comparison.personal_rules.precision}</td>
                    <td className="p-3 font-mono text-emerald-400 font-bold">{benchmarkResult.method_comparison.personal_rules.recall}</td>
                    <td className="p-3 font-mono">{benchmarkResult.method_comparison.personal_rules.f1_score}</td>
                    <td className="p-3 font-mono text-emerald-400 font-bold">{benchmarkResult.method_comparison.personal_rules.median_lead_time_minutes} min advance warning</td>
                  </tr>
                  <tr className="hover:bg-industrial-800/20 bg-emerald-950/20">
                    <td className="p-3 font-semibold text-emerald-300">
                      (c) Deterministic Rules + ML Anomaly Notices (Hybrid System)
                    </td>
                    <td className="p-3 font-mono">{benchmarkResult.method_comparison.rules_plus_ml.precision}</td>
                    <td className="p-3 font-mono text-emerald-300 font-bold">{benchmarkResult.method_comparison.rules_plus_ml.recall}</td>
                    <td className="p-3 font-mono">{benchmarkResult.method_comparison.rules_plus_ml.f1_score}</td>
                    <td className="p-3 font-mono text-emerald-300 font-bold">{benchmarkResult.method_comparison.rules_plus_ml.median_lead_time_minutes} min advance warning</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          {/* Model Card */}
          <Card className="p-5 space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Official Model Card & Architecture</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300">
              <div className="p-3 rounded-lg bg-industrial-950 border border-industrial-800 space-y-1">
                <span className="text-slate-500 block text-[10px]">Model Name & Version</span>
                <strong className="text-white text-xs">{benchmarkResult.model_card.model_name}</strong>
                <p className="text-slate-400 font-mono text-[11px]">{benchmarkResult.model_card.model_version}</p>
              </div>
              <div className="p-3 rounded-lg bg-industrial-950 border border-industrial-800 space-y-1">
                <span className="text-slate-500 block text-[10px]">Deterministic Core</span>
                <p className="text-slate-300">{benchmarkResult.model_card.architecture.deterministic_core}</p>
              </div>
              <div className="p-3 rounded-lg bg-industrial-950 border border-industrial-800 space-y-1">
                <span className="text-slate-500 block text-[10px]">ML Anomaly Detector</span>
                <p className="text-slate-300">{benchmarkResult.model_card.architecture.anomaly_detector}</p>
              </div>
              <div className="p-3 rounded-lg bg-industrial-950 border border-industrial-800 space-y-1">
                <span className="text-slate-500 block text-[10px]">Digital Twin Core</span>
                <p className="text-slate-300">{benchmarkResult.model_card.architecture.digital_twin}</p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-industrial-950 border border-industrial-800 text-xs text-slate-300 space-y-2">
              <h4 className="font-bold text-amber-300">Safety & Ethical Invariants Enforced in Code:</h4>
              <ul className="list-disc list-inside space-y-1 text-slate-400 text-[11px]">
                {benchmarkResult.model_card.safety_and_ethical_invariants.map((inv, idx) => (
                  <li key={idx}>{inv}</li>
                ))}
              </ul>
            </div>
          </Card>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* MODULE 8: JUDGE WALKTHROUGH SCRIPTED STORY */}
      {/* ---------------------------------------------------------------------- */}
      {activeTab === 'walkthrough' && (
        <div className="space-y-6">
          <Card className="p-5 space-y-5 border-orange-500/50 bg-gradient-to-b from-industrial-900 to-industrial-950">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-950 text-orange-300 border border-orange-600">
                    JUDGE WALKTHROUGH MODE
                  </span>
                  <span className="text-xs font-mono text-slate-400">Fixed Seed: 42</span>
                </div>
                <h3 className="text-base font-bold text-white mt-1">End-to-End Operational Safety Lifecycle Walkthrough</h3>
                <p className="text-xs text-slate-400">Step-by-step scripted story demonstrating all platform safeguards in action</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleResetWalkthrough}
                  className="px-3 py-1.5 rounded-lg bg-industrial-900 hover:bg-industrial-800 border border-industrial-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset to Step 1</span>
                </button>
              </div>
            </div>

            {/* Stepper Header */}
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {walkthroughStory.map((step) => {
                const isCurrent = step.step === walkthroughStep;
                const isPast = step.step < walkthroughStep;
                return (
                  <button
                    key={step.step}
                    onClick={() => handleStepWalkthrough(step.step)}
                    className={`p-2 rounded-lg text-center border transition-all ${
                      isCurrent
                        ? 'bg-orange-950 border-orange-500 text-orange-200 font-bold shadow-md'
                        : isPast
                        ? 'bg-industrial-950 border-emerald-600/60 text-emerald-400'
                        : 'bg-industrial-950 border-industrial-800 text-slate-500'
                    }`}
                  >
                    <span className="text-[10px] block font-mono">Step {step.step}</span>
                    <span className="text-[11px] truncate block">{step.title.split(' ')[0]}</span>
                  </button>
                );
              })}
            </div>

            {/* Active Step Details */}
            {currentWalkthroughData && (
              <div className="p-5 rounded-xl bg-industrial-950 border border-industrial-800 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-industrial-800 pb-3">
                  <div>
                    <span className="text-xs font-mono text-orange-400 font-bold uppercase tracking-wider">
                      Step {currentWalkthroughData.step} of 8: {currentWalkthroughData.title}
                    </span>
                    <h4 className="text-base font-bold text-white mt-0.5">{currentWalkthroughData.narration}</h4>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-mono text-slate-400 bg-industrial-900 px-2.5 py-1 rounded border border-industrial-800">
                      {currentWalkthroughData.time}
                    </span>
                    <RiskBadge level={currentWalkthroughData.risk_level} size="sm" />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-2.5 rounded bg-industrial-900 border border-industrial-800">
                    <span className="text-slate-500 block text-[10px]">Worker & Exertion</span>
                    <strong className="text-white">{currentWalkthroughData.worker}</strong>
                  </div>
                  <div className="p-2.5 rounded bg-industrial-900 border border-industrial-800">
                    <span className="text-slate-500 block text-[10px]">Zone Location</span>
                    <strong className="text-slate-200 text-[11px]">{currentWalkthroughData.zone}</strong>
                  </div>
                  <div className="p-2.5 rounded bg-industrial-900 border border-industrial-800">
                    <span className="text-slate-500 block text-[10px]">Ambient & WBGT Proxy</span>
                    <strong className="text-sky-300 font-mono">{currentWalkthroughData.ambient_temp_c}°C | {currentWalkthroughData.wbgt_val}°C</strong>
                  </div>
                  <div className="p-2.5 rounded bg-industrial-900 border border-industrial-800">
                    <span className="text-slate-500 block text-[10px]">Heart Rate / Core Proxy</span>
                    <strong className="text-red-300 font-mono">{currentWalkthroughData.heart_rate} bpm | {currentWalkthroughData.core_temp_proxy}°C</strong>
                  </div>
                </div>

                {/* Step Specific Notes */}
                {currentWalkthroughData.ml_notice && (
                  <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-600/50 text-amber-200 text-xs flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>{currentWalkthroughData.ml_notice}</span>
                  </div>
                )}
                {currentWalkthroughData.alert_id && (
                  <div className="p-3 rounded-lg bg-orange-950/40 border border-orange-600/50 text-orange-200 text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Flame className="w-4 h-4 text-orange-400 shrink-0" />
                      <span>Alert Activated: <strong>{currentWalkthroughData.alert_id}</strong> (High Thermal Burden)</span>
                    </div>
                    <span className="text-[11px] font-mono text-orange-400">Audio Alarm Synthesized</span>
                  </div>
                )}
                {currentWalkthroughData.clearance_id && (
                  <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-600/50 text-emerald-200 text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Rule 8 Return-to-Work Clearance: <strong>{currentWalkthroughData.clearance_id}</strong></span>
                    </div>
                    <span className="text-emerald-300 font-semibold">Signatory: {currentWalkthroughData.signatory}</span>
                  </div>
                )}

                {/* Step Navigation Controls */}
                <div className="flex items-center justify-between pt-3 border-t border-industrial-800">
                  <button
                    onClick={() => handleStepWalkthrough(Math.max(1, walkthroughStep - 1))}
                    disabled={walkthroughStep === 1}
                    className="px-3 py-1.5 rounded bg-industrial-900 hover:bg-industrial-800 text-slate-300 text-xs font-semibold disabled:opacity-40"
                  >
                    ← Previous Step
                  </button>
                  <span className="text-xs font-mono text-slate-500">Step {walkthroughStep} of 8</span>
                  <button
                    onClick={() => handleStepWalkthrough(Math.min(8, walkthroughStep + 1))}
                    disabled={walkthroughStep === 8}
                    className="px-3 py-1.5 rounded bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold disabled:opacity-40"
                  >
                    Next Step →
                  </button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

export default Innovation;
