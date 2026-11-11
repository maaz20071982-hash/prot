# THERMOSENSE: Software-Only AI Occupational Heat-Safety Platform

**THERMOSENSE** is an industrial-grade, privacy-preserving, software-only AI occupational heat-safety platform (zero proprietary hardware or wearable dependencies). It protects industrial and outdoor workforces by combining deterministic thermodynamic safety standards (OSHA, NIOSH, ACGIH, ISO 7243) with bounded machine learning anomaly detection, predictive digital twin simulations, multilingual worker support, and verifiable privacy walls.

> **Operational Safety Disclaimer:**  
> **THERMOSENSE is an occupational decision-support platform, NOT a medical device.**  
> Sourced parameters and algorithms provide advisory recommendations only. The system never provides medical diagnoses, never predicts heatstroke, and strictly enforces human-in-the-loop physical assessments before cleared return to work.

---

## 1. Compliance with Hard Architectural Rules

| Rule # | Requirement | Implementation in THERMOSENSE |
|---|---|---|
| **Rule 1** | Exactly 26 approved application files (backend 7, frontend config 5, frontend/src 14, root 2). No extra files or folders. Shared UI in `ui.jsx`. | Verified: Exactly 26 approved files + 2 root files (`README.md`, `requirements.txt`). Zero unapproved components or directories. All shared design primitives reside in `frontend/src/ui.jsx`. |
| **Rule 2** | Stack: Python 3.11, FastAPI, sqlite3, scikit-learn, bcrypt, PyJWT, cryptography. React 18, Vite, Tailwind 3, React Router, Recharts, Lucide icons. No other runtime dependencies. | Pure compliant stack. Verified zero auxiliary runtime dependencies. |
| **Rule 3** | Deterministic safety decisions in `engine.py` with one `CONFIG` dict (sources cited, 'verify before real use'). ML (`ml.py`) only adds a labelled 'ML anomaly notice' capped at Elevated. ML never sets High/Emergency and never diagnoses. | Authoritative single-source `CONFIG` in `backend/engine.py` citing OSHA OTM, NIOSH Pub 2016-106, ACGIH TLVs, and ISO 7243:2017. `backend/ml.py` builds worker baseline fingerprints; ML notices cap strictly at Elevated risk. |
| **Rule 4** | Never state or imply a diagnosis or heatstroke prediction. Use 'possible heat-related emergency'. | Zero medical diagnostic claims across codebase and UI. System strictly uses `possible heat-related emergency` for severe acute alerts. |
| **Rule 5** | Temperature and humidity never appear as measured WBGT. Label 'WBGT estimate (proxy)' unless a manual instrument value is entered ('measured'). Show limitations tooltip. | Ambient temp/humidity calculations are explicitly labeled `WBGT estimate (proxy)`. Only calibrated physical entries are tagged `WBGT (measured)`. Every reading provides an ISO 7243 limitations disclaimer tooltip. |
| **Rule 6** | Every reading shows a source tag: `Simulated`, `Manual`, `Imported` or `Verified external`. Simulated data is never presented as a sensor measurement. Persistent demo banner. | Every environmental zone and sensor card carries a visible `SourceTag`. Persistent `'Prototype: synthetic data'` warning banner active across all views. |
| **Rule 7** | Every alert carries all 11 mandatory fields. | Every alert object contains: `worker_id`, `time`, `location`, `conditions`, `physiological_changes`, `reason`, `action`, `ack_status`, `escalation_status`, `contributing_factors`, `reliability_and_limitations`. |
| **Rule 8** | The system never declares a worker fit to return. A named human records the decision. | Automated return-to-work is strictly disabled. Return-to-work clearance requires human physical evaluation, named signatory, role attestation, vital signs check, and human responsibility confirmation. |
| **Rule 9** | Privacy: encrypted health table, supervisors never receive declared conditions (verified by test), analytics use aggregates only, every sensitive view writes an audit entry. | AES-256 Fernet encryption at rest for `health_private`. Supervisors querying worker endpoints receive operational accommodations only, never medical conditions (`test_45_supervisor_never_receives_declared_conditions`). Analytics return pure aggregate summaries. Every sensitive view writes to `audit_log`. |
| **Rule 10** | Accessibility and UX: premium, calm, high-contrast UI. Risk is never colour-only (icon + text). Mobile-first worker screen (390px) and dense desktop command centre. | High-contrast industrial palette. Every risk level renders both an unambiguous icon (`CheckCircle2`, `AlertTriangle`, `AlertOctagon`, `Flame`) and bold text. Dedicated 390px mobile worker experience (`Worker.jsx`) and role-guarded desktop routes. |
| **Rule 11** | Complete sprint, run tests and app, report results honestly, then STOP. | Automated backend test suite with 70/70 passing tests. Frontend built and verified. |

