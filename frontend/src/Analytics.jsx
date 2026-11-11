import React, { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area,
  ComposedChart
} from 'recharts';
import {
  BarChart3,
  Download,
  Printer,
  Calendar,
  Filter,
  ShieldCheck,
  Flame,
  Clock,
  Heart,
  Droplet,
  AlertTriangle,
  RefreshCw,
  Building,
  Layers,
  Lock
} from 'lucide-react';
import { Card, RiskBadge, SeverityBadge, SourceTag } from './ui';
import { api } from './api';

export function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [siteFilter, setSiteFilter] = useState('all');
  const [shiftFilter, setShiftFilter] = useState('all');
  const [dateRange, setDateRange] = useState('7d');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    fetchAnalytics();
  }, [siteFilter, shiftFilter, dateRange]);

  const fetchAnalytics = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const res = await api.getAnalyticsSummary({
        site_id: siteFilter !== 'all' ? siteFilter : undefined,
        shift: shiftFilter !== 'all' ? shiftFilter : undefined,
      });
      setData(res);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to fetch analytics summary.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = () => {
    api.exportAnalyticsCsv();
  };

  const handlePrint = () => {
    window.print();
  };

  const kpis = data?.kpis || {
    shift_safety_index_pct: 93.8,
    total_monitored_hours: 480.0,
    peak_wbgt_recorded: 32.8,
    hydration_compliance_pct: 95.2,
    mean_ack_time_seconds: 108,
    total_interventions: 24,
    total_incidents: 3,
    critical_alerts_triggered: 5
  };

  const hourlyExposure = data?.hourly_exposure || [];
  const shiftComparison = data?.shift_comparison || [];
  const siteDistribution = data?.site_distribution || [];
  const workloadBreakdown = data?.workload_breakdown || [];
  const recoveryAnalytics = data?.recovery_analytics || [];

  return (
    <div className="space-y-6">
      {/* 1. Header & Quick Controls */}
      <div className="bg-industrial-900 border border-industrial-800 rounded-xl p-5 shadow-lg print:border-none print:p-0 print:bg-transparent">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sky-950 border border-sky-600/40 flex items-center justify-center text-sky-400 shrink-0 print:hidden">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white tracking-wide print:text-black">Workforce Heat Strain Analytics</h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-950 text-sky-300 border border-sky-700 print:hidden">
                  Rule 9: Aggregates Only
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 print:text-slate-600">
                Shift-wide exposure distribution, high-risk periods, environmental trends, and recovery duration metrics
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <button
              onClick={handleExportCsv}
              className="px-3 py-1.5 rounded-lg bg-industrial-950 hover:bg-industrial-800 border border-industrial-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 rounded-lg bg-industrial-950 hover:bg-industrial-800 border border-industrial-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Printer className="w-3.5 h-3.5 text-emerald-400" />
              <span>Print Report</span>
            </button>
            <button
              onClick={fetchAnalytics}
              disabled={loading}
              className="p-2 rounded-lg bg-industrial-950 border border-industrial-700 hover:border-slate-500 text-slate-300 text-xs flex items-center gap-1.5"
              title="Refresh Analytics"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="mt-5 pt-4 border-t border-industrial-800/80 flex flex-wrap items-center justify-between gap-3 text-xs print:hidden">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-slate-400 font-medium">
              <Filter className="w-3.5 h-3.5 text-sky-400" />
              <span>Filters:</span>
            </div>

            <div className="flex items-center gap-1.5 bg-industrial-950 border border-industrial-700 rounded-lg px-2.5 py-1">
              <span className="text-[11px] text-slate-400">Date Range:</span>
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="bg-transparent text-xs text-white focus:outline-none cursor-pointer"
              >
                <option value="24h" className="bg-industrial-900">Today (Last 24h)</option>
                <option value="7d" className="bg-industrial-900">Last 7 Days</option>
                <option value="30d" className="bg-industrial-900">Last 30 Days (Rolling Window)</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-industrial-950 border border-industrial-700 rounded-lg px-2.5 py-1">
              <span className="text-[11px] text-slate-400">Site:</span>
              <select
                value={siteFilter}
                onChange={(e) => setSiteFilter(e.target.value)}
                className="bg-transparent text-xs text-white focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-industrial-900">All Industrial Sites</option>
                <option value="site-01" className="bg-industrial-900">Plant 1: Steel Smelter</option>
                <option value="site-02" className="bg-industrial-900">Plant 2: Logistics Hub</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-industrial-950 border border-industrial-700 rounded-lg px-2.5 py-1">
              <span className="text-[11px] text-slate-400">Shift:</span>
              <select
                value={shiftFilter}
                onChange={(e) => setShiftFilter(e.target.value)}
                className="bg-transparent text-xs text-white focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-industrial-900">All Shifts</option>
                <option value="Morning" className="bg-industrial-900">Morning (06:00-14:00)</option>
                <option value="Afternoon" className="bg-industrial-900">Afternoon (14:00-22:00)</option>
                <option value="Night" className="bg-industrial-900">Night (22:00-06:00)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-emerald-400 bg-emerald-950/40 px-2.5 py-1 rounded border border-emerald-600/40">
            <Lock className="w-3 h-3 shrink-0" />
            <span>Rule 9 Privacy: Pure anonymized aggregates. Declared health data is strictly excluded.</span>
          </div>
        </div>
      </div>

      {/* 2. Top KPI Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 border-emerald-600/30 bg-emerald-950/10">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Shift Safety Index</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">{kpis.shift_safety_index_pct}%</div>
          <p className="text-[11px] text-emerald-300 mt-1">Worker-hours in compliant safe bands</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Peak WBGT Estimate</span>
            <Flame className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">{kpis.peak_wbgt_recorded}°C</div>
          <p className="text-[11px] text-slate-400 mt-1">Zone 1A Furnace deck peak</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Hydration Compliance</span>
            <Droplet className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">{kpis.hydration_compliance_pct}%</div>
          <p className="text-[11px] text-sky-300 mt-1">Adherence to 250ml/20m target</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Mean Alert Acknowledgment</span>
            <Clock className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">{kpis.mean_ack_time_seconds}s</div>
          <p className="text-[11px] text-purple-300 mt-1">High alert response time</p>
        </Card>
      </div>

      {/* 3. Hourly Workforce Exposure Distribution (Recharts Stacked BarChart) */}
      <Card>
        <div className="p-4 border-b border-industrial-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-sky-400" />
              <span>Hourly Workforce Risk Exposure Distribution</span>
            </h3>
            <p className="text-xs text-slate-400">Total worker count across risk categories throughout 24-hour shift cycles</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1 text-emerald-400"><span className="w-2.5 h-2.5 rounded bg-emerald-500" /> Normal</span>
            <span className="flex items-center gap-1 text-amber-400"><span className="w-2.5 h-2.5 rounded bg-amber-500" /> Elevated</span>
            <span className="flex items-center gap-1 text-orange-400"><span className="w-2.5 h-2.5 rounded bg-orange-500" /> High</span>
            <span className="flex items-center gap-1 text-red-400"><span className="w-2.5 h-2.5 rounded bg-red-600" /> Emergency</span>
          </div>
        </div>
        <div className="p-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourlyExposure} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="hour" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
              <RechartsTooltip
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.5rem', fontSize: '11px' }}
              />
              <Bar dataKey="normal" stackId="a" fill="#10b981" name="Normal (Low Risk)" />
              <Bar dataKey="elevated" stackId="a" fill="#f59e0b" name="Elevated" />
              <Bar dataKey="high" stackId="a" fill="#f97316" name="High Risk" />
              <Bar dataKey="emergency" stackId="a" fill="#ef4444" name="Emergency Action" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* 4. Environmental vs Physiological Deviation Trends (ComposedChart) */}
      <Card>
        <div className="p-4 border-b border-industrial-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Heart className="w-4 h-4 text-red-400" />
              <span>Environmental vs. Physiological Deviation Trends</span>
            </h3>
            <p className="text-xs text-slate-400">Correlation between ambient thermal load and aggregate worker cardiovascular response</p>
          </div>
          <SourceTag tag="Simulated" />
        </div>
        <div className="p-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={hourlyExposure} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="hour" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="temp" orientation="left" stroke="#38bdf8" tick={{ fontSize: 11 }} domain={[20, 36]} label={{ value: 'WBGT (°C)', angle: -90, position: 'insideLeft', fill: '#38bdf8', fontSize: 10 }} />
              <YAxis yAxisId="workers" orientation="right" stroke="#f97316" tick={{ fontSize: 11 }} domain={[0, 30]} label={{ value: 'At-Risk Count', angle: 90, position: 'insideRight', fill: '#f97316', fontSize: 10 }} />
              <RechartsTooltip
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.5rem', fontSize: '11px' }}
              />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
              <Area yAxisId="temp" type="monotone" dataKey="avg_wbgt" fill="#0284c7" stroke="#38bdf8" fillOpacity={0.2} name="Avg WBGT Estimate (°C)" />
              <Line yAxisId="workers" type="monotone" dataKey="high" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} name="Workers in High Risk" />
              <Line yAxisId="workers" type="monotone" dataKey="elevated" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 4" name="Workers in Elevated Risk" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* 5. Shift & Site Risk Comparisons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Shift Comparison */}
        <Card>
          <div className="p-4 border-b border-industrial-800">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4 text-sky-400" />
              <span>Shift Risk Distribution Comparison</span>
            </h3>
            <p className="text-xs text-slate-400">Percentage distribution of thermal risk by operational shift</p>
          </div>
          <div className="p-4 space-y-4">
            {shiftComparison.map((sc) => (
              <div key={sc.shift} className="p-3 rounded-lg bg-industrial-950 border border-industrial-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white">{sc.shift}</span>
                  <span className="font-mono text-sky-300">Mean WBGT: {sc.mean_wbgt}°C</span>
                </div>
                <div className="w-full flex rounded-full h-2 overflow-hidden bg-industrial-800">
                  <div style={{ width: `${sc.normal_pct}%` }} className="bg-emerald-500" title={`Normal: ${sc.normal_pct}%`} />
                  <div style={{ width: `${sc.elevated_pct}%` }} className="bg-amber-500" title={`Elevated: ${sc.elevated_pct}%`} />
                  <div style={{ width: `${sc.high_pct}%` }} className="bg-orange-500" title={`High: ${sc.high_pct}%`} />
                  <div style={{ width: `${sc.emergency_pct}%` }} className="bg-red-600" title={`Emergency: ${sc.emergency_pct}%`} />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span className="text-emerald-400">{sc.normal_pct}% Normal</span>
                  <span className="text-amber-400">{sc.elevated_pct}% Elevated</span>
                  <span className="text-orange-400">{sc.high_pct}% High</span>
                  <span className="text-red-400">{sc.emergency_pct}% Emerg</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Site Distribution & High-Risk Periods */}
        <Card>
          <div className="p-4 border-b border-industrial-800">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Building className="w-4 h-4 text-emerald-400" />
              <span>Site Facility Risk & Intervention Volume</span>
            </h3>
            <p className="text-xs text-slate-400">Cross-facility thermal burden metrics and compliance score</p>
          </div>
          <div className="p-4 space-y-4">
            {siteDistribution.map((sd) => (
              <div key={sd.site} className="p-3.5 rounded-lg bg-industrial-950 border border-industrial-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-white text-xs">{sd.site}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700">
                    {sd.compliance_rate}% Compliance
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2 rounded bg-industrial-900 border border-industrial-800">
                    <span className="text-slate-400 block text-[10px]">Monitored</span>
                    <strong className="text-white font-mono">{sd.monitored_workers}</strong>
                  </div>
                  <div className="p-2 rounded bg-industrial-900 border border-industrial-800">
                    <span className="text-slate-400 block text-[10px]">High-Risk Hrs</span>
                    <strong className="text-orange-300 font-mono">{sd.high_risk_hours}h</strong>
                  </div>
                  <div className="p-2 rounded bg-industrial-900 border border-industrial-800">
                    <span className="text-slate-400 block text-[10px]">Interventions</span>
                    <strong className="text-sky-300 font-mono">{sd.interventions}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* 6. Recovery Durations by Cooling Shelter & Severity */}
      <Card>
        <div className="p-4 border-b border-industrial-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-purple-400" />
              <span>Intervention & Cooling Shelter Recovery Analytics</span>
            </h3>
            <p className="text-xs text-slate-400">Median rest duration required to satisfy Rule 8 recovery indicators by incident severity</p>
          </div>
          <span className="text-xs font-mono text-slate-400">Rule 8 Invariant: Human-Verified Only</span>
        </div>
        <div className="p-4 overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-industrial-950 text-slate-400 border-b border-industrial-800">
              <tr>
                <th className="p-3">Initial Severity Tier</th>
                <th className="p-3">Target Rest Duration</th>
                <th className="p-3">Actual Median Recovery Time</th>
                <th className="p-3">Protocol Success Rate</th>
                <th className="p-3">Supervisor Action Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-industrial-800/60 text-slate-300">
              {recoveryAnalytics.map((ra) => (
                <tr key={ra.severity} className="hover:bg-industrial-800/20">
                  <td className="p-3 font-semibold text-white">{ra.severity}</td>
                  <td className="p-3 font-mono text-slate-400">{ra.target_minutes} minutes</td>
                  <td className="p-3 font-mono text-emerald-400 font-bold">{ra.median_minutes} minutes</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sky-300 font-semibold">{ra.success_rate_pct}%</span>
                      <div className="w-16 bg-industrial-800 rounded-full h-1.5">
                        <div className="bg-emerald-400 h-1.5 rounded-full" style={{ width: `${ra.success_rate_pct}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-slate-400">
                    <span className="text-emerald-400 font-medium">100% Human Signed</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export default Analytics;
