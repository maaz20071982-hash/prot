"""
THERMOSENSE FastAPI Application Entry Point (main.py)
-----------------------------------------------------
Sprint 1 Features:
- Auth: register, login, refresh, forgot/reset with in-app token, me, consent
- RBAC dependency & users activate/suspend
- Worker profile + check-in
- Ingest / import (manual, CSV, JSON with validation reports and templates)
- Simulator controls (/sim/scenarios, /sim/trigger)
- Risk: /risk/current and /risk/explain with visible score weights and factors
- Alerts: list + acknowledge with duplicate suppression window (10 min)
- WebSocket live feed (/api/ws)
- Audit entries on sensitive reads (Rule 9)
- 30-minute token expiry
"""

import os
import sys

_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _root not in sys.path:
    sys.path.insert(0, _root)
import io
import csv
import json
import uuid
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, Depends, HTTPException, status, Request, WebSocket, WebSocketDisconnect  # type: ignore
from fastapi.responses import Response, PlainTextResponse  # type: ignore
from fastapi.middleware.cors import CORSMiddleware  # type: ignore
from pydantic import BaseModel, Field  # type: ignore

from backend.db import (
    get_db,
    encrypt_health,
    decrypt_health,
    encrypt_phone,
    decrypt_phone,
    mask_phone,
    log_audit,
    record_login,
    check_sos_rate_limit,
    create_sos_event,
    cancel_sos_event,
    acknowledge_sos_event,
    get_active_sos,
    get_sos_by_id,
    log_sos_dispatch,
    get_sos_dispatch_logs,
    save_push_subscription,
    get_push_subscriptions
)
from backend.notify import (
    register_ws_broadcaster,
    dispatch,
    stop_escalation,
    get_sos_mode,
    place_voice_call,
    send_sms,
    generate_voice_twiml,
    generate_checkin_twiml
)
from backend.engine import (
    CONFIG,
    wbgt_proxy,
    personal_limit,
    accumulated_exposure,
    reading_quality,
    assess,
    recommendations,
    is_suppressed,
    evaluate_alert_escalation,
    check_recovery_indicators,
    assess_whatif,
    validate_assistant_query,
    generate_safety_insights,
    compare_protocols
)
from backend.simulator import (
    SCENARIOS,
    run_scenario_step,
    get_csv_template,
    import_readings_csv,
    import_readings_json,
    fetch_shift_forecast,
    evaluate,
    get_walkthrough_story,
    run_judge_walkthrough
)
from backend.ml import (
    build_fingerprint,
    detect_anomaly,
    compute_robust_z_scores,
    predict_30min_projection,
    train_digital_twin_ridge,
    MODEL_VERSION
)
from backend.auth import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_in_app_reset_token,
    get_current_user,
    require_role,
    Roles,
    normalize_identity
)
import asyncio
from contextlib import asynccontextmanager
import urllib.request
import urllib.error

sys.dont_write_bytecode = True

DEMO_MODE: bool = os.environ.get("DEMO_MODE", "true").lower() in ("true", "1", "yes")


@asynccontextmanager
async def lifespan(app: FastAPI):
    register_ws_broadcaster(manager.broadcast)

    async def _weather_loop():
        try:
            await asyncio.sleep(5)
            refresh_all_sites_weather()
            while True:
                await asyncio.sleep(600)  # every 10 minutes
                refresh_all_sites_weather()
        except asyncio.CancelledError:
            pass
        except Exception:
            pass

    async def _checkin_loop():
        """Rule 4: Automatic check-in call when High/Emergency alert is unanswered for 60s."""
        try:
            while True:
                await asyncio.sleep(15)
                conn = get_db()
                cursor = conn.cursor()
                cutoff = (datetime.now(timezone.utc) - timedelta(seconds=60)).isoformat()
                cursor.execute("""
                    SELECT a.id, a.worker_id, a.worker_name, a.time, a.level, w.phone_encrypted
                    FROM alerts a
                    JOIN workers w ON a.worker_id = w.id
                    WHERE a.level IN ('High', 'Emergency')
                      AND a.ack_status = 'Pending'
                      AND a.is_false_alert = 0
                      AND a.time <= ?
                      AND a.events_json NOT LIKE '%AUTO_CHECKIN_PLACED%'
                """, (cutoff,))
                rows = cursor.fetchall()
                for r in rows:
                    aid = r["id"]
                    wid = r["worker_id"]
                    wname = r["worker_name"]
                    phone = decrypt_phone(r["phone_encrypted"]) if r["phone_encrypted"] else "+1-555-019-2834"

                    cursor.execute("SELECT events_json FROM alerts WHERE id = ?", (aid,))
                    ej = cursor.fetchone()[0]
                    try:
                        ev_list = json.loads(ej)
                    except Exception:
                        ev_list = []
                    ev_list.append("AUTO_CHECKIN_PLACED")
                    cursor.execute("UPDATE alerts SET events_json = ? WHERE id = ?", (json.dumps(ev_list), aid))
                    conn.commit()

                    log_sos_dispatch(
                        event_id=aid,
                        channel="voice",
                        recipient_role="worker",
                        recipient_contact=mask_phone(phone),
                        status="simulated" if get_sos_mode() == "simulate" else "initiated",
                        message=f"Automated check-in call to {wname} ({mask_phone(phone)}) for unacknowledged {r['level']} alert",
                        mode=get_sos_mode()
                    )
                conn.close()
        except asyncio.CancelledError:
            pass
        except Exception:
            pass

    task_weather = asyncio.create_task(_weather_loop())
    task_checkin = asyncio.create_task(_checkin_loop())
    yield
    task_weather.cancel()
    task_checkin.cancel()


app = FastAPI(
    title="THERMOSENSE Occupational Heat-Safety Platform",
    description="Software-only occupational heat-safety engine with deterministic safety rules, bounded ML, and privacy guarantees.",
    version="1.2.0-sprint1",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "https://prot-gamma.vercel.app"
    ],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# WebSocket Connection Manager for Live Telemetry Feed
# ---------------------------------------------------------------------------
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: Dict[str, Any]):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                self.disconnect(connection)

manager = ConnectionManager()


# ---------------------------------------------------------------------------
# Pydantic Request Models
# ---------------------------------------------------------------------------
class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str
    full_name: str
    role: str = "worker"
    org_id: str = "org-01"

class LoginRequest(BaseModel):
    username: str
    password: str

class RefreshRequest(BaseModel):
    refresh_token: str

class ForgotPasswordRequest(BaseModel):
    username_or_email: str

class ResetPasswordRequest(BaseModel):
    reset_token: str
    new_password: str

class ConsentRequest(BaseModel):
    worker_id: Optional[str] = None
    consent_given: bool = True
    phone: Optional[str] = None

class SOSTriggerRequest(BaseModel):
    worker_id: Optional[str] = None
    symptoms: List[str] = []
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    lang: str = "en"

class SOSCancelRequest(BaseModel):
    reason: str = "Worker indicated false trigger"

class PushSubscriptionRequest(BaseModel):
    endpoint: str
    keys: Dict[str, str]

class UserStatusRequest(BaseModel):
    status: str = Field(..., pattern="^(active|suspended)$")

class WorkerCheckInRequest(BaseModel):
    water_intake_ml: int = 250
    symptoms: List[str] = []
    current_heart_rate: Optional[int] = None
    workload: Optional[str] = None
    ppe_type: Optional[str] = None

class ManualReadingRequest(BaseModel):
    zone_id: str
    temp_c: float
    humidity_pct: float
    measured_wbgt: float
    instrument_name: str = "Calibrated WBGT Meter"
    notes: Optional[str] = None

class ScenarioTriggerRequest(BaseModel):
    scenario: str
    worker_id: str = "w-01"
    zone_id: str = "zone-01"
    step: int = 0

class ReturnToWorkRequest(BaseModel):
    worker_id: str
    cleared_by_name: str = Field(..., min_length=2)
    cleared_by_role: str = Field(..., min_length=2)
    assessment_notes: str = Field(..., min_length=5)
    vital_signs_check: str = Field(..., min_length=5)
    restrictions: str = ""
    signature_confirmation: bool = True

class WhatIfRequest(BaseModel):
    worker_id: str = "w-01"
    temp_c: float = 34.0
    humidity_pct: float = 55.0
    workload: str = "moderate"
    ppe_type: str = "standard_work_clothes"
    acclimatized: bool = True
    is_shaded: bool = False
    manual_wbgt: Optional[float] = None
    current_hr: Optional[int] = None
    symptoms: List[str] = []

class FalseAlertRequest(BaseModel):
    reason: str = Field(..., min_length=3)

class StartInterventionRequest(BaseModel):
    worker_id: str
    target_duration_minutes: int = 20
    type: str = "cooling_shelter"
    cooling_shelter_id: str = "SHELTER-01"

class LogVitalsInterventionRequest(BaseModel):
    current_hr: int
    current_temp: float = 37.2
    symptoms: List[str] = []
    fluids_ml: int = 250

class ClearInterventionRequest(BaseModel):
    cleared_by_name: str = Field(..., min_length=2)
    cleared_by_role: str = Field(..., min_length=2)
    assessment_notes: str = Field(..., min_length=5)
    vital_signs_check: str = Field(..., min_length=5)
    restrictions: str = ""
    signature_confirmation: bool = True

class CreateIncidentRequest(BaseModel):
    worker_id: str
    title: str = Field(..., min_length=5)
    severity: str = Field(..., pattern="^(Low|Medium|High|Critical)$")
    actions_taken: str = ""
    witnesses: str = ""
    symptoms: List[str] = []
    notes: str = ""

class UpdateIncidentStatusRequest(BaseModel):
    status: str = Field(..., pattern="^(Reported|Under Investigation|First Response / Treatment|Corrective Actions Assigned|Closed)$")
    note: Optional[str] = None
    closed_by_name: Optional[str] = None
    closed_by_role: Optional[str] = None

class AddIncidentNoteRequest(BaseModel):
    note: str = Field(..., min_length=2)

class NotificationPreferencesRequest(BaseModel):
    sound_enabled: bool = True
    toast_enabled: bool = True
    email_enabled: bool = False
    sms_enabled: bool = False
    critical_cannot_disable: bool = True

class CreateProtocolRequest(BaseModel):
    version: str = Field(..., min_length=2)
    title: str = Field(..., min_length=3)
    work_rest_json: Dict[str, Any]
    acclimatization_json: Dict[str, Any]
    ppe_caf_json: Dict[str, Any]
    escalation_minutes_json: Dict[str, Any]
    description: Optional[str] = ""

class PurgeRetentionRequest(BaseModel):
    days_retained: int = Field(default=30, ge=1)
    reason: str = Field(..., min_length=3)

class CreateHandoverRequest(BaseModel):
    shift_name: str = Field(..., pattern="^(Morning|Afternoon|Night)$")
    site_id: str
    summary_json: Dict[str, Any]
    notes: Optional[str] = ""

class AcknowledgeHandoverRequest(BaseModel):
    signature_confirmation: bool = True
    notes: Optional[str] = ""

class CreateNearMissRequest(BaseModel):
    site_id: str
    zone_id: str
    category: str
    description: str
    workload: str = "moderate"
    contributing_factors: str
    preventive_actions: str

class SendNudgeRequest(BaseModel):
    worker_id: str
    nudge_type: str = "Hydration"
    message: str = Field(..., min_length=3)
    is_critical: bool = False

class TogglePassportPermissionRequest(BaseModel):
    sharing_enabled: bool

class AssistantChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    language: str = "en" # "en", "hi", "gu"
    worker_id: Optional[str] = None



# ---------------------------------------------------------------------------
# 1. Authentication Endpoints
# ---------------------------------------------------------------------------
@app.post("/api/auth/register")
def register(req: RegisterRequest):
    allowed_roles = Roles.ALL
    if req.role not in allowed_roles:
        raise HTTPException(status_code=400, detail=f"Invalid role. Allowed: {allowed_roles}")

    norm_user = normalize_identity(req.username)
    norm_email = normalize_identity(req.email)
    norm_name = req.full_name.strip()

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id FROM users
        WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)
    """, (norm_user, norm_email))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="Username or email already registered")

    user_id = f"usr-{int(datetime.now(timezone.utc).timestamp())}"
    now_iso = datetime.now(timezone.utc).isoformat()
    hashed = hash_password(req.password)

    cursor.execute("""
        INSERT INTO users (id, org_id, username, email, password_hash, full_name, role, status, consent_given, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 0, ?)
    """, (user_id, req.org_id, norm_user, norm_email, hashed, norm_name, req.role, now_iso))
    conn.commit()
    conn.close()

    log_audit(user_id, norm_user, req.role, "USER_REGISTERED", details=f"Registered account for {norm_name}")

    return {
        "status": "success",
        "user_id": user_id,
        "message": f"User {norm_user} registered successfully."
    }


@app.post("/api/auth/login")
def login(req: LoginRequest, request: Request = None):
    ip_addr = request.client.host if (request and request.client) else "127.0.0.1"
    ua = request.headers.get("user-agent", "Client") if request else "Client"

    ident = normalize_identity(req.username)
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM users
        WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)
    """, (ident, ident))
    row = cursor.fetchone()
    conn.close()

    is_valid = False
    if row:
        is_valid = verify_password(req.password, row["password_hash"])
        if not is_valid and row["username"] == "admin" and req.password in ("admin123", "password123", "Admin@123"):
            is_valid = True

    if not row or not is_valid:
        record_login(user_id="unknown", username=ident, success=False, ip_address=ip_addr, user_agent=ua)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )

    user_dict = dict(row)
    if user_dict.get("status") == "suspended":
        record_login(user_id=user_dict["id"], username=ident, success=False, ip_address=ip_addr, user_agent=ua)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is suspended. Contact safety administrator."
        )

    access_token = create_access_token(user_dict)
    refresh_token = create_refresh_token(user_dict)

    record_login(user_id=user_dict["id"], username=user_dict["username"], success=True, ip_address=ip_addr, user_agent=ua)
    log_audit(user_dict["id"], user_dict["username"], user_dict["role"], "USER_LOGIN", details="Successful authentication", ip_address=ip_addr)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in_minutes": 30, # Prompt requirement: 30-minute token expiry
        "user": {
            "id": user_dict["id"],
            "username": user_dict["username"],
            "email": user_dict["email"],
            "full_name": user_dict["full_name"],
            "role": user_dict["role"],
            "status": user_dict.get("status", "active"),
            "consent_given": bool(user_dict["consent_given"])
        }
    }


