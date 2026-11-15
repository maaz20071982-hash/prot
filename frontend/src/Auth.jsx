import React, { useState } from 'react';
import {
  Lock,
  User,
  Mail,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Flame,
  ArrowRight,
  ShieldAlert,
  Loader2
} from 'lucide-react';
import { useAuth, DEMO_ACCOUNTS } from './AuthContext';
import { Card, Button, Input, Select } from './ui';

export function Auth({ onLoginSuccess }) {
  const { login, registerUser, requestPasswordReset, executePasswordReset, submitConsent, user, demoMode } = useAuth();
  const [mode, setMode] = useState('login'); // 'login', 'register', 'forgot', 'reset', 'consent'

  // Login form
  const [loginUser, setLoginUser] = useState(demoMode ? 'supervisor' : '');
  const [loginPass, setLoginPass] = useState(demoMode ? 'password123' : '');

  // Register form
  const [regName, setRegName] = useState('');
  const [regUser, setRegUser] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPass, setRegPass] = useState('');
  const [regRole, setRegRole] = useState('worker');

  // Forgot / Reset
  const [forgotTarget, setForgotTarget] = useState(demoMode ? 'supervisor' : '');
  const [generatedResetToken, setGeneratedResetToken] = useState('');
  const [resetTokenInput, setResetTokenInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');

  // Consent
  const [consentCheck, setConsentCheck] = useState(false);

  // Status feedback
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleTryAs = async (uname, pwd) => {
    setLoginUser(uname);
    setLoginPass(pwd);
    setErrorMsg('');
    setLoading(true);
    try {
      const loggedUser = await login(uname, pwd);
      if (loggedUser.role === 'worker' && !loggedUser.consent_given) {
        setMode('consent');
      } else if (onLoginSuccess) {
        onLoginSuccess(loggedUser);
      }
    } catch (err) {
      setErrorMsg(err.message || "Sign in failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!loginUser.trim() || !loginPass) {
      setErrorMsg("Please enter your username/email and password.");
      return;
    }
    setLoading(true);
    setErrorMsg('');
    try {
      const loggedUser = await login(loginUser.trim(), loginPass);
      if (loggedUser.role === 'worker' && !loggedUser.consent_given) {
        setMode('consent');
      } else if (onLoginSuccess) {
        onLoginSuccess(loggedUser);
      }
    } catch (err) {
      setErrorMsg(err.message || "Invalid credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (regPass.length < 6) {
      setErrorMsg("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    setErrorMsg('');
    try {
      await registerUser({
        username: regUser.trim(),
        email: regEmail.trim(),
        password: regPass,
        full_name: regName.trim(),
        role: regRole,
      });
      setSuccessMsg(`Account created! You may now sign in as ${regUser}.`);
      setLoginUser(regUser.trim());
      setLoginPass(regPass);
      setMode('login');
    } catch (err) {
      setErrorMsg(err.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    if (!forgotTarget.trim()) {
      setErrorMsg("Please enter the username or email to reset.");
      return;
    }
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await requestPasswordReset(forgotTarget.trim());
      if (res.in_app_reset_token) {
        setGeneratedResetToken(res.in_app_reset_token);
        setResetTokenInput(res.in_app_reset_token);
        setSuccessMsg("In-app reset token generated successfully. Enter your new password below.");
      } else {
        setSuccessMsg(res.message);
      }
    } catch (err) {
      setErrorMsg(err.message || "Reset request failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    if (newPasswordInput.length < 6) {
      setErrorMsg("New password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    setErrorMsg('');
    try {
      await executePasswordReset(resetTokenInput.trim(), newPasswordInput);
      setSuccessMsg("Password successfully reset! Please sign in with your new password.");
      setLoginPass(newPasswordInput);
      setMode('login');
    } catch (err) {
      setErrorMsg(err.message || "Password reset failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleConsentSubmit = async (e) => {
    e.preventDefault();
    if (!consentCheck) {
      setErrorMsg("Please acknowledge the heat-safety data processing consent.");
      return;
    }
    setLoading(true);
    setErrorMsg('');
    try {
      await submitConsent(true);
      setSuccessMsg("Consent recorded. Entering platform.");
      if (onLoginSuccess) onLoginSuccess(user);
    } catch (err) {
      setErrorMsg(err.message || "Consent submission failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto my-6 space-y-4">
      {/* Brand Header */}
      <div className="text-center space-y-1">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-tr from-orange-600 to-amber-500 text-white shadow-lg shadow-orange-950/50 mb-2">
          <Flame className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-black tracking-wider text-white">THERMOSENSE</h2>
        <p className="text-xs text-slate-400">Occupational Heat-Safety Authentication & Control Gateway</p>
      </div>

      {/* Messages */}
      {successMsg && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-500/60 rounded-lg text-xs text-emerald-200 flex items-center gap-2" role="status">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-3 bg-red-950/80 border border-red-500/60 rounded-lg text-xs text-red-200 flex items-center gap-2" role="alert">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Auth Card */}
      <Card className="bg-industrial-900 border-industrial-700/80 shadow-xl">
        {mode !== 'consent' && (
          <div className="flex border-b border-industrial-800 pb-3 mb-4 text-xs font-semibold">
            <button
              type="button"
              onClick={() => { setMode('login'); setErrorMsg(''); setSuccessMsg(''); }}
              className={`flex-1 pb-1 text-center border-b-2 transition ${
                mode === 'login' ? 'border-sky-500 text-sky-400 font-bold' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setErrorMsg(''); setSuccessMsg(''); }}
              className={`flex-1 pb-1 text-center border-b-2 transition ${
                mode === 'register' ? 'border-sky-500 text-sky-400 font-bold' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Register
            </button>
            <button
              type="button"
              onClick={() => { setMode('forgot'); setErrorMsg(''); setSuccessMsg(''); }}
              className={`flex-1 pb-1 text-center border-b-2 transition ${
                mode === 'forgot' || mode === 'reset' ? 'border-sky-500 text-sky-400 font-bold' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Forgot / Reset
            </button>
          </div>
        )}

        {/* 1. LOGIN FORM */}
        {mode === 'login' && (
          <div className="space-y-4">
            <form onSubmit={handleLoginSubmit} className="space-y-3">
              <Input
                label="Username or Email"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                placeholder="e.g. supervisor or worker1"
                required
              />

              <Input
                label="Password"
                type="password"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                placeholder="••••••••"
                required
              />

              <Button
                type="submit"
                variant="primary"
                size="md"
                className="w-full justify-center"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4 shrink-0" />
                    <span>Sign In to Platform</span>
                  </>
                )}
              </Button>
            </form>

            {/* DEMO_MODE: Try as 4 role cards */}
            {demoMode && (
              <div className="pt-4 border-t border-industrial-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300">Try as (Demo Mode Accounts):</span>
                  <span className="text-[10px] text-amber-400 font-mono">1-Click Sign In</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {DEMO_ACCOUNTS.map((acc) => (
                    <button
                      key={acc.username}
                      type="button"
                      onClick={() => handleTryAs(acc.username, acc.username === 'admin' ? 'admin123' : 'password123')}
                      disabled={loading}
                      className="p-2.5 rounded-lg bg-industrial-950/80 border border-industrial-800 hover:border-sky-500/70 text-left transition-all group flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-200 group-hover:text-sky-300 text-xs">{acc.label}</span>
                        <span className="text-[10px] uppercase font-mono px-1 rounded bg-industrial-900 text-slate-400">{acc.role}</span>
                      </div>
                      <span className="text-[11px] text-slate-400 mt-1">{acc.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2. REGISTER FORM */}
        {mode === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="space-y-3">
            <Input
              label="Full Name"
              value={regName}
              onChange={(e) => setRegName(e.target.value)}
              placeholder="e.g. Jordan Smith"
              required
            />
            <Input
              label="Username"
              value={regUser}
              onChange={(e) => setRegUser(e.target.value)}
              placeholder="e.g. jsmith"
              required
            />
            <Input
              label="Email Address"
              type="email"
              value={regEmail}
              onChange={(e) => setRegEmail(e.target.value)}
              placeholder="jsmith@apexindustrial.com"
              required
            />
            <Input
              label="Password (min 6 chars)"
              type="password"
              value={regPass}
              onChange={(e) => setRegPass(e.target.value)}
              placeholder="••••••••"
              required
            />
            <Select
              label="Assigned Role"
              value={regRole}
              onChange={(e) => setRegRole(e.target.value)}
              options={[
                { value: "worker", label: "Worker (Field Operations)" },
                { value: "supervisor", label: "Supervisor (Shift Management)" },
                { value: "safety_officer", label: "Safety Officer / Site Medic" },
                { value: "admin", label: "Administrator (Platform EHS Lead)" },
              ]}
            />
            <Button type="submit" variant="primary" size="md" className="w-full justify-center" disabled={loading}>
              <User className="w-4 h-4 shrink-0" />
              <span>{loading ? "Registering..." : "Create Account"}</span>
            </Button>
          </form>
        )}

        {/* 3. FORGOT / RESET FORM */}
        {(mode === 'forgot' || mode === 'reset') && (
          <div className="space-y-4">
            <form onSubmit={handleForgotSubmit} className="space-y-3">
              <Input
                label="Username or Email to Reset"
                value={forgotTarget}
                onChange={(e) => setForgotTarget(e.target.value)}
                placeholder="supervisor or user@domain.com"
                required
              />
              <Button type="submit" variant="secondary" size="sm" className="w-full justify-center" disabled={loading}>
                <KeyRound className="w-3.5 h-3.5 shrink-0" />
                <span>Generate In-App Reset Token</span>
              </Button>
            </form>

            {generatedResetToken && (
              <div className="p-3 bg-industrial-950 border border-sky-500/50 rounded-lg text-xs space-y-2">
                <div className="flex items-center justify-between text-sky-400 font-semibold">
                  <span>Generated In-App Token:</span>
                  <button
                    type="button"
                    onClick={() => { setResetTokenInput(generatedResetToken); setMode('reset'); }}
                    className="text-[11px] underline hover:text-sky-300"
                  >
                    Auto-Fill
                  </button>
                </div>
                <div className="p-2 bg-industrial-900 rounded font-mono font-bold text-white text-center tracking-widest">
                  {generatedResetToken}
                </div>
              </div>
            )}

            <form onSubmit={handleResetSubmit} className="space-y-3 pt-2 border-t border-industrial-800">
              <Input
                label="In-App Reset Token"
                value={resetTokenInput}
                onChange={(e) => setResetTokenInput(e.target.value)}
                placeholder="TS-RESET-XXXX"
                required
              />
              <Input
                label="New Password (min 6 chars)"
                type="password"
                value={newPasswordInput}
                onChange={(e) => setNewPasswordInput(e.target.value)}
                placeholder="••••••••"
                required
              />
              <Button type="submit" variant="primary" size="md" className="w-full justify-center" disabled={loading || !resetTokenInput}>
                <Lock className="w-4 h-4 shrink-0" />
                <span>Reset Password & Update</span>
              </Button>
            </form>
          </div>
        )}

        {/* 4. WORKER CONSENT FLOW */}
        {mode === 'consent' && (
          <form onSubmit={handleConsentSubmit} className="space-y-4">
            <div className="p-3 bg-industrial-950 border border-sky-500/40 rounded-lg space-y-2 text-xs text-slate-300 leading-relaxed">
              <h4 className="font-bold text-white flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Worker Heat-Safety Data Consent (Rule 9)</span>
              </h4>
              <p>
                THERMOSENSE monitors environmental heat index proxies and your voluntary physiological
                self-check reports to safeguard you from heat illness.
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-400 text-[11px]">
                <li>Declared medical conditions are encrypted at rest with AES-256.</li>
                <li>Your direct supervisor <strong>never</strong> receives medical diagnoses or condition names.</li>
                <li>You can withdraw or update your declared data at any time.</li>
              </ul>
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-200">
              <input
                type="checkbox"
                checked={consentCheck}
                onChange={(e) => setConsentCheck(e.target.checked)}
                className="mt-0.5 rounded bg-industrial-950 border-industrial-700 text-sky-500 focus:ring-sky-400 w-4 h-4 shrink-0"
                required
              />
              <span>I give informed consent for THERMOSENSE to process environmental and self-reported thermal strain indicators to provide rest-break and hydration recommendations.</span>
            </label>

            <Button type="submit" variant="primary" size="md" className="w-full justify-center" disabled={loading || !consentCheck}>
              <span>Accept & Enter Platform</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}

export default Auth;
