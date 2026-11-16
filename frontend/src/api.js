/**
 * THERMOSENSE API Client (api.js)
 * Wraps backend endpoints with token injection and error handling.
 */
import { safeStorage } from './storage';

const BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE_URL)
  ? import.meta.env.VITE_API_BASE_URL
  : '/api';

function getAuthHeader() {
  const token = safeStorage.getItem('thermosense_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

let isRefreshing = false;
let refreshSubscribers = [];

function onRefreshed(newToken) {
  refreshSubscribers.forEach((callback) => callback(newToken));
  refreshSubscribers = [];
}

async function request(endpoint, options = {}, isRetry = false) {
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeader(),
    ...options.headers,
  };

  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    // 401 Interception: Attempt silent refresh once using stored refresh token
    if (res.status === 401 && !isRetry && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/refresh')) {
      const refreshToken = safeStorage.getItem('thermosense_refresh_token');
      if (refreshToken) {
        if (!isRefreshing) {
          isRefreshing = true;
          try {
            const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refresh_token: refreshToken }),
            });
            if (refreshRes.ok) {
              const data = await refreshRes.json();
              safeStorage.setItem('thermosense_token', data.access_token);
              isRefreshing = false;
              onRefreshed(data.access_token);
              return request(endpoint, options, true);
            } else {
              isRefreshing = false;
              safeStorage.removeItem('thermosense_token');
              safeStorage.removeItem('thermosense_refresh_token');
              window.dispatchEvent(new Event('thermosense_auth_expired'));
            }
          } catch (e) {
            isRefreshing = false;
            safeStorage.removeItem('thermosense_token');
            safeStorage.removeItem('thermosense_refresh_token');
            window.dispatchEvent(new Event('thermosense_auth_expired'));
          }
        } else {
          return new Promise((resolve, reject) => {
            refreshSubscribers.push((newToken) => {
              if (newToken) {
                resolve(request(endpoint, options, true));
              } else {
                reject(new Error("Session expired"));
              }
            });
          });
        }
      }
    }

    if (!res.ok) {
      let errorDetail = `Request failed: ${res.status}`;
      try {
        const errJson = await res.json();
        errorDetail = errJson.detail || errorDetail;
      } catch (e) {
        // fallback
      }
      const error = new Error(errorDetail);
      error.status = res.status;
      throw error;
    }

    return res.json();
  } catch (err) {
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      const netError = new Error("Unable to connect to THERMOSENSE safety engine. Server is offline or unreachable.");
      netError.status = 503;
      throw netError;
    }
    throw err;
  }
}

