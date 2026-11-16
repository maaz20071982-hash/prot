import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import { App } from './App';
import { safeStorage } from './storage';
import './index.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ThermoSense caught a rendering error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          backgroundColor: '#09090b',
          color: '#f4f4f5',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <div style={{
            maxWidth: '480px',
            width: '100%',
            backgroundColor: '#121215',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px',
            padding: '24px',
            textAlign: 'center',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #f59e0b, #ea580c)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px',
              color: '#fff',
              fontSize: '24px'
            }}>
              ⚠️
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 8px 0', color: '#fff' }}>
              THERMOSENSE Recovery
            </h2>
            <p style={{ fontSize: '13px', color: '#a1a1aa', margin: '0 0 20px 0', lineHeight: 1.5 }}>
              A client session state was restored. Click below to refresh and clear any cached parameters.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                onClick={() => {
                  safeStorage.clear();
                  window.location.href = '/auth';
                }}
                style={{
                  backgroundColor: '#f59e0b',
                  color: '#09090b',
                  fontWeight: 'bold',
                  padding: '10px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                Reset Session & Reload
              </button>
              <button
                onClick={() => {
                  window.location.reload();
                }}
                style={{
                  backgroundColor: '#27272a',
                  color: '#f4f4f5',
                  fontWeight: 'semibold',
                  padding: '10px 18px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Safely register PWA Service Worker in secure environments without blocking rendering
if (typeof window !== 'undefined' && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Non-critical: PWA background sync/push worker fallback
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);

