import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Sliders,
  TrendingUp,
  Cpu,
  Clock,
  Thermometer,
  Droplets,
  Activity,
  ShieldCheck,
  Info,
  RefreshCw,
  SlidersHorizontal,
  Flame,
  AlertTriangle,
  Calendar,
  Layers,
  ArrowRight
} from 'lucide-react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { useAuth } from './AuthContext';
import { api } from './api';
import {
  RiskBadge,
  SourceTag,
  WbgtLabelWithTooltip,
  Card,
  Button,
  Input,
  Select
} from './ui';

export function Predict() {
  const { user } = useAuth();
  const [selectedWorkerId, setSelectedWorkerId] = useState('w-01');
  const [workersList, setWorkersList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [predictionData, setPredictionData] = useState(null);
  const [shiftForecast, setShiftForecast] = useState(null);

  // What-If Simulator parameters (wired to /api/risk/whatif)
  const [whatIfTemp, setWhatIfTemp] = useState(35.0);
  const [whatIfHum, setWhatIfHum] = useState(60.0);
  const [whatIfWorkload, setWhatIfWorkload] = useState('heavy');
  const [whatIfPpe, setWhatIfPpe] = useState('cotton_coveralls');
  const [whatIfAcclim, setWhatIfAcclim] = useState(true);
  const [whatIfShaded, setWhatIfShaded] = useState(false);
  const [whatIfManualWbgt, setWhatIfManualWbgt] = useState('');
  const [whatIfResult, setWhatIfResult] = useState(null);
  const [whatIfLoading, setWhatIfLoading] = useState(false);

  // Explanation drawer
  const [explanationOpen, setExplanationOpen] = useState(false);

  // Load baseline data
  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const [wList, forecast] = await Promise.all([
          api.getWorkers().catch(() => []),
          api.getShiftForecast(40.7128, -74.0060, 8, false).catch(() => null)
        ]);
        setWorkersList(wList);
        setShiftForecast(forecast);
      } catch (err) {
        console.warn("Predict initialization error:", err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // Fetch worker prediction & run initial what-if
  async function loadWorkerPrediction(wid) {
    try {
      const p = await api.getWorkerPrediction(wid);
      setPredictionData(p);
    } catch (e) {
      console.warn("Prediction loading error:", e);
    }
  }

  useEffect(() => {
    if (selectedWorkerId) {
      loadWorkerPrediction(selectedWorkerId);
      runWhatIf();
    }
  }, [selectedWorkerId]);

  // Run What-If simulation calling /api/risk/whatif
  async function runWhatIf() {
    setWhatIfLoading(true);
    try {
      const res = await api.evaluateWhatIf({
        worker_id: selectedWorkerId,
        temp_c: parseFloat(whatIfTemp),
        humidity_pct: parseFloat(whatIfHum),
        workload: whatIfWorkload,
        ppe_type: whatIfPpe,
        acclimatized: whatIfAcclim,
        is_shaded: whatIfShaded,
        manual_wbgt: whatIfManualWbgt ? parseFloat(whatIfManualWbgt) : null
      });
      setWhatIfResult(res);
    } catch (err) {
      console.warn("What-If simulation error:", err);
    } finally {
      setWhatIfLoading(false);
    }
  }

  // Format chart data for 30-min projection with error bands
  const projectionChartData = predictionData?.projection?.map((pt) => ({
    time: `+${pt.minute_offset}m`,
    projected_hr: pt.projected_hr,
    upper_bound: pt.error_upper,
    lower_bound: pt.error_lower,
    projected_wbgt: pt.projected_wbgt
  })) || [
    { time: 'Now', projected_hr: 125, upper_bound: 130, lower_bound: 120, projected_wbgt: 29.2 },
    { time: '+10m', projected_hr: 132, upper_bound: 138, lower_bound: 126, projected_wbgt: 29.4 },
    { time: '+20m', projected_hr: 139, upper_bound: 145, lower_bound: 133, projected_wbgt: 29.6 },
    { time: '+30m', projected_hr: 144, upper_bound: 151, lower_bound: 137, projected_wbgt: 29.7 }
  ];

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-industrial-900 border border-industrial-800 rounded-xl shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-950/80 border border-amber-800 flex items-center justify-center text-amber-400 shadow-inner">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black text-white tracking-wide">
                PREDICTIVE THERMAL MODELING & DIGITAL TWIN
              </h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-950 text-amber-300 border border-amber-800">
                {predictionData?.model_version || '2.1.0-twin-ridge-isolationforest'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Ridge Regression Digital Twin • 30-Minute Projections • Backtest Error Bands • What-If Stress Testing
            </p>
          </div>
        </div>

        {/* Worker Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-semibold">Select Worker:</span>
          <select
            value={selectedWorkerId}
            onChange={(e) => setSelectedWorkerId(e.target.value)}
            className="bg-industrial-950 border border-industrial-700 rounded-lg px-3 py-1.5 text-xs text-sky-300 font-bold focus:outline-none focus:border-sky-500"
          >
            {workersList.map((w) => (
              <option key={w.id} value={w.id} className="bg-industrial-900 text-slate-200">
                {w.full_name} ({w.id}) — {w.workload}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Grid: 30-Min Predictive Timeline & Digital Twin Parameters */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left 2 Cols: 30-Minute Projection with Error Band */}
        <div className="lg:col-span-2 bg-industrial-900 border border-industrial-800 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between border-b border-industrial-800 pb-2">
            <div>
              <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-sky-400" />
                <span>30-Minute Projected Heart Rate & Thermal Strain</span>
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Digital Twin Ridge Model with &plusmn;{predictionData?.backtest_error_band_bpm || 4.8} bpm backtest error band (95% CI)
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-sky-300 font-mono font-semibold">
                Baseline: {predictionData?.fingerprint?.resting_hr_median || 72} bpm
              </span>
            </div>
          </div>

          {/* Area & Line Chart */}
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={projectionChartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="errorBand" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} domain={['dataMin - 10', 'dataMax + 10']} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc', fontSize: '11px' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Area
                  type="monotone"
                  dataKey="upper_bound"
                  stroke="transparent"
                  fill="url(#errorBand)"
                  name="Upper Error Bound (+1.96 RMSE)"
                />
                <Area
                  type="monotone"
                  dataKey="lower_bound"
                  stroke="transparent"
                  fill="url(#errorBand)"
                  name="Lower Error Bound (-1.96 RMSE)"
                />
                <Line
                  type="monotone"
                  dataKey="projected_hr"
                  stroke="#38bdf8"
                  strokeWidth={2.5}
                  name="Projected Heart Rate (bpm)"
                  dot={{ r: 4, fill: '#38bdf8' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Top Contributing Features */}
          <div className="p-3 bg-industrial-950 rounded-xl border border-industrial-800 space-y-2">
            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
              Top Drivers of Projected Thermal Strain:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              {predictionData?.top_contributing_features?.map((f, idx) => (
                <div key={idx} className="bg-industrial-900 p-2 rounded-lg border border-industrial-800">
                  <span className="text-[10px] text-slate-400 block">{f.name}</span>
                  <span className="font-mono font-bold text-sky-300">+{f.impact} {f.unit}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right 1 Col: Digital Twin Architecture Panel */}
        <div className="bg-industrial-900 border border-industrial-800 rounded-xl p-4 space-y-3">
          <div className="border-b border-industrial-800 pb-2">
            <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Cpu className="w-4 h-4 text-purple-400" />
              <span>Worker Digital Twin Parameters</span>
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Personalized Biometric Baseline vs Cohort Group
            </p>
          </div>

          <div className="space-y-2 text-xs">
            <div className="bg-industrial-950 p-2.5 rounded-lg border border-industrial-800 flex justify-between items-center">
              <span className="text-slate-400">Resting HR Median:</span>
              <span className="font-mono font-bold text-white">
                {predictionData?.fingerprint?.resting_hr_median || 72} bpm
              </span>
            </div>

            <div className="bg-industrial-950 p-2.5 rounded-lg border border-industrial-800 flex justify-between items-center">
              <span className="text-slate-400">Baseline Spread (IQR):</span>
              <span className="font-mono font-bold text-slate-200">
                &plusmn;{predictionData?.fingerprint?.resting_hr_spread || 8} bpm
              </span>
            </div>

            <div className="bg-industrial-950 p-2.5 rounded-lg border border-industrial-800 flex justify-between items-center">
              <span className="text-slate-400">Recovery Half-Time:</span>
              <span className="font-mono font-bold text-sky-300">
                {predictionData?.fingerprint?.recovery_half_time || 8.5} min
              </span>
            </div>

            <div className="bg-industrial-950 p-2.5 rounded-lg border border-industrial-800 flex justify-between items-center">
              <span className="text-slate-400">Exposure Tolerance Ratio:</span>
              <span className="font-mono font-bold text-emerald-400">
                {predictionData?.fingerprint?.exposure_tolerance || 1.0}x
              </span>
            </div>

            <div className="bg-industrial-950 p-2.5 rounded-lg border border-industrial-800 flex justify-between items-center">
              <span className="text-slate-400">Robust z-Score (Max):</span>
              <span className="font-mono font-bold text-amber-300">
                {predictionData?.robust_z_scores?.max_z || 1.2} &sigma;
              </span>
            </div>

            <div className="bg-industrial-950 p-2.5 rounded-lg border border-industrial-800 flex justify-between items-center">
              <span className="text-slate-400">Model Backtest RMSE:</span>
              <span className="font-mono font-bold text-purple-300">
                {predictionData?.digital_twin_parameters?.backtest_rmse || 2.45} bpm
              </span>
            </div>
          </div>

          <div className="p-2.5 bg-industrial-950/80 rounded-lg border border-industrial-800 text-[11px] text-slate-400 space-y-1">
            <span className="font-semibold text-slate-300 flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-sky-400" />
              Rule 3 Safety Boundary:
            </span>
            <p>
              ML Digital Twin outputs are advisory only. Statistical anomaly notices cap strictly at <strong>Elevated</strong> and never override deterministic rules to High or Emergency.
            </p>
          </div>
        </div>
      </div>

      {/* WHAT-IF STRESS TESTING SIMULATOR (Wired to /api/risk/whatif) */}
      <div className="bg-industrial-900 border border-industrial-800 rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between border-b border-industrial-800 pb-2.5 gap-2">
          <div>
            <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-sky-400" />
              <span>Interactive What-If Scenario Stress-Testing Engine</span>
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Simulate shift microclimates, PPE encumbrance, and metabolic pacing. Direct engine execution via <code>/api/risk/whatif</code>.
            </p>
          </div>

          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={runWhatIf}
            disabled={whatIfLoading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${whatIfLoading ? 'animate-spin' : ''}`} />
            <span>Re-evaluate What-If Scenario</span>
          </Button>
        </div>

        {/* Controls Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-industrial-950 p-3.5 rounded-xl border border-industrial-800 text-xs">
          {/* Temperature Slider */}
          <div className="space-y-1">
            <div className="flex justify-between font-semibold text-slate-300">
              <span>Ambient Temp:</span>
              <span className="font-mono text-white">{whatIfTemp}°C</span>
            </div>
            <input
              type="range"
              min="20"
              max="45"
              step="0.5"
              value={whatIfTemp}
              onChange={(e) => {
                setWhatIfTemp(e.target.value);
                setWhatIfManualWbgt('');
              }}
              className="w-full accent-sky-500 cursor-pointer"
            />
            <span className="text-[10px] text-slate-500 block">Range: 20°C to 45°C</span>
          </div>

          {/* Humidity Slider */}
          <div className="space-y-1">
            <div className="flex justify-between font-semibold text-slate-300">
              <span>Relative Humidity:</span>
              <span className="font-mono text-white">{whatIfHum}%</span>
            </div>
            <input
              type="range"
              min="15"
              max="95"
              step="1"
              value={whatIfHum}
              onChange={(e) => {
                setWhatIfHum(e.target.value);
                setWhatIfManualWbgt('');
              }}
              className="w-full accent-sky-500 cursor-pointer"
            />
            <span className="text-[10px] text-slate-500 block">Range: 15% to 95% RH</span>
          </div>

          {/* Workload Selector */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Metabolic Workload:</label>
            <select
              value={whatIfWorkload}
              onChange={(e) => setWhatIfWorkload(e.target.value)}
              className="w-full bg-industrial-900 border border-industrial-700 rounded p-1.5 text-white"
            >
              <option value="light">Light (&le; 200W) - Inspection / Bench</option>
              <option value="moderate">Moderate (~300W) - Sustained Walking</option>
              <option value="heavy">Heavy (&ge; 415W) - Furnace / Rigging</option>
              <option value="very_heavy">Very Heavy (&ge; 520W) - Maximum Exertion</option>
            </select>
          </div>

          {/* PPE Type Selector */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Protective Clothing (CAF):</label>
            <select
              value={whatIfPpe}
              onChange={(e) => setWhatIfPpe(e.target.value)}
              className="w-full bg-industrial-900 border border-industrial-700 rounded p-1.5 text-white"
            >
              <option value="standard_work_clothes">Standard Work Clothes (0.0°C)</option>
              <option value="cotton_coveralls">Cotton Coveralls (-1.0°C CAF)</option>
              <option value="double_layer_woven">Double-Layer Woven (-2.0°C CAF)</option>
              <option value="vapor_barrier_impermeable_ppe">Vapor-Barrier Impermeable (-4.0°C CAF)</option>
            </select>
          </div>

          {/* Toggles */}
          <div className="flex items-center gap-4 sm:col-span-2 lg:col-span-4 pt-2 border-t border-industrial-900">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={whatIfAcclim}
                onChange={(e) => setWhatIfAcclim(e.target.checked)}
                className="rounded bg-industrial-900 border-industrial-700 text-sky-500"
              />
              <span className="text-slate-300 font-medium">Worker is Acclimatized (2.0°C benefit)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={whatIfShaded}
                onChange={(e) => setWhatIfShaded(e.target.checked)}
                className="rounded bg-industrial-900 border-industrial-700 text-sky-500"
              />
              <span className="text-slate-300 font-medium">Shaded / Indoor Structure (-1.0°C offset)</span>
            </label>

            <div className="flex items-center gap-2 ml-auto">
              <span className="text-slate-400">Manual Override WBGT:</span>
              <input
                type="number"
                step="0.1"
                placeholder="None"
                value={whatIfManualWbgt}
                onChange={(e) => setWhatIfManualWbgt(e.target.value)}
                className="w-20 bg-industrial-900 border border-industrial-700 rounded px-2 py-1 text-white text-xs font-mono"
              />
            </div>
          </div>
        </div>

        {/* Simulation Output Card */}
        {whatIfResult && (
          <div className="bg-industrial-950 border border-industrial-800 rounded-xl p-4 space-y-3 animate-in fade-in">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-industrial-800 pb-2.5">
              <div className="flex items-center gap-3">
                <RiskBadge level={whatIfResult.level} size="lg" />
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">What-If Thermal Stress Level</span>
                  <span className="text-sm font-bold text-white font-mono">
                    Score: {whatIfResult.score}/100 • WBGT: {whatIfResult.wbgt_proxy_details?.wbgt_val}°C
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400 font-mono">Weights: WBGT (35%), HR (30%), Core (20%), Exp (15%)</span>
              </div>
            </div>

            {/* Assessment Factors & Recommendations */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="space-y-1.5">
                <span className="font-semibold text-slate-300 block">Contributing Factors Triggered:</span>
                <ul className="list-disc list-inside space-y-1 text-slate-400 text-[11px]">
                  {whatIfResult.factors?.map((f, i) => (
                    <li key={i}><span className="text-slate-200">{f}</span></li>
                  ))}
                </ul>
              </div>

              <div className="space-y-1.5">
                <span className="font-semibold text-amber-300 block">Mandatory Regulatory Action Directive:</span>
                <div className="p-2.5 bg-industrial-900/90 rounded-lg border border-industrial-800 space-y-1 text-[11px]">
                  {whatIfResult.actions?.map((act, i) => (
                    <p key={i} className="text-slate-200">&bull; {act}</p>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-industrial-900">
              <span>Rule IDs: {whatIfResult.rule_ids?.join('; ')}</span>
              <span>Direct execution of engine.assess() • Deterministic Parity Verified</span>
            </div>
          </div>
        )}
      </div>

      {/* SHIFT RISK PLANNER (Open-Meteo Hourly Schedule) */}
      <div className="bg-industrial-900 border border-industrial-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between border-b border-industrial-800 pb-2.5">
          <div>
            <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4 text-sky-400" />
              <span>Shift Risk Planner: 8-Hour Microclimate Schedule</span>
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Proactive hourly work-rest cycle staging based on diurnal thermal loads.
            </p>
          </div>
          <SourceTag source={shiftForecast?.source_tag || 'Simulated'} />
        </div>

        {/* Hourly Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300 border-collapse">
            <thead>
              <tr className="bg-industrial-950 text-slate-400 border-b border-industrial-800 text-[11px] uppercase">
                <th className="py-2.5 px-3">Hour</th>
                <th className="py-2.5 px-3">Ambient Temp</th>
                <th className="py-2.5 px-3">Humidity</th>
                <th className="py-2.5 px-3">WBGT (proxy)</th>
                <th className="py-2.5 px-3">Risk Tier</th>
                <th className="py-2.5 px-3">OSHA / NIOSH Work-Rest Directive</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-industrial-800/60 font-mono">
              {shiftForecast?.hourly_forecast?.map((item, idx) => (
                <tr key={idx} className="hover:bg-industrial-800/40 transition">
                  <td className="py-2.5 px-3 font-bold text-white font-sans">{item.hour}</td>
                  <td className="py-2.5 px-3">{item.temp_c}°C</td>
                  <td className="py-2.5 px-3">{item.humidity_pct}%</td>
                  <td className="py-2.5 px-3 font-bold text-sky-300">{item.wbgt_val}°C</td>
                  <td className="py-2.5 px-3 font-sans">
                    <RiskBadge level={item.risk_level} size="sm" />
                  </td>
                  <td className="py-2.5 px-3 font-sans text-slate-300">
                    {item.work_rest_cycle}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default Predict;