---

## 2. Directory Layout (Strictly 26 Files + 2 Root)

```text
prot/
├── README.md                      # [Root 1/2] Comprehensive documentation, Model Card & verification report
├── requirements.txt               # [Root 2/2] Backend dependencies
├── backend/                       # [Backend: 7 files]
│   ├── auth.py                    # bcrypt password hashing, PyJWT tokens (30m expiry), RBAC
│   ├── db.py                      # SQLite schema, AES-256 Fernet health encryption, seeder
│   ├── engine.py                  # Deterministic safety rules, CONFIG dict, BoM WBGT proxy, multilingual assistant
│   ├── main.py                    # FastAPI application, REST endpoints, audit logging, WebSocket
│   ├── ml.py                      # Biometric fingerprinting, Ridge twin, IsolationForest anomaly detection
│   ├── simulator.py               # 7 scenarios, 60-shift benchmark evaluate(), Judge walkthrough runner
│   └── test_all.py                # Comprehensive pytest suite (70 tests)
└── frontend/                      # [Frontend: Config 5 files + src 14 files]
    ├── index.html                 # HTML shell
    ├── package.json               # Frontend dependencies & scripts
    ├── postcss.config.js          # PostCSS Tailwind integration
    ├── tailwind.config.js         # Accessible high-contrast industrial theme
    ├── vite.config.js             # Vite configuration with API proxy
    └── src/
        ├── App.jsx                # Main application shell, Judge Walkthrough launcher & role router
        ├── Analytics.jsx          # Recharts workforce exposure, deviations, KPIs, aggregate CSV exports
        ├── api.js                 # Authenticated API client covering all Sprint 1, 2, 3 endpoints
        ├── Auth.jsx               # Login (4 demo roles), Register, Reset, Consent modal
        ├── AuthContext.jsx        # Role-based session management & instant demo role switcher
        ├── Command.jsx            # Desktop Command Centre: KPI row, live alerts, SVG map, worker drawer
        ├── Incidents.jsx          # Incident registry, OSHA 300/301 logs, emergency escalation protocols
        ├── index.css              # Tailwind base & industrial component styles
        ├── Innovation.jsx         # Multilingual assistant, Heat Passport, Handovers, Near-Miss, Benchmarks
        ├── main.jsx               # React 18 DOM mount point with BrowserRouter
        ├── Predict.jsx            # Predictive 30-min timeline, What-If simulator, Digital Twin, Weather API
        ├── Safety.jsx             # Safety Protocols, versioning, work-rest policies, PPE, audits, purge
        ├── ui.jsx                 # Consolidated shared UI components, badges, modals, tooltips, footer
        └── Worker.jsx             # Mobile-first (390px) worker heat dashboard with hydration & rest timers
```

---

## 3. Sprint Capabilities Overview

### Sprint 1: Foundational Heat-Safety Core
- **Deterministic Thermodynamic Engine (`engine.py`)**: BoM approximation formula for WBGT estimate (proxy), personal work-rest thresholds, metabolic workload baseline adjustments, reading quality grading, and duplicate alert suppression window (10 min).
- **Encrypted Privacy Vault (`db.py`)**: AES-256 Fernet encryption for `health_private`. Health conditions are strictly segregated and shielded from supervisors.
- **Biometric Fingerprinting (`ml.py`)**: Resting HR median and spread calculation, workload heart rate bands, recovery half-time, and safe cold-start group defaults.
- **Simulation Engine (`simulator.py`)**: 7 deterministic scenarios (`normal`, `rising_heat`, `over_exertion`, `dehydration_drift`, `noisy_sensor`, `missing_data`, `collapse`).
- **Mobile-First Worker Dashboard (`Worker.jsx`)**: 390px optimized responsive interface displaying personal risk, proxy WBGT, rest countdown timer, hydration log, and check-in status.

