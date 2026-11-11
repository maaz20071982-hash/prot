import React, { useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import {
  Flame,
  LayoutDashboard,
  Smartphone,
  ShieldAlert,
  Sparkles,
  BarChart3,
  Lightbulb,
  FileWarning,
  HelpCircle,
  LogOut,
  UserCheck
} from 'lucide-react';
import { useAuth, DEMO_ACCOUNTS } from './AuthContext';
import { DemoBanner, Modal, SafetyFooter } from './ui';
import { Auth } from './Auth';
import { Worker } from './Worker';
import { Command } from './Command';
import { Predict } from './Predict';
import { Safety } from './Safety';
import { Analytics } from './Analytics';
import { Innovation } from './Innovation';
import { Incidents } from './Incidents';

export function App() {
  const { user, switchDemoRole, logout, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [standardsModalOpen, setStandardsModalOpen] = useState(false);

  // Role permissions matrix
  const userRole = user?.role || 'worker';

  // Navigation definition with role guards
  const allNavItems = [
    { path: '/worker', label: 'Worker Safety (390px)', icon: Smartphone, roles: ['worker', 'supervisor', 'safety_officer', 'admin'] },
    { path: '/command', label: 'Command Centre', icon: LayoutDashboard, roles: ['supervisor', 'safety_officer', 'admin'] },
    { path: '/safety', label: 'Safety & Compliance', icon: ShieldAlert, roles: ['supervisor', 'safety_officer', 'admin'] },
    { path: '/predict', label: 'Predictive Modeling', icon: Sparkles, roles: ['safety_officer', 'admin'] },
    { path: '/incidents', label: 'Incidents Registry', icon: FileWarning, roles: ['supervisor', 'safety_officer', 'admin'] },
    { path: '/analytics', label: 'Workforce Analytics', icon: BarChart3, roles: ['safety_officer', 'admin'] },
    { path: '/innovation', label: 'Innovation Lab', icon: Lightbulb, roles: ['safety_officer', 'admin'] },
  ];

  const visibleNavItems = allNavItems.filter((item) => item.roles.includes(userRole));

  // If user is not authenticated and not on /auth, render Auth
  if (!user && !loading) {
    return (
      <div className="min-h-screen bg-industrial-950 text-slate-100 flex flex-col">
        <DemoBanner />
        <main className="flex-1 p-4 flex items-center justify-center">
          <Auth onLoginSuccess={(u) => navigate(u.role === 'worker' ? '/worker' : '/command')} />
        </main>
        <SafetyFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-industrial-950 text-slate-100">
      {/* Rule 6: Persistent 'Prototype: synthetic data' Banner in demo mode */}
      <DemoBanner />

      {/* Main Header */}
      <header className="bg-industrial-900 border-b border-industrial-800 px-4 py-2.5 sticky top-7 z-40 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center text-white shadow-md shadow-orange-900/30">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm tracking-widest text-white">THERMOSENSE</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-sky-950 text-sky-400 border border-sky-800">
                  OCCUPATIONAL HEAT SAFETY
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                Software-Only Occupational AI Safety Platform (No Hardware)
              </p>
            </div>
          </div>

          {/* Quick Demo 4-Role Switcher and Account Badge */}
          <div className="flex items-center gap-2">
            {/* Judge Walkthrough button (Requirement 5) */}
            <button
              type="button"
              onClick={() => {
                if (!['admin', 'safety_officer'].includes(userRole)) {
                  switchDemoRole('admin');
                }
                navigate('/innovation?tab=walkthrough');
              }}
              className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white text-xs font-bold shadow-md shadow-orange-950/40 flex items-center gap-1.5 transition-all"
              title="Launch End-to-End Judge Walkthrough (Fixed Seed: 42)"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Judge Walkthrough</span>
            </button>

            <div className="flex items-center gap-1.5 bg-industrial-950 border border-industrial-700 rounded-lg px-2.5 py-1 text-xs">
              <span className="text-[11px] text-slate-400 font-semibold">Demo Role:</span>
              <select
                value={user?.username || 'worker1'}
                onChange={(e) => {
                  switchDemoRole(e.target.value);
                  if (e.target.value === 'worker1') navigate('/worker');
                  else navigate('/command');
                }}
                className="bg-transparent text-xs font-semibold text-sky-300 focus:outline-none cursor-pointer"
                disabled={loading}
              >
                {DEMO_ACCOUNTS.map((acc) => (
                  <option key={acc.username} value={acc.username} className="bg-industrial-900 text-slate-200">
                    {acc.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => setStandardsModalOpen(true)}
              className="text-slate-400 hover:text-slate-200 p-1.5 rounded hover:bg-industrial-800 transition"
              title="View Standards & Cited Sources (Rule 3)"
              aria-label="View Standards and Sources"
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={logout}
              className="text-slate-400 hover:text-red-400 p-1.5 rounded hover:bg-industrial-800 transition"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Role-Specific Navigation Tabs */}
        <div className="max-w-7xl mx-auto mt-2.5 border-t border-industrial-800/80 pt-1.5 flex items-center gap-1 overflow-x-auto">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate(item.path)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all focus:outline-none focus:ring-1 focus:ring-sky-400 ${
                  isActive
                    ? 'bg-sky-600/20 text-sky-300 border border-sky-500/40 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-industrial-800/60'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-sky-400' : 'text-slate-500'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Main View Routes */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4">
        <Routes>
          <Route
            path="/"
            element={<Navigate to={userRole === 'worker' ? '/worker' : '/command'} replace />}
          />
          <Route path="/auth" element={<Auth onLoginSuccess={(u) => navigate(u.role === 'worker' ? '/worker' : '/command')} />} />
          <Route path="/worker" element={<Worker />} />
          <Route
            path="/command"
            element={
              userRole === 'worker' ? (
                <Navigate to="/worker" replace />
              ) : (
                <Command />
              )
            }
          />
          <Route
            path="/safety"
            element={
              userRole === 'worker' ? (
                <Navigate to="/worker" replace />
              ) : (
                <Safety />
              )
            }
          />
          <Route
            path="/predict"
            element={
              ['safety_officer', 'admin'].includes(userRole) ? (
                <Predict />
              ) : (
                <Navigate to="/command" replace />
              )
            }
          />
          <Route
            path="/incidents"
            element={
              userRole === 'worker' ? (
                <Navigate to="/worker" replace />
              ) : (
                <Incidents />
              )
            }
          />
          <Route
            path="/analytics"
            element={
              ['safety_officer', 'admin'].includes(userRole) ? (
                <Analytics />
              ) : (
                <Navigate to="/command" replace />
              )
            }
          />
          <Route
            path="/innovation"
            element={
              ['safety_officer', 'admin'].includes(userRole) ? (
                <Innovation />
              ) : (
                <Navigate to="/command" replace />
              )
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Footer Disclaimer & Regulatory Citations (Rule 3) */}
      <footer className="bg-industrial-950 border-t border-industrial-800 text-[11px] text-slate-500 py-3 px-4 text-center space-y-1">
        <p>
          THERMOSENSE Occupational Heat-Safety Engine • Deterministic rules sourced from OSHA OTM Section III: Ch 4,
          NIOSH Pub 2016-106, ACGIH TLVs (2023), and ISO 7243:2017.
        </p>
        <p className="text-[10px] text-slate-600">
          Rule 3 & 4 Notice: Reference parameters are for decision-support only; verify before real use. The platform never predicts heatstroke or issues medical diagnoses.
        </p>
      </footer>
      <SafetyFooter />

      {/* Standards & Citations Modal */}
      <Modal
        isOpen={standardsModalOpen}
        onClose={() => setStandardsModalOpen(false)}
        title="REGULATORY STANDARDS & CITED SOURCES (CONFIG)"
      >
        <div className="space-y-3 text-xs text-slate-300">
          <p className="text-sky-300 font-semibold">
            Rule 3 Compliance: Single source of truth in engine.CONFIG with published citations:
          </p>
          <ul className="space-y-2 list-disc list-inside bg-industrial-950 p-3 rounded-xl border border-industrial-800 text-[11px]">
            <li>
              <strong>OSHA Technical Manual (OTM) Sec III: Ch 4</strong> — Heat Stress work-rest regimens and acclimatization schedules.
            </li>
            <li>
              <strong>NIOSH Criteria Document Pub 2016-106</strong> — Recommended Alert Limits (RAL) and physiological limits.
            </li>
            <li>
              <strong>ACGIH TLVs (2023)</strong> — Metabolic workload threshold action limits and WBGT screening.
            </li>
            <li>
              <strong>ISO 7243:2017</strong> — Hot environments: Estimation of heat stress on working men based on WBGT.
            </li>
            <li>
              <strong>Bureau of Meteorology (BoM) Proxy</strong> — Approximation formula for estimating WBGT from ambient temperature and humidity.
            </li>
          </ul>
          <div className="p-2.5 bg-amber-950/60 border border-amber-600/40 rounded-lg text-amber-200 text-[11px]">
            <strong>Rule 3 & 5 Disclaimer:</strong> Sourced reference parameters are for decision-support only; verify before real use.
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default App;