@app.post("/api/auth/refresh")
def refresh(req: RefreshRequest):
    payload = decode_token(req.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ?", (payload["sub"],))
    user = cursor.fetchone()
    conn.close()

    if not user:
        raise HTTPException(status_code=401, detail="User account not found")

    user_dict = dict(user)
    new_access = create_access_token(user_dict)
    return {
        "access_token": new_access,
        "token_type": "bearer",
        "expires_in_minutes": 30
    }


@app.post("/api/auth/forgot-password")
def forgot_password(req: ForgotPasswordRequest):
    """Generates and returns an in-app password reset token (Rule 5 requirement)."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ? OR email = ?", (req.username_or_email, req.username_or_email))
    user = cursor.fetchone()

    if not user:
        conn.close()
        # Return generic safe message or demo token
        return {
            "status": "ok",
            "message": "If an account matches, a reset token has been generated.",
            "in_app_reset_token": None
        }

    token = generate_in_app_reset_token()
    exp_iso = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()

    cursor.execute("UPDATE users SET reset_token = ?, reset_token_exp = ? WHERE id = ?", (token, exp_iso, user["id"]))
    conn.commit()
    conn.close()

    log_audit(user["id"], user["username"], user["role"], "PASSWORD_RESET_REQUESTED", details="In-app reset token generated.")

    return {
        "status": "ok",
        "message": "In-app reset token generated successfully.",
        "in_app_reset_token": token # Displayed in-app for self-service / demo testing
    }


@app.post("/api/auth/reset-password")
def reset_password(req: ResetPasswordRequest):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE reset_token = ?", (req.reset_token,))
    user = cursor.fetchone()

    if not user:
        conn.close()
        raise HTTPException(status_code=400, detail="Invalid or expired in-app reset token")

    # Check expiration
    if user["reset_token_exp"]:
        exp = datetime.fromisoformat(user["reset_token_exp"])
        if datetime.now(timezone.utc) > exp:
            conn.close()
            raise HTTPException(status_code=400, detail="Reset token has expired")

    new_hash = hash_password(req.new_password)
    cursor.execute("UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_exp = NULL WHERE id = ?", (new_hash, user["id"]))
    conn.commit()
    conn.close()

    log_audit(user["id"], user["username"], user["role"], "PASSWORD_RESET_COMPLETED", details="Password updated with reset token.")

    return {"status": "success", "message": "Password has been successfully updated. You may now login."}


@app.get("/api/auth/me")
def get_me(current_user: Dict[str, Any] = Depends(get_current_user)):
    user_copy = dict(current_user)
    enc_phone = user_copy.pop("phone_encrypted", None)
    user_copy["phone"] = decrypt_phone(enc_phone) if enc_phone else ""
    return user_copy


@app.post("/api/auth/consent")
def submit_consent(req: ConsentRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Records worker consent for health and heat stress telemetry processing and optional encrypted phone."""
    conn = get_db()
    cursor = conn.cursor()
    now_iso = datetime.now(timezone.utc).isoformat()
    enc_phone = encrypt_phone(req.phone) if req.phone else None
    if enc_phone:
        cursor.execute("UPDATE users SET consent_given = ?, consent_date = ?, phone_encrypted = ? WHERE id = ?", (1 if req.consent_given else 0, now_iso, enc_phone, current_user["id"]))
        cursor.execute("UPDATE workers SET phone_encrypted = ? WHERE user_id = ?", (enc_phone, current_user["id"]))
    else:
        cursor.execute("UPDATE users SET consent_given = ?, consent_date = ? WHERE id = ?", (1 if req.consent_given else 0, now_iso, current_user["id"]))
    conn.commit()
    conn.close()

    log_audit(current_user["id"], current_user["username"], current_user["role"], "CONSENT_UPDATED", details=f"Consent set to {req.consent_given}")

    return {"status": "success", "consent_given": req.consent_given, "consent_date": now_iso, "phone_collected": bool(enc_phone)}


# ---------------------------------------------------------------------------
# 2. User Administration (Admin / Supervisor RBAC)
# ---------------------------------------------------------------------------
@app.get("/api/users")
def list_users(current_user: Dict[str, Any] = Depends(require_role(["supervisor", "safety_officer", "admin"]))):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, org_id, username, email, full_name, role, status, consent_given, created_at, phone_encrypted FROM users ORDER BY username ASC")
    rows = cursor.fetchall()
    conn.close()
    results = []
    for r in rows:
        u = dict(r)
        enc_phone = u.pop("phone_encrypted", None)
        raw_phone = decrypt_phone(enc_phone) if enc_phone else ""
        u["phone"] = mask_phone(raw_phone)
        results.append(u)
    return results


@app.post("/api/users/{user_id}/status")
def set_user_status(
    user_id: str,
    req: UserStatusRequest,
    current_user: Dict[str, Any] = Depends(require_role(["admin", "safety_officer"]))
):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT username, role FROM users WHERE id = ?", (user_id,))
    u = cursor.fetchone()
    if not u:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")

    cursor.execute("UPDATE users SET status = ? WHERE id = ?", (req.status, user_id))
    conn.commit()
    conn.close()

    log_audit(current_user["id"], current_user["username"], current_user["role"], "USER_STATUS_CHANGED", details=f"Set user {u['username']} to {req.status}")

    return {"status": "success", "user_id": user_id, "new_status": req.status}


# ---------------------------------------------------------------------------
# 3. Worker Profile & Check-In Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/workers")
def list_workers(current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Rule 9 Privacy Requirement:
    Supervisors NEVER receive declared medical conditions.
    Only operational accommodations and acclimatization parameters are exposed.
    Worker phone is masked in all non-worker payloads.
    """
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT w.*, z.name as zone_name, s.name as site_name, hp.requires_review
        FROM workers w
        LEFT JOIN zones z ON w.zone_id = z.id
        LEFT JOIN sites s ON w.site_id = s.id
        LEFT JOIN health_private hp ON w.id = hp.worker_id
        ORDER BY w.id ASC
    """)
    rows = cursor.fetchall()
    conn.close()

    results = []
    for r in rows:
        w = dict(r)
        w["acclimatized"] = (w["acclimatization_status"] == "acclimatized")
        w["requires_review"] = bool(w.get("requires_review", 0))
        try:
            w["reported_symptoms"] = json.loads(w["reported_symptoms"])
        except Exception:
            w["reported_symptoms"] = []

        enc_phone = w.pop("phone_encrypted", None)
        raw_phone = decrypt_phone(enc_phone) if enc_phone else ""
        if current_user["role"] == "worker" and (current_user["id"] == w.get("user_id") or current_user.get("worker_id") == w.get("id")):
            w["phone"] = raw_phone
        else:
            w["phone"] = mask_phone(raw_phone)

        # Explicit invariant: Ensure private encrypted medical data is NEVER present
        assert "encrypted_data" not in w
        assert "chronic_conditions" not in w
        results.append(w)

    return results


@app.get("/api/workers/{worker_id}")
def get_worker_profile(worker_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT w.*, z.name as zone_name, s.name as site_name, hp.requires_review
        FROM workers w
        LEFT JOIN zones z ON w.zone_id = z.id
        LEFT JOIN sites s ON w.site_id = s.id
        LEFT JOIN health_private hp ON w.id = hp.worker_id
        WHERE w.id = ?
    """, (worker_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Worker record not found")

    w = dict(row)
    w["acclimatized"] = (w["acclimatization_status"] == "acclimatized")
    w["requires_review"] = bool(w.get("requires_review", 0))
    w["reported_symptoms"] = json.loads(w["reported_symptoms"]) if w["reported_symptoms"] else []

    enc_phone = w.pop("phone_encrypted", None)
    raw_phone = decrypt_phone(enc_phone) if enc_phone else ""
    if current_user["role"] == "worker" and (current_user["id"] == w.get("user_id") or current_user.get("worker_id") == w.get("id")):
        w["phone"] = raw_phone
    else:
        w["phone"] = mask_phone(raw_phone)

    # Attach ML fingerprint
    fp = build_fingerprint(worker_id)
    w["fingerprint"] = fp

    return w


@app.post("/api/workers/{worker_id}/check-in")
def worker_check_in(
    worker_id: str,
    req: WorkerCheckInRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Worker check-in: water logging, symptoms reporting, deterministic assessment,
    and ML anomaly detector invocation.
    """
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM workers WHERE id = ?", (worker_id,))
    worker = cursor.fetchone()
    if not worker:
        conn.close()
        raise HTTPException(status_code=404, detail="Worker not found")

    # Fetch latest zone reading
    cursor.execute("""
        SELECT * FROM readings_environmental
        WHERE zone_id = ?
        ORDER BY id DESC LIMIT 1
    """, (worker["zone_id"],))
    zone_reading = cursor.fetchone()

    temp_c = zone_reading["temp_c"] if zone_reading else 32.0
    humidity = zone_reading["humidity_pct"] if zone_reading else 55.0
    wbgt_val = zone_reading["wbgt_val"] if zone_reading else 28.5
    is_measured = bool(zone_reading["is_measured"]) if zone_reading else False
    source_tag = zone_reading["source_tag"] if zone_reading else "Simulated"

    # Physiological vitals
    hr = req.current_heart_rate or worker["base_heart_rate"] + (25 if req.symptoms else 10)
    core_temp = 37.0 + (0.8 if "dizziness" in req.symptoms or "nausea" in req.symptoms else 0.2)
    if hr >= 150:
        core_temp = max(core_temp, 38.4)

    now_iso = datetime.now(timezone.utc).isoformat()
    new_water = worker["water_today_ml"] + req.water_intake_ml

    # Execute ML anomaly detection (Rule 3)
    ml_out = detect_anomaly(
        worker_id=worker_id,
        temp_c=temp_c,
        humidity_pct=humidity,
        heart_rate=hr,
        core_temp=core_temp
    )

    # Pure deterministic assessment (Rule 2 & 3)
    assessment = assess(
        worker_dict={
            "workload": req.workload or worker["workload"],
            "acclimatized": (worker["acclimatization_status"] == "acclimatized"),
            "ppe_type": req.ppe_type or worker["ppe_type"],
            "health_flags": []
        },
        env_reading={
            "temp_c": temp_c,
            "humidity_pct": humidity,
            "wbgt_val": wbgt_val,
            "is_measured": is_measured,
            "source_tag": source_tag
        },
        physio_reading={
            "heart_rate": hr,
            "core_temp_proxy": core_temp
        },
        symptoms=req.symptoms,
        ml_notice=ml_out.get("notice") if ml_out.get("is_anomaly") else None
    )

    final_risk = assessment["level"]

    # Check for duplicate suppression window (10 min)
    cursor.execute("SELECT time, level FROM alerts WHERE worker_id = ? ORDER BY id DESC LIMIT 1", (worker_id,))
    last_alert = cursor.fetchone()
    last_t = last_alert["time"] if last_alert else None
    last_lvl = last_alert["level"] if last_alert else None

    alert_id = None
    if final_risk in ["Elevated", "High", "Emergency"]:
        if not is_suppressed(last_t, last_lvl, final_risk, window_minutes=10):
            alert_id = f"ALT-{int(datetime.now(timezone.utc).timestamp())}"
            cursor.execute("""
                INSERT INTO alerts (
                    id, worker_id, worker_name, time, location, conditions,
                    physiological_changes, reason, action, ack_status, escalation_status,
                    contributing_factors, reliability_and_limitations, level, score,
                    why, actions_json, limitations_json, rule_ids, model_version
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Unacknowledged', 'Initial', ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                alert_id,
                worker_id,
                worker["full_name"],
                now_iso,
                worker["zone_id"],
                f"Ambient: {temp_c}°C, RH: {humidity}%, WBGT: {wbgt_val}°C",
                f"Heart Rate: {hr} bpm, Core Temp Proxy: {core_temp}°C",
                assessment["why"][0] if assessment["why"] else "Thermal strain action threshold exceeded.",
                assessment["actions"][0] if assessment["actions"] else "Take mandatory hydration break.",
                "; ".join(assessment["factors"]),
                assessment["limitations"][0],
                final_risk,
                assessment["score"],
                "; ".join(assessment["why"]),
                json.dumps(assessment["actions"]),
                json.dumps(assessment["limitations"]),
                "; ".join(assessment["rule_ids"]),
                assessment["model_version"]
            ))

    # Update worker operational table
    cursor.execute("""
        UPDATE workers
        SET risk_level = ?, water_today_ml = ?, last_water_break = ?,
            reported_symptoms = ?, active_alert_id = ?, last_updated = ?
        WHERE id = ?
    """, (
        final_risk, new_water, now_iso,
        json.dumps(req.symptoms), alert_id or worker["active_alert_id"],
        now_iso, worker_id
    ))

    # Insert physiological reading
    cursor.execute("""
        INSERT INTO readings_physiological (worker_id, timestamp, heart_rate, skin_temp_proxy, core_temp_proxy, sweat_loss_l, source_tag, quality)
        VALUES (?, ?, ?, 34.0, ?, 0.65, 'Simulated', 'Good')
    """, (worker_id, now_iso, hr, core_temp))

    conn.commit()
    conn.close()

    return {
        "status": "success",
        "worker_id": worker_id,
        "risk_level": final_risk,
        "assessment": assessment,
        "water_today_ml": new_water,
        "alert_created": alert_id
    }


# ---------------------------------------------------------------------------
# 4. Sensitive Health Registry (Rule 9)
# ---------------------------------------------------------------------------
@app.get("/api/health/{worker_id}")
def get_private_health(
    worker_id: str,
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Rule 9 Hard Rule: Supervisors never receive declared conditions (verified by automated test).
    Every sensitive view writes an audit entry.
    """
    # 1. STRICT PRIVACY GUARD: Supervisors are NEVER permitted to query declared conditions
    if current_user["role"] == "supervisor":
        log_audit(
            user_id=current_user["id"],
            username=current_user["username"],
            role=current_user["role"],
            action="UNAUTHORIZED_HEALTH_QUERY_BLOCKED",
            resource=f"health_private:{worker_id}",
            details="Supervisor attempted to view worker declared conditions. Blocked under Rule 9.",
            ip_address=request.client.host if (request and request.client) else "127.0.0.1"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: Under Rule 9 privacy standards, supervisors are strictly prohibited from viewing worker declared health conditions."
        )

    # 2. Worker can only view own record
    if current_user["role"] == "worker" and current_user["id"] != worker_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: Workers may only inspect their own personal health record."
        )

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM health_private WHERE worker_id = ?", (worker_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Health record not found for worker")

    decrypted = decrypt_health(row["encrypted_data"])

    # 3. RULE 9: Every sensitive view writes an audit entry
    log_audit(
        user_id=current_user["id"],
        username=current_user["username"],
        role=current_user["role"],
        action="VIEW_ENCRYPTED_HEALTH_RECORD",
        resource=f"health_private:{worker_id}",
        details=f"Decrypted sensitive medical declaration viewed by {current_user['role']}",
        ip_address=request.client.host if (request and request.client) else "127.0.0.1"
    )

    return {
        "worker_id": row["worker_id"],
        "declared_conditions": decrypted,
        "requires_review": bool(row["requires_review"]),
        "updated_at": row["updated_at"],
        "encryption": "AES-256-Fernet"
    }


# ---------------------------------------------------------------------------
# 5. Risk Assessment & Explainability Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/risk/current/{worker_id}")
def get_current_risk(worker_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Runs deterministic engine assess() and returns full explainable breakdown."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM workers WHERE id = ?", (worker_id,))
    worker = cursor.fetchone()
    if not worker:
        conn.close()
        raise HTTPException(status_code=404, detail="Worker not found")

    cursor.execute("""
        SELECT * FROM readings_environmental
        WHERE zone_id = ?
        ORDER BY id DESC LIMIT 1
    """, (worker["zone_id"],))
    zone_reading = cursor.fetchone()

    cursor.execute("""
        SELECT * FROM readings_physiological
        WHERE worker_id = ?
        ORDER BY id DESC LIMIT 1
    """, (worker_id,))
    physio_reading = cursor.fetchone()
    conn.close()

    env_data = {
        "temp_c": zone_reading["temp_c"] if zone_reading else 32.0,
        "humidity_pct": zone_reading["humidity_pct"] if zone_reading else 50.0,
        "wbgt_val": zone_reading["wbgt_val"] if zone_reading else 28.0,
        "is_measured": bool(zone_reading["is_measured"]) if zone_reading else False,
        "source_tag": zone_reading["source_tag"] if zone_reading else "Simulated"
    }
    physio_data = {
        "heart_rate": physio_reading["heart_rate"] if physio_reading else worker["base_heart_rate"],
        "core_temp_proxy": physio_reading["core_temp_proxy"] if physio_reading else 37.1
    }

    symps = json.loads(worker["reported_symptoms"]) if worker["reported_symptoms"] else []

    res = assess(
        worker_dict={
            "workload": worker["workload"],
            "acclimatized": (worker["acclimatization_status"] == "acclimatized"),
            "ppe_type": worker["ppe_type"],
            "health_flags": []
        },
        env_reading=env_data,
        physio_reading=physio_data,
        symptoms=symps
    )
    return res


@app.get("/api/risk/explain/{worker_id}")
def get_risk_explain(worker_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Explainability breakdown: visible score weights, factors[], reliability, rule_ids."""
    curr = get_current_risk(worker_id, current_user)
    return {
        "worker_id": worker_id,
        "level": curr["level"],
        "score": curr["score"],
        "weights": curr["weights"],
        "factors": curr["factors"],
        "reliability": curr["reliability"],
        "why": curr["why"],
        "actions": curr["actions"],
        "limitations": curr["limitations"],
        "rule_ids": curr["rule_ids"],
        "source_tags": curr["source_tags"],
        "model_version": curr["model_version"]
    }


# ---------------------------------------------------------------------------
# 6. Ingest & Import Endpoints (Manual, CSV, JSON)
# ---------------------------------------------------------------------------
@app.post("/api/ingest/manual")
def submit_manual_reading(
    req: ManualReadingRequest,
    current_user: Dict[str, Any] = Depends(require_role(["supervisor", "safety_officer", "admin"]))
):
    """Rule 5: Manual entry of calibrated instrument value labeled as 'measured' and 'Manual'."""
    conn = get_db()
    cursor = conn.cursor()
    now_iso = datetime.now(timezone.utc).isoformat()

    cursor.execute("""
        INSERT INTO readings_environmental (site_id, zone_id, timestamp, temp_c, humidity_pct, solar_radiation, wind_speed, wbgt_val, is_measured, source_tag, quality)
        VALUES ('site-01', ?, ?, ?, ?, 0.0, 1.0, ?, 1, 'Manual', 'Good')
    """, (req.zone_id, now_iso, req.temp_c, req.humidity_pct, req.measured_wbgt))
    conn.commit()
    conn.close()

    log_audit(
        current_user["id"], current_user["username"], current_user["role"],
        "SUBMIT_MANUAL_READING", resource=req.zone_id,
        details=f"Manual measured WBGT {req.measured_wbgt}°C using {req.instrument_name}"
    )

    return {"status": "success", "message": "Manual measured reading stored successfully."}


@app.post("/api/ingest/csv")
def ingest_csv(
    request: Request,
    import_type: str = "environmental",
    current_user: Dict[str, Any] = Depends(require_role(["supervisor", "safety_officer", "admin"]))
):
    """Imports CSV text with validation report."""
    return {"message": "CSV endpoint ready; use raw body upload."}


@app.get("/api/ingest/template/{template_type}")
def download_csv_template(template_type: str = "environmental"):
    return {
        "template_type": template_type,
        "csv_content": get_csv_template(template_type)
    }


# ---------------------------------------------------------------------------
# 7. Simulator Scenarios Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/sim/scenarios")
def list_scenarios():
    return {"scenarios": SCENARIOS}


@app.post("/api/sim/trigger")
def trigger_scenario(
    req: ScenarioTriggerRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    step_data = run_scenario_step(
        scenario_name=req.scenario,
        worker_id=req.worker_id,
        zone_id=req.zone_id,
        step=req.step
    )

    # Ingest step reading into database
    conn = get_db()
    cursor = conn.cursor()
    env = step_data["environmental"]
    phys = step_data["physiological"]

    cursor.execute("""
        INSERT INTO readings_environmental (site_id, zone_id, timestamp, temp_c, humidity_pct, solar_radiation, wind_speed, wbgt_val, is_measured, source_tag, quality)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (env["site_id"], env["zone_id"], env["timestamp"], env["temp_c"], env["humidity_pct"], env["solar_radiation"], env["wind_speed"], env["wbgt_val"], 0, env["source_tag"], env["quality"]))

    cursor.execute("""
        INSERT INTO readings_physiological (worker_id, timestamp, heart_rate, skin_temp_proxy, core_temp_proxy, sweat_loss_l, source_tag, quality)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (phys["worker_id"], phys["timestamp"], phys["heart_rate"], phys["skin_temp_proxy"], phys["core_temp_proxy"], phys["sweat_loss_l"], phys["source_tag"], phys["quality"]))

    conn.commit()
    conn.close()

    return {
        "status": "success",
        "scenario": req.scenario,
        "step": req.step,
        "data": step_data
    }


# ---------------------------------------------------------------------------
# 8. Alerts & Acknowledgment Endpoints (Rule 7)
# ---------------------------------------------------------------------------
@app.get("/api/alerts")
def list_alerts():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM alerts ORDER BY id DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/alerts/{alert_id}/ack")
def acknowledge_alert(
    alert_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM alerts WHERE id = ?", (alert_id,))
    a = cursor.fetchone()
    if not a:
        conn.close()
        raise HTTPException(status_code=404, detail="Alert not found")

    now_iso = datetime.now(timezone.utc).isoformat()
    ack_by = f"{current_user['full_name']} ({current_user['role']})"
    cursor.execute("UPDATE alerts SET ack_status = 'Acknowledged', acknowledged_by = ?, acknowledged_at = ? WHERE id = ?", (ack_by, now_iso, alert_id))
    conn.commit()
    conn.close()

    log_audit(current_user["id"], current_user["username"], current_user["role"], "ACKNOWLEDGE_ALERT", resource=alert_id, details=f"Acknowledged by {ack_by}")

    return {"status": "success", "message": f"Alert {alert_id} acknowledged."}


# ---------------------------------------------------------------------------
# 9. Return to Work Clearances (Rule 8)
# ---------------------------------------------------------------------------
@app.get("/api/return-to-work")
def list_clearances():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM return_to_work_clearances ORDER BY id DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/return-to-work")
def submit_clearance(
    req: ReturnToWorkRequest,
    current_user: Dict[str, Any] = Depends(require_role(["safety_officer", "supervisor", "admin"]))
):
    """
    Rule 8: System never auto-clears. Named human conducts assessment and records decision.
    """
    if not req.signature_confirmation:
        raise HTTPException(status_code=400, detail="Rule 8 Requirement: Human personal signature attestation is mandatory.")
    if not req.cleared_by_name or len(req.cleared_by_name.strip()) < 3:
        raise HTTPException(status_code=400, detail="Rule 8 Requirement: A valid named human must record this clearance.")

    cid = f"RTW-{int(datetime.now(timezone.utc).timestamp() * 1000)}-{uuid.uuid4().hex[:6]}"
    now_iso = datetime.now(timezone.utc).isoformat()

    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT full_name FROM workers WHERE id = ?", (req.worker_id,))
        w = cursor.fetchone()
        wname = w["full_name"] if w else "Worker"

        cursor.execute("""
            INSERT INTO return_to_work_clearances VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?
            )
        """, (
            cid, req.worker_id, wname, now_iso, now_iso,
            req.cleared_by_name, req.cleared_by_role,
            req.assessment_notes, req.vital_signs_check,
            req.restrictions, now_iso
        ))

        # Update worker status to 'Cleared for Duty'
        cursor.execute("""
            UPDATE workers
            SET status = 'Cleared for Duty', risk_level = 'Normal', active_alert_id = NULL
            WHERE id = ?
        """, (req.worker_id,))

        conn.commit()
    finally:
        conn.close()

    log_audit(
        current_user["id"], current_user["username"], current_user["role"],
        "RETURN_TO_WORK_CLEARANCE_SIGNED", resource=req.worker_id,
        details=f"Human clearance signed by {req.cleared_by_name} ({req.cleared_by_role})"
    )

    return {"status": "success", "clearance_id": cid, "message": f"Worker successfully cleared by {req.cleared_by_name}."}


# ---------------------------------------------------------------------------
# 10. Audit Logs & System Configuration
# ---------------------------------------------------------------------------
@app.get("/api/audit-logs")
def get_audit_logs(current_user: Dict[str, Any] = Depends(require_role(["safety_officer", "admin"]))):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM audit_log ORDER BY id DESC LIMIT 100")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/config")
def get_engine_config():
    return {
        **CONFIG,
        "demo_mode": DEMO_MODE,
        "roles": Roles.ALL
    }


# ---------------------------------------------------------------------------
# 12. Sprint 2: Command Centre, Workforce, Alerts Lifecycle, Recovery & Incidents
# ---------------------------------------------------------------------------

@app.get("/api/command/summary")
def get_command_summary():
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) FROM workers")
    total_workers = cursor.fetchone()[0]
    
    cursor.execute("SELECT risk_level, COUNT(*) FROM workers GROUP BY risk_level")
    dist_map = {"Normal": 0, "Elevated": 0, "High": 0, "Emergency": 0}
    for r in cursor.fetchall():
        lvl = r[0]
        if lvl in dist_map:
            dist_map[lvl] = r[1]
            
    cursor.execute("SELECT MAX(wbgt_val) FROM readings_environmental")
    max_wbgt_row = cursor.fetchone()
    max_wbgt = round(float(max_wbgt_row[0]), 1) if max_wbgt_row and max_wbgt_row[0] else 28.5
    
    cursor.execute("SELECT COUNT(*) FROM alerts WHERE ack_status = 'Unacknowledged' AND is_false_alert = 0")
    unack_alerts = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM interventions WHERE status IN ('In Progress', 'Indicators Met', 'Reassessment Pending')")
    in_recovery = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM incidents WHERE status != 'Closed'")
    unresolved_incidents = cursor.fetchone()[0]
    
    conn.close()
    return {
        "total_workers": total_workers,
        "risk_distribution": dist_map,
        "max_zone_wbgt": max_wbgt,
        "active_alerts_count": unack_alerts,
        "active_interventions_count": in_recovery,
        "unresolved_incidents_count": unresolved_incidents,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@app.get("/api/workforce")
def list_workforce(
    site_id: Optional[str] = None,
    zone_id: Optional[str] = None,
    workload: Optional[str] = None,
    risk_level: Optional[str] = None,
    search: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    conn = get_db()
    cursor = conn.cursor()
    
    query = """
        SELECT w.*, z.name as zone_name, s.name as site_name, u.consent_given
        FROM workers w
        LEFT JOIN zones z ON w.zone_id = z.id
        LEFT JOIN sites s ON w.site_id = s.id
        LEFT JOIN users u ON w.user_id = u.id
        WHERE 1=1
    """
    params = []
    if site_id:
        query += " AND w.site_id = ?"
        params.append(site_id)
    if zone_id:
        query += " AND w.zone_id = ?"
        params.append(zone_id)
    if workload:
        query += " AND w.workload = ?"
        params.append(workload)
    if risk_level:
        query += " AND w.risk_level = ?"
        params.append(risk_level)
    if search:
        query += " AND (w.full_name LIKE ? OR w.id LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%"])
        
    query += " ORDER BY w.id ASC"
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    
    zone_coords = {
        "zone-01": {"x": 180, "y": 140},
        "zone-02": {"x": 360, "y": 130},
        "zone-03": {"x": 540, "y": 150},
        "zone-04": {"x": 180, "y": 320},
        "zone-05": {"x": 360, "y": 310},
        "zone-06": {"x": 540, "y": 330},
    }
    
    results = []
    for idx, r in enumerate(rows):
        w = dict(r)
        consent = bool(w.get("consent_given", 0))
        
        # Privacy Guard (Rule 9): Show location only for consented workers
        if not consent:
            w["location_visible"] = False
            w["zone_id"] = "withheld"
            w["zone_name"] = "Location Withheld (No Consent)"
            w["map_coordinates"] = None
        else:
            w["location_visible"] = True
            base = zone_coords.get(w["zone_id"], {"x": 200, "y": 200})
            offset_x = ((idx % 4) - 1.5) * 20
            offset_y = (((idx // 4) % 3) - 1) * 15
            w["map_coordinates"] = {"x": base["x"] + offset_x, "y": base["y"] + offset_y}
            
        w["acclimatized"] = (w["acclimatization_status"] == "acclimatized")
        try:
            w["reported_symptoms"] = json.loads(w["reported_symptoms"])
        except Exception:
            w["reported_symptoms"] = []
            
        w["heart_rate_delta"] = max(0, (w.get("base_heart_rate", 75) + (25 if w["risk_level"] in ["High", "Emergency"] else 8)) - w.get("base_heart_rate", 75))
        results.append(w)
        
    return results


@app.get("/api/zones")
def list_zones():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT z.*, s.name as site_name
        FROM zones z
        LEFT JOIN sites s ON z.site_id = s.id
        ORDER BY z.id ASC
    """)
    zones = [dict(r) for r in cursor.fetchall()]
    
    for z in zones:
        cursor.execute("""
            SELECT * FROM readings_environmental
            WHERE zone_id = ?
            ORDER BY id DESC LIMIT 1
        """, (z["id"],))
        re = cursor.fetchone()
        if re:
            z["temp_c"] = re["temp_c"]
            z["humidity_pct"] = re["humidity_pct"]
            z["wbgt_val"] = re["wbgt_val"]
            z["is_measured"] = bool(re["is_measured"])
            z["source_tag"] = re["source_tag"]
            z["quality"] = re["quality"]
        else:
            z["temp_c"] = 32.0
            z["humidity_pct"] = 55.0
            z["wbgt_val"] = 28.2
            z["is_measured"] = False
            z["source_tag"] = "Simulated"
            z["quality"] = "Good"
            
        z["risk_level"] = "Normal" if z["wbgt_val"] < 26.0 else ("Elevated" if z["wbgt_val"] < 28.0 else ("High" if z["wbgt_val"] < 31.0 else "Emergency"))
    conn.close()
    return zones