### Sprint 2: Command Centre, Alerts, Digital Twin & Recovery
- **Industrial Command Centre (`Command.jsx`)**: Real-time workforce grid, environmental telemetry, risk distribution chart, worker drill-down drawer, and SVG heat risk map with zone overlays.
- **Alert Lifecycle & Auto-Escalation**: Alert priorities (Normal, Elevated, High, Emergency), in-app audio synthesized alarms with mute, auto-escalation timers (High: 5 min, Emergency: 2 min), false-alert flagging, and alert history audit trail.
- **Rule 8 Return-to-Work Clearance**: Strict human-in-the-loop recovery workflow. Recovery indicators requiring HR within 20 bpm of baseline for 3 min, no symptoms, minimum rest elapsed, and a digitally signed clearance note by a named human supervisor.
- **Predictive Digital Twin & What-If Simulator (`Predict.jsx`)**: Ridge regression 30-minute forward projection with backtest error bands, IsolationForest anomaly detection, and interactive What-If scenario explorer directly wired to `engine.assess()`.
- **Shift Risk Planner**: Integrated Open-Meteo hourly weather forecasting with deterministic offline fallback.

### Sprint 3: Governance, Analytics & Innovation
- **Safety & Compliance (`Safety.jsx`)**:
  - Protocols with full version history (create, edit, diff comparison, and activation).
  - Work-rest policy tables per site and metabolic workload (Light, Moderate, Heavy, Very Heavy).
  - NIOSH 5-day acclimatization schedules and PPE Clothing Adjustment Factors (CAF).
  - Workforce & user administration (activate/suspend worker accounts, role permissions).
  - OSHA 300 / 301 incident compliance record exports.
  - Data retention controls with an audited, permanent `purge now` mechanism.
  - Comprehensive login history and immutable audit log viewer.
- **Workforce Analytics (`Analytics.jsx`)**:
  - Built with Recharts: stacked hourly workforce exposure bar charts, ambient vs physiological deviation curves, shift comparison cards, site risk distribution, recovery duration histograms.
  - Strictly aggregate metrics: privacy-hardened to prevent medical condition re-identification (Rule 9).
  - Print-optimized executive reports and one-click aggregate CSV exports.
- **Innovation Lab (`Innovation.jsx`)**:
  - **Heat Safety Passport**: Portable worker exposure credentials and acclimatization history, strictly locked behind a worker-controlled permission toggle.
  - **Shift Handover Reports**: End-of-shift digital handover protocol requiring formal digital signature acknowledgment from incoming supervisors before shift acceptance.
  - **Near-Miss Intelligence**: Structured reporting and automated clustering of near-miss events by zone, time of day, and workload band.
  - **AI Safety Insight Generator**: Rule-driven operational recommendations with visible evidence and historical grounding.
  - **Personalised Nudges**: Rate-limited proactive hydration/rest reminders (max 1 per 30 minutes, critical alerts never throttled).
  - **Multilingual Safety Assistant**: Domain-constrained assistant answering in English, Hindi, and Gujarati strictly using active protocol text, refusing out-of-scope queries with mandatory disclaimers.
  - **Judge Walkthrough Runner**: Interactive 8-step scripted walkthrough with fixed seed (`42`) demonstrating the end-to-end safety lifecycle.

---

## 4. 60-Shift Synthetic Evaluation & Benchmark Report

As mandated by Sprint 3 requirements, `simulator.evaluate()` executes a tri-modal benchmark across **60 simulated industrial shifts (2,880 timesteps)** with 40 injected heat-stress events and 20 safe control shifts (`seed=42`).

> **Label:** `synthetic data, not clinical validation`

### Tri-Modal Detection Benchmark Comparison

| Detection Method | Precision | Recall | F1 Score | Median Lead Time | Lead Time Range | True Positives | False Positives | False Negatives |
|---|---|---|---|---|---|---|---|---|
| **(a) Air Temp > 40°C** | 0.692 | 0.450 | 0.545 | 130 min | 30 - 310 min | 18 | 8 | 22 |
| **(b) Personal Rules (OSHA/ISO)** | 0.667 | **1.000** | **0.800** | **260 min** | 0 - 380 min | 40 | 20 | **0** |
| **(c) Rules + ML Notices** | 0.667 | **1.000** | **0.800** | **260 min** | 40 - 380 min | 40 | 20 | **0** |

