import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import {
  Flame,
  LayoutDashboard,
  Smartphone,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  BarChart3,
  Lightbulb,
  FileWarning,
  HelpCircle,
  LogOut,
  UserCheck,
  Building2,
  Bell,
  Globe,
  User,
  Activity,
  Sun,
  Moon
} from 'lucide-react';
import { useAuth, DEMO_ACCOUNTS } from './AuthContext';
import { DemoBanner, Modal, SafetyFooter, Drawer, Button, RiskBadge } from './ui';
import { Auth } from './Auth';
import { Worker } from './Worker';
import { Command } from './Command';
import { Predict } from './Predict';
import { Safety, Admin } from './Safety';
import { Analytics } from './Analytics';
import { Innovation } from './Innovation';
import { Incidents } from './Incidents';

export function App() {
  const { user, switchDemoRole, logout, loading, demoMode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [standardsModalOpen, setStandardsModalOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState('1');
  const [language, setLanguage] = useState('EN');

  // Dark / Light theme toggle saved per user
  const userKey = user?.username || 'anonymous';
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem(`thermosense_theme_${userKey}`) || 'dark';
  });

  useEffect(() => {
    const saved = localStorage.getItem(`thermosense_theme_${userKey}`) || 'dark';
    setTheme(saved);
    if (saved === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
  }, [userKey]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem(`thermosense_theme_${userKey}`, next);
    if (next === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
  };

  // Role permissions matrix
  const userRole = user?.role || 'worker';

  const getHomeRoute = (role) => {
    if (role === 'admin') return '/admin';
    if (role === 'worker') return '/worker';
    return '/command';
  };

  // Navigation definition with role guards
  const allNavItems = [
    { path: '/worker', label: 'Worker Safety (390px)', icon: Smartphone, roles: ['worker', 'supervisor', 'safety_officer', 'admin'] },
    { path: '/command', label: 'Command Centre', icon: LayoutDashboard, roles: ['supervisor', 'safety_officer', 'admin'] },
    { path: '/safety', label: 'Safety & Compliance', icon: ShieldAlert, roles: ['supervisor', 'safety_officer', 'admin'] },
    { path: '/admin', label: 'Administration', icon: ShieldCheck, roles: ['admin'] },
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
        <DemoBanner show={demoMode !== false} />
        <main className="flex-1 p-4 flex items-center justify-center">
          <Auth onLoginSuccess={(u) => navigate(getHomeRoute(u.role))} />
        </main>
        <SafetyFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-industrial-950 text-slate-100">
      {/* Rule 6: Persistent 'Prototype: synthetic data' Banner in demo mode */}
      <DemoBanner show={demoMode !== false} />

      {/* Main Header */}
      <header className="bg-industrial-950/85 border-b border-white/[0.08] px-4 py-2.5 sticky top-7 z-40 backdrop-blur-xl shadow-lg shadow-black/40">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 via-orange-600 to-amber-600 flex items-center justify-center text-white shadow-md shadow-amber-950/40 ring-1 ring-white/10">
              <Flame className="w-5 h-5 text-amber-100" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm tracking-widest text-zinc-100">THERMOSENSE</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-amber-950/60 text-amber-400 border border-amber-800/50">
                  OCCUPATIONAL HEAT SAFETY
                </span>
              </div>
              <p className="text-[10px] text-zinc-400">
                Software-Only Occupational AI Safety Platform (No Hardware)
              </p>
            </div>
          </div>

          {/* Top Bar Controls: Site Selector, Live Indicator, Language, Notifications, User Menu */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Site Selector Dropdown */}
            <div className="flex items-center gap-1.5 bg-industrial-900 border border-industrial-700/80 rounded-lg px-2.5 py-1 text-xs shadow-inner">
              <Building2 className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <select
                value={selectedSiteId}
                onChange={(e) => setSelectedSiteId(e.target.value)}
                className="bg-transparent text-xs font-semibold text-zinc-200 focus:outline-none cursor-pointer"
                aria-label="Select Site"
              >
                <option value="1" className="bg-industrial-900 text-zinc-200">Site 1: Apex Smelter (NJ)</option>
                <option value="2" className="bg-industrial-900 text-zinc-200">Site 2: Chicago Metalworks (IL)</option>
              </select>
            </div>

            {/* Live Telemetry Indicator */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-600/40 text-[11px] font-mono text-emerald-300 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>LIVE ENGINE</span>
            </div>

            {/* Language Switcher EN / HI / GU */}
            <div className="flex items-center bg-industrial-900 border border-industrial-700/80 rounded-lg p-0.5 text-[11px] font-semibold">
              {[
                { code: 'EN', label: 'EN' },
                { code: 'HI', label: 'HI' },
                { code: 'GU', label: 'GU' },
              ].map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => setLanguage(l.code)}
                  className={`px-2 py-0.5 rounded transition ${
                    language === l.code
                      ? 'bg-amber-500 text-industrial-950 font-bold shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  title={`Switch language to ${l.label}`}
                >
                  {l.label}
                </button>
              ))}
            </div>

            {/* Notifications Bell */}
            <button
              type="button"
              onClick={() => setNotificationsOpen(true)}
              className="relative p-1.5 rounded-lg bg-industrial-900 border border-industrial-700/80 text-zinc-300 hover:text-white transition shadow-sm hover:border-amber-500/50"
              title="System Alerts & Notifications"
              aria-label="System Alerts"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 border-2 border-industrial-900" />
            </button>

            {/* Dark/Light Theme Toggle (Saved per user) */}
            <button
              type="button"
              onClick={toggleTheme}
              className="p-1.5 rounded-lg bg-industrial-900 border border-industrial-700/80 text-zinc-300 hover:text-white transition shadow-sm hover:border-amber-500/50"
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Theme`}
              aria-label="Toggle Theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-sky-400" />}
            </button>

            {/* Judge Walkthrough button (Demo Mode) */}
            {demoMode !== false && (
              <button
                type="button"
                onClick={() => {
                  if (!['admin', 'safety_officer'].includes(userRole)) {
                    switchDemoRole('admin');
                  }
                  navigate('/innovation?tab=walkthrough');
                }}
                className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-industrial-950 text-xs font-bold shadow-md shadow-amber-950/40 flex items-center gap-1.5 transition-all"
                title="Launch End-to-End Judge Walkthrough (Fixed Seed: 42)"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Judge Walkthrough</span>
              </button>
            )}

            {/* Quick Demo 4-Role Switcher (Only visible in DEMO_MODE) */}
            {demoMode !== false && (
              <div className="flex items-center gap-1.5 bg-industrial-900 border border-industrial-700/80 rounded-lg px-2.5 py-1 text-xs">
                <span className="text-[11px] text-zinc-400 font-semibold hidden md:inline">Demo Role:</span>
                <select
                  value={user?.username || 'worker1'}
                  onChange={(e) => {
                    const u = DEMO_ACCOUNTS.find((a) => a.username === e.target.value);
                    switchDemoRole(e.target.value);
                    if (u) {
                      navigate(getHomeRoute(u.role));
                    }
                  }}
                  className="bg-transparent text-xs font-semibold text-amber-300 focus:outline-none cursor-pointer"
                  disabled={loading}
                >
                  {DEMO_ACCOUNTS.map((acc) => (
                    <option key={acc.username} value={acc.username} className="bg-industrial-900 text-zinc-200">
                      {acc.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Standards & Citations Help */}
            <button
              type="button"
              onClick={() => setStandardsModalOpen(true)}
              className="text-zinc-400 hover:text-zinc-200 p-1.5 rounded-lg hover:bg-industrial-800 transition"
              title="View Standards & Cited Sources (Rule 3)"
              aria-label="View Standards and Sources"
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            {/* User Profile & Sign Out */}
            <div className="flex items-center gap-1.5 pl-1.5 border-l border-industrial-800">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                userRole === 'admin'
                  ? 'bg-purple-950/80 text-purple-300 border border-purple-700/60'
                  : userRole === 'safety_officer'
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/60'
                  : userRole === 'supervisor'
                  ? 'bg-amber-950/80 text-amber-300 border border-amber-700/60'
                  : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
              }`}>
                {userRole.replace('_', ' ')}
              </span>

              <button
                type="button"
                onClick={logout}
                className="text-zinc-400 hover:text-red-400 p-1.5 rounded-lg hover:bg-industrial-850 transition"
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Role-Specific Navigation Tabs */}
        <div className="max-w-7xl mx-auto mt-2.5 border-t border-industrial-800/80 pt-1.5 flex items-center gap-1.5 overflow-x-auto">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate(item.path)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all focus:outline-none focus:ring-1 focus:ring-amber-400 ${
                  isActive
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40 font-semibold shadow-inner shadow-amber-500/5'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-industrial-850/60'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-amber-400' : 'text-zinc-500'}`} />
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
            element={<Navigate to={getHomeRoute(userRole)} replace />}
          />
          <Route
            path="/auth"
            element={<Auth onLoginSuccess={(u) => navigate(getHomeRoute(u.role))} />}
          />
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
            path="/admin"
            element={
              userRole === 'admin' ? (
                <Admin />
              ) : (
                <Navigate to="/command" replace />
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

      {/* Drawer: Notifications & Live Alerts */}
      <Drawer
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        title="Live Safety Notifications"
      >
        <div className="space-y-3 text-xs">
          <div className="p-3 rounded-lg bg-orange-950/40 border border-orange-500/50">
            <div className="flex items-center justify-between font-bold text-orange-300 mb-1">
              <span>Heat Stress Alert: Zone 3</span>
              <span className="text-[10px] text-slate-400 font-mono">2m ago</span>
            </div>
            <p className="text-slate-300">BoM proxy WBGT reached 30.2°C. Automated 15-minute rest protocol activated.</p>
          </div>
          <div className="p-3 rounded-lg bg-industrial-950 border border-industrial-800">
            <div className="flex items-center justify-between font-bold text-sky-300 mb-1">
              <span>Weather Telemetry Synced</span>
              <span className="text-[10px] text-slate-400 font-mono">6m ago</span>
            </div>
            <p className="text-slate-400">Open-Meteo external data refreshed for Site 1 (Apex Smelter).</p>
          </div>
          <div className="p-3 rounded-lg bg-industrial-950 border border-industrial-800">
            <div className="flex items-center justify-between font-bold text-emerald-300 mb-1">
              <span>Acclimatization Logged</span>
              <span className="text-[10px] text-slate-400 font-mono">18m ago</span>
            </div>
            <p className="text-slate-400">Worker w-04 completed Day 3 progressive heat acclimatization ramp.</p>
          </div>
        </div>
      </Drawer>

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