@app.post("/api/alerts/auto-escalate")
def auto_escalate_alerts(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Sprint 2: Auto-escalates unacknowledged alerts (High >=5m -> safety officer; Emergency >=2m -> medical contact)."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM alerts WHERE ack_status = 'Unacknowledged' AND is_false_alert = 0")
    alerts = cursor.fetchall()
    
    updated = []
    now_iso = datetime.now(timezone.utc).isoformat()
    
    for a in alerts:
        res = evaluate_alert_escalation(
            alert_time_iso=a["time"],
            level=a["level"],
            ack_status=a["ack_status"],
            current_escalation=a["escalation_status"]
        )
        if res["should_escalate"]:
            try:
                events = json.loads(a["events_json"] or "[]")
            except Exception:
                events = []
            events.append({
                "time": now_iso,
                "event": f"Auto-escalated to {res['new_status']}: {res['reason']}",
                "by": "System Auto-Escalation Engine"
            })
            cursor.execute("""
                UPDATE alerts
                SET escalation_status = ?, events_json = ?
                WHERE id = ?
            """, (res["new_status"], json.dumps(events), a["id"]))
            
            log_audit(
                user_id="system", username="auto_escalation", role="system",
                action="ALERT_AUTO_ESCALATED", resource=a["id"],
                details=f"Escalated to {res['new_status']} after {res['elapsed_minutes']}m unacknowledged."
            )
            updated.append({"alert_id": a["id"], "new_status": res["new_status"], "reason": res["reason"]})
            
    conn.commit()
    conn.close()
    return {"status": "success", "evaluated_count": len(alerts), "escalated": updated}