export const api = {
  // Authentication
  login: (username, password) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  register: (data) =>
    request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  forgotPassword: (username_or_email) =>
    request('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ username_or_email }),
    }),
  resetPassword: (reset_token, new_password) =>
    request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ reset_token, new_password }),
    }),
  submitConsent: (consent_given = true, worker_id = "w-01") =>
    request('/auth/consent', {
      method: 'POST',
      body: JSON.stringify({ consent_given, worker_id }),
    }),
  getMe: () => request('/auth/me'),

  // Config & Standards
  getConfig: () => request('/config'),

  // Command Centre & Workforce (Sprint 2)
  getCommandSummary: () => request('/command/summary'),
  getWorkforce: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/workforce${qs ? `?${qs}` : ''}`);
  },
  getWorkers: () => request('/workers'),
  getWorker: (id) => request(`/workers/${id}`),
  workerCheckIn: (workerId, data) =>
    request(`/workers/${workerId}/check-in`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Environmental Zones
  getZones: () => request('/zones'),
  submitManualReading: (data) =>
    request('/ingest/manual', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Alerts Lifecycle & Auto-Escalation (Sprint 2)
  getAlerts: () => request('/alerts'),
  acknowledgeAlert: (alertId) =>
    request(`/alerts/${alertId}/ack`, {
      method: 'POST',
    }),
  escalateAlert: (alertId) =>
    request(`/alerts/${alertId}/escalate`, {
      method: 'POST',
    }),
  autoEscalateAlerts: () =>
    request('/alerts/auto-escalate', {
      method: 'POST',
    }),
  markFalseAlert: (alertId, reason) =>
    request(`/alerts/${alertId}/false-alert`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  getNotificationPreferences: () => request('/alerts/preferences'),
  setNotificationPreferences: (data) =>
    request('/alerts/preferences', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Interventions & Recovery Workflow (Sprint 2)
  startIntervention: (data) =>
    request('/interventions/start', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getActiveInterventions: () => request('/interventions/active'),
  logInterventionVitals: (id, data) =>
    request(`/interventions/${id}/log-vitals`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  clearIntervention: (id, data) =>
    request(`/interventions/${id}/clear`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Incidents & Root Cause Analysis (Sprint 2)
  getIncidents: () => request('/incidents'),
  createIncident: (data) =>
    request('/incidents', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getIncident: (id) => request(`/incidents/${id}`),
  updateIncidentStatus: (id, data) =>
    request(`/incidents/${id}/update-status`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  addIncidentNote: (id, note) =>
    request(`/incidents/${id}/add-note`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),
  getEmergencyProtocols: () => request('/incidents/protocols/list'),

  // Predictive Modeling & What-If Simulator (Sprint 2)
  getWorkerPrediction: (workerId) => request(`/predict/worker/${workerId}`),
  evaluateWhatIf: (data) =>
    request('/risk/whatif', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getShiftForecast: (lat = 40.7128, lon = -74.0060, hours = 8, isShaded = false) =>
    request(`/planner/shift-forecast?latitude=${lat}&longitude=${lon}&hours=${hours}&is_shaded=${isShaded}`),

  // SVG Heat Risk Map
  getMapLayout: () => request('/map/zones-and-workers'),

  // Encrypted Health Records (Rule 9)
  getHealthRecord: (workerId) => request(`/health/${workerId}`),
  updateHealthRecord: (workerId, data) =>
    request(`/health/${workerId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Return to Work Clearance (Rule 8)
  getReturnToWorkClearances: () => request('/return-to-work'),
  submitReturnToWork: (data) =>
    request('/return-to-work', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Privacy-Preserving Analytics (Rule 9)
  getAnalytics: () => request('/analytics'),

  // Audit Logs (Rule 9)
  getAuditLogs: () => request('/audit-logs'),

  // Risk Assessment
  getCurrentRisk: (workerId) => request(`/risk/current/${workerId}`),
  getRiskExplain: (workerId) => request(`/risk/explain/${workerId}`),

  // Simulation controls
  getScenarios: () => request('/sim/scenarios'),
  triggerScenario: (data) =>
    request('/sim/trigger', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Ingest
  downloadTemplate: (type) => request(`/ingest/template/${type}`),
  importCsv: (csvText, type = "environmental") =>
    request('/ingest/csv', {
      method: 'POST',
      body: JSON.stringify({ csv_text: csvText, import_type: type }),
    }),
  importJson: (jsonData, type = "environmental") =>
    request('/ingest/json', {
      method: 'POST',
      body: JSON.stringify({ json_data: jsonData, import_type: type }),
    }),

  // ---------------------------------------------------------------------------
  // Sprint 3: Safety Protocols & Versioning
  // ---------------------------------------------------------------------------
  getProtocols: () => request('/safety/protocols'),
  createProtocol: (data) =>
    request('/safety/protocols', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  activateProtocol: (id) =>
    request(`/safety/protocols/${id}/activate`, {
      method: 'POST',
    }),
  compareProtocols: (idA, idB) =>
    request(`/safety/protocols/compare?id_a=${idA}&id_b=${idB}`),

  // Workforce Administration & Data Retention Purge
  getWorkforceAdmin: () => request('/safety/workforce-admin'),
  toggleUserStatus: (userId, status) =>
    request(`/safety/users/${userId}/status?new_status=${status}`, {
      method: 'POST',
    }),
  purgeRetention: (days, reason) =>
    request('/safety/retention/purge', {
      method: 'POST',
      body: JSON.stringify({ days_retained: days, reason }),
    }),
  getLoginHistory: (limit = 50) => request(`/safety/login-history?limit=${limit}`),
  getAuditViewer: (limit = 100) => request(`/safety/audit-viewer?limit=${limit}`),

  // Analytics Aggregates (Rule 9: Aggregates Only)
  getAnalyticsSummary: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/analytics/summary${q ? `?${q}` : ''}`);
  },
  exportAnalyticsCsv: () => {
    window.open(`${BASE_URL}/analytics/export/csv`, '_blank');
  },

  // Heat Safety Passport (Permission-Gated)
  getPassport: (workerId) => request(`/passport/${workerId}`),
  togglePassportPermission: (workerId, sharingEnabled) =>
    request(`/passport/${workerId}/permission`, {
      method: 'POST',
      body: JSON.stringify({ sharing_enabled: sharingEnabled }),
    }),

  // Shift Handover Reports
  getHandovers: () => request('/handovers/recent'),
  createHandover: (data) =>
    request('/handovers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  acknowledgeHandover: (id, notes = '') =>
    request(`/handovers/${id}/acknowledge`, {
      method: 'POST',
      body: JSON.stringify({ signature_confirmation: true, notes }),
    }),

  // Near-Miss Intelligence
  getNearMisses: () => request('/near-misses'),
  reportNearMiss: (data) =>
    request('/near-misses', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // AI Safety Insights & Personalised Nudges
  getSafetyInsights: () => request('/safety/insights'),
  getWorkerNudges: (workerId) => request(`/nudges/worker/${workerId}`),
  sendNudge: (data) =>
    request('/nudges/send', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Multilingual Safety Assistant (en/hi/gu)
  sendAssistantChat: (message, language = 'en', workerId = null) =>
    request('/assistant/chat', {
      method: 'POST',
      body: JSON.stringify({ message, language, worker_id: workerId }),
    }),

  // Benchmark Evaluation (60 Shifts)
  getBenchmarkEvaluation: (shifts = 60) =>
    request(`/simulator/evaluate?shifts=${shifts}`),

  // Judge Walkthrough
  getWalkthroughSteps: () => request('/walkthrough/steps'),
  executeWalkthroughStep: (stepNumber) =>
    request(`/walkthrough/step/${stepNumber}`, {
      method: 'POST',
    }),
  resetWalkthrough: () =>
    request('/walkthrough/reset', {
      method: 'POST',
    }),

  // Administrator Control Plane (Sprint 1)
  admin: {
    getOrgs: () => request('/admin/orgs'),
    createOrg: (data) =>
      request('/admin/orgs', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getSites: () => request('/admin/sites'),
    createSite: (data) =>
      request('/admin/sites', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateSite: (id, data) =>
      request(`/admin/sites/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    deleteSite: (id) =>
      request(`/admin/sites/${id}`, {
        method: 'DELETE',
      }),
    getUsers: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/admin/users${q ? `?${q}` : ''}`);
    },
    setUserStatus: (userId, newStatus) =>
      request(`/admin/users/${userId}/status?new_status=${newStatus}`, {
        method: 'POST',
      }),
    setUserRole: (userId, newRole) =>
      request(`/admin/users/${userId}/role`, {
        method: 'POST',
        body: JSON.stringify({ new_role: newRole }),
      }),
    generateResetToken: (userId) =>
      request(`/admin/users/${userId}/reset-token`, {
        method: 'POST',
      }),
    purgeRetention: (days, reason) =>
      request('/admin/retention/purge', {
        method: 'POST',
        body: JSON.stringify({ days_retained: days, reason }),
      }),
    getLoginHistory: (limit = 100) => request(`/admin/login-history?limit=${limit}`),
    getAuditLogs: (limit = 100, action = '') => {
      const q = action ? `&action=${encodeURIComponent(action)}` : '';
      return request(`/admin/audit-logs?limit=${limit}${q}`);
    },
    getConfig: () => request('/admin/config'),
  },

  // Weather Service (Sprint 1)
  weather: {
    get: (siteId) => request(`/weather/${siteId}`),
    refresh: (siteId) =>
      request(`/weather/${siteId}/refresh`, {
        method: 'POST',
      }),
    setMode: (siteId, mode) =>
      request(`/weather/${siteId}/mode`, {
        method: 'POST',
        body: JSON.stringify({ mode }),
      }),
    submitManual: (siteId, data) =>
      request(`/weather/${siteId}/manual`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  // Emergency SOS & Escalation (Sprint 2)
  sos: {
    trigger: (data = {}) =>
      request('/sos/trigger', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    cancel: (eventId, reason = 'Worker indicated false trigger') =>
      request(`/sos/${eventId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    acknowledge: (eventId) =>
      request(`/sos/${eventId}/acknowledge`, {
        method: 'POST',
      }),
    getActive: () => request('/sos/active'),
    getDispatchLogs: (eventId = '', limit = 100) => {
      const q = eventId ? `?event_id=${eventId}&limit=${limit}` : `?limit=${limit}`;
      return request(`/sos/dispatch-log${q}`);
    },
    callWorker: (workerId) =>
      request(`/workers/${workerId}/call`, {
        method: 'POST',
      }),
    subscribePush: (subscription) =>
      request('/push/subscribe', {
        method: 'POST',
        body: JSON.stringify(subscription),
      }),
  },
};