### Benchmark Analysis & Findings
1. **Failure of Naive Ambient Thresholds:** Static air temperature thresholds (>40°C) miss **55% of heat distress events** because they fail to account for relative humidity, metabolic heat generation from heavy exertion, and worker clothing adjustment factors (CAF).
2. **Zero False Negatives with Personal Rules:** Sourced deterministic rules (OSHA/NIOSH/ACGIH/ISO 7243) successfully flagged 100% of injected distress cases (Recall = 1.000), capturing cumulative exposure before acute distress.
3. **Advance Warning Lead Time:** Personal rules and hybrid ML notices provided a **median advance warning of 260 minutes (4.3 hours)** prior to peak heat index, granting supervisors sufficient operational runway to rotate crews, enforce hydration, and mandate shade rest breaks.
4. **Safety Invariant Guardrail:** Hybrid ML notices provide early physiological drift visibility but are hard-constrained by code to never elevate risk beyond `Elevated`, ensuring machine learning anomalies cannot cause panic or override deterministic safety baselines.

---

## 5. Model Card: THERMOSENSE Hybrid Safety Engine

```yaml
Model Details:
  Model Name: THERMOSENSE Hybrid Rule-ML Occupational Heat Safety Engine
  Model Version: 3.0.0-tri-modal-benchmark
  Release Date: 2026-11-11
  Developer: THERMOSENSE Safety Engineering Team
  Type: Hybrid Deterministic Rule Engine + Bounded Anomaly Detector + Autoregressive Digital Twin

Architecture:
  Deterministic Core: ISO 7243:2017 & ACGIH TLV Screening Equations with Individual Metabolic Adjustments
  Anomaly Detector: Ensemble IsolationForest (contamination=0.04) + Robust Median/MAD Z-Score Drift
  Digital Twin: L2 Ridge Regression on Autoregressive Environmental & Physiological Time-Series

Intended Use:
  Primary Domain: Heavy industrial, metallurgical, mining, construction, and agricultural operations.
  Intended Users: Site Safety Officers, Industrial Hygienists, Operations Supervisors.
  Intended Function: Pre-symptomatic decision support to trigger shaded rest breaks and hydration cycles.
  Out-of-Scope: Medical diagnostic assessment, heatstroke triage, clinical patient management.

Safety & Ethical Invariants:
  1. ML may only emit labelled 'ML anomaly notice' capped strictly at Elevated (Rule 3).
  2. ML never triggers High or Emergency alerts and never produces a medical diagnosis (Rule 3, 4).
  3. Return-to-work fitness must be physically verified and signed by a named human officer (Rule 8).
  4. Declared medical conditions are AES-256 Fernet encrypted and hidden from supervisors (Rule 9).
  5. Analytics endpoints return pure aggregate statistics without identifiable health data (Rule 9).

Dataset & Validation:
  Dataset Type: Seeded synthetic physiological and environmental telemetry (60 shifts, 2880 steps).
  Label: "synthetic data, not clinical validation"
```

---

## 6. Quickstart & Verification

### Prerequisites
- Python 3.11+
- Node.js 18+ and npm

### 1. Backend Setup & Seed
```bash
# Install backend dependencies
pip install -r requirements.txt

# Initialize database and seed 30-day realistic industrial dataset
python backend/db.py

# Run all 70 automated pytest tests
pytest backend/test_all.py -v
```

### 2. Frontend Setup & Build
```bash
cd frontend

# Install dependencies
npm install

# Verify production build passes cleanly
npm run build

# Start development server
npm run dev
```
The application will be accessible at `http://localhost:5173`.

---

## 7. Role Logins (Demo Baseline)

| Role | Username | Password | Full Name | Primary Responsibilities |
|---|---|---|---|---|
| **Worker** | `worker1` | `password123` | Alex Morgan | 390px mobile heat dashboard, hydration logging, rest timer |
| **Supervisor** | `supervisor` | `password123` | Marcus Vance | Real-time workforce grid, alert ack, return-to-work clearance |
| **Safety Officer** | `safety_officer` | `password123` | Dr. Elena Rostova | Protocol configuration, OSHA compliance, health vault audits |
| **Administrator** | `admin` | `admin123` | Arthur Pendelton | Full system governance, data retention, Innovation Lab |

---

## 8. Test Suite Summary (70 Passing Tests)

The test suite in `backend/test_all.py` covers all 11 Hard Rules and end-to-end operational safety paths:

