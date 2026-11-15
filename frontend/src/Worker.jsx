import React, { useState, useEffect, useRef } from 'react';
import {
  Heart,
  Droplets,
  Clock,
  ShieldAlert,
  AlertTriangle,
  Flame,
  CheckCircle2,
  RefreshCw,
  User,
  MapPin,
  Activity,
  Maximize2,
  Minimize2,
  FileCheck,
  Phone,
  PhoneCall,
  AlertOctagon,
  Share2,
  HelpCircle,
  ThermometerSun,
  X
} from 'lucide-react';
import { useAuth } from './AuthContext';
import { api } from './api';
import {
  RiskBadge,
  SourceTag,
  WbgtLabelWithTooltip,
  Card,
  Button,
  Modal,
  StatCard
} from './ui';

export function Worker() {
  const { user } = useAuth();
  const [mobileOnly, setMobileOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [workerData, setWorkerData] = useState(null);
  const [riskData, setRiskData] = useState(null);
  const [zoneData, setZoneData] = useState(null);
  const [waterLogged, setWaterLogged] = useState(1250);
  const [countdownMinutes, setCountdownMinutes] = useState(18);
  const [countdownSeconds, setCountdownSeconds] = useState(45);

  // Symptoms Check-in State
  const [selectedSymptoms, setSelectedSymptoms] = useState([]);
  const [checkInStatus, setCheckInStatus] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Sprint 2 Emergency SOS States
  const [isPressing, setIsPressing] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0); // 0 to 100%
  const [countdownActive, setCountdownActive] = useState(false);
  const [countdownTime, setCountdownTime] = useState(5);
  const [activeSosEvent, setActiveSosEvent] = useState(null);
  const [emergencyScreenActive, setEmergencyScreenActive] = useState(false);
  const [phoneConsentOpen, setPhoneConsentOpen] = useState(false);
  const [workerPhoneInput, setWorkerPhoneInput] = useState('');

  const holdTimerRef = useRef(null);
  const holdStartRef = useRef(null);
  const countdownTimerRef = useRef(null);

  const workerId = user?.role === 'worker' ? (user.worker_id || 'w-01') : 'w-01';

  // Sprint 2 Critical Symptom Quick-Picker (Raises emergency directly)
  const criticalSymptoms = [
    { id: 'confusion', label: 'Confusion', desc: 'Disoriented / slurred words' },
    { id: 'collapsed', label: 'Collapsed', desc: 'Fainted / fell to floor' },
    { id: 'seizure', label: 'Seizure', desc: 'Involuntary muscle tremors' },
    { id: 'severe_dizziness', label: 'Severe Dizziness', desc: 'Cannot stand or balance' },
    { id: 'cannot_continue', label: 'Cannot Continue', desc: 'Severe heat exhaustion' },
  ];

  const standardSymptoms = [
    { id: 'dizziness', label: 'Mild lightheadedness' },
    { id: 'headache', label: 'Throbbing headache' },
    { id: 'nausea', label: 'Nausea or stomach cramp' },
    { id: 'fatigue', label: 'Extreme tiredness' },
    { id: 'heavy_sweating', label: 'Profuse cold sweat' },
  ];

  async function loadWorkerTelemetry() {
    setLoading(true);
    try {
      const w = await api.getWorker(workerId);
      setWorkerData(w);
      setWaterLogged(w.water_today_ml || 1250);
      if (w.phone && !w.phone.includes('*')) {
        setWorkerPhoneInput(w.phone);
      }

      const r = await api.getCurrentRisk(workerId);
      setRiskData(r);

      const zones = await api.getZones();
      const myZone = zones.find((z) => z.id === w.zone_id) || zones[0];
      setZoneData(myZone);

      // Check for active SOS events for this worker
      const activeEvents = await api.sos.getActive();
      const myActive = activeEvents.find((e) => e.worker_id === workerId);
      if (myActive) {
        setActiveSosEvent(myActive);
        setEmergencyScreenActive(true);
      }
    } catch (err) {
      console.warn("Worker telemetry fallback to baseline:", err);
      setWorkerData({
        id: 'w-01',
        full_name: user?.full_name || 'Alex Morgan',
        zone_id: 'zone-01',
        zone_name: 'Zone 1A: Blast Furnace & Pouring Floor',
        workload: 'heavy',
        acclimatization_status: 'acclimatized',
        acclimatized: true,
        base_heart_rate: 72,
        current_heart_rate: 142,
        ppe_type: 'cotton_coveralls',
        operational_status: 'Active',
        risk_level: 'High',
        water_today_ml: 1250,
        phone: '+1-555-019-2834',
        accommodation_notes: 'Mandatory 15-minute shaded cooling shelter break every 45 minutes; buddy pairing required.'
      });
      setRiskData({
        level: 'High',
        score: 76.5,
        factors: [
          'Estimated WBGT (29.2°C) exceeds personal heat threshold (26.0°C)',
          'Heavy metabolic workload in furnace vicinity',
          'Elevated heart rate delta (+34 bpm over baseline)'
        ],
        why: [
          'Ambient heat strain exceeds NIOSH Recommended Alert Limit (RAL). Immediate cooling rotation recommended.'
        ],
        actions: [
          'Rotate to shaded cooling shelter immediately for a 15-minute rest cycle.',
          'Consume 250ml chilled electrolyte solution or water.',
          'Pair with designated safety buddy to monitor for early heat symptoms.'
        ]
      });
      setZoneData({
        id: 'zone-01',
        name: 'Zone 1A: Blast Furnace & Pouring Floor',
        temp_c: 34.2,
        humidity_pct: 58.0,
        wbgt_val: 29.2,
        is_measured: false,
        source_tag: 'Simulated'
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadWorkerTelemetry();
  }, [workerId]);

  // Countdown timer simulation for next hydration break
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdownSeconds((prevSec) => {
        if (prevSec > 0) return prevSec - 1;
        setCountdownMinutes((prevMin) => (prevMin > 0 ? prevMin - 1 : 45));
        return 59;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // ---------------------------------------------------------------------------
  // Press-and-Hold 1.5s Progress Ring Implementation
  // ---------------------------------------------------------------------------
  const startHold = () => {
    if (emergencyScreenActive || countdownActive) return;
    setIsPressing(true);
    setHoldProgress(0);
    holdStartRef.current = Date.now();

    holdTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - holdStartRef.current;
      const progress = Math.min(100, (elapsed / 1500) * 100);
      setHoldProgress(progress);

      if (elapsed >= 1500) {
        clearInterval(holdTimerRef.current);
        setIsPressing(false);
        setHoldProgress(100);
        triggerCountdownStage();
      }
    }, 30);
  };

  const cancelHold = () => {
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
    }
    setIsPressing(false);
    setHoldProgress(0);
  };

  // ---------------------------------------------------------------------------
  // 5-Second Full-Screen Countdown Stage
  // ---------------------------------------------------------------------------
  const triggerCountdownStage = () => {
    setCountdownActive(true);
    setCountdownTime(5);

    countdownTimerRef.current = setInterval(() => {
      setCountdownTime((prev) => {
        if (prev <= 1) {
          clearInterval(countdownTimerRef.current);
          setCountdownActive(false);
          executeSosTrigger(['manual_button_hold_1.5s']);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const cancelCountdown = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
    }
    setCountdownActive(false);
    setCheckInStatus('Emergency SOS countdown cancelled.');
    setTimeout(() => setCheckInStatus(''), 3000);
  };

  // ---------------------------------------------------------------------------
  // Execute SOS Trigger (Dispatches Multi-Channel SOS)
  // ---------------------------------------------------------------------------
  const executeSosTrigger = async (symptoms = []) => {
    setLoading(true);
    setErrorMessage('');
    let lat = 40.7128;
    let lon = -74.0060;

    // Optional location with user permission
    if (navigator.geolocation) {
      try {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 });
        });
        lat = pos.coords.latitude;
        lon = pos.coords.longitude;
      } catch (e) {
        // Fallback to zone coordinates
      }
    }

    try {
      const res = await api.sos.trigger({
        worker_id: workerId,
        symptoms: symptoms,
        latitude: lat,
        longitude: lon,
        lang: 'en'
      });

      setActiveSosEvent(res.event);
      setEmergencyScreenActive(true);
      setRiskData((prev) => ({
        ...prev,
        level: 'Emergency',
        why: ['Worker activated Emergency SOS: possible heat-related emergency flagged.'],
        actions: ['STOP WORK IMMEDIATELY. Move to shaded cool area, unbutton PPE, apply cold packs, summon Site Medic.']
      }));
    } catch (err) {
      if (err.message && err.message.includes('429')) {
        setErrorMessage('Rate limit reached: Maximum 3 SOS triggers per worker per 10 minutes. Dial 112 or 108 directly.');
      } else {
        setErrorMessage(err.message || 'Error triggering SOS dispatch.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Quick-Picker Trigger (Raises Emergency directly)
  // ---------------------------------------------------------------------------
  const handleQuickSymptomEmergency = (sym) => {
    executeSosTrigger([sym.id]);
  };

  // ---------------------------------------------------------------------------
  // Cancel Active SOS ('I am safe' button -> logged as false-trigger)
  // ---------------------------------------------------------------------------
  const handleCancelActiveSos = async () => {
    if (!activeSosEvent) return;
    try {
      setLoading(true);
      await api.sos.cancel(activeSosEvent.id, 'Worker self-reported safe (I am safe clicked)');
      setEmergencyScreenActive(false);
      setActiveSosEvent(null);
      setCheckInStatus('SOS cancelled and logged as false-trigger. Standard monitoring resumed.');
      setTimeout(() => setCheckInStatus(''), 4000);
      loadWorkerTelemetry();
    } catch (err) {
      setErrorMessage(err.message || 'Error cancelling SOS.');
    } finally {
      setLoading(false);
    }
  };

  // Water break logger
  const handleLogWater = async () => {
    const newTotal = waterLogged + 250;
    setWaterLogged(newTotal);
    try {
      await api.workerCheckIn(workerId, {
        water_intake_ml: 250,
        symptoms: selectedSymptoms,
      });
      setCheckInStatus('Logged +250ml hydration.');
      setTimeout(() => setCheckInStatus(''), 3000);
    } catch (e) {
      setCheckInStatus('Hydration logged locally (offline).');
      setTimeout(() => setCheckInStatus(''), 3000);
    }
  };

  // Save phone number to consent
  const handleSavePhoneConsent = async (e) => {
    e.preventDefault();
    try {
      await api.submitConsent({
        worker_id: workerId,
        consent_given: true,
        phone: workerPhoneInput
      });
      setPhoneConsentOpen(false);
      setCheckInStatus('Emergency contact phone encrypted and securely stored.');
      setTimeout(() => setCheckInStatus(''), 4000);
    } catch (err) {
      setErrorMessage('Failed to save phone number.');
    }
  };

  // ---------------------------------------------------------------------------
  // RENDER: Full-Screen 5s Countdown Takeover
  // ---------------------------------------------------------------------------
  if (countdownActive) {
    return (
      <div className="fixed inset-0 z-50 bg-red-950 flex flex-col items-center justify-between p-6 text-white animate-pulse">
        <div className="text-center pt-8 space-y-2">
          <div className="inline-flex p-4 rounded-full bg-red-900 border-2 border-red-500 shadow-2xl">
            <Flame className="w-12 h-12 text-amber-300 animate-bounce" />
          </div>
          <h1 className="text-2xl font-black tracking-wide uppercase">Emergency SOS Activating</h1>
          <p className="text-xs text-red-200 max-w-xs mx-auto">
            Broadcasting possible heat emergency, live GPS coordinates, and worker identity across Voice, SMS, Push, and Dashboard.
          </p>
        </div>

        {/* Big Countdown Number */}
        <div className="text-center my-auto">
          <div className="text-8xl font-black font-mono tracking-tighter text-amber-300 drop-shadow-[0_0_35px_rgba(245,158,11,0.8)]">
            {countdownTime}
          </div>
          <span className="text-xs font-semibold uppercase tracking-widest text-red-300">Seconds to Automated Dispatch</span>
        </div>

        {/* Huge Cancel Button */}
        <div className="w-full max-w-sm pb-8 space-y-3">
          <button
            type="button"
            onClick={cancelCountdown}
            className="w-full py-5 rounded-2xl bg-white text-red-950 hover:bg-slate-100 font-black text-xl tracking-wider shadow-2xl transition transform active:scale-95 border-4 border-slate-300 flex items-center justify-center gap-2"
          >
            <X className="w-6 h-6 stroke-[3]" />
            <span>CANCEL SOS NOW</span>
          </button>
          <p className="text-[11px] text-center text-red-300">
            False trigger? Tap Cancel to abort emergency notification chain.
          </p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: Worker Emergency First-Response Screen (Rule 6)
  // ---------------------------------------------------------------------------
  if (emergencyScreenActive) {
    return (
      <div className="max-w-[420px] mx-auto min-h-screen pb-24 p-4 space-y-4 text-white">
        {/* Flashing Emergency Header */}
        <div className="bg-red-950 border-2 border-red-500 rounded-3xl p-5 text-center space-y-3 shadow-2xl shadow-red-950/80">
          <div className="inline-flex p-3 rounded-full bg-red-900/80 border border-red-400">
            <ShieldAlert className="w-8 h-8 text-amber-300 animate-pulse" />
          </div>
          <div>
            <span className="px-2.5 py-0.5 rounded-full bg-red-800 text-amber-200 text-[10px] font-black uppercase tracking-wider">
              {activeSosEvent?.id || 'SOS-ACTIVE'} • Escalation Level {activeSosEvent?.escalation_level || 1}
            </span>
            <h1 className="text-lg font-black text-white mt-1">EMERGENCY ASSISTANCE DISPATCHED</h1>
            <p className="text-xs text-red-200 mt-1">
              Supervisor Marcus Vance and Site Medic Dr. Elena Rostova have been alerted with your location: <strong>{workerData?.zone_name || 'Zone 1A'}</strong>.
            </p>
          </div>
        </div>

        {/* First-Response Life-Safety Protocol Instructions */}
        <div className="bg-industrial-900 border border-industrial-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-amber-300 font-bold text-xs uppercase tracking-wide">
            <AlertTriangle className="w-4 h-4" />
            <span>Immediate First-Response Protocol</span>
          </div>
          <div className="space-y-2 text-xs text-slate-200">
            <div className="flex items-start gap-2.5 p-2 rounded-xl bg-industrial-950 border border-industrial-800">
              <span className="w-5 h-5 rounded-full bg-red-900 text-red-200 font-bold text-[11px] flex items-center justify-center shrink-0">1</span>
              <p><strong>Cease physical exertion immediately.</strong> Sit or lie down in shaded cooling shelter (SHELTER-01).</p>
            </div>
            <div className="flex items-start gap-2.5 p-2 rounded-xl bg-industrial-950 border border-industrial-800">
              <span className="w-5 h-5 rounded-full bg-red-900 text-red-200 font-bold text-[11px] flex items-center justify-center shrink-0">2</span>
              <p><strong>Loosen and remove outer PPE.</strong> Remove hard hat, unbutton coveralls, and take off gloves.</p>
            </div>
            <div className="flex items-start gap-2.5 p-2 rounded-xl bg-industrial-950 border border-industrial-800">
              <span className="w-5 h-5 rounded-full bg-red-900 text-red-200 font-bold text-[11px] flex items-center justify-center shrink-0">3</span>
              <p><strong>Active cooling.</strong> Apply chilled water/ice towels to neck, armpits, and groin; turn on mist fan.</p>
            </div>
            <div className="flex items-start gap-2.5 p-2 rounded-xl bg-industrial-950 border border-industrial-800">
              <span className="w-5 h-5 rounded-full bg-red-900 text-red-200 font-bold text-[11px] flex items-center justify-center shrink-0">4</span>
              <p><strong>Sip cold electrolyte fluids</strong> slowly if alert and conscious. Do NOT force liquids if nauseous.</p>
            </div>
          </div>
        </div>

        {/* Tap-to-Call Buttons (User-Initiated Only - NEVER auto-dial!) */}
        <div className="space-y-2 pt-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block px-1">
            Emergency Contacts (Tap to Call):
          </span>
          <div className="grid grid-cols-1 gap-2">
            <a
              href="tel:112"
              className="flex items-center justify-between p-3.5 rounded-2xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white font-bold text-xs shadow-lg transition active:scale-98 border border-red-400 min-h-[48px]"
            >
              <div className="flex items-center gap-2.5">
                <PhoneCall className="w-5 h-5 text-amber-200" />
                <span>Call 112 (National Emergency Dispatch)</span>
              </div>
              <span className="text-xs font-mono bg-red-900/60 px-2 py-0.5 rounded">112</span>
            </a>

            <a
              href="tel:108"
              className="flex items-center justify-between p-3.5 rounded-2xl bg-gradient-to-r from-amber-600 to-orange-700 hover:from-amber-500 hover:to-orange-600 text-white font-bold text-xs shadow-lg transition active:scale-98 border border-amber-400 min-h-[48px]"
            >
              <div className="flex items-center gap-2.5">
                <PhoneCall className="w-5 h-5 text-yellow-200" />
                <span>Call 108 (Disaster & Ambulance)</span>
              </div>
              <span className="text-xs font-mono bg-amber-900/60 px-2 py-0.5 rounded">108</span>
            </a>

            <a
              href="tel:+15550199110"
              className="flex items-center justify-between p-3.5 rounded-2xl bg-industrial-900 hover:bg-industrial-800 text-slate-100 font-bold text-xs shadow-md transition active:scale-98 border border-industrial-700 min-h-[48px]"
            >
              <div className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-sky-400" />
                <span>Call Site Medical Officer (Dr. Elena Rostova)</span>
              </div>
              <span className="text-xs font-mono text-slate-400">Site Medic</span>
            </a>
          </div>
        </div>

        {/* 'I am safe' Cancel Action (Rule 1: Logged as false-trigger) */}
        <div className="pt-2">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-full justify-center bg-industrial-800 hover:bg-industrial-700 text-slate-200 border-industrial-600 min-h-[48px]"
            onClick={handleCancelActiveSos}
            disabled={loading}
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>I Am Safe (Cancel Emergency Signal)</span>
          </Button>
          <p className="text-[10px] text-center text-slate-400 mt-1.5">
            Tapping 'I Am Safe' cancels the dispatch chain and logs this event as a false-trigger in the safety audit.
          </p>
        </div>

        {/* iPhone Add to Home Screen PWA Explanation */}
        <div className="p-3.5 rounded-2xl bg-industrial-900/60 border border-industrial-800 text-[11px] text-slate-400 space-y-1.5">
          <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
            <Share2 className="w-3.5 h-3.5 text-sky-400" />
            <span>iPhone PWA Installation Note</span>
          </div>
          <p>
            On iOS Safari: Tap the <strong>Share</strong> button (box with upward arrow) and select <strong>'Add to Home Screen'</strong> to enable background push notifications and instant 1-tap emergency access.
          </p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: Standard Worker Safety Display (Mobile-First 390px)
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-4 pb-28">
      {/* Viewport Width Control Banner (Rule 10: Mobile-first 390px with desktop toggle) */}
      <div className="flex items-center justify-between bg-industrial-900/80 border border-industrial-800 rounded-lg px-4 py-2 text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-sky-400" />
          <span className="font-semibold text-white">Worker Occupational Safety Display</span>
          <span className="text-slate-400 hidden sm:inline">• Viewport:</span>
          <span className="font-mono text-sky-300">{mobileOnly ? '390px (Mobile Frame)' : 'Full Desktop'}</span>
        </div>
        <button
          type="button"
          onClick={() => setMobileOnly(!mobileOnly)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-industrial-800 hover:bg-industrial-700 text-slate-200 border border-industrial-600 transition text-xs"
        >
          {mobileOnly ? (
            <>
              <Maximize2 className="w-3.5 h-3.5 text-sky-400" />
              <span>Expand to Full Width</span>
            </>
          ) : (
            <>
              <Minimize2 className="w-3.5 h-3.5 text-sky-400" />
              <span>Constrain to 390px Phone</span>
            </>
          )}
        </button>
      </div>

      {errorMessage && (
        <div className="max-w-[390px] mx-auto p-3 rounded-xl bg-red-950 border border-red-500 text-xs text-red-200 flex items-start gap-2 animate-shake">
          <AlertOctagon className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p>{errorMessage}</p>
        </div>
      )}

      {/* Main Container: Mobile Frame vs Wide */}
      <div className={`mx-auto transition-all duration-200 ${mobileOnly ? 'max-w-[390px] border-2 border-industrial-700 rounded-3xl p-3 bg-industrial-950 shadow-2xl ring-1 ring-industrial-800' : 'max-w-4xl'}`}>
        <div className="space-y-3.5">
          {/* Worker Header Card */}
          <div className="bg-industrial-900 border border-industrial-800 rounded-2xl p-3.5 text-slate-200">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <User className="w-4 h-4 text-sky-400" />
                  <h2 className="font-bold text-sm text-white">{workerData?.full_name || 'Alex Morgan'}</h2>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                  <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                  <span className="truncate max-w-[220px]">{workerData?.zone_name || zoneData?.name || 'Zone 1A: Blast Furnace'}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPhoneConsentOpen(true)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-industrial-800 transition"
                  title="Configure Emergency Phone"
                >
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                </button>
                <button
                  type="button"
                  onClick={loadWorkerTelemetry}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-industrial-800 transition"
                  title="Refresh Live Sensor Data"
                  aria-label="Refresh telemetry"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-sky-400' : ''}`} />
                </button>
              </div>
            </div>

            {/* Workload & Acclimatization Badges */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2 border-t border-industrial-800/80 text-[10px]">
              <span className="px-2 py-0.5 rounded bg-industrial-950 border border-industrial-700 text-slate-300 capitalize">
                Workload: <strong>{workerData?.workload || 'Heavy'}</strong>
              </span>
              <span className="px-2 py-0.5 rounded bg-industrial-950 border border-industrial-700 text-slate-300 capitalize">
                Status: <strong>{workerData?.acclimatization_status || 'Acclimatized'}</strong>
              </span>
              <span className="px-2 py-0.5 rounded bg-industrial-950 border border-industrial-700 text-slate-300">
                PPE: <strong className="lowercase">Coveralls</strong>
              </span>
            </div>
          </div>

          {/* 1. PERSONAL RISK TIER (Rule 10: Never colour-only, Rule 4: No diagnosis language) */}
          <div className="bg-industrial-900 border border-industrial-800 rounded-2xl p-4 text-center space-y-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
              Current Heat-Strain Status
            </span>
            <div className="flex justify-center">
              <RiskBadge level={riskData?.level || workerData?.risk_level || 'Normal'} size="lg" />
            </div>

            <div className="text-xs text-slate-300 font-medium">
              Heat Strain Index:{' '}
              <span className="font-mono font-bold text-white">
                {riskData?.score !== undefined ? `${riskData.score}/100` : '76.5/100'}
              </span>
            </div>

            {riskData?.actions && riskData.actions.length > 0 && (
              <div className="p-2.5 bg-industrial-950/90 border border-industrial-700 rounded-xl text-left text-xs space-y-1">
                <span className="font-semibold text-amber-300 flex items-center gap-1.5 text-[11px]">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Mandatory Safety Directive:
                </span>
                <p className="text-[11px] text-slate-200 leading-relaxed">
                  {riskData.actions[0]}
                </p>
              </div>
            )}
          </div>

          {/* 2. ZONE CONDITIONS & WBGT (Rule 5: Proxy label + tooltip, Rule 6: Source Tag) */}
          <div className="bg-industrial-900 border border-industrial-800 rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-xs border-b border-industrial-800 pb-2">
              <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
                <ThermometerSun className="w-4 h-4 text-amber-400" />
                <span>Zone Microclimate</span>
              </div>
              <SourceTag source={zoneData?.source_tag || 'Simulated'} />
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-industrial-950 p-2.5 rounded-xl border border-industrial-800">
                <span className="text-[10px] text-slate-400 block">Ambient Temp</span>
                <span className="text-lg font-bold font-mono text-white">
                  {zoneData?.temp_c ? `${zoneData.temp_c}°C` : '34.2°C'}
                </span>
              </div>
              <div className="bg-industrial-950 p-2.5 rounded-xl border border-industrial-800">
                <span className="text-[10px] text-slate-400 block">Relative Humidity</span>
                <span className="text-lg font-bold font-mono text-white">
                  {zoneData?.humidity_pct ? `${zoneData.humidity_pct}%` : '58%'}
                </span>
              </div>
            </div>

            <div className="p-2.5 bg-industrial-950 rounded-xl border border-industrial-800 flex items-center justify-between">
              <WbgtLabelWithTooltip
                isMeasured={zoneData?.is_measured || false}
                value={zoneData?.wbgt_val || 29.2}
              />
              <span className="text-[10px] font-mono text-slate-400">
                Limit: {zoneData?.wbgt_val && zoneData.wbgt_val >= 28.0 ? 'Action Triggered' : 'Normal Range'}
              </span>
            </div>
          </div>

          {/* 3. MANDATORY HYDRATION TIMER & WATER LOGGING */}
          <div className="bg-gradient-to-br from-industrial-900 to-sky-950/40 border border-sky-900/50 rounded-2xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-300">
                <Droplets className="w-4 h-4 text-sky-400" />
                <span>Hydration & Rest Cycle</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800">
                Target: 2,500 ml/shift
              </span>
            </div>

            <div className="bg-industrial-950/80 p-3 rounded-xl border border-sky-900/40 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 block">Next Mandatory Break in:</span>
                <div className="flex items-baseline gap-1 text-sky-300">
                  <Clock className="w-3.5 h-3.5 text-sky-400 inline" />
                  <span className="text-xl font-bold font-mono tracking-wider">
                    {String(countdownMinutes).padStart(2, '0')}:{String(countdownSeconds).padStart(2, '0')}
                  </span>
                  <span className="text-[10px] text-slate-400">min</span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-slate-400 block">Consumed Today:</span>
                <span className="text-lg font-bold font-mono text-white">
                  {waterLogged} ml
                </span>
              </div>
            </div>

            <Button
              type="button"
              variant="primary"
              size="md"
              className="w-full justify-center shadow-lg shadow-sky-950/60 min-h-[48px]"
              onClick={handleLogWater}
            >
              <Droplets className="w-4 h-4 text-sky-200" />
              <span>Log 250ml Water Break</span>
            </Button>
            {checkInStatus && (
              <p className="text-center text-[11px] text-emerald-300 font-medium animate-pulse">
                {checkInStatus}
              </p>
            )}
          </div>

          {/* 4. SPRINT 2 CRITICAL SYMPTOM QUICK-PICKER */}
          <div className="bg-industrial-900 border border-industrial-800 rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                <Flame className="w-4 h-4 text-amber-400" />
                <span>Symptom Quick-Picker (Direct SOS)</span>
              </div>
              <span className="text-[10px] text-slate-400">Raises Emergency</span>
            </div>
            <p className="text-[10px] text-slate-400 leading-tight">
              Experiencing severe distress? Tapping any item immediately triggers an Emergency SOS.
            </p>

            <div className="grid grid-cols-1 gap-1.5">
              {criticalSymptoms.map((sym) => (
                <button
                  key={sym.id}
                  type="button"
                  onClick={() => handleQuickSymptomEmergency(sym)}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-500/40 hover:border-red-400 text-left transition active:scale-98 min-h-[44px]"
                >
                  <div>
                    <span className="text-xs font-bold text-red-200 block">{sym.label}</span>
                    <span className="text-[10px] text-red-300/80">{sym.desc}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-red-900 text-amber-300 text-[10px] font-bold uppercase">
                    SOS
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 5. RETURN TO WORK CLEARANCE STATUS (Rule 8: Named Human Signoff) */}
          <div className="bg-industrial-900 border border-industrial-800 rounded-2xl p-3.5 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
              <FileCheck className="w-4 h-4 text-emerald-400" />
              <span>Return-to-Work Clearance</span>
            </div>
            <div className="p-2.5 rounded-xl bg-industrial-950 border border-industrial-800 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-[11px]">Clearance Status:</span>
                <span className="font-semibold text-emerald-400 text-[11px] flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Active Shift Clearance
                </span>
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed pt-1 border-t border-industrial-800">
                Rule 8 Compliance: Return to work decisions are never automated. Authorized medical officer: <strong>Dr. Elena Rostova</strong> (Site Medic).
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* --------------------------------------------------------------------------- */}
      {/* SPRINT 2 FIXED WORKER SOS BUTTON WITH 1.5s PROGRESS RING AT SCREEN BOTTOM */}
      {/* --------------------------------------------------------------------------- */}
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 w-full max-w-[390px] px-3 z-40 pointer-events-auto">
        <div className="relative group">
          <button
            type="button"
            onPointerDown={startHold}
            onPointerUp={cancelHold}
            onPointerLeave={cancelHold}
            onTouchStart={startHold}
            onTouchEnd={cancelHold}
            className={`w-full h-14 rounded-2xl bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white font-black text-xs sm:text-sm tracking-wider shadow-2xl shadow-red-950/90 flex items-center justify-center gap-3 border-2 border-red-400 select-none transition-all active:scale-95 touch-none relative overflow-hidden ${isPressing ? 'ring-4 ring-amber-400' : ''}`}
            aria-label="Press and hold 1.5 seconds for emergency SOS"
          >
            {/* SVG Circular Progress Ring */}
            <div className="relative w-7 h-7 flex items-center justify-center">
              <svg className="w-7 h-7 -rotate-90 transform" viewBox="0 0 36 36">
                <path
                  className="text-red-900"
                  strokeWidth="4"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-amber-300 transition-all duration-75"
                  strokeDasharray={`${holdProgress}, 100`}
                  strokeWidth="4"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <Flame className="w-3.5 h-3.5 text-white absolute" />
            </div>

            <div className="flex flex-col text-left">
              <span className="uppercase text-xs font-black">
                {isPressing ? `HOLDING... ${Math.round(holdProgress)}%` : 'HOLD 1.5s FOR EMERGENCY SOS'}
              </span>
              <span className="text-[10px] text-red-200 font-normal">
                {isPressing ? 'Keep pressing to trigger countdown' : 'Press & hold 1.5s to trigger alert'}
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* Phone Consent Modal */}
      <Modal
        isOpen={phoneConsentOpen}
        onClose={() => setPhoneConsentOpen(false)}
        title="Emergency Contact Phone"
      >
        <form onSubmit={handleSavePhoneConsent} className="space-y-4 text-xs text-slate-200">
          <p className="text-slate-300 leading-relaxed">
            Your phone number is stored with AES-256 Fernet encryption at rest and masked in all operational dashboards. It is used strictly for automated heat stress safety check-in calls and direct supervisor voice calls.
          </p>
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              Mobile Phone Number (E.164 or National)
            </label>
            <input
              type="tel"
              value={workerPhoneInput}
              onChange={(e) => setWorkerPhoneInput(e.target.value)}
              placeholder="+1-555-019-2834"
              className="w-full px-3 py-2 bg-industrial-950 border border-industrial-700 rounded-xl text-white font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setPhoneConsentOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
            >
              Save Encrypted Phone
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default Worker;
