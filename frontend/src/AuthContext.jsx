import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from './api';
import { safeStorage } from './storage';

const AuthContext = createContext(null);

export const DEMO_ACCOUNTS = [
  { username: 'worker1', label: 'Alex Morgan (Foundry Worker)', role: 'worker', desc: 'Field worker thermal safety dashboard' },
  { username: 'supervisor', label: 'Marcus Vance (Supervisor)', role: 'supervisor', desc: 'Site command centre & shift operations' },
  { username: 'safety_officer', label: 'Dr. Elena Rostova (Safety Officer)', role: 'safety_officer', desc: 'Predictive analytics & medical compliance' },
  { username: 'admin', label: 'Arthur Pendelton (Administrator)', role: 'admin', desc: 'Control plane, site management & governance' },
];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => safeStorage.getItem('thermosense_token'));
  const [demoMode, setDemoMode] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check system config for DEMO_MODE setting
    api.getConfig().then((cfg) => {
      if (typeof cfg.demo_mode === 'boolean') {
        setDemoMode(cfg.demo_mode);
      }
    }).catch(() => { });

    // Listen for auth expiration events
    const handleExpired = () => {
      setUser(null);
      setToken(null);
    };
    window.addEventListener('thermosense_auth_expired', handleExpired);
    return () => window.removeEventListener('thermosense_auth_expired', handleExpired);
  }, []);

  useEffect(() => {
    async function loadUser() {
      if (token) {
        try {
          const me = await api.getMe();
          setUser(me);
        } catch (err) {
          console.error("Session restoration failed:", err);
          logout();
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    }
    loadUser();
  }, [token]);

  const login = async (username, password) => {
    const res = await api.login(username, password);
    safeStorage.setItem('thermosense_token', res.access_token);
    if (res.refresh_token) {
      safeStorage.setItem('thermosense_refresh_token', res.refresh_token);
    }
    setToken(res.access_token);
    setUser(res.user);
    return res.user;
  };

  const registerUser = async (data) => {
    return await api.register(data);
  };

  const requestPasswordReset = async (usernameOrEmail) => {
    return await api.forgotPassword(usernameOrEmail);
  };

  const executePasswordReset = async (token, newPassword) => {
    return await api.resetPassword(token, newPassword);
  };

  const submitConsent = async (consent = true) => {
    const res = await api.submitConsent(consent, user?.id || 'w-01');
    if (user) {
      setUser({ ...user, consent_given: consent });
    }
    return res;
  };

  const switchDemoRole = async (username) => {
    setLoading(true);
    try {
      const pwd = username === 'admin' ? 'admin123' : 'password123';
      await login(username, pwd);
    } catch (e) {
      console.error("Demo role switch error:", e);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    safeStorage.removeItem('thermosense_token');
    safeStorage.removeItem('thermosense_refresh_token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        demoMode,
        login,
        registerUser,
        requestPasswordReset,
        executePasswordReset,
        submitConsent,
        logout,
        switchDemoRole,
        loading
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