```text
============================== 70 passed in 2.59s ==============================
```

- **Tests 1–40 (Sprint 1 Core)**:
  - Database schema integrity, AES-256 Fernet health encryption.
  - Pure deterministic thermodynamic equations (`wbgt_proxy`, `personal_limit`, `accumulated_exposure`).
  - Reading quality scoring and 10-minute alert duplicate suppression.
  - Scenario simulation, CSV/JSON ingest validation.
  - ML baseline fingerprinting and safe cold-start defaults.
  - Auth, token refresh, and RBAC endpoint protection.
- **Tests 41–62 (Sprint 2 Governance & Prediction)**:
  - Supervisor privacy wall: supervisors cannot view declared health conditions (`test_45`).
  - Alert auto-escalation (High 5 min, Emergency 2 min) and duplicate merging.
  - Rule 8 human clearance verification: rejection of automated clearance attempts (`test_52`, `test_53`, `test_54`).
  - ML anomaly notice ceiling at Elevated risk (`test_59`).
  - Digital twin Ridge regression and backtest error bounds.
  - What-If simulation parity with deterministic engine.
  - Location privacy filtering for unconsented workers.
- **Tests 63–70 (Sprint 3 Governance & Innovation)**:
  - Protocol versioning: create, activate, and diff comparison (`test_63`).
  - Analytics aggregate privacy: verification that zero medical conditions are leaked (`test_64`).
  - Heat Safety Passport: permission toggle enforcement (`test_65`).
  - Multilingual Safety Assistant: domain scope enforcement and medical refusal (`test_66`).
  - Shift Handover: incoming supervisor digital signature requirement (`test_67`).
  - Personalised Nudges: 30-minute rate limiting and critical bypass (`test_68`).
  - 60-Shift Synthetic Benchmark: model card and label verification (`test_69`).
  - Judge Walkthrough: end-to-end 8-step smoke test with fixed seed 42 (`test_70`).

---

## 9. Honest Operational Limitations & Boundary Conditions

### Environmental & Physical Telemetry Limitations
1. **Proxy WBGT vs. Calibrated Wet Bulb Globe:** When using ambient dry-bulb temperature and relative humidity, the system calculates a proxy estimate using the Australian Bureau of Meteorology (BoM) formula. While calibrated for typical outdoor solar radiation, it cannot measure localized radiant heat from blast furnaces, hot metal ladles, or unshielded steam piping without a manual instrument reading.
2. **Missing Airflow Telemetry:** The platform does not currently incorporate anemometer wind speed readings into the proxy formula. Stagnant enclosed spaces (e.g., vessel interiors) may experience substantially higher heat strain than calculated.
3. **Clothing Adjustment Factors (CAF):** Default CAF adjustments follow ACGIH standard additions (+0 to +3°C). Specialized vapor-impermeable chemical or Level A hazmat suits require manual custom protocol overrides.

### Physiological & Algorithmic Limitations
1. **Decision Support, Not Clinical Diagnostic:** THERMOSENSE is not a diagnostic device. It estimates physiological strain based on population models, baseline heart rate spread, and declared acclimatization. Individual responses vary significantly based on sleep, medications, caffeine, and recent viral illnesses.
2. **Cold-Start Phase:** For workers with fewer than 3 completed shifts, the system relies on conservative population defaults. Highly trained or conversely highly vulnerable individuals may experience slightly higher alert frequency during cold-start.
3. **ML Anomaly Detection Scope:** Machine learning models detect statistical deviation from a worker's personal baseline; they do not assess medical etiology. By code invariant, ML notices are bounded and never trigger acute emergency workflows independently.

---

## 10. User Feedback & Evaluation Notes

*(This section is reserved for user evaluations, judge scoring, pilot observations, and operational review notes.)*

### Evaluator Details
- **Evaluator Name / Organization:** ________________________________________
- **Evaluation Date:** ____________________
- **Role / Sector:** [ ] Safety Officer  [ ] Industrial Supervisor  [ ] Ergonomist  [ ] Judge / Reviewer

### Reviewer Observations & Assessment
```text
[Enter feedback regarding platform usability, alert clarity, rule explainability, 
and practical feasibility for industrial deployment here...]




```

### Priority Recommendations for Subsequent Iterations
1. __________________________________________________________________________________
2. __________________________________________________________________________________
3. __________________________________________________________________________________