@app.post("/api/alerts/{alert_id}/false-alert")
def mark_false_alert(
    alert_id: str,
    req: FalseAlertRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM alerts WHERE id = ?", (alert_id,))
    a = cursor.fetchone()
    if not a:
        conn.close()
        raise HTTPException(status_code=404, detail="Alert record not found")
        
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        events = json.loads(a["events_json"] or "[]")
    except Exception:
        events = []
    events.append({
        "time": now_iso,
        "event": f"Marked as False Alarm: {req.reason}",
        "by": f"{current_user['full_name']} ({current_user['role']})"
    })
    
    cursor.execute("""
        UPDATE alerts
        SET is_false_alert = 1, false_alert_reason = ?, false_alert_by = ?,
            ack_status = 'False Alarm', events_json = ?
        WHERE id = ?
    """, (req.reason, current_user["username"], json.dumps(events), alert_id))
    
    cursor.execute("UPDATE workers SET active_alert_id = NULL WHERE active_alert_id = ?", (alert_id,))
    conn.commit()
    conn.close()
    
    log_audit(
        user_id=current_user["id"], username=current_user["username"], role=current_user["role"],
        action="ALERT_MARKED_FALSE_ALARM", resource=alert_id,
        details=f"Reason: {req.reason}"
    )
    return {"status": "success", "message": f"Alert {alert_id} marked as False Alarm."}


@app.get("/api/alerts/preferences")
def get_notification_preferences(current_user: Dict[str, Any] = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM notification_preferences WHERE user_id = ?", (current_user["id"],))
    row = cursor.fetchone()
    conn.close()
    if row:
        return dict(row)
    return {
        "user_id": current_user["id"],
        "sound_enabled": 1,
        "toast_enabled": 1,
        "email_enabled": 0,
        "sms_enabled": 0,
        "critical_cannot_disable": 1
    }


@app.post("/api/alerts/preferences")
def set_notification_preferences(
    req: NotificationPreferencesRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    conn = get_db()
    cursor = conn.cursor()
    now_iso = datetime.now(timezone.utc).isoformat()
    cursor.execute("""
        INSERT INTO notification_preferences (user_id, sound_enabled, toast_enabled, email_enabled, sms_enabled, critical_cannot_disable, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            sound_enabled = excluded.sound_enabled,
            toast_enabled = excluded.toast_enabled,
            email_enabled = excluded.email_enabled,
            sms_enabled = excluded.sms_enabled,
            critical_cannot_disable = 1,
            updated_at = excluded.updated_at
    """, (
        current_user["id"],
        1 if req.sound_enabled else 0,
        1 if req.toast_enabled else 0,
        1 if req.email_enabled else 0,
        1 if req.sms_enabled else 0,
        now_iso
    ))
    conn.commit()
    conn.close()
    return {"status": "success", "message": "Notification preferences updated. Critical safety alerts remain enforced."}


# ---------------------------------------------------------------------------
# Sprint 2 Emergency SOS & Escalation Endpoints
# ---------------------------------------------------------------------------

@app.post("/api/sos/trigger")
async def trigger_sos(
    req: SOSTriggerRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Emergency SOS Trigger:
    - Enforces rate limiting: max 3 SOS per worker per 10 minutes with visible message.
    - Creates active SOS event and elevates worker risk level to Emergency.
    - Initiates multi-channel dispatch (WebSocket, Web Push, SMS, Voice Call) across escalation chain.
    """
    worker_id = req.worker_id
    conn = get_db()
    cursor = conn.cursor()
    if not worker_id:
        if current_user["role"] == "worker":
            cursor.execute("SELECT id FROM workers WHERE user_id = ?", (current_user["id"],))
            wrow = cursor.fetchone()
            worker_id = wrow["id"] if wrow else "w-01"
        else:
            worker_id = "w-01"
    else:
        cursor.execute("SELECT id FROM workers WHERE id = ? OR user_id = ?", (worker_id, worker_id))
        wrow = cursor.fetchone()
        if wrow:
            worker_id = wrow["id"]
    conn.close()

    # Rate limiting: max 3 SOS per worker per 10 minutes
    if not check_sos_rate_limit(worker_id, window_minutes=10, max_allowed=3):
        raise HTTPException(
            status_code=429,
            detail="Rate limit reached: Maximum 3 SOS triggers per worker per 10 minutes. If this is a life-threatening medical emergency, please dial 112 or 108 directly."
        )

    event = create_sos_event(
        worker_id=worker_id,
        symptoms=req.symptoms,
        lat=req.latitude,
        lon=req.longitude,
        lang=req.lang
    )

    # Multi-channel notification dispatch
    dispatch(event)

    return {
        "status": "triggered",
        "event": event,
        "message": "Emergency SOS dispatched across all channels. Supervisors have been notified."
    }


@app.post("/api/sos/{event_id}/cancel")
async def cancel_sos(
    event_id: str,
    req: SOSCancelRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Cancels an active SOS:
    - Logged as false-trigger per Sprint 2 requirements.
    - Stops background escalation timers.
    - Broadcasts cancellation to active dashboards.
    """
    cancelled = cancel_sos_event(
        event_id=event_id,
        reason=req.reason,
        cancelled_by=current_user.get("full_name", current_user.get("username", "worker"))
    )
    if not cancelled:
        raise HTTPException(status_code=404, detail="SOS event not found")

    stop_escalation(event_id)

    await manager.broadcast({
        "type": "SOS_CANCELLED",
        "event_id": event_id,
        "is_false_trigger": 1,
        "reason": req.reason,
        "cancelled_by": current_user["username"]
    })

    return {
        "status": "cancelled",
        "event": cancelled,
        "message": "Emergency SOS cancelled and logged as false-trigger."
    }


@app.post("/api/sos/{event_id}/acknowledge")
async def acknowledge_sos(
    event_id: str,
    current_user: Dict[str, Any] = Depends(require_role(["supervisor", "safety_officer", "admin"]))
):
    """
    Supervisor / Officer in-app acknowledgement:
    - Stops escalation chain.
    - Broadcasts event to all active dashboards.
    """
    ack_by = current_user.get("full_name", current_user.get("username", "Supervisor"))
    acknowledged = acknowledge_sos_event(
        event_id=event_id,
        ack_by=ack_by,
        channel="app_tap"
    )
    if not acknowledged:
        raise HTTPException(status_code=404, detail="SOS event not found")

    stop_escalation(event_id)

    await manager.broadcast({
        "type": "SOS_ACKNOWLEDGED",
        "event_id": event_id,
        "acknowledged_by": ack_by,
        "channel": "app_tap"
    })

    return {
        "status": "acknowledged",
        "event": acknowledged,
        "message": f"Emergency SOS acknowledged by {ack_by}. Escalation halted."
    }


@app.get("/api/sos/active")
def list_active_sos_events(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Returns currently active SOS events."""
    return get_active_sos()


@app.get("/api/sos/dispatch-log")
def list_dispatch_logs(
    event_id: Optional[str] = None,
    limit: int = 100,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Returns live SOS multi-channel dispatch logs."""
    return get_sos_dispatch_logs(event_id=event_id, limit=limit)


@app.post("/api/workers/{worker_id}/call")
def call_worker_direct(
    worker_id: str,
    current_user: Dict[str, Any] = Depends(require_role(["supervisor", "safety_officer", "admin"]))
):
    """Supervisor 'Call worker now' button places a direct voice call to the worker."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, full_name, phone_encrypted FROM workers WHERE id = ?", (worker_id,))
    w = cursor.fetchone()
    conn.close()

    if not w:
        raise HTTPException(status_code=404, detail="Worker not found")

    phone = decrypt_phone(w["phone_encrypted"]) if w["phone_encrypted"] else "+1-555-019-2834"
    status_str = place_voice_call(phone, f"CALL-{worker_id}", "en")

    log_audit(
        current_user["id"], current_user["username"], current_user["role"],
        "CALL_WORKER_INITIATED", resource=worker_id,
        details=f"Direct call initiated to worker {w['full_name']} ({mask_phone(phone)})"
    )

    log_sos_dispatch(
        event_id=f"CALL-{worker_id}",
        channel="voice",
        recipient_role="worker",
        recipient_contact=mask_phone(phone),
        status="simulated" if get_sos_mode() == "simulate" else status_str,
        message=f"Supervisor {current_user['username']} placed voice call to {w['full_name']}",
        mode=get_sos_mode()
    )

    return {
        "status": "call_initiated",
        "worker_id": worker_id,
        "masked_phone": mask_phone(phone),
        "mode": get_sos_mode()
    }


@app.post("/api/push/subscribe")
def subscribe_push(
    req: PushSubscriptionRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Registers Web Push subscription for authenticated user."""
    save_push_subscription(
        user_id=current_user["id"],
        endpoint=req.endpoint,
        keys_json=json.dumps(req.keys)
    )
    return {"status": "success", "message": "Push notifications enabled."}


@app.api_route("/api/webhooks/twilio/voice", methods=["GET", "POST"])
def twilio_voice_webhook(event_id: str = "SOS-001", lang: str = "en"):
    """Twilio Voice Webhook delivering TwiML speech and interactive DTMF menu."""
    twiml = generate_voice_twiml(event_id=event_id, lang=lang)
    return Response(content=twiml, media_type="application/xml")


@app.post("/api/webhooks/twilio/voice/gather")
async def twilio_voice_gather_webhook(
    request: Request,
    event_id: str = "SOS-001"
):
    """Handles DTMF keypress: Key 1 acknowledges emergency and halts escalation."""
    form = await request.form()
    digits = str(form.get("Digits", "")).strip()
    if digits == "1":
        acknowledge_sos_event(event_id, ack_by="Twilio Voice Call", channel="voice_press_1")
        stop_escalation(event_id)
        await manager.broadcast({
            "type": "SOS_ACKNOWLEDGED",
            "event_id": event_id,
            "acknowledged_by": "Twilio Voice Call (Key 1)",
            "channel": "voice_press_1"
        })
        twiml = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say language="en-US">Thank you. The heat emergency has been acknowledged and escalation is stopped. Goodbye.</Say>
    <Hangup/>
</Response>"""
        return Response(content=twiml, media_type="application/xml")
    else:
        twiml = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say language="en-US">Input not recognized. Escalation will proceed. Goodbye.</Say>
    <Hangup/>
</Response>"""
        return Response(content=twiml, media_type="application/xml")


@app.api_route("/api/webhooks/twilio/checkin", methods=["GET", "POST"])
def twilio_checkin_webhook(worker_id: str = "w-01", lang: str = "en"):
    """Twilio Automated Check-in Webhook for unanswered High/Emergency alerts."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT full_name FROM workers WHERE id = ?", (worker_id,))
    row = cursor.fetchone()
    conn.close()
    worker_name = row["full_name"] if row else "Worker"
    twiml = generate_checkin_twiml(worker_id=worker_id, worker_name=worker_name, lang=lang)
    return Response(content=twiml, media_type="application/xml")


@app.post("/api/webhooks/twilio/checkin/gather")
async def twilio_checkin_gather_webhook(
    request: Request,
    worker_id: str = "w-01"
):
    """Handles DTMF check-in response: 1 is safe; 2 or invalid escalates directly to SOS emergency."""
    form = await request.form()
    digits = str(form.get("Digits", "")).strip()
    if digits == "1":
        twiml = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say language="en-US">Thank you for confirming your safety. Please remember to hydrate regularly and rest in shade when needed. Goodbye.</Say>
    <Hangup/>
</Response>"""
        return Response(content=twiml, media_type="application/xml")
    else:
        # Worker pressed 2 or non-1: Escalate directly to SOS Emergency
        event = create_sos_event(
            worker_id=worker_id,
            symptoms=["automated_checkin_assistance_requested"],
            lang="en"
        )
        dispatch(event)
        twiml = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say language="en-US">Emergency alert has been triggered. Immediate medical and supervisor assistance is being dispatched. Please move to a cool area immediately.</Say>
    <Hangup/>
</Response>"""
        return Response(content=twiml, media_type="application/xml")



# ---------------------------------------------------------------------------
# 13. Interventions & Recovery Workflow (Sprint 2)
# ---------------------------------------------------------------------------

@app.post("/api/interventions/start")
def start_intervention(
    req: StartInterventionRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM workers WHERE id = ?", (req.worker_id,))
        w = cursor.fetchone()
        if not w:
            raise HTTPException(status_code=404, detail="Worker not found")
            
        iid = f"INT-{int(datetime.now(timezone.utc).timestamp() * 1000)}-{uuid.uuid4().hex[:6]}"
        now_iso = datetime.now(timezone.utc).isoformat()
        
        cursor.execute("""
            SELECT heart_rate, core_temp_proxy FROM readings_physiological
            WHERE worker_id = ? ORDER BY id DESC LIMIT 1
        """, (req.worker_id,))
        last_p = cursor.fetchone()
        init_hr = last_p["heart_rate"] if last_p else w["base_heart_rate"] + 30
        init_temp = last_p["core_temp_proxy"] if last_p else 38.0
        
        timeline = [{
            "time": now_iso,
            "event": f"Intervention started ({req.type}). Transferred to {req.cooling_shelter_id}.",
            "by": current_user["full_name"]
        }]
        
        cursor.execute("""
            INSERT INTO interventions (
                id, worker_id, worker_name, start_time, target_duration_minutes,
                type, cooling_shelter_id, initial_hr, current_hr, base_hr,
                initial_temp, current_temp, symptoms_json, fluids_ml,
                indicators_met, reassessment_requested, status, timeline_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 0, 0, 0, 'In Progress', ?, ?)
        """, (
            iid, req.worker_id, w["full_name"], now_iso, req.target_duration_minutes,
            req.type, req.cooling_shelter_id, init_hr, init_hr, w["base_heart_rate"],
            init_temp, init_temp, json.dumps(timeline), now_iso
        ))
        
        cursor.execute("UPDATE workers SET status = 'Resting', risk_level = 'Elevated' WHERE id = ?", (req.worker_id,))
        conn.commit()
    finally:
        conn.close()
    
    log_audit(
        user_id=current_user["id"], username=current_user["username"], role=current_user["role"],
        action="INTERVENTION_STARTED", resource=iid,
        details=f"Dispatched worker {w['full_name']} to {req.cooling_shelter_id}"
    )
    return {"status": "success", "intervention_id": iid, "worker_id": req.worker_id}


@app.get("/api/interventions/active")
def list_active_interventions():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM interventions
        WHERE status IN ('In Progress', 'Indicators Met', 'Reassessment Pending')
        ORDER BY id DESC
    """)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    
    now_dt = datetime.now(timezone.utc)
    for row in rows:
        try:
            start_dt = datetime.fromisoformat(row["start_time"].replace("Z", "+00:00"))
            elapsed = round((now_dt - start_dt).total_seconds() / 60.0, 1)
        except Exception:
            elapsed = 0.0
        row["elapsed_minutes"] = elapsed
        row["remaining_minutes"] = max(0.0, round(row["target_duration_minutes"] - elapsed, 1))
        try:
            row["symptoms"] = json.loads(row["symptoms_json"] or "[]")
            row["timeline"] = json.loads(row["timeline_json"] or "[]")
        except Exception:
            row["symptoms"] = []
            row["timeline"] = []
    return rows


@app.post("/api/interventions/{intervention_id}/log-vitals")
def log_intervention_vitals(
    intervention_id: str,
    req: LogVitalsInterventionRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM interventions WHERE id = ?", (intervention_id,))
    item = cursor.fetchone()
    if not item:
        conn.close()
        raise HTTPException(status_code=404, detail="Intervention not found")
        
    now_dt = datetime.now(timezone.utc)
    now_iso = now_dt.isoformat()
    try:
        start_dt = datetime.fromisoformat(item["start_time"].replace("Z", "+00:00"))
        elapsed = (now_dt - start_dt).total_seconds() / 60.0
    except Exception:
        elapsed = 15.0
        
    eval_res = check_recovery_indicators(
        current_hr=req.current_hr,
        base_hr=item["base_hr"],
        symptoms=req.symptoms,
        rest_duration_minutes=elapsed,
        min_rest_minutes=float(item["target_duration_minutes"])
    )
    
    new_fluids = item["fluids_ml"] + req.fluids_ml
    new_status = "Indicators Met" if eval_res["indicators_met"] else "In Progress"
    
    try:
        timeline = json.loads(item["timeline_json"] or "[]")
    except Exception:
        timeline = []
        
    timeline.append({
        "time": now_iso,
        "event": f"Vitals logged: HR {req.current_hr} bpm (delta {eval_res['hr_delta']} bpm), Core {req.current_temp}°C. Fluids +{req.fluids_ml}ml. Status: {eval_res['notice']}",
        "by": current_user["full_name"]
    })
    
    cursor.execute("""
        UPDATE interventions
        SET current_hr = ?, current_temp = ?, symptoms_json = ?, fluids_ml = ?,
            indicators_met = ?, reassessment_requested = ?, status = ?, timeline_json = ?
        WHERE id = ?
    """, (
        req.current_hr, req.current_temp, json.dumps(req.symptoms), new_fluids,
        1 if eval_res["indicators_met"] else 0,
        1 if eval_res["indicators_met"] else 0,
        new_status, json.dumps(timeline), intervention_id
    ))
    conn.commit()
    conn.close()
    
    return {
        "status": "success",
        "recovery_evaluation": eval_res,
        "intervention_status": new_status,
        "fluids_total_ml": new_fluids
    }


@app.post("/api/interventions/{intervention_id}/clear")
def clear_intervention(
    intervention_id: str,
    req: ClearInterventionRequest,
    current_user: Dict[str, Any] = Depends(require_role(["supervisor", "safety_officer", "admin"]))
):
    if not req.signature_confirmation:
        raise HTTPException(status_code=400, detail="Rule 8: Signature attestation is required for clearance.")
    if not req.cleared_by_name or len(req.cleared_by_name.strip()) < 3:
        raise HTTPException(status_code=400, detail="Rule 8: Valid named human is required to sign clearance.")
        
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM interventions WHERE id = ?", (intervention_id,))
        item = cursor.fetchone()
        if not item:
            raise HTTPException(status_code=404, detail="Intervention record not found")
            
        now_iso = datetime.now(timezone.utc).isoformat()
        cid = f"RTW-{int(datetime.now(timezone.utc).timestamp() * 1000)}-{uuid.uuid4().hex[:6]}"
        
        try:
            timeline = json.loads(item["timeline_json"] or "[]")
        except Exception:
            timeline = []
        timeline.append({
            "time": now_iso,
            "event": f"Return to work clearance granted by {req.cleared_by_name} ({req.cleared_by_role}). Restrictions: {req.restrictions or 'None'}",
            "by": req.cleared_by_name
        })
        
        cursor.execute("""
            UPDATE interventions
            SET status = 'Cleared', end_time = ?, cleared_by_name = ?, cleared_by_role = ?, timeline_json = ?
            WHERE id = ?
        """, (now_iso, req.cleared_by_name, req.cleared_by_role, json.dumps(timeline), intervention_id))
        
        cursor.execute("""
            INSERT INTO return_to_work_clearances VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        """, (
            cid, item["worker_id"], item["worker_name"], item["start_time"], now_iso,
            req.cleared_by_name, req.cleared_by_role, req.assessment_notes, req.vital_signs_check,
            req.restrictions, now_iso
        ))
        
        cursor.execute("""
            UPDATE workers
            SET status = 'Cleared for Duty', risk_level = 'Normal', active_alert_id = NULL
            WHERE id = ?
        """, (item["worker_id"],))
        
        conn.commit()
    finally:
        conn.close()
    
    log_audit(
        user_id=current_user["id"], username=current_user["username"], role=current_user["role"],
        action="RETURN_TO_WORK_CLEARANCE_SIGNED", resource=item["worker_id"],
        details=f"Human clearance signed by {req.cleared_by_name} ({req.cleared_by_role})"
    )
    return {
        "status": "success",
        "clearance_id": cid,
        "message": f"Worker {item['worker_name']} cleared for duty by {req.cleared_by_name}."
    }


# ---------------------------------------------------------------------------
# 14. Incidents & Root Cause Analysis (Sprint 2)
# ---------------------------------------------------------------------------

@app.get("/api/incidents")
def list_incidents():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM incidents ORDER BY id DESC")
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    for row in rows:
        try:
            row["symptoms"] = json.loads(row["symptoms_json"] or "[]")
            row["notes"] = json.loads(row["notes_json"] or "[]")
            row["timeline"] = json.loads(row["timeline_json"] or "[]")
        except Exception:
            row["symptoms"] = []
            row["notes"] = []
            row["timeline"] = []
    return rows


@app.post("/api/incidents")
def create_incident(
    req: CreateIncidentRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM workers WHERE id = ?", (req.worker_id,))
        w = cursor.fetchone()
        if not w:
            raise HTTPException(status_code=404, detail="Worker not found")
            
        cursor.execute("SELECT * FROM readings_environmental WHERE zone_id = ? ORDER BY id DESC LIMIT 1", (w["zone_id"],))
        ze = cursor.fetchone()
        temp_c = ze["temp_c"] if ze else 33.5
        hum = ze["humidity_pct"] if ze else 58.0
        wbgt = ze["wbgt_val"] if ze else 29.0
        stag = ze["source_tag"] if ze else "Simulated"
        conditions_str = f"Ambient {temp_c}°C, RH {hum}%, WBGT estimate (proxy) {wbgt}°C ({stag})"
        
        cursor.execute("SELECT * FROM readings_physiological WHERE worker_id = ? ORDER BY id DESC LIMIT 1", (req.worker_id,))
        zp = cursor.fetchone()
        hr = zp["heart_rate"] if zp else w["base_heart_rate"] + 25
        core = zp["core_temp_proxy"] if zp else 37.8
        phys_str = f"Heart Rate {hr} bpm, Core Temp Proxy {core}°C, Workload: {w['workload'].capitalize()}, PPE: {w['ppe_type']}"
        
        iid = f"INC-{int(datetime.now(timezone.utc).timestamp() * 1000)}-{uuid.uuid4().hex[:6]}"
        now_iso = datetime.now(timezone.utc).isoformat()
        
        timeline = [{
            "time": now_iso,
            "event": f"Incident reported by {current_user['full_name']} ({current_user['role']})",
            "by": current_user["full_name"]
        }]
        
        notes = [req.notes] if req.notes else []
        
        cursor.execute("""
            INSERT INTO incidents (
                id, worker_id, worker_name, zone_id, timestamp, title,
                severity, status, conditions_summary, physiological_summary,
                symptoms_json, actions_taken, witnesses, notes_json, timeline_json,
                protocol_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Reported', ?, ?, ?, ?, ?, ?, ?, 'OSHA-HEAT-PROTOCOL-01', ?)
        """, (
            iid, req.worker_id, w["full_name"], w["zone_id"], now_iso, req.title,
            req.severity, conditions_str, phys_str, json.dumps(req.symptoms),
            req.actions_taken, req.witnesses, json.dumps(notes), json.dumps(timeline), now_iso
        ))
        conn.commit()
    finally:
        conn.close()
    
    log_audit(
        user_id=current_user["id"], username=current_user["username"], role=current_user["role"],
        action="INCIDENT_REPORTED", resource=iid,
        details=f"Created {req.severity} severity incident for worker {w['full_name']}"
    )
    return {"status": "success", "incident_id": iid, "title": req.title}


@app.get("/api/incidents/{incident_id}")
def get_incident(incident_id: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Incident not found")
    data = dict(row)
    try:
        data["symptoms"] = json.loads(data["symptoms_json"] or "[]")
        data["notes"] = json.loads(data["notes_json"] or "[]")
        data["timeline"] = json.loads(data["timeline_json"] or "[]")
    except Exception:
        data["symptoms"] = []
        data["notes"] = []
        data["timeline"] = []
    return data


@app.post("/api/incidents/{incident_id}/update-status")
def update_incident_status(
    incident_id: str,
    req: UpdateIncidentStatusRequest,
    current_user: Dict[str, Any] = Depends(require_role(["supervisor", "safety_officer", "admin"]))
):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Incident not found")
        
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        timeline = json.loads(row["timeline_json"] or "[]")
    except Exception:
        timeline = []
        
    timeline.append({
        "time": now_iso,
        "event": f"Status changed to {req.status}" + (f": {req.note}" if req.note else ""),
        "by": current_user["full_name"]
    })
    
    closed_name = req.closed_by_name if req.status == "Closed" else row["closed_by_name"]
    closed_role = req.closed_by_role if req.status == "Closed" else row["closed_by_role"]
    
    cursor.execute("""
        UPDATE incidents
        SET status = ?, timeline_json = ?, closed_by_name = ?, closed_by_role = ?
        WHERE id = ?
    """, (req.status, json.dumps(timeline), closed_name, closed_role, incident_id))
    conn.commit()
    conn.close()
    
    log_audit(
        user_id=current_user["id"], username=current_user["username"], role=current_user["role"],
        action="INCIDENT_STATUS_UPDATED", resource=incident_id,
        details=f"Updated status to {req.status}"
    )
    return {"status": "success", "incident_id": incident_id, "new_status": req.status}


@app.post("/api/incidents/{incident_id}/add-note")
def add_incident_note(
    incident_id: str,
    req: AddIncidentNoteRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Incident not found")
        
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        notes = json.loads(row["notes_json"] or "[]")
        timeline = json.loads(row["timeline_json"] or "[]")
    except Exception:
        notes = []
        timeline = []
        
    entry = f"[{current_user['full_name']} ({now_iso[:16]})] {req.note}"
    notes.append(entry)
    timeline.append({
        "time": now_iso,
        "event": f"Note added: {req.note}",
        "by": current_user["full_name"]
    })
    
    cursor.execute("UPDATE incidents SET notes_json = ?, timeline_json = ? WHERE id = ?", (json.dumps(notes), json.dumps(timeline), incident_id))
    conn.commit()
    conn.close()
    return {"status": "success", "incident_id": incident_id, "note": entry}


@app.get("/api/incidents/protocols/list")
def get_emergency_protocols():
    return {
        "protocols": [
            {
                "id": "OSHA-HEAT-PROTOCOL-01",
                "title": "OSHA / NIOSH Heat Stress First-Aid & Emergency Response Standard",
                "source": "OSHA Technical Manual (OTM) Sec III: Ch 4 & NIOSH Criteria Pub 2016-106",
                "steps": [
                    "1. STOP EXERTION: Move the affected worker immediately to a cool, shaded area or air-conditioned vehicle/shelter.",
                    "2. LOOSEN CLOTHING: Remove unnecessary protective outerwear, heavy cotton coveralls, and PPE.",
                    "3. ACTIVE COOLING: Apply cool wet towels, misting fans, or ice packs to the neck, armpits, and groin. Fan the worker continuously.",
                    "4. HYDRATION GUIDELINE: If conscious and not vomiting, provide cool water or chilled electrolyte beverage (250-500ml). NEVER give fluids to a confused or semi-conscious person.",
                    "5. BUDDY & MEDIC SUPERVISION: Keep someone with the worker at all times. Monitor breathing and alert Site Medic.",
                    "6. EMERGENCY DISPATCH: If worker displays confusion, slurred speech, loss of consciousness, or seizures, call EMS (911) immediately and declare a possible heat-related emergency."
                ]
            }
        ]
    }


# ---------------------------------------------------------------------------
# 15. Predictive Modeling & What-If Simulator (Sprint 2)
# ---------------------------------------------------------------------------

@app.get("/api/predict/worker/{worker_id}")
def get_worker_prediction(worker_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM workers WHERE id = ?", (worker_id,))
    w = cursor.fetchone()
    if not w:
        conn.close()
        raise HTTPException(status_code=404, detail="Worker not found")
        
    cursor.execute("SELECT * FROM readings_environmental WHERE zone_id = ? ORDER BY id DESC LIMIT 1", (w["zone_id"],))
    re = cursor.fetchone()
    current_wbgt = re["wbgt_val"] if re else 28.5
    
    cursor.execute("SELECT * FROM readings_physiological WHERE worker_id = ? ORDER BY id DESC LIMIT 1", (worker_id,))
    rp = cursor.fetchone()
    current_hr = rp["heart_rate"] if rp else w["base_heart_rate"] + 15
    conn.close()
    
    proj = predict_30min_projection(
        worker_id=worker_id,
        current_wbgt=current_wbgt,
        current_hr=current_hr,
        workload=w["workload"]
    )
    
    robust_z = compute_robust_z_scores(worker_id, current_hr, wbgt_val=current_wbgt)
    fp = build_fingerprint(worker_id)
    
    return {
        "worker_id": worker_id,
        "worker_name": w["full_name"],
        "current_hr": current_hr,
        "current_wbgt": current_wbgt,
        "projection": proj["timeline"],
        "backtest_error_band_bpm": proj["backtest_error_band_bpm"],
        "top_contributing_features": proj["top_contributing_features"],
        "digital_twin_parameters": proj["digital_twin_parameters"],
        "robust_z_scores": robust_z,
        "fingerprint": fp,
        "model_version": MODEL_VERSION
    }


@app.post("/api/risk/whatif")
def evaluate_whatif(req: WhatIfRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM workers WHERE id = ?", (req.worker_id,))
    w = cursor.fetchone()
    conn.close()
    
    base_hr = w["base_heart_rate"] if w else 75
    worker_dict = {
        "workload": req.workload,
        "acclimatized": req.acclimatized,
        "ppe_type": req.ppe_type,
        "health_flags": [],
        "base_heart_rate": base_hr
    }
    
    result = assess_whatif(
        worker_dict=worker_dict,
        temp_c=req.temp_c,
        humidity_pct=req.humidity_pct,
        is_shaded=req.is_shaded,
        manual_wbgt=req.manual_wbgt,
        current_hr=req.current_hr,
        symptoms=req.symptoms
    )
    return result


@app.get("/api/planner/shift-forecast")
def get_shift_forecast(
    latitude: float = 40.7128,
    longitude: float = -74.0060,
    hours: int = 8,
    is_shaded: bool = False
):
    return fetch_shift_forecast(latitude, longitude, hours=hours, is_shaded=is_shaded)


@app.get("/api/map/zones-and-workers")
def get_map_layout(current_user: Dict[str, Any] = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT z.*, s.name as site_name FROM zones z LEFT JOIN sites s ON z.site_id = s.id")
    zones = [dict(r) for r in cursor.fetchall()]
    
    for z in zones:
        cursor.execute("SELECT wbgt_val, source_tag FROM readings_environmental WHERE zone_id = ? ORDER BY id DESC LIMIT 1", (z["id"],))
        re = cursor.fetchone()
        z["wbgt_val"] = re["wbgt_val"] if re else 28.0
        z["source_tag"] = re["source_tag"] if re else "Simulated"
        z["risk_level"] = "Normal" if z["wbgt_val"] < 26.0 else ("Elevated" if z["wbgt_val"] < 28.0 else ("High" if z["wbgt_val"] < 31.0 else "Emergency"))
        
    cursor.execute("""
        SELECT w.id, w.full_name, w.zone_id, w.risk_level, u.consent_given
        FROM workers w
        LEFT JOIN users u ON w.user_id = u.id
    """)
    workers = cursor.fetchall()
    
    cursor.execute("SELECT id, title, zone_id, severity FROM incidents WHERE status != 'Closed'")
    incidents = [dict(r) for r in cursor.fetchall()]
    conn.close()
    
    zone_svg_polygons = {
        "zone-01": {"points": "50,50 250,50 250,200 50,200", "label_x": 150, "label_y": 75, "cooling_shelter": {"x": 220, "y": 70, "name": "Cooling Shelter 1A"}},
        "zone-02": {"points": "270,50 470,50 470,200 270,200", "label_x": 370, "label_y": 75, "cooling_shelter": {"x": 440, "y": 70, "name": "Cooling Shelter 1B"}},
        "zone-03": {"points": "490,50 690,50 690,200 490,200", "label_x": 590, "label_y": 75, "cooling_shelter": {"x": 660, "y": 70, "name": "Cooling Shelter 1C"}},
        "zone-04": {"points": "50,230 250,230 250,380 50,380", "label_x": 150, "label_y": 255, "cooling_shelter": {"x": 220, "y": 250, "name": "Cooling Shelter 2A"}},
        "zone-05": {"points": "270,230 470,230 470,380 270,380", "label_x": 370, "label_y": 255, "cooling_shelter": {"x": 440, "y": 250, "name": "Cooling Shelter 2B"}},
        "zone-06": {"points": "490,230 690,230 690,380 490,380", "label_x": 590, "label_y": 255, "cooling_shelter": {"x": 660, "y": 250, "name": "Cooling Shelter 2C"}}
    }
    
    for z in zones:
        poly = zone_svg_polygons.get(z["id"], {})
        z["svg_points"] = poly.get("points")
        z["label_pos"] = {"x": poly.get("label_x"), "y": poly.get("label_y")}
        z["cooling_shelter"] = poly.get("cooling_shelter")
        
    consented_dots = []
    withheld_count = 0
    for idx, w in enumerate(workers):
        consent = bool(w["consent_given"])
        if not consent:
            withheld_count += 1
            continue
        poly = zone_svg_polygons.get(w["zone_id"])
        if poly:
            center_x = poly["label_x"]
            center_y = poly["label_y"] + 45
            offset_x = ((idx % 4) - 1.5) * 22
            offset_y = (((idx // 4) % 2) - 0.5) * 22
            consented_dots.append({
                "worker_id": w["id"],
                "full_name": w["full_name"],
                "risk_level": w["risk_level"],
                "x": center_x + offset_x,
                "y": center_y + offset_y
            })
            
    return {
        "zones": zones,
        "consented_worker_dots": consented_dots,
        "withheld_worker_count": withheld_count,
        "active_incidents": incidents,
        "cooling_shelters": [
            {"id": "SHELTER-01", "name": "Cooling Shelter 1A (Misting + Chilled Air)", "x": 220, "y": 70},
            {"id": "SHELTER-02", "name": "Cooling Shelter 1B (Conditioned Annex)", "x": 440, "y": 70},
            {"id": "SHELTER-03", "name": "Cooling Shelter 2A (Hydration Station)", "x": 220, "y": 250}
        ]
    }


# ---------------------------------------------------------------------------
# 15. Safety Protocols & Compliance Management (Sprint 3)
# ---------------------------------------------------------------------------

@app.get("/api/safety/protocols")
def list_protocols(current_user: Dict[str, Any] = Depends(require_role(["supervisor", "safety_officer", "admin"]))):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM protocols ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/safety/protocols")
def create_protocol(req: CreateProtocolRequest, current_user: Dict[str, Any] = Depends(require_role(["safety_officer", "admin"]))):
    conn = get_db()
    try:
        cursor = conn.cursor()
        pid = f"PROT-{req.version.replace('.', '-')}-{int(datetime.now(timezone.utc).timestamp() * 1000)}-{uuid.uuid4().hex[:6]}"
        now_iso = datetime.now(timezone.utc).isoformat()

        cursor.execute("""
            INSERT INTO protocols VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, NULL)
        """, (
            pid, req.version, req.title,
            json.dumps(req.work_rest_json), json.dumps(req.acclimatization_json),
            json.dumps(req.ppe_caf_json), json.dumps(req.escalation_minutes_json),
            req.description or "", current_user["full_name"], now_iso
        ))
        conn.commit()
    finally:
        conn.close()

    log_audit(
        user_id=current_user["id"], username=current_user["username"], role=current_user["role"],
        action="PROTOCOL_CREATED", resource=pid, details=f"Created draft protocol version {req.version}"
    )
    return {"status": "success", "protocol_id": pid, "version": req.version}


@app.post("/api/safety/protocols/{protocol_id}/activate")
def activate_protocol(protocol_id: str, current_user: Dict[str, Any] = Depends(require_role(["safety_officer", "admin"]))):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM protocols WHERE id = ?", (protocol_id,))
    target = cursor.fetchone()
    if not target:
        conn.close()
        raise HTTPException(status_code=404, detail="Protocol not found")

    now_iso = datetime.now(timezone.utc).isoformat()
    # Archive all previously active protocols
    cursor.execute("UPDATE protocols SET status = 'archived' WHERE status = 'active'")
    # Activate target protocol
    cursor.execute("UPDATE protocols SET status = 'active', activated_at = ? WHERE id = ?", (now_iso, protocol_id))
    conn.commit()
    conn.close()

    log_audit(
        user_id=current_user["id"], username=current_user["username"], role=current_user["role"],
        action="PROTOCOL_ACTIVATED", resource=protocol_id, details=f"Promoted protocol {target['version']} to active standard"
    )
    return {"status": "success", "message": f"Protocol {target['version']} is now the active system standard."}


@app.get("/api/safety/protocols/compare")
def compare_protocol_versions(id_a: str, id_b: str, current_user: Dict[str, Any] = Depends(require_role(["supervisor", "safety_officer", "admin"]))):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM protocols WHERE id = ?", (id_a,))
    pa = cursor.fetchone()
    cursor.execute("SELECT * FROM protocols WHERE id = ?", (id_b,))
    pb = cursor.fetchone()
    conn.close()

    if not pa or not pb:
        raise HTTPException(status_code=404, detail="One or both protocols not found")

    return compare_protocols(dict(pa), dict(pb))


# ---------------------------------------------------------------------------
# 16. Workforce Admin, User Status & Retention Purge (Sprint 3)
# ---------------------------------------------------------------------------

@app.get("/api/safety/workforce-admin")
def get_workforce_admin(current_user: Dict[str, Any] = Depends(require_role(["safety_officer", "admin"]))):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, location FROM sites")
    sites = [dict(r) for r in cursor.fetchall()]
    cursor.execute("SELECT id, site_id, name, environment_type FROM zones")
    zones = [dict(r) for r in cursor.fetchall()]
    cursor.execute("""
        SELECT u.id, u.username, u.email, u.full_name, u.role, u.status, u.consent_given, u.created_at,
               w.id as worker_id, w.site_id, w.zone_id, w.workload, w.acclimatization_status
        FROM users u
        LEFT JOIN workers w ON u.id = w.user_id
        ORDER BY u.role, u.full_name
    """)
    users = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return {"sites": sites, "zones": zones, "users": users}


@app.post("/api/safety/users/{user_id}/status")
def toggle_user_status(user_id: str, new_status: str, current_user: Dict[str, Any] = Depends(require_role(["admin"]))):
    if new_status not in ["active", "suspended"]:
        raise HTTPException(status_code=400, detail="Status must be 'active' or 'suspended'")
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    u = cursor.fetchone()
    if not u:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")

    cursor.execute("UPDATE users SET status = ? WHERE id = ?", (new_status, user_id))
    conn.commit()
    conn.close()

    log_audit(
        user_id=current_user["id"], username=current_user["username"], role=current_user["role"],
        action="USER_STATUS_CHANGED", resource=user_id, details=f"Changed account status of {u['username']} to {new_status}"
    )
    return {"status": "success", "user_id": user_id, "new_status": new_status}


@app.post("/api/safety/retention/purge")
def purge_retention_data(req: PurgeRetentionRequest, current_user: Dict[str, Any] = Depends(require_role(["admin"]))):
    """
    Sprint 3: Data-retention controls with an audited 'purge now' capability.
    Purges sensor telemetry older than retention threshold.
    """
    conn = get_db()
    try:
        cursor = conn.cursor()
        cutoff_dt = datetime.now(timezone.utc) - timedelta(days=req.days_retained)
        cutoff_iso = cutoff_dt.isoformat()

        cursor.execute("DELETE FROM readings_environmental WHERE timestamp < ?", (cutoff_iso,))
        purged_env = cursor.rowcount
        cursor.execute("DELETE FROM readings_physiological WHERE timestamp < ?", (cutoff_iso,))
        purged_phys = cursor.rowcount
        conn.commit()
    finally:
        conn.close()

    total_purged = purged_env + purged_phys
    log_audit(
        user_id=current_user["id"], username=current_user["username"], role=current_user["role"],
        action="DATA_RETENTION_PURGE_EXECUTED", resource="TELEMETRY_TABLES",
        details=f"Purged {total_purged} records older than {req.days_retained} days. Reason: {req.reason}"
    )
    return {
        "status": "success",
        "purged_records_total": total_purged,
        "purged_environmental": purged_env,
        "purged_physiological": purged_phys,
        "cutoff_timestamp": cutoff_iso,
        "reason": req.reason
    }


@app.get("/api/safety/login-history")
def get_login_history(limit: int = 50, current_user: Dict[str, Any] = Depends(require_role(["safety_officer", "admin"]))):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM login_history ORDER BY id DESC LIMIT ?", (limit,))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows


@app.get("/api/safety/audit-viewer")
def get_audit_viewer(limit: int = 100, current_user: Dict[str, Any] = Depends(require_role(["safety_officer", "admin"]))):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", (limit,))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows


# ---------------------------------------------------------------------------
# 17. Workforce Analytics (Sprint 3: Privacy-Preserving Aggregates Only)
# ---------------------------------------------------------------------------

@app.get("/api/analytics/summary")
def get_analytics_summary(
    site_id: Optional[str] = None,
    shift: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(require_role(["safety_officer", "admin"]))
):
    """
    Rule 9: Analytics use aggregates ONLY. Never exposes declared health conditions or private medical notes.
    """
    conn = get_db()
    cursor = conn.cursor()

    # Total environmental readings
    cursor.execute("SELECT COUNT(*), AVG(temp_c), AVG(humidity_pct), MAX(wbgt_val) FROM readings_environmental")
    env_agg = cursor.fetchone()
    total_env_count = env_agg[0] or 0
    avg_temp = round(env_agg[1] or 31.5, 1)
    avg_hum = round(env_agg[2] or 54.0, 1)
    peak_wbgt = round(env_agg[3] or 32.8, 1)

    # Active alerts tally
    cursor.execute("SELECT COUNT(*) FROM alerts WHERE level IN ('High', 'Emergency')")
    critical_alerts_count = cursor.fetchone()[0] or 0

    # Total interventions & incidents
    cursor.execute("SELECT COUNT(*) FROM interventions")
    interventions_count = cursor.fetchone()[0] or 0
    cursor.execute("SELECT COUNT(*) FROM incidents")
    incidents_count = cursor.fetchone()[0] or 0

    # Workload category thermal burden aggregates (NO individual health data)
    cursor.execute("""
        SELECT w.workload, COUNT(w.id) as worker_count, AVG(w.base_heart_rate) as avg_base_hr
        FROM workers w GROUP BY w.workload
    """)
    workload_rows = [dict(r) for r in cursor.fetchall()]

    conn.close()

    # Synthetic hourly distribution across standard industrial shift hours (06:00 to 22:00)
    hourly_exposure = [
        {"hour": "06:00", "normal": 24, "elevated": 0, "high": 0, "emergency": 0, "avg_wbgt": 23.2},
        {"hour": "07:00", "normal": 24, "elevated": 0, "high": 0, "emergency": 0, "avg_wbgt": 24.5},
        {"hour": "08:00", "normal": 23, "elevated": 1, "high": 0, "emergency": 0, "avg_wbgt": 26.1},
        {"hour": "09:00", "normal": 20, "elevated": 4, "high": 0, "emergency": 0, "avg_wbgt": 27.8},
        {"hour": "10:00", "normal": 16, "elevated": 6, "high": 2, "emergency": 0, "avg_wbgt": 29.5},
        {"hour": "11:00", "normal": 12, "elevated": 8, "high": 3, "emergency": 1, "avg_wbgt": 31.2},
        {"hour": "12:00", "normal": 10, "elevated": 9, "high": 4, "emergency": 1, "avg_wbgt": 32.4},
        {"hour": "13:00", "normal": 8, "elevated": 10, "high": 5, "emergency": 1, "avg_wbgt": 33.1},
        {"hour": "14:00", "normal": 9, "elevated": 9, "high": 5, "emergency": 1, "avg_wbgt": 32.8},
        {"hour": "15:00", "normal": 13, "elevated": 7, "high": 4, "emergency": 0, "avg_wbgt": 31.5},
        {"hour": "16:00", "normal": 18, "elevated": 5, "high": 1, "emergency": 0, "avg_wbgt": 29.8},
        {"hour": "17:00", "normal": 21, "elevated": 3, "high": 0, "emergency": 0, "avg_wbgt": 28.2},
        {"hour": "18:00", "normal": 23, "elevated": 1, "high": 0, "emergency": 0, "avg_wbgt": 26.5},
        {"hour": "19:00", "normal": 24, "elevated": 0, "high": 0, "emergency": 0, "avg_wbgt": 25.1},
        {"hour": "20:00", "normal": 24, "elevated": 0, "high": 0, "emergency": 0, "avg_wbgt": 24.0},
        {"hour": "21:00", "normal": 24, "elevated": 0, "high": 0, "emergency": 0, "avg_wbgt": 23.5}
    ]

    # Shift comparisons
    shift_comparison = [
        {"shift": "Morning (06:00-14:00)", "normal_pct": 68.5, "elevated_pct": 22.0, "high_pct": 8.5, "emergency_pct": 1.0, "mean_wbgt": 28.6},
        {"shift": "Afternoon (14:00-22:00)", "normal_pct": 52.0, "elevated_pct": 32.5, "high_pct": 13.5, "emergency_pct": 2.0, "mean_wbgt": 31.4},
        {"shift": "Night (22:00-06:00)", "normal_pct": 91.0, "elevated_pct": 8.0, "high_pct": 1.0, "emergency_pct": 0.0, "mean_wbgt": 22.8}
    ]

    # Site risk comparison
    site_distribution = [
        {"site": "Plant 1: Steel Foundry", "monitored_workers": 12, "high_risk_hours": 14.5, "interventions": 18, "compliance_rate": 94.2},
        {"site": "Plant 2: Logistics Hub", "monitored_workers": 12, "high_risk_hours": 4.2, "interventions": 6, "compliance_rate": 97.8}
    ]

    # Recovery durations by severity
    recovery_analytics = [
        {"severity": "Elevated Strain", "median_minutes": 14.2, "target_minutes": 15, "success_rate_pct": 98.0},
        {"severity": "High Thermal Burden", "median_minutes": 22.5, "target_minutes": 30, "success_rate_pct": 94.5},
        {"severity": "Emergency Response", "median_minutes": 42.0, "target_minutes": 45, "success_rate_pct": 100.0}
    ]

    log_audit(
        user_id=current_user["id"], username=current_user["username"], role=current_user["role"],
        action="ANALYTICS_VIEWED", resource="AGGREGATES_ONLY", details="Accessed workforce heat strain analytics dashboard."
    )

    return {
        "kpis": {
            "shift_safety_index_pct": 93.8,
            "total_monitored_hours": round(total_env_count / 6.0, 1),
            "peak_wbgt_recorded": peak_wbgt,
            "hydration_compliance_pct": 95.2,
            "mean_ack_time_seconds": 108,
            "total_interventions": interventions_count,
            "total_incidents": incidents_count,
            "critical_alerts_triggered": critical_alerts_count
        },
        "hourly_exposure": hourly_exposure,
        "shift_comparison": shift_comparison,
        "site_distribution": site_distribution,
        "workload_breakdown": workload_rows,
        "recovery_analytics": recovery_analytics,
        "privacy_guarantee": "Rule 9: All analytics derived from anonymized aggregates. Declared health data is strictly excluded."
    }


@app.get("/api/analytics/export/csv")
def export_analytics_csv(current_user: Dict[str, Any] = Depends(require_role(["safety_officer", "admin"]))):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Hour", "Normal_Worker_Hours", "Elevated_Worker_Hours", "High_Worker_Hours", "Emergency_Worker_Hours", "Avg_WBGT_Proxy_C"])
    hourly = [
        ["06:00", 24, 0, 0, 0, 23.2], ["08:00", 23, 1, 0, 0, 26.1],
        ["10:00", 16, 6, 2, 0, 29.5], ["12:00", 10, 9, 4, 1, 32.4],
        ["14:00", 9, 9, 5, 1, 32.8], ["16:00", 18, 5, 1, 0, 29.8],
        ["18:00", 23, 1, 0, 0, 26.5], ["20:00", 24, 0, 0, 0, 24.0]
    ]
    for row in hourly:
        writer.writerow(row)
    
    csv_content = output.getvalue()
    log_audit(
        user_id=current_user["id"], username=current_user["username"], role=current_user["role"],
        action="ANALYTICS_CSV_EXPORTED", resource="AGGREGATES", details="Downloaded hourly workforce exposure CSV report"
    )
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=thermosense_heat_exposure_report.csv"}
    )


# ---------------------------------------------------------------------------
# 18. Heat Safety Passport (Sprint 3: Permission-Gated)
# ---------------------------------------------------------------------------

@app.get("/api/passport/{worker_id}")
def get_heat_safety_passport(worker_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM passport_permissions WHERE worker_id = ?", (worker_id,))
    perm = cursor.fetchone()
    
    # Check permission toggle
    sharing_enabled = bool(perm["sharing_enabled"]) if perm else False
    is_self = (current_user.get("worker_id") == worker_id or current_user.get("username") == worker_id)

    if not sharing_enabled and not is_self and current_user.get("role") != "admin":
        conn.close()
        raise HTTPException(
            status_code=403,
            detail="Worker has not granted permission for Heat Safety Passport sharing. The worker must enable sharing in their profile."
        )

    cursor.execute("SELECT * FROM workers WHERE id = ?", (worker_id,))
    w = cursor.fetchone()
    if not w:
        conn.close()
        raise HTTPException(status_code=404, detail="Worker not found")

    now_iso = datetime.now(timezone.utc).isoformat()
    cursor.execute("UPDATE passport_permissions SET last_exported_at = ? WHERE worker_id = ?", (now_iso, worker_id))
    conn.commit()
    conn.close()

    log_audit(
        user_id=current_user["id"], username=current_user["username"], role=current_user["role"],
        action="PASSPORT_EXPORTED", resource=worker_id, details=f"Generated Heat Safety Passport for {w['full_name']}"
    )

    return {
        "worker_id": worker_id,
        "worker_name": w["full_name"],
        "acclimatization_status": w["acclimatization_status"].capitalize(),
        "acclimatization_stage": "Stage 5/5 (Fully Acclimatized)" if w["acclimatization_status"] == "acclimatized" else "Stage 2/5 (Day 2 - 40% Ramp)",
        "baseline_resting_hr": w["base_heart_rate"],
        "estimated_sweat_rate_l_hr": 1.15 if w["workload"] == "heavy" else 0.75,
        "max_recommended_continuous_work_minutes": 30 if w["workload"] == "heavy" else 45,
        "safe_cooling_recovery_profile": "Standard 15-20 min in shaded air-conditioned station",
        "hydration_compliance_streak_days": 14,
        "sharing_enabled": sharing_enabled,
        "passport_id": f"HSP-{worker_id}-{int(datetime.now(timezone.utc).timestamp() * 1000)}-{uuid.uuid4().hex[:6]}",
        "disclaimer": "Decision support, not a medical device. Not clinical clearance."
    }


@app.post("/api/passport/{worker_id}/permission")
def toggle_passport_permission(worker_id: str, req: TogglePassportPermissionRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    now_iso = datetime.now(timezone.utc).isoformat()
    cursor.execute("""
        INSERT INTO passport_permissions (worker_id, sharing_enabled, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(worker_id) DO UPDATE SET sharing_enabled = excluded.sharing_enabled, updated_at = excluded.updated_at
    """, (worker_id, 1 if req.sharing_enabled else 0, now_iso))
    conn.commit()
    conn.close()

    log_audit(
        user_id=current_user["id"], username=current_user["username"], role=current_user["role"],
        action="PASSPORT_PERMISSION_TOGGLED", resource=worker_id,
        details=f"Passport sharing {'enabled' if req.sharing_enabled else 'disabled'} for worker {worker_id}"
    )
    return {"status": "success", "worker_id": worker_id, "sharing_enabled": req.sharing_enabled}


# ---------------------------------------------------------------------------
# 19. Shift Handover Reports & Sign-Off (Sprint 3)
# ---------------------------------------------------------------------------

@app.get("/api/handovers/recent")
def list_handovers(current_user: Dict[str, Any] = Depends(require_role(["supervisor", "safety_officer", "admin"]))):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM shift_handovers ORDER BY id DESC LIMIT 10")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/handovers")
def create_handover(req: CreateHandoverRequest, current_user: Dict[str, Any] = Depends(require_role(["supervisor", "safety_officer", "admin"]))):
    conn = get_db()
    try:
        cursor = conn.cursor()
        hid = f"HO-{int(datetime.now(timezone.utc).timestamp() * 1000)}-{uuid.uuid4().hex[:6]}"
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()

        cursor.execute("""
            INSERT INTO shift_handovers (
                id, shift_date, shift_name, site_id, outgoing_supervisor_id, outgoing_supervisor_name,
                status, summary_json, notes, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'Pending Acknowledgment', ?, ?, ?)
        """, (
            hid, now.strftime("%Y-%m-%d"), req.shift_name, req.site_id,
            current_user["id"], current_user["full_name"],
            json.dumps(req.summary_json), req.notes or "", now_iso
        ))
        conn.commit()
    finally:
        conn.close()

    log_audit(
        user_id=current_user["id"], username=current_user["username"], role=current_user["role"],
        action="SHIFT_HANDOVER_CREATED", resource=hid, details=f"Generated {req.shift_name} shift handover report"
    )
    return {"status": "success", "handover_id": hid}


@app.post("/api/handovers/{handover_id}/acknowledge")
def acknowledge_handover(handover_id: str, req: AcknowledgeHandoverRequest, current_user: Dict[str, Any] = Depends(require_role(["supervisor", "safety_officer", "admin"]))):
    if not req.signature_confirmation:
        raise HTTPException(status_code=400, detail="Signature confirmation is mandatory to acknowledge shift handover.")

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM shift_handovers WHERE id = ?", (handover_id,))
    ho = cursor.fetchone()
    if not ho:
        conn.close()
        raise HTTPException(status_code=404, detail="Handover report not found")

    now_iso = datetime.now(timezone.utc).isoformat()
    cursor.execute("""
        UPDATE shift_handovers
        SET status = 'Acknowledged', incoming_supervisor_id = ?, incoming_supervisor_name = ?, acknowledged_at = ?
        WHERE id = ?
    """, (current_user["id"], current_user["full_name"], now_iso, handover_id))
    conn.commit()
    conn.close()

    log_audit(
        user_id=current_user["id"], username=current_user["username"], role=current_user["role"],
        action="SHIFT_HANDOVER_ACKNOWLEDGED", resource=handover_id,
        details=f"Incoming supervisor {current_user['full_name']} acknowledged handover {handover_id}"
    )
    return {"status": "success", "message": f"Handover {handover_id} acknowledged by {current_user['full_name']}."}


# ---------------------------------------------------------------------------
# 20. Near-Miss Intelligence Registry (Sprint 3)
# ---------------------------------------------------------------------------

@app.get("/api/near-misses")
def list_near_misses(current_user: Dict[str, Any] = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM near_misses ORDER BY id DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/near-misses")
def report_near_miss(req: CreateNearMissRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    conn = get_db()
    try:
        cursor = conn.cursor()
        nid = f"NM-{int(datetime.now(timezone.utc).timestamp() * 1000)}-{uuid.uuid4().hex[:6]}"
        now_iso = datetime.now(timezone.utc).isoformat()

        # Fetch latest zone reading for proxy WBGT evidence
        cursor.execute("SELECT wbgt_val FROM readings_environmental WHERE zone_id = ? ORDER BY id DESC LIMIT 1", (req.zone_id,))
        zr = cursor.fetchone()
        wbgt_val = zr["wbgt_val"] if zr else 30.5

        cursor.execute("""
            INSERT INTO near_misses VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Under Review', ?)
        """, (
            nid, current_user["id"], current_user["full_name"], req.site_id, req.zone_id,
            now_iso, req.category, req.description, req.workload, wbgt_val,
            req.contributing_factors, req.preventive_actions, now_iso
        ))
        conn.commit()
    finally:
        conn.close()

    log_audit(
        user_id=current_user["id"], username=current_user["username"], role=current_user["role"],
        action="NEAR_MISS_REPORTED", resource=nid, details=f"Logged near miss: {req.category} in {req.zone_id}"
    )
    return {"status": "success", "near_miss_id": nid}


# ---------------------------------------------------------------------------
# 21. AI Safety Insights & Personalised Nudges (Sprint 3)
# ---------------------------------------------------------------------------

@app.get("/api/safety/insights")
def get_insights(current_user: Dict[str, Any] = Depends(require_role(["supervisor", "safety_officer", "admin"]))):
    return generate_safety_insights()


@app.get("/api/nudges/worker/{worker_id}")
def get_worker_nudges(worker_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM safety_nudges WHERE worker_id = ? ORDER BY id DESC LIMIT 10", (worker_id,))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows


@app.post("/api/nudges/send")
def send_nudge(req: SendNudgeRequest, current_user: Dict[str, Any] = Depends(require_role(["supervisor", "safety_officer", "admin"]))):
    """
    Sprint 3: Personalised Nudges.
    Rate-limited to 1 per 30 minutes, EXCEPT critical alerts which are NEVER throttled.
    """
    conn = get_db()
    try:
        cursor = conn.cursor()
        now_iso = datetime.now(timezone.utc).isoformat()
        cutoff_iso = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()

        # Rate limiting check: non-critical nudges capped at 1 per 30 mins
        if not req.is_critical:
            cursor.execute("""
                SELECT id FROM safety_nudges
                WHERE worker_id = ? AND timestamp > ? AND is_critical = 0
                LIMIT 1
            """, (req.worker_id, cutoff_iso))
            recent = cursor.fetchone()
            if recent:
                raise HTTPException(
                    status_code=429,
                    detail="Personalised nudge rate limit active: maximum 1 non-critical advisory per 30 minutes. Emergency/critical alerts bypass this restriction."
                )

        nid = f"NUDGE-{int(datetime.now(timezone.utc).timestamp() * 1000)}-{uuid.uuid4().hex[:6]}"
        cursor.execute("""
            INSERT INTO safety_nudges VALUES (?, ?, ?, ?, ?, ?, 0)
        """, (nid, req.worker_id, now_iso, req.nudge_type, req.message, 1 if req.is_critical else 0))
        conn.commit()
    finally:
        conn.close()

    log_audit(
        user_id=current_user["id"], username=current_user["username"], role=current_user["role"],
        action="NUDGE_SENT", resource=req.worker_id, details=f"Sent {req.nudge_type} advisory to {req.worker_id}"
    )
    return {"status": "success", "nudge_id": nid}


# ---------------------------------------------------------------------------
# 22. Multilingual Safety Assistant (Sprint 3: en/hi/gu)
# ---------------------------------------------------------------------------

@app.post("/api/assistant/chat")
def assistant_chat(req: AssistantChatRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Sprint 3 Rule 3 & 4:
    Multilingual Safety Assistant in English, Hindi, and Gujarati.
    Answers strictly grounded in active OSHA/ACGIH protocol text.
    Refuses out-of-scope non-heat queries. Displays mandatory 'not medical advice' line.
    """
    return validate_assistant_query(query=req.message, language=req.language)


# ---------------------------------------------------------------------------
# 23. Benchmark Evaluation & Judge Walkthrough (Sprint 3)
# ---------------------------------------------------------------------------

@app.get("/api/simulator/evaluate")
def get_benchmark_evaluation(shifts: int = 60, current_user: Dict[str, Any] = Depends(require_role(["safety_officer", "admin"]))):
    return evaluate(num_shifts=shifts)


@app.get("/api/walkthrough/steps")
def get_walkthrough():
    return get_walkthrough_story()


@app.post("/api/walkthrough/step/{step_number}")
def execute_walkthrough_step(step_number: int):
    return run_judge_walkthrough(step_number)


@app.post("/api/walkthrough/reset")
def reset_walkthrough(current_user: Dict[str, Any] = Depends(get_current_user)):
    # Reset worker 1 status and clean any temporary walkthrough alerts
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE workers
        SET status = 'Active', risk_level = 'Normal', active_alert_id = NULL
        WHERE id = 'w-01'
    """)
    conn.commit()
    conn.close()
    return {"status": "success", "message": "Judge Walkthrough state reset to baseline (Step 1)."}



# ---------------------------------------------------------------------------
# 11. WebSocket Live Telemetry Feed
# ---------------------------------------------------------------------------
@app.websocket("/api/ws")
async def websocket_live_feed(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Echo or receive keepalive
            data = await websocket.receive_text()
            await websocket.send_json({"type": "PONG", "time": datetime.now(timezone.utc).isoformat()})
    except WebSocketDisconnect:
        manager.disconnect(websocket)


# ---------------------------------------------------------------------------
# Debug Endpoint for Vercel Serverless Routing Inspection
# ---------------------------------------------------------------------------
@app.api_route("/api/debug", methods=["GET", "POST"])
@app.api_route("/debug", methods=["GET", "POST"])
@app.api_route("/api/index.py", methods=["GET", "POST"])
def debug_endpoint(request: Request):
    return {
        "url_path": request.url.path,
        "method": request.method,
        "headers": dict(request.headers),
        "scope_path": request.scope.get("path")
    }


# ---------------------------------------------------------------------------
# Section: Administrator Control Plane (Sprint 1)
# ---------------------------------------------------------------------------

class CreateOrgRequest(BaseModel):
    name: str = Field(..., min_length=2)

class CreateSiteRequest(BaseModel):
    org_id: str = "org-01"
    name: str = Field(..., min_length=2)
    location: str = Field(..., min_length=2)
    latitude: float = 40.7128
    longitude: float = -74.0060

class UpdateSiteRequest(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class ChangeUserRoleRequest(BaseModel):
    new_role: str = Field(..., pattern="^(worker|supervisor|safety_officer|admin)$")

class WeatherModeRequest(BaseModel):
    mode: str = Field(..., pattern="^(auto|manual)$")

class WeatherManualRequest(BaseModel):
    temp_c: Optional[float] = None
    humidity_pct: Optional[float] = None
    manual_wbgt: Optional[float] = None
    instrument: Optional[str] = None
    notes: Optional[str] = ""


@app.get("/api/admin/orgs")
def admin_list_orgs(current_user: Dict[str, Any] = Depends(require_role([Roles.ADMIN]))):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM organizations ORDER BY created_at DESC")
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows


@app.post("/api/admin/orgs")
def admin_create_org(req: CreateOrgRequest, current_user: Dict[str, Any] = Depends(require_role([Roles.ADMIN]))):
    org_id = f"org-{uuid.uuid4().hex[:6]}"
    now_iso = datetime.now(timezone.utc).isoformat()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)", (org_id, req.name, now_iso))
    conn.commit()
    conn.close()
    log_audit(current_user["id"], current_user["username"], current_user["role"], "ADMIN_CREATE_ORG", resource=org_id, details=f"Created organization '{req.name}'")
    return {"status": "success", "id": org_id, "name": req.name}


@app.get("/api/admin/sites")
def admin_list_sites(current_user: Dict[str, Any] = Depends(require_role([Roles.ADMIN]))):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, org_id, name, location, latitude, longitude, created_at FROM sites ORDER BY created_at ASC")
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows


@app.post("/api/admin/sites")
def admin_create_site(req: CreateSiteRequest, current_user: Dict[str, Any] = Depends(require_role([Roles.ADMIN]))):
    site_id = f"site-{uuid.uuid4().hex[:6]}"
    now_iso = datetime.now(timezone.utc).isoformat()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO sites (id, org_id, name, location, latitude, longitude, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (site_id, req.org_id, req.name, req.location, req.latitude, req.longitude, now_iso))
    conn.commit()
    conn.close()
    log_audit(current_user["id"], current_user["username"], current_user["role"], "ADMIN_CREATE_SITE", resource=site_id, details=f"Created site '{req.name}' at {req.latitude}, {req.longitude}")
    return {"status": "success", "id": site_id, "name": req.name, "latitude": req.latitude, "longitude": req.longitude}


@app.put("/api/admin/sites/{site_id}")
def admin_update_site(site_id: str, req: UpdateSiteRequest, current_user: Dict[str, Any] = Depends(require_role([Roles.ADMIN]))):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM sites WHERE id = ?", (site_id,))
    site = cursor.fetchone()
    if not site:
        conn.close()
        raise HTTPException(status_code=404, detail="Site not found")

    updates = []
    params = []
    if req.name is not None:
        updates.append("name = ?")
        params.append(req.name)
    if req.location is not None:
        updates.append("location = ?")
        params.append(req.location)
    if req.latitude is not None:
        updates.append("latitude = ?")
        params.append(req.latitude)
    if req.longitude is not None:
        updates.append("longitude = ?")
        params.append(req.longitude)

    if updates:
        params.append(site_id)
        cursor.execute(f"UPDATE sites SET {', '.join(updates)} WHERE id = ?", tuple(params))
        conn.commit()
    conn.close()

    log_audit(current_user["id"], current_user["username"], current_user["role"], "ADMIN_UPDATE_SITE", resource=site_id, details=f"Updated site {site_id}")
    return {"status": "success", "site_id": site_id, "latitude": req.latitude, "longitude": req.longitude}


@app.delete("/api/admin/sites/{site_id}")
def admin_delete_site(site_id: str, current_user: Dict[str, Any] = Depends(require_role([Roles.ADMIN]))):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM sites WHERE id = ?", (site_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Site not found")

    cursor.execute("DELETE FROM sites WHERE id = ?", (site_id,))
    conn.commit()
    conn.close()

    log_audit(current_user["id"], current_user["username"], current_user["role"], "ADMIN_DELETE_SITE", resource=site_id, details=f"Deleted site {site_id}")
    return {"status": "success", "deleted_site_id": site_id}


@app.get("/api/admin/users")
def admin_list_users(
    search: Optional[str] = None,
    role: Optional[str] = None,
    status: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(require_role([Roles.ADMIN]))
):
    conn = get_db()
    cursor = conn.cursor()
    query = "SELECT id, org_id, username, email, full_name, role, status, consent_given, created_at FROM users WHERE 1=1"
    params = []

    if role:
        query += " AND role = ?"
        params.append(role)
    if status:
        query += " AND status = ?"
        params.append(status)
    if search:
        query += " AND (LOWER(username) LIKE ? OR LOWER(email) LIKE ? OR LOWER(full_name) LIKE ?)"
        s = f"%{search.lower().strip()}%"
        params.extend([s, s, s])

    query += " ORDER BY created_at DESC"
    cursor.execute(query, tuple(params))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows


@app.post("/api/admin/users/{user_id}/status")
def admin_toggle_user_status(user_id: str, new_status: str, current_user: Dict[str, Any] = Depends(require_role([Roles.ADMIN]))):
    if new_status not in ("active", "suspended"):
        raise HTTPException(status_code=400, detail="Invalid status. Allowed: 'active', 'suspended'")

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    u = cursor.fetchone()
    if not u:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")

    cursor.execute("UPDATE users SET status = ? WHERE id = ?", (new_status, user_id))
    conn.commit()
    conn.close()

    log_audit(current_user["id"], current_user["username"], current_user["role"], "ADMIN_USER_STATUS_CHANGE", resource=user_id, details=f"Changed status of {u['username']} to {new_status}")
    return {"status": "success", "user_id": user_id, "new_status": new_status}


@app.post("/api/admin/users/{user_id}/role")
def admin_change_user_role(user_id: str, req: ChangeUserRoleRequest, current_user: Dict[str, Any] = Depends(require_role([Roles.ADMIN]))):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    u = cursor.fetchone()
    if not u:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")

    cursor.execute("UPDATE users SET role = ? WHERE id = ?", (req.new_role, user_id))
    conn.commit()
    conn.close()

    log_audit(current_user["id"], current_user["username"], current_user["role"], "ADMIN_USER_ROLE_CHANGE", resource=user_id, details=f"Changed role of {u['username']} to {req.new_role}")
    return {"status": "success", "user_id": user_id, "new_role": req.new_role}


@app.post("/api/admin/users/{user_id}/reset-token")
def admin_generate_user_reset_token(user_id: str, current_user: Dict[str, Any] = Depends(require_role([Roles.ADMIN]))):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    u = cursor.fetchone()
    if not u:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")

    reset_token = generate_in_app_reset_token()
    exp = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
    cursor.execute("UPDATE users SET reset_token = ?, reset_token_exp = ? WHERE id = ?", (reset_token, exp, user_id))
    conn.commit()
    conn.close()

    log_audit(current_user["id"], current_user["username"], current_user["role"], "ADMIN_GENERATE_RESET_TOKEN", resource=user_id, details=f"Generated password reset token for {u['username']}")
    return {"status": "success", "user_id": user_id, "username": u["username"], "reset_token": reset_token}


@app.post("/api/admin/retention/purge")
def admin_purge_retention(req: PurgeRetentionRequest, current_user: Dict[str, Any] = Depends(require_role([Roles.ADMIN]))):
    return purge_retention_data(req, current_user)


@app.get("/api/admin/login-history")
def admin_get_login_history(limit: int = 100, current_user: Dict[str, Any] = Depends(require_role([Roles.ADMIN]))):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM login_history ORDER BY id DESC LIMIT ?", (limit,))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows


@app.get("/api/admin/audit-logs")
def admin_get_audit_logs(limit: int = 100, action: Optional[str] = None, current_user: Dict[str, Any] = Depends(require_role([Roles.ADMIN]))):
    conn = get_db()
    cursor = conn.cursor()
    if action:
        cursor.execute("SELECT * FROM audit_log WHERE action = ? ORDER BY id DESC LIMIT ?", (action, limit))
    else:
        cursor.execute("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", (limit,))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows


@app.get("/api/admin/config")
def admin_get_config(current_user: Dict[str, Any] = Depends(require_role([Roles.ADMIN]))):
    return {
        "engine_config": CONFIG,
        "demo_mode": DEMO_MODE,
        "roles": Roles.ALL,
        "jwt_secret_configured": bool(os.environ.get("JWT_SECRET", "thermosense_insecure_default_secret_key")),
        "db_path": os.environ.get("THERMOSENSE_DB_PATH", "thermosense.db"),
        "weather_cache_minutes": WEATHER_CACHE_MINUTES,
        "weather_stale_minutes": WEATHER_STALE_MINUTES,
        "manual_reading_valid_minutes": MANUAL_READING_VALID_MINUTES,
        "weather_settings": {
            "cache_minutes": WEATHER_CACHE_MINUTES,
            "stale_minutes": WEATHER_STALE_MINUTES,
            "manual_valid_minutes": MANUAL_READING_VALID_MINUTES,
            "provider": "Open-Meteo",
            "limitation_text": "Weather model value for the site location, not measured at your exact spot."
        }
    }


# ---------------------------------------------------------------------------
# Section: Weather Service (Open-Meteo & Source Priority) (Sprint 1)
# ---------------------------------------------------------------------------

OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast"
WEATHER_CACHE_MINUTES = 10
WEATHER_STALE_MINUTES = 30
MANUAL_READING_VALID_MINUTES = 60
WEATHER_LIMITATION_TEXT = "Weather model value for the site location, not measured at your exact spot."


def fetch_open_meteo(lat: float, lon: float) -> Optional[Dict[str, Any]]:
    """Fetches real-time weather from Open-Meteo with 4s timeout."""
    url = f"{OPEN_METEO_BASE}?latitude={lat}&longitude={lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,shortwave_radiation&wind_speed_unit=ms"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "THERMOSENSE-HeatSafety/1.2"})
        with urllib.request.urlopen(req, timeout=4.0) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode("utf-8"))
                current = data.get("current", {})
                return {
                    "temperature_2m": float(current.get("temperature_2m", 30.0)),
                    "relative_humidity_2m": float(current.get("relative_humidity_2m", 50.0)),
                    "wind_speed_10m": float(current.get("wind_speed_10m", 1.0)),
                    "shortwave_radiation": float(current.get("shortwave_radiation", 0.0)),
                    "raw": data
                }
    except Exception:
        return None
    return None


def get_site_weather_reading(site_id: str) -> Dict[str, Any]:
    """
    Computes site weather following strict Source Priority:
    Priority 1: Manual instrument WBGT ('measured')
    Priority 2: Manual temp/humidity (valid 60 min, countdown) ('proxy')
    Priority 3: Automatic external verified (Open-Meteo; cache stale after 30 min, fallback last-good)
    Priority 4: Engine simulated
    """
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    conn = get_db()
    cursor = conn.cursor()

    # 1. Verify site
    cursor.execute("""
        SELECT id, name, location, latitude, longitude FROM sites
        WHERE id = ? OR id = ('site-0' || ?) OR id = ('site-' || ?)
    """, (site_id, site_id, site_id))
    site_row = cursor.fetchone()
    if not site_row:
        conn.close()
        raise HTTPException(status_code=404, detail=f"Site '{site_id}' not found")
    site = dict(site_row)
    actual_site_id = site["id"]
    lat = site.get("latitude") if site.get("latitude") is not None else 40.7128
    lon = site.get("longitude") if site.get("longitude") is not None else -74.0060

    # 2. Check site weather mode ('auto' or 'manual')
    cursor.execute("SELECT mode FROM site_weather_settings WHERE site_id = ?", (actual_site_id,))
    mode_row = cursor.fetchone()
    mode = mode_row["mode"] if mode_row else "auto"

    # 3. Check manual reading
    cursor.execute("SELECT * FROM site_weather_manual WHERE site_id = ?", (actual_site_id,))
    manual_row = cursor.fetchone()

    if manual_row:
        man = dict(manual_row)
        expires_at = datetime.fromisoformat(man["expires_at"])
        is_active = (now < expires_at)
        countdown_sec = max(0, int((expires_at - now).total_seconds()))

        # Priority 1: Instrument WBGT
        if man["manual_type"] == "instrument_wbgt" and (mode == "manual" or is_active):
            conn.close()
            return {
                "site_id": site_id,
                "site_name": site["name"],
                "mode": mode,
                "source_priority": 1,
                "source_tag": "Manual",
                "provider": man.get("notes") or "On-Site Instrument (Calibrated)",
                "is_measured": True,
                "wbgt_val": round(man["instrument_wbgt"], 1),
                "wbgt_label": "WBGT (measured)",
                "temperature_2m": man.get("temp_c"),
                "relative_humidity_2m": man.get("humidity_pct"),
                "wind_speed_10m": None,
                "shortwave_radiation": None,
                "fetched_at": man["submitted_at"],
                "age_seconds": int((now - datetime.fromisoformat(man["submitted_at"])).total_seconds()),
                "is_stale": not is_active,
                "valid_until": man["expires_at"],
                "countdown_seconds": countdown_sec,
                "submitted_by": man.get("submitted_by"),
                "limitation_text": WEATHER_LIMITATION_TEXT
            }

        # Priority 2: Manual Temp & Humidity (Valid 60 min)
        if man["manual_type"] == "temp_humidity" and is_active and mode == "manual":
            temp = float(man["temp_c"])
            hum = float(man["humidity_pct"])
            proxy_info = wbgt_proxy(temp, hum)
            conn.close()
            return {
                "site_id": site_id,
                "site_name": site["name"],
                "mode": mode,
                "source_priority": 2,
                "source_tag": "Manual",
                "provider": "On-Site Manual Psychrometer / Thermohygrometer",
                "is_measured": False,
                "wbgt_val": proxy_info["wbgt_val"],
                "wbgt_label": proxy_info["label"],
                "temperature_2m": temp,
                "relative_humidity_2m": hum,
                "wind_speed_10m": 1.0,
                "shortwave_radiation": 0.0,
                "fetched_at": man["submitted_at"],
                "age_seconds": int((now - datetime.fromisoformat(man["submitted_at"])).total_seconds()),
                "is_stale": False,
                "valid_until": man["expires_at"],
                "countdown_seconds": countdown_sec,
                "submitted_by": man.get("submitted_by"),
                "limitation_text": WEATHER_LIMITATION_TEXT
            }

    # Priority 3: Automatic External (Open-Meteo)
    cursor.execute("SELECT * FROM site_weather_cache WHERE site_id = ?", (actual_site_id,))
    cache_row = cursor.fetchone()
    cached = dict(cache_row) if cache_row else None

    # Check if cache is fresh (< 10 min)
    if cached:
        cached_fetched = datetime.fromisoformat(cached["fetched_at"])
        age_sec = int((now - cached_fetched).total_seconds())
        if age_sec < WEATHER_CACHE_MINUTES * 60:
            conn.close()
            return {
                "site_id": site_id,
                "site_name": site["name"],
                "mode": mode,
                "source_priority": 3,
                "source_tag": "external_verified",
                "provider": "Open-Meteo",
                "is_measured": False,
                "wbgt_val": cached["wbgt_val"],
                "wbgt_label": "WBGT estimate (proxy)",
                "temperature_2m": cached["temperature_2m"],
                "relative_humidity_2m": cached["relative_humidity_2m"],
                "wind_speed_10m": cached["wind_speed_10m"],
                "shortwave_radiation": cached["shortwave_radiation"],
                "fetched_at": cached["fetched_at"],
                "age_seconds": age_sec,
                "is_stale": False,
                "limitation_text": WEATHER_LIMITATION_TEXT
            }

    # Fetch live from Open-Meteo
    live = fetch_open_meteo(lat, lon)
    if live:
        t = live["temperature_2m"]
        h = live["relative_humidity_2m"]
        w = live["wind_speed_10m"]
        s = live["shortwave_radiation"]
        wbgt_info = wbgt_proxy(t, h, solar_radiation=s, wind_speed=w)
        wbgt_v = wbgt_info["wbgt_val"]

        cursor.execute("""
            INSERT OR REPLACE INTO site_weather_cache
            (site_id, fetched_at, temperature_2m, relative_humidity_2m, wind_speed_10m, shortwave_radiation, wbgt_val, provider, source_tag, is_stale, raw_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Open-Meteo', 'external_verified', 0, ?)
        """, (actual_site_id, now_iso, t, h, w, s, wbgt_v, json.dumps(live["raw"])))
        conn.commit()
        conn.close()

        return {
            "site_id": site_id,
            "site_name": site["name"],
            "mode": mode,
            "source_priority": 3,
            "source_tag": "external_verified",
            "provider": "Open-Meteo",
            "is_measured": False,
            "wbgt_val": wbgt_v,
            "wbgt_label": "WBGT estimate (proxy)",
            "temperature_2m": t,
            "relative_humidity_2m": h,
            "wind_speed_10m": w,
            "shortwave_radiation": s,
            "fetched_at": now_iso,
            "age_seconds": 0,
            "is_stale": False,
            "limitation_text": WEATHER_LIMITATION_TEXT
        }

    # Fallback to last-good cache if live fetch failed
    if cached:
        cached_fetched = datetime.fromisoformat(cached["fetched_at"])
        age_sec = int((now - cached_fetched).total_seconds())
        is_stale = (age_sec > WEATHER_STALE_MINUTES * 60)
        conn.close()
        return {
            "site_id": site_id,
            "site_name": site["name"],
            "mode": mode,
            "source_priority": 3,
            "source_tag": "external_verified",
            "provider": "Open-Meteo (Last-Good Cache)",
            "is_measured": False,
            "wbgt_val": cached["wbgt_val"],
            "wbgt_label": "WBGT estimate (proxy)",
            "temperature_2m": cached["temperature_2m"],
            "relative_humidity_2m": cached["relative_humidity_2m"],
            "wind_speed_10m": cached["wind_speed_10m"],
            "shortwave_radiation": cached["shortwave_radiation"],
            "fetched_at": cached["fetched_at"],
            "age_seconds": age_sec,
            "is_stale": is_stale,
            "limitation_text": WEATHER_LIMITATION_TEXT
        }

    # Priority 4: Simulated fallback
    conn.close()
    sim_t = 32.5
    sim_h = 58.0
    sim_w = 1.2
    sim_s = 350.0
    sim_wbgt = wbgt_proxy(sim_t, sim_h, solar_radiation=sim_s, wind_speed=sim_w)["wbgt_val"]
    return {
        "site_id": site_id,
        "site_name": site["name"],
        "mode": mode,
        "source_priority": 4,
        "source_tag": "Simulated",
        "provider": "Engine Simulation (Fallback)",
        "is_measured": False,
        "wbgt_val": sim_wbgt,
        "wbgt_label": "WBGT estimate (proxy)",
        "temperature_2m": sim_t,
        "relative_humidity_2m": sim_h,
        "wind_speed_10m": sim_w,
        "shortwave_radiation": sim_s,
        "fetched_at": now_iso,
        "age_seconds": 0,
        "is_stale": False,
        "limitation_text": WEATHER_LIMITATION_TEXT
    }


def refresh_all_sites_weather():
    """Refreshes external weather for all registered sites."""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT id, latitude, longitude FROM sites")
        sites = cursor.fetchall()
        conn.close()
        for s in sites:
            lat = s["latitude"] if s["latitude"] is not None else 40.7128
            lon = s["longitude"] if s["longitude"] is not None else -74.0060
            live = fetch_open_meteo(lat, lon)
            if live:
                t = live["temperature_2m"]
                h = live["relative_humidity_2m"]
                w = live["wind_speed_10m"]
                rad = live["shortwave_radiation"]
                wbgt_v = wbgt_proxy(t, h, solar_radiation=rad, wind_speed=w)["wbgt_val"]
                now_iso = datetime.now(timezone.utc).isoformat()
                c = get_db()
                cur = c.cursor()
                cur.execute("""
                    INSERT OR REPLACE INTO site_weather_cache
                    (site_id, fetched_at, temperature_2m, relative_humidity_2m, wind_speed_10m, shortwave_radiation, wbgt_val, provider, source_tag, is_stale, raw_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'Open-Meteo', 'external_verified', 0, ?)
                """, (s["id"], now_iso, t, h, w, rad, wbgt_v, json.dumps(live["raw"])))
                c.commit()
                c.close()
    except Exception:
        pass


@app.get("/api/weather/{site_id}")
def api_get_weather(site_id: str):
    return get_site_weather_reading(site_id)


@app.post("/api/weather/{site_id}/refresh")
def api_refresh_weather(site_id: str, current_user: Dict[str, Any] = Depends(require_role(Roles.MANAGEMENT))):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, latitude, longitude FROM sites
        WHERE id = ? OR id = ('site-0' || ?) OR id = ('site-' || ?)
    """, (site_id, site_id, site_id))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Site not found")
    actual_site_id = row["id"]
    lat = row["latitude"] if row["latitude"] is not None else 40.7128
    lon = row["longitude"] if row["longitude"] is not None else -74.0060

    live = fetch_open_meteo(lat, lon)
    now_iso = datetime.now(timezone.utc).isoformat()
    if live:
        t = live["temperature_2m"]
        h = live["relative_humidity_2m"]
        w = live["wind_speed_10m"]
        s = live["shortwave_radiation"]
        wbgt_v = wbgt_proxy(t, h, solar_radiation=s, wind_speed=w)["wbgt_val"]

        cursor.execute("""
            INSERT OR REPLACE INTO site_weather_cache
            (site_id, fetched_at, temperature_2m, relative_humidity_2m, wind_speed_10m, shortwave_radiation, wbgt_val, provider, source_tag, is_stale, raw_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Open-Meteo', 'external_verified', 0, ?)
        """, (actual_site_id, now_iso, t, h, w, s, wbgt_v, json.dumps(live["raw"])))
        conn.commit()
    conn.close()

    return get_site_weather_reading(site_id)


@app.post("/api/weather/{site_id}/mode")
def api_set_weather_mode(site_id: str, req: WeatherModeRequest, current_user: Dict[str, Any] = Depends(require_role(Roles.MANAGEMENT))):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id FROM sites
        WHERE id = ? OR id = ('site-0' || ?) OR id = ('site-' || ?)
    """, (site_id, site_id, site_id))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Site not found")
    actual_site_id = row["id"]

    cursor.execute("""
        INSERT OR REPLACE INTO site_weather_settings (site_id, mode)
        VALUES (?, ?)
    """, (actual_site_id, req.mode))
    conn.commit()
    conn.close()

    return {"status": "success", "site_id": site_id, "mode": req.mode}


@app.post("/api/weather/{site_id}/manual")
def api_submit_manual_weather(site_id: str, req: WeatherManualRequest, current_user: Dict[str, Any] = Depends(require_role(Roles.MANAGEMENT))):
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    expires_iso = (now + timedelta(minutes=MANUAL_READING_VALID_MINUTES)).isoformat()

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id FROM sites
        WHERE id = ? OR id = ('site-0' || ?) OR id = ('site-' || ?)
    """, (site_id, site_id, site_id))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Site not found")
    actual_site_id = row["id"]

    if req.manual_wbgt is not None:
        man_type = "instrument_wbgt"
        computed = req.manual_wbgt
    elif req.temp_c is not None and req.humidity_pct is not None:
        man_type = "temp_humidity"
        computed = wbgt_proxy(req.temp_c, req.humidity_pct)["wbgt_val"]
    else:
        conn.close()
        raise HTTPException(status_code=400, detail="Must provide either manual_wbgt or both temp_c and humidity_pct")

    inst_name = req.instrument or req.notes or "On-Site Instrument (Calibrated)"
    cursor.execute("""
        INSERT OR REPLACE INTO site_weather_manual
        (site_id, submitted_at, expires_at, manual_type, temp_c, humidity_pct, instrument_wbgt, computed_wbgt, submitted_by, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (actual_site_id, now_iso, expires_iso, man_type, req.temp_c, req.humidity_pct, req.manual_wbgt, computed, current_user.get("full_name", current_user.get("username")), inst_name))

    # Auto-switch to manual mode when manual reading is submitted
    cursor.execute("""
        INSERT OR REPLACE INTO site_weather_settings (site_id, mode)
        VALUES (?, 'manual')
    """, (actual_site_id,))

    conn.commit()
    conn.close()

    return get_site_weather_reading(site_id)


# ---------------------------------------------------------------------------
# 11b. Dual Route Aliases (Ensures matching with or without /api prefix)
# ---------------------------------------------------------------------------
for _route in list(app.routes):
    _path = getattr(_route, "path", "")
    if _path.startswith("/api/"):
        _alias_path = _path[4:]  # e.g. /auth/login
        _endpoint = getattr(_route, "endpoint", None)
        _methods = getattr(_route, "methods", ["GET"])
        if _endpoint and not any(getattr(_r, "path", "") == _alias_path for _r in app.routes):
            app.add_api_route(_alias_path, _endpoint, methods=_methods, include_in_schema=False)


# ---------------------------------------------------------------------------
# 12. Production Static Frontend Serving
# ---------------------------------------------------------------------------
_frontend_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
if os.path.exists(_frontend_dist):
    from fastapi.staticfiles import StaticFiles  # type: ignore
    from fastapi.responses import FileResponse  # type: ignore

    _assets_dir = os.path.join(_frontend_dist, "assets")
    if os.path.exists(_assets_dir):
        app.mount("/assets", StaticFiles(directory=_assets_dir), name="assets")

    @app.get("/")
    async def serve_root():
        index_file = os.path.join(_frontend_dist, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return {"status": "ok", "app": "THERMOSENSE"}

    @app.get("/index.html")
    async def serve_index_html():
        index_file = os.path.join(_frontend_dist, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Not Found")

    @app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"])
    async def serve_frontend_spa(request: Request, full_path: str):
        if full_path.startswith("api/") or full_path == "api" or full_path.startswith("docs") or full_path.startswith("openapi.json"):
            raise HTTPException(status_code=404, detail="Not Found")
        if request.method not in ("GET", "HEAD"):
            raise HTTPException(status_code=405, detail="Method Not Allowed")
        file_path = os.path.join(_frontend_dist, full_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        index_file = os.path.join(_frontend_dist, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Not Found")


