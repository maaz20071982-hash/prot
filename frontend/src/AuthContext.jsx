import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from './api';

const AuthContext = createContext(null);

export const DEMO_ACCOUNTS = [
  { username: 'worker1', label: 'Alex Morgan (Foundry Worker)', role: 'worker' },
  { username: 'supervisor', label: 'Marcus Vance (Supervisor)', role: 'supervisor' },
  { username: 'safety_officer', label: 'Dr. Elena Rostova (Safety Officer)', role: 'safety_officer' },
  { username: 'admin', label: 'Arthur Pendelton (Administrator)', role: 'admin' },
];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('thermosense_token'));
  const [loading, setLoading] = useState(true);

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
        // Auto-login as worker1 for worker mobile view baseline if no token
        try {
          const res = await api.login('worker1', 'password123');
          localStorage.setItem('thermosense_token', res.access_token);
          setToken(res.access_token);
          setUser(res.user);
        } catch (e) {
          // Fallback if backend offline
        }
      }
      setLoading(false);
    }
    loadUser();
  }, [token]);

  const login = async (username, password) => {
    const res = await api.login(username, password);
    localStorage.setItem('thermosense_token', res.access_token);
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
    localStorage.removeItem('thermosense_token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
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
