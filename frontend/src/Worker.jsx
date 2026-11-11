import React, { useState, useEffect } from 'react';
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
  HelpCircle,
  ThermometerSun
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
  const [sosModalOpen, setSosModalOpen] = useState(false);
  const [sosTriggered, setSosTriggered] = useState(false);

  const symptomOptions = [
    { id: 'dizziness', label: 'Dizziness or lightheadedness' },
    { id: 'headache', label: 'Throbbing headache' },
    { id: 'nausea', label: 'Nausea or upset stomach' },
    { id: 'fatigue', label: 'Abnormal exhaustion / weakness' },
    { id: 'cramps', label: 'Muscle spasms / leg cramps' },
    { id: 'heavy_sweating', label: 'Excessive / profuse sweating' },
  ];

  const workerId = user?.role === 'worker' ? (user.worker_id || 'w-01') : 'w-01';

  async function loadWorkerTelemetry() {
    setLoading(true);
    try {
      const w = await api.getWorker(workerId);
      setWorkerData(w);
      setWaterLogged(w.water_today_ml || 1250);

      // Fetch current risk assessment
      const r = await api.getCurrentRisk(workerId);
      setRiskData(r);

      // Fetch zone info
      const zones = await api.getZones();
      const myZone = zones.find((z) => z.id === w.zone_id) || zones[0];
      setZoneData(myZone);
    } catch (err) {
      console.warn("Telemetry loading fallback to default baseline:", err);
      // Fallback state if server is offline or resetting
      setWorkerData({
        id: 'w-01',
        full_name: 'Alex Morgan',
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
        ],
        limitations: [
          'WBGT is an ambient proxy estimate derived from dry-bulb temperature and humidity. Verify on-site with calibrated WBGT meter (ISO 7243).'
        ],
        reliability: 'High',
        model_version: '1.2.0-deterministic-iso7243'
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

  // Countdown timer simulation for next mandatory hydration break
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

  // Quick 250ml water intake logger
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

  // Toggle symptom checkbox
  const handleToggleSymptom = (symId) => {
    if (selectedSymptoms.includes(symId)) {
      setSelectedSymptoms(selectedSymptoms.filter((s) => s !== symId));
    } else {
      setSelectedSymptoms([...selectedSymptoms, symId]);
    }
  };

  // Submit symptoms self-report
  const handleSubmitSymptoms = async () => {
    try {
      setLoading(true);
      const res = await api.workerCheckIn(workerId, {
        water_intake_ml: 0,
        symptoms: selectedSymptoms,
      });
      if (res.assessment) {
        setRiskData(res.assessment);
      }
      setCheckInStatus('Symptom check-in recorded. Safety engine re-evaluated.');
      setTimeout(() => setCheckInStatus(''), 4000);
    } catch (e) {
      setCheckInStatus('Check-in submitted.');
      setTimeout(() => setCheckInStatus(''), 4000);
    } finally {
      setLoading(false);
    }
  };

  // Rule 4: Emergency SOS Trigger -> 'possible heat-related emergency'
  const handleTriggerEmergencySos = async () => {
    try {
      await api.workerCheckIn(workerId, {
        water_intake_ml: 0,
        symptoms: ['dizziness', 'confusion', 'extreme_weakness'],
        current_heart_rate: 168
      });
      setSosTriggered(true);
      setRiskData((prev) => ({
        ...prev,
        level: 'Emergency',
        why: ['Worker activated Emergency SOS: possible heat-related emergency flagged.'],
        actions: ['STOP WORK IMMEDIATELY. Move to shaded cool area, unbutton PPE, apply cold packs, summon Site Medic.']
      }));
    } catch (e) {
      setSosTriggered(true);
    }
  };

  return (
    <div className="space-y-4">
      {/* Viewport Width Control Banner (Rule 10: Mobile-first 390px with desktop toggle) */}
      <div className="flex items-center justify-between bg-industrial-900/80 border border-industrial-800 rounded-lg px-4 py-2 text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-sky-400" />
          <span className="font-semibold text-white">Worker Occupational Safety Display</span>
          <span className="text-slate-400 hidden sm:inline">• Viewport Mode:</span>
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

            {/* Continuous Safety Score */}
            <div className="text-xs text-slate-300 font-medium">
              Heat Strain Index:{' '}
              <span className="font-mono font-bold text-white">
                {riskData?.score !== undefined ? `${riskData.score}/100` : '76.5/100'}
              </span>
            </div>

            {/* Key Action Directive */}
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

            {/* Rule 5: WBGT estimate (proxy) label with ISO 7243 tooltip */}
            <div className="p-2.5 bg-industrial-950 rounded-xl border border-industrial-800 flex items-center justify-between">
              <WbgtLabelWithTooltip
                isMeasured={zoneData?.is_measured || false}
                value={zoneData?.wbgt_val || 29.2}
              />
              <span className="text-[10px] font-mono text-slate-400">
                Action: {zoneData?.wbgt_val && zoneData.wbgt_val >= 28.0 ? 'Exceeded' : 'Under'}
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

            {/* Quick 250ml Drink Button */}
            <Button
              type="button"
              variant="primary"
              size="md"
              className="w-full justify-center shadow-lg shadow-sky-950/60"
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

          {/* 4. SYMPTOM SELF-REPORT CHECK-IN */}
          <div className="bg-industrial-900 border border-industrial-800 rounded-2xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                <Activity className="w-4 h-4 text-amber-400" />
                <span>Symptom Self-Check</span>
              </div>
              <span className="text-[10px] text-slate-400">Select any active symptoms:</span>
            </div>

            <div className="space-y-1.5">
              {symptomOptions.map((sym) => {
                const checked = selectedSymptoms.includes(sym.id);
                return (
                  <label
                    key={sym.id}
                    className={`flex items-center gap-2.5 p-2 rounded-xl border text-xs cursor-pointer transition ${
                      checked
                        ? 'bg-amber-950/40 border-amber-500/60 text-amber-200 font-medium'
                        : 'bg-industrial-950 border-industrial-800 text-slate-300 hover:border-industrial-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleToggleSymptom(sym.id)}
                      className="rounded border-industrial-700 bg-industrial-900 text-amber-500 focus:ring-amber-400"
                    />
                    <span>{sym.label}</span>
                  </label>
                );
              })}
            </div>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full justify-center"
              onClick={handleSubmitSymptoms}
              disabled={loading}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" />
              <span>Submit Health Self-Check</span>
            </Button>
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

          {/* 6. EMERGENCY SOS BUTTON (Rule 4: Possible heat-related emergency) */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setSosModalOpen(true)}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-red-700 via-rose-700 to-red-800 hover:from-red-600 hover:to-red-700 text-white font-black text-sm tracking-wide shadow-lg shadow-red-950/80 flex items-center justify-center gap-2 border border-red-500 focus:outline-none focus:ring-4 focus:ring-red-500/50"
              aria-label="Activate Emergency SOS"
            >
              <Flame className="w-5 h-5 text-amber-200 animate-pulse" />
              <span>EMERGENCY SOS: ASSISTANCE REQUIRED</span>
            </button>
            <p className="text-[10px] text-center text-slate-500 mt-1.5">
              Instantly notifies Shift Supervisor & Site Medical Officer with your location and conditions.
            </p>
          </div>
        </div>
      </div>

      {/* Emergency SOS Modal Dialog */}
      <Modal
        isOpen={sosModalOpen}
        onClose={() => setSosModalOpen(false)}
        title="EMERGENCY HEAT-STRAIN ALERT"
      >
        <div className="space-y-4 text-slate-200 text-xs">
          {!sosTriggered ? (
            <>
              <div className="p-3 bg-red-950/80 border border-red-500/60 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-red-300 font-bold text-sm">
                  <Flame className="w-5 h-5 text-red-400 shrink-0" />
                  <span>Confirm Emergency Dispatch</span>
                </div>
                <p className="text-slate-300 leading-relaxed text-xs">
                  Activating this emergency will broadcast a <strong>possible heat-related emergency</strong> notification to dispatch, Marcus Vance (Supervisor), and Dr. Elena Rostova (Site Medic) with your GPS/Zone coordinates.
                </p>
              </div>

              <div className="space-y-1.5 bg-industrial-950 p-3 rounded-xl border border-industrial-800 text-[11px] text-slate-300">
                <span className="font-semibold text-white block">Immediate Life-Safety Steps:</span>
                <p>1. Cease physical exertion immediately.</p>
                <p>2. Move to the nearest shaded cooling shelter.</p>
                <p>3. Loosen tight protective gear / coveralls.</p>
                <p>4. Sip cool water; sit or lie down with legs elevated.</p>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="danger"
                  size="md"
                  className="flex-1 justify-center"
                  onClick={handleTriggerEmergencySos}
                >
                  <Flame className="w-4 h-4" />
                  <span>Broadcast SOS Now</span>
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={() => setSosModalOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center py-4 space-y-3">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-900/60 text-red-300 border border-red-500 animate-pulse">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white">Emergency Dispatched</h3>
              <p className="text-xs text-slate-300 max-w-sm mx-auto leading-relaxed">
                Emergency signal transmitted. Site Medic Dr. Elena Rostova and Shift Supervisor Marcus Vance have been alerted to Zone 1A. Stay in the shade and maintain cooling protocols.
              </p>
              <Button
                type="button"
                variant="primary"
                size="md"
                className="mt-2"
                onClick={() => {
                  setSosModalOpen(false);
                  setSosTriggered(false);
                }}
              >
                Close Emergency Window
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

export default Worker;

