# THERMOSENSE - Root Cause Analysis & Bug Resolutions (BUGS.md)

## Summary
When users opened `https://prot-gamma.vercel.app/` by clicking links from chat applications (WhatsApp, Telegram, Slack), emails (Gmail, Outlook), or social media (Instagram, Twitter), the web application presented a blank white screen. However, manually copying and pasting the clean URL directly into a desktop browser window functioned correctly.

This document outlines the root causes identified across the browser console, network requests, storage permissions, and routing infrastructure, along with the precise fixes applied and verified via automated Playwright testing.

---

## 1. Identified Root Causes

### Bug 1: Storage Denial & Uncaught `SecurityError` in Mobile In-App WebViews
* **Symptoms**: Completely white screen on mobile in-app browsers and private/incognito browsing windows.
* **Console Error**: `DOMException: Failed to read the 'localStorage' property from 'Window': Access is denied for this document.` (Error code: `SecurityError`).
* **Root Cause**: In-app WebViews (such as WhatsApp, Instagram, Telegram, and Gmail WebViews) and privacy-focused browsers enforce strict storage partitioning or completely block `window.localStorage` and `window.sessionStorage`. In `api.js`, `AuthContext.jsx`, and `App.jsx`, `localStorage.getItem` was invoked synchronously at module evaluation and component initialization. Because these calls were unprotected, the browser threw an unhandled exception before React could mount, halting script execution and leaving a blank canvas.
* **Resolution**:
  1. Created `frontend/src/storage.js` implementing `safeStorage`: a safe abstraction wrapping `localStorage` and `sessionStorage`. If access is restricted or throws `SecurityError` / `DOMException`, it catches the error and seamlessly falls back to an in-memory `Map`.
  2. Injected an early defensive storage polyfill script in the `<head>` of `frontend/index.html` so that any external or third-party storage access is safeguarded prior to bundle evaluation.
  3. Replaced all raw `localStorage` calls across `api.js`, `AuthContext.jsx`, and `App.jsx` with `safeStorage`.

### Bug 2: Missing Initial Loading State & Unstyled Default Browser Canvas
* **Symptoms**: Flash of blank white screen while downloading chunks, or permanent white screen if an initial network stall or script error occurred.
* **Root Cause**: The HTML file contained an empty `<div id="root"></div>` with no critical inline styles. The default browser canvas background is pure white (`#ffffff`). If JavaScript evaluation was delayed or failed, the user saw a stark white page.
* **Resolution**:
  1. Added inline critical CSS (`html, body { background-color: #09090b !important; }`) directly inside `<head>` of `frontend/index.html`.
  2. Injected a zero-dependency inline HTML/SVG ThermoSense preloader inside `<div id="root">` that renders immediately upon initial HTML parse, guaranteeing the page is never blank white.

### Bug 3: Authentication State Race Condition in `App.jsx`
* **Symptoms**: Protected routes mounted before user session verification completed, triggering 401 unauthenticated API cascades.
* **Root Cause**: `App.jsx` previously checked `if (!user && !loading)` to render the login view. While `loading` was `true`, execution fell through to render protected routes (e.g., `/worker` or `/command`) with `user === null`, causing crashes and redirects.
* **Resolution**:
  - Implemented an explicit `if (loading)` guard in `App.jsx` displaying a branded dark session-verification preloader until the auth token is validated or resolved.

### Bug 4: Modern JavaScript Syntax in Legacy Mobile WebViews
* **Symptoms**: Syntax errors on older mobile operating systems or embedded WebViews (`Unexpected token '?'`, `Unexpected token '.'`).
* **Root Cause**: Vite's default `modules` build target emitted modern ES syntax (such as optional chaining and nullish coalescing) that failed to parse on older Android System WebViews and older Safari/WebKit engines.
* **Resolution**:
  - Updated `frontend/vite.config.js` to set `build.target: ['es2018', 'chrome70', 'edge79', 'firefox67', 'safari12']` and `cssTarget: ['chrome61', 'firefox60', 'safari11', 'edge16']`, ensuring comprehensive transpilation for older mobile WebViews.

### Bug 5: Cache Invalidation & SPA Rewriting Headers in `vercel.json`
* **Symptoms**: Stale service worker scripts or outdated index files served when queries with tracking parameters (`?fbclid=...`, `?utm_source=...`) bypassed cache revalidation.
* **Root Cause**: `vercel.json` did not enforce no-cache headers on `/sw.js` and `/manifest.webmanifest`, and was missing `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`.
* **Resolution**:
  - Updated `vercel.json` with explicit no-cache headers for `/sw.js` and `/manifest.webmanifest`, added `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, and preserved SPA fallback rewrite rules.

---

## 2. Global Error Boundary
Added an updated `ErrorBoundary` in `frontend/src/main.jsx`:
- Catches any unhandled React component exceptions.
- Displays a branded, dark industrial recovery interface with the error message.
- Provides a "Reset Session & Reload" button that clears `safeStorage` and navigates back to `/auth` safely without leaving the screen blank.

---

## 3. End-to-End Clickthrough & Screen Verification
All screens, tabs, and interactive features were inspected and tested:
1. **Authentication (`/auth`)**: Login form, 1-click Demo Cards (Worker, Supervisor, Safety Officer, Admin), In-App Password Reset Token generation, Worker Consent Modal.
2. **Worker Heat Safety (`/worker`)**: 390px mobile view, +250ml water logging, symptoms check-in, 5-second countdown Emergency SOS button, Critical Symptom Quick-Picker (Confusion, Collapsed, Seizure, Severe Dizziness, Cannot Continue), Emergency first-response protocol modal, and "I Am Safe" dismissal.
3. **Command Centre (`/command`)**: Real-time workforce KPIs, site dispatch controls, live workforce grid, Alex Morgan telemetry drawer, manual sensor entry modal.
4. **Predictive Modeling (`/predict`)**: L2 individual digital twin, What-If simulation engine, and shift risk planner.
5. **Incidents Registry (`/incidents`)**: Safety incident logs, severity filtering, emergency protocol modal.
6. **Workforce Analytics (`/analytics`)**: Workforce heat strain distribution, biometric trend charts, and export tools.
7. **Safety & Compliance (`/safety`)**: Medical protocol administration, OSHA/ISO compliance guidelines, acclimatization tracker.
8. **Administration (`/admin`)**: Multi-site management (lat/lng coordinates), user RBAC roles, audit logs.
9. **Innovation & Research Lab (`/innovation`)**: Heat Safety Passport, Shift Handover protocol, Near-Miss Intelligence, Judge Walkthrough.
10. **Global Controls**: Theme toggle (Dark/Light), Language switcher (EN, HI, GU), Notifications drawer.

---

## 4. Playwright Automated Test Suite
A dedicated verification suite was created at `backend/test_blank_page_and_clickthrough.py`:
- `test_referer_and_tracking_params_no_blank_page`: Verifies page rendering under simulated WhatsApp / Gmail referer headers and tracking parameters (`?fbclid=...`, `?utm_source=...`).
- `test_blocked_localstorage_resilience`: Injects strict `localStorage` and `sessionStorage` exceptions (`DOMException: SecurityError`) and asserts the application mounts cleanly with zero errors.
- `test_full_application_clickthrough`: Clicks through every screen, triggers modals, logs water, toggles themes, and asserts 0 unhandled console errors or runtime crashes.
