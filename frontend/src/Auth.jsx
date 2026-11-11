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
  ArrowRight
} from 'lucide-react';
import { useAuth } from './AuthContext';
import { Card, Button, Input, Select } from './ui';

export function Auth({ onLoginSuccess }) {
  const { login, registerUser, requestPasswordReset, executePasswordReset, submitConsent, user } = useAuth();
  const [mode, setMode] = useState('login'); // 'login', 'register', 'forgot', 'reset', 'consent'

  // Login form
  const [loginUser, setLoginUser] = useState('supervisor');
  const [loginPass, setLoginPass] = useState('password123');

  // Register form
  const [regName, setRegName] = useState('');
  const [regUser, setRegUser] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPass, setRegPass] = useState('');
  const [regRole, setRegRole] = useState('worker');

  // Forgot / Reset
  const [forgotTarget, setForgotTarget] = useState('supervisor');
  const [generatedResetToken, setGeneratedResetToken] = useState('');
  const [resetTokenInput, setResetTokenInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');

  // Consent
  const [consentCheck, setConsentCheck] = useState(false);

  // Status feedback
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleQuickLogin = (uname, pwd = "password123") => {
    setLoginUser(uname);
    setLoginPass(pwd);
    setErrorMsg('');
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    try {
      const loggedUser = await login(loginUser, loginPass);
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
    setLoading(true);
    setErrorMsg('');
    try {
      await registerUser({
        username: regUser,
        email: regEmail,
        password: regPass,
        full_name: regName,
        role: regRole,
      });
      setSuccessMsg(`Registration successful! You may now sign in as ${regUser}.`);
      setLoginUser(regUser);
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
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await requestPasswordReset(forgotTarget);
      if (res.in_app_reset_token) {
        setGeneratedResetToken(res.in_app_reset_token);
        setResetTokenInput(res.in_app_reset_token);
        setSuccessMsg("In-app reset token generated successfully. Proceed to reset password.");
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
    setLoading(true);
    setErrorMsg('');
    try {
      await executePasswordReset(resetTokenInput, newPasswordInput);
      setSuccessMsg("Password successfully reset! Please log in with your new password.");
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
      setSuccessMsg("Consent verified. Entering workplace dashboard.");
      if (onLoginSuccess) onLoginSuccess(user);
    } catch (err) {
      setErrorMsg(err.message || "Consent submission failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto my-8 space-y-4">
      {/* Brand Badge */}
      <div className="text-center space-y-1">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-tr from-orange-600 to-amber-500 text-white shadow-lg shadow-orange-950/50 mb-2">
          <Flame className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-black tracking-wider text-white">THERMOSENSE</h2>
        <p className="text-xs text-slate-400">Occupational Heat-Safety Authentication & Security Gateway</p>
      </div>

      {/* Messages */}
      {successMsg && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-500/60 rounded-lg text-xs text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-3 bg-red-950/80 border border-red-500/60 rounded-lg text-xs text-red-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Auth Card with Tabs */}
      <Card className="bg-industrial-900 border-industrial-700">
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

            <Button type="submit" variant="primary" size="md" className="w-full justify-center" disabled={loading}>
              <Lock className="w-4 h-4" />
              <span>{loading ? "Signing in..." : "Sign In to Platform"}</span>
            </Button>

            {/* Quick Demo 4-Role Buttons */}
            <div className="pt-3 border-t border-industrial-800 text-xs">
              <span className="text-[11px] text-slate-400 font-semibold block mb-2">
                1-Click Role Logins (Demo):
              </span>
              <div className="grid grid-cols-2 gap-2 text-center text-[11px]">
                <button
                  type="button"
                  onClick={() => handleQuickLogin("worker1", "password123")}
                  className="p-1.5 rounded bg-industrial-950 border border-industrial-700 hover:border-sky-500 text-slate-200"
                >
                  👷 Worker (Alex Morgan)
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickLogin("supervisor", "password123")}
                  className="p-1.5 rounded bg-industrial-950 border border-industrial-700 hover:border-sky-500 text-slate-200"
                >
                  📋 Supervisor (Marcus Vance)
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickLogin("safety_officer", "password123")}
                  className="p-1.5 rounded bg-industrial-950 border border-industrial-700 hover:border-sky-500 text-slate-200"
                >
                  🩺 Medic (Dr. Elena Rostova)
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickLogin("admin", "admin123")}
                  className="p-1.5 rounded bg-industrial-950 border border-industrial-700 hover:border-sky-500 text-slate-200"
                >
                  🛡️ Admin (Arthur Pendelton)
                </button>
              </div>
            </div>
          </form>
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
                { value: "worker", label: "Worker (Field Labor)" },
                { value: "supervisor", label: "Supervisor (Shift Operations)" },
                { value: "safety_officer", label: "Safety Officer / Site Medic" },
                { value: "admin", label: "Administrator (EHS Director)" },
              ]}
            />
            <Button type="submit" variant="primary" size="md" className="w-full justify-center" disabled={loading}>
              <User className="w-4 h-4" />
              <span>{loading ? "Registering..." : "Create Account"}</span>
            </Button>
          </form>
        )}

        {/* 3. FORGOT / RESET FORM WITH IN-APP TOKEN */}
        {(mode === 'forgot' || mode === 'reset') && (
          <div className="space-y-4">
            {/* Step A: Request Token */}
            <form onSubmit={handleForgotSubmit} className="space-y-3">
              <Input
                label="Username or Email to Reset"
                value={forgotTarget}
                onChange={(e) => setForgotTarget(e.target.value)}
                placeholder="supervisor or user@domain.com"
                required
              />
              <Button type="submit" variant="secondary" size="sm" className="w-full justify-center" disabled={loading}>
                <KeyRound className="w-3.5 h-3.5" />
                <span>Generate In-App Reset Token</span>
              </Button>
            </form>

            {/* Step B: Display in-app token if generated */}
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

            {/* Step C: Enter New Password */}
            <form onSubmit={handleResetSubmit} className="space-y-3 pt-2 border-t border-industrial-800">
              <Input
                label="In-App Reset Token"
                value={resetTokenInput}
                onChange={(e) => setResetTokenInput(e.target.value)}
                placeholder="TS-RESET-XXXX"
                required
              />
              <Input
                label="New Password"
                type="password"
                value={newPasswordInput}
                onChange={(e) => setNewPasswordInput(e.target.value)}
                placeholder="••••••••"
                required
              />
              <Button type="submit" variant="primary" size="md" className="w-full justify-center" disabled={loading || !resetTokenInput}>
                <Lock className="w-4 h-4" />
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
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
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
              <ArrowRight className="w-4 h-4" />
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}

export default Auth;

