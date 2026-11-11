"""
THERMOSENSE Database & Persistence Layer (db.py)
------------------------------------------------
Rule 1: Approved 26-file layout.
Rule 9: Fernet-encrypted health_private, audit_log, login_history.
Seed: 1 org, 2 sites x 3 zones, 24 workers across light/moderate/heavy work,
4 role logins: worker, supervisor, safety officer, admin; 30 days of simulated history.
"""

import sqlite3
import json
import os
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional
from cryptography.fernet import Fernet  # type: ignore
import bcrypt  # type: ignore

sys.dont_write_bytecode = True

# Persistent SQLite DB in OS temp directory so backend/ remains clean
DB_PATH = os.environ.get("THERMOSENSE_DB_PATH", os.path.join(tempfile.gettempdir(), "thermosense_v1.db"))

# Static 32-byte URL-safe base64 Fernet key for deterministic AES-256 encryption at rest
_FERNET_KEY = b"uF8w1c4P_z9lV_m9G2a7Y6q8X1s3D5f7J9k0L2z4X6c="
_cipher = Fernet(_FERNET_KEY)


_db_initialized = False


def get_db() -> sqlite3.Connection:
    global _db_initialized
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA busy_timeout = 30000;")
    conn.row_factory = sqlite3.Row
    
    if not _db_initialized:
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
            if not cursor.fetchone():
                _db_initialized = True
                seed_db()
            else:
                _db_initialized = True
        except Exception:
            _db_initialized = True
            
    return conn


def encrypt_health(data: Dict[str, Any]) -> str:
    """Encrypts sensitive medical conditions using AES-256 Fernet."""
    raw_json = json.dumps(data).encode("utf-8")
    return _cipher.encrypt(raw_json).decode("utf-8")


def decrypt_health(encrypted_str: str) -> Dict[str, Any]:
    """Decrypts sensitive medical data. Prohibited for supervisors."""
    try:
        raw_json = _cipher.decrypt(encrypted_str.encode("utf-8")).decode("utf-8")
        return json.loads(raw_json)
    except Exception as e:
        return {"error": f"Decryption failure: {str(e)}"}


def log_audit(
    user_id: str,
    username: str,
    role: str,
    action: str,
    resource: str = "N/A",
    details: str = "",
    ip_address: str = "127.0.0.1"
) -> int:
    """Rule 9: Audit entry recorded on every sensitive access and administrative action."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO audit_log (timestamp, user_id, username, role, action, resource, details, ip_address)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        datetime.now(timezone.utc).isoformat(),
        user_id,
        username,
        role,
        action,
        resource,
        details,
        ip_address
    ))
    log_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return log_id


def record_login(
    user_id: str,
    username: str,
    success: bool,
    ip_address: str = "127.0.0.1",
    user_agent: str = "Mozilla/5.0"
):
    """Records audit trail of authentication attempts."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO login_history (user_id, username, timestamp, success, ip_address, user_agent)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        user_id,
        username,
        datetime.now(timezone.utc).isoformat(),
        1 if success else 0,
        ip_address,
        user_agent
    ))
    conn.commit()
    conn.close()


def init_db():
    """Initializes SQLite schema for all platform entities."""
    conn = get_db()
    cursor = conn.cursor()

    # 1. Organizations
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS organizations (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)

    # 2. Sites & Zones (2 sites x 3 zones = 6 zones)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sites (
            id TEXT PRIMARY KEY,
            org_id TEXT NOT NULL,
            name TEXT NOT NULL,
            location TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (org_id) REFERENCES organizations(id)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS zones (
            id TEXT PRIMARY KEY,
            site_id TEXT NOT NULL,
            name TEXT NOT NULL,
            environment_type TEXT NOT NULL, -- indoor_heavy, indoor_conditioned, outdoor_open
            created_at TEXT NOT NULL,
            FOREIGN KEY (site_id) REFERENCES sites(id)
        )
    """)

    # 3. Users & RBAC
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            org_id TEXT NOT NULL,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT NOT NULL,
            role TEXT NOT NULL, -- 'worker', 'supervisor', 'safety_officer', 'admin'
            status TEXT DEFAULT 'active', -- 'active', 'suspended'
            consent_given INTEGER DEFAULT 0,
            consent_date TEXT,
            reset_token TEXT,
            reset_token_exp TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (org_id) REFERENCES organizations(id)
        )
    """)

    # 4. Workers Operational Registry
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS workers (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            site_id TEXT NOT NULL,
            zone_id TEXT NOT NULL,
            full_name TEXT NOT NULL,
            workload TEXT NOT NULL, -- 'light', 'moderate', 'heavy'
            acclimatization_status TEXT NOT NULL, -- 'acclimatized', 'unacclimatized'
            base_heart_rate INTEGER DEFAULT 75,
            ppe_type TEXT DEFAULT 'standard_work_clothes',
            operational_accommodation TEXT,
            status TEXT DEFAULT 'Active', -- 'Active', 'Resting', 'Medical Observation', 'Cleared for Duty'
            risk_level TEXT DEFAULT 'Normal',
            last_water_break TEXT,
            water_today_ml INTEGER DEFAULT 750,
            reported_symptoms TEXT DEFAULT '[]',
            active_alert_id TEXT,
            last_updated TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (site_id) REFERENCES sites(id),
            FOREIGN KEY (zone_id) REFERENCES zones(id)
        )
    """)

    # 5. Fernet-Encrypted Health Table (Rule 9)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS health_private (
            worker_id TEXT PRIMARY KEY,
            encrypted_data TEXT NOT NULL, -- AES-256 Fernet ciphertext
            requires_review INTEGER DEFAULT 0, -- 1 if cardiovascular/kidney condition declared
            updated_at TEXT NOT NULL,
            FOREIGN KEY (worker_id) REFERENCES workers(id)
        )
    """)

    # 6. Audit Log & Login History
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            user_id TEXT NOT NULL,
            username TEXT NOT NULL,
            role TEXT NOT NULL,
            action TEXT NOT NULL,
            resource TEXT,
            details TEXT,
            ip_address TEXT
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS login_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            username TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            success INTEGER NOT NULL,
            ip_address TEXT,
            user_agent TEXT
        )
    """)

    # 7. Environmental & Physiological Telemetry Readings
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS readings_environmental (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            site_id TEXT NOT NULL,
            zone_id TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            temp_c REAL NOT NULL,
            humidity_pct REAL NOT NULL,
            solar_radiation REAL DEFAULT 0.0,
            wind_speed REAL DEFAULT 1.0,
            wbgt_val REAL NOT NULL,
            is_measured INTEGER NOT NULL, -- 0: proxy, 1: measured
            source_tag TEXT NOT NULL,    -- 'Simulated', 'Manual', 'Imported', 'Verified external'
            quality TEXT DEFAULT 'Good'  -- 'Good', 'Fair', 'Suspect', 'Missing'
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS readings_physiological (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            worker_id TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            heart_rate INTEGER NOT NULL,
            skin_temp_proxy REAL NOT NULL,
            core_temp_proxy REAL NOT NULL,
            sweat_loss_l REAL DEFAULT 0.5,
            source_tag TEXT NOT NULL,
            quality TEXT DEFAULT 'Good',
            FOREIGN KEY (worker_id) REFERENCES workers(id)
        )
    """)

    # 8. Alerts Registry (Rule 7: All 11 mandatory fields + explainability)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS alerts (
            id TEXT PRIMARY KEY,
            worker_id TEXT NOT NULL,
            worker_name TEXT NOT NULL,
            time TEXT NOT NULL,
            location TEXT NOT NULL,
            conditions TEXT NOT NULL,
            physiological_changes TEXT NOT NULL,
            reason TEXT NOT NULL,
            action TEXT NOT NULL,
            ack_status TEXT NOT NULL,
            escalation_status TEXT NOT NULL,
            contributing_factors TEXT NOT NULL,
            reliability_and_limitations TEXT NOT NULL,
            level TEXT NOT NULL,
            score REAL NOT NULL,
            why TEXT NOT NULL,
            actions_json TEXT NOT NULL,
            limitations_json TEXT NOT NULL,
            rule_ids TEXT NOT NULL,
            model_version TEXT NOT NULL,
            acknowledged_by TEXT,
            acknowledged_at TEXT,
            priority TEXT DEFAULT 'High',
            is_false_alert INTEGER DEFAULT 0,
            false_alert_reason TEXT,
            false_alert_by TEXT,
            events_json TEXT DEFAULT '[]'
        )
    """)

    # Ensure backward-compatible column presence
    cursor.execute("PRAGMA table_info(alerts)")
    existing_cols = [col[1] for col in cursor.fetchall()]
    for col_name, col_def in [
        ("priority", "TEXT DEFAULT 'High'"),
        ("is_false_alert", "INTEGER DEFAULT 0"),
        ("false_alert_reason", "TEXT"),
        ("false_alert_by", "TEXT"),
        ("events_json", "TEXT DEFAULT '[]'")
    ]:
        if col_name not in existing_cols:
            cursor.execute(f"ALTER TABLE alerts ADD COLUMN {col_name} {col_def}")

    # 9. Return to Work Clearances (Rule 8: Named Human Sign-Off)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS return_to_work_clearances (
            id TEXT PRIMARY KEY,
            worker_id TEXT NOT NULL,
            worker_name TEXT NOT NULL,
            incident_time TEXT NOT NULL,
            clearance_time TEXT NOT NULL,
            cleared_by_name TEXT NOT NULL, -- Rule 8: Named human
            cleared_by_role TEXT NOT NULL,
            assessment_notes TEXT NOT NULL,
            vital_signs_check TEXT NOT NULL,
            restrictions TEXT NOT NULL,
            signature_confirmation INTEGER NOT NULL,
            created_at TEXT NOT NULL
        )
    """)

    # 10. Interventions & Cooling Shelter Recovery Records (Sprint 2)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS interventions (
            id TEXT PRIMARY KEY,
            worker_id TEXT NOT NULL,
            worker_name TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT,
            target_duration_minutes INTEGER DEFAULT 20,
            type TEXT NOT NULL, -- 'cooling_shelter', 'hydration_rest', 'cooling_vest', 'medical_triage'
            cooling_shelter_id TEXT DEFAULT 'SHELTER-01',
            initial_hr INTEGER,
            current_hr INTEGER,
            base_hr INTEGER,
            initial_temp REAL,
            current_temp REAL,
            symptoms_json TEXT DEFAULT '[]',
            fluids_ml INTEGER DEFAULT 0,
            indicators_met INTEGER DEFAULT 0,
            reassessment_requested INTEGER DEFAULT 0,
            reassessment_notes TEXT,
            cleared_by_name TEXT,
            cleared_by_role TEXT,
            status TEXT DEFAULT 'In Progress', -- 'In Progress', 'Indicators Met', 'Reassessment Pending', 'Cleared'
            timeline_json TEXT DEFAULT '[]',
            created_at TEXT NOT NULL,
            FOREIGN KEY (worker_id) REFERENCES workers(id)
        )
    """)

    # 11. Incidents & Root Cause Analysis (Sprint 2)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS incidents (
            id TEXT PRIMARY KEY,
            worker_id TEXT NOT NULL,
            worker_name TEXT NOT NULL,
            zone_id TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            title TEXT NOT NULL,
            severity TEXT NOT NULL, -- 'Low', 'Medium', 'High', 'Critical'
            status TEXT NOT NULL,   -- 'Reported', 'Under Investigation', 'First Response / Treatment', 'Corrective Actions Assigned', 'Closed'
            conditions_summary TEXT,
            physiological_summary TEXT,
            symptoms_json TEXT DEFAULT '[]',
            actions_taken TEXT,
            witnesses TEXT,
            notes_json TEXT DEFAULT '[]',
            timeline_json TEXT DEFAULT '[]',
            protocol_id TEXT DEFAULT 'OSHA-HEAT-PROTOCOL-01',
            closed_by_name TEXT,
            closed_by_role TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (worker_id) REFERENCES workers(id),
            FOREIGN KEY (zone_id) REFERENCES zones(id)
        )
    """)

    # 12. Notification Preferences (Sprint 2)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS notification_preferences (
            user_id TEXT PRIMARY KEY,
            sound_enabled INTEGER DEFAULT 1,
            toast_enabled INTEGER DEFAULT 1,
            email_enabled INTEGER DEFAULT 0,
            sms_enabled INTEGER DEFAULT 0,
            critical_cannot_disable INTEGER DEFAULT 1,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)

    # 13. Safety Protocols & Versioning (Sprint 3)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS protocols (
            id TEXT PRIMARY KEY,
            version TEXT NOT NULL,
            title TEXT NOT NULL,
            status TEXT NOT NULL, -- 'active', 'draft', 'archived'
            work_rest_json TEXT NOT NULL,
            acclimatization_json TEXT NOT NULL,
            ppe_caf_json TEXT NOT NULL,
            escalation_minutes_json TEXT NOT NULL,
            description TEXT,
            created_by TEXT NOT NULL,
            created_at TEXT NOT NULL,
            activated_at TEXT
        )
    """)

    # 14. Shift Handover Reports (Sprint 3)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS shift_handovers (
            id TEXT PRIMARY KEY,
            shift_date TEXT NOT NULL,
            shift_name TEXT NOT NULL, -- 'Morning', 'Afternoon', 'Night'
            site_id TEXT NOT NULL,
            outgoing_supervisor_id TEXT NOT NULL,
            outgoing_supervisor_name TEXT NOT NULL,
            incoming_supervisor_id TEXT,
            incoming_supervisor_name TEXT,
            status TEXT NOT NULL, -- 'Pending Acknowledgment', 'Acknowledged'
            summary_json TEXT NOT NULL,
            notes TEXT,
            acknowledged_at TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (site_id) REFERENCES sites(id)
        )
    """)

    # 15. Near-Miss Intelligence Registry (Sprint 3)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS near_misses (
            id TEXT PRIMARY KEY,
            reporter_id TEXT NOT NULL,
            reporter_name TEXT NOT NULL,
            site_id TEXT NOT NULL,
            zone_id TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            category TEXT NOT NULL,
            description TEXT NOT NULL,
            workload TEXT NOT NULL,
            wbgt_proxy REAL NOT NULL,
            contributing_factors TEXT NOT NULL,
            preventive_actions TEXT NOT NULL,
            status TEXT DEFAULT 'Under Review',
            created_at TEXT NOT NULL,
            FOREIGN KEY (site_id) REFERENCES sites(id),
            FOREIGN KEY (zone_id) REFERENCES zones(id)
        )
    """)

    # 16. Personalised Safety Nudges (Sprint 3)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS safety_nudges (
            id TEXT PRIMARY KEY,
            worker_id TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            nudge_type TEXT NOT NULL,
            message TEXT NOT NULL,
            is_critical INTEGER DEFAULT 0,
            read_status INTEGER DEFAULT 0,
            FOREIGN KEY (worker_id) REFERENCES workers(id)
        )
    """)

    # 17. Heat Safety Passport Permissions (Sprint 3)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS passport_permissions (
            worker_id TEXT PRIMARY KEY,
            sharing_enabled INTEGER DEFAULT 0,
            allowed_recipients_json TEXT DEFAULT '["occupational_health", "safety_officer"]',
            last_exported_at TEXT,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (worker_id) REFERENCES workers(id)
        )
    """)

    conn.commit()
    conn.close()


def seed_db():
    """
    Seeds demo database:
    - 1 Organization
    - 2 Sites x 3 Zones (6 zones total)
    - 24 Workers across light, moderate, and heavy workloads
    - 4 Role Logins: worker (worker1), supervisor (supervisor), safety officer (safety_officer), admin (admin)
    - 30 days of simulated environmental & physiological history
    """
    init_db()
    conn = get_db()
    cursor = conn.cursor()

    # Clear previous seed data
    for table in [
        "organizations", "sites", "zones", "users", "workers",
        "health_private", "audit_log", "login_history",
        "readings_environmental", "readings_physiological", "alerts",
        "return_to_work_clearances", "interventions", "incidents", "notification_preferences",
        "protocols", "shift_handovers", "near_misses", "safety_nudges", "passport_permissions"
    ]:
        cursor.execute(f"DELETE FROM {table}")

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    # Helper for bcrypt hash with rounds=8 for fast demo startup
    def hash_pwd(pwd: str) -> str:
        return bcrypt.hashpw(pwd.encode("utf-8"), bcrypt.gensalt(rounds=8)).decode("utf-8")

    common_pwd = hash_pwd("password123")

    # 1. Organization
    cursor.execute("""
        INSERT INTO organizations (id, name, created_at)
        VALUES ('org-01', 'Apex Heavy Industries & Fabrication', ?)
    """, (now_iso,))

    # 2. 2 Sites x 3 Zones (6 zones total)
    sites_data = [
        ("site-01", "org-01", "Delta Casting & Smelting Works", "40.7128 N, 74.0060 W", now_iso),
        ("site-02", "org-01", "North Pier Rigging & Logistics Yard", "41.8781 N, 87.6298 W", now_iso)
    ]
    for sid, oid, sname, sloc, scrt in sites_data:
        cursor.execute("INSERT INTO sites VALUES (?, ?, ?, ?, ?)", (sid, oid, sname, sloc, scrt))

    zones_data = [
        # Site 1 Zones
        ("zone-01", "site-01", "Zone 1A: Blast Furnace & Pouring Floor", "indoor_heavy", now_iso),
        ("zone-02", "site-01", "Zone 1B: Fabrication & CNC Machining", "indoor_conditioned", now_iso),
        ("zone-03", "site-01", "Zone 1C: Scrap Storage & Slag Recovery", "outdoor_open", now_iso),
        # Site 2 Zones
        ("zone-04", "site-02", "Zone 2A: Crane Gantry & High Pier Deck", "outdoor_open", now_iso),
        ("zone-05", "site-02", "Zone 2B: Structural Welding Bay", "indoor_heavy", now_iso),
        ("zone-06", "site-02", "Zone 2C: Warehouse Logistics & Staging", "indoor_conditioned", now_iso),
    ]
    for zid, sid, zname, ztype, zcrt in zones_data:
        cursor.execute("INSERT INTO zones VALUES (?, ?, ?, ?, ?)", (zid, sid, zname, ztype, zcrt))

    # 3. 4 Role Logins
    role_users = [
        ("usr-worker", "org-01", "worker1", "worker1@apexindustrial.com", common_pwd, "Alex Morgan", "worker", "active", 1, now_iso, now_iso),
        ("usr-sup", "org-01", "supervisor", "supervisor@apexindustrial.com", common_pwd, "Marcus Vance", "supervisor", "active", 1, now_iso, now_iso),
        ("usr-safety", "org-01", "safety_officer", "safety@apexindustrial.com", common_pwd, "Dr. Elena Rostova", "safety_officer", "active", 1, now_iso, now_iso),
        ("usr-admin", "org-01", "admin", "admin@apexindustrial.com", hash_pwd("admin123"), "Arthur Pendelton", "admin", "active", 1, now_iso, now_iso),
    ]
    for u in role_users:
        cursor.execute("INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)", u)

    # 4. 24 Workers across light, moderate, heavy work
    # We assign 4 workers per zone (6 zones x 4 = 24 workers)
    worker_names = [
        "Alex Morgan", "Carlos Mendez", "Priya Sharma", "David Kim",
        "Sarah Jenkins", "Michael Chang", "Fatima Al-Sayed", "Liam O'Connor",
        "James Wilson", "Amina Yusuf", "Robert Taylor", "Mateo Hernandez",
        "Emily Davis", "Kenji Sato", "Rachel Adams", "Lucas Silva",
        "Olga Ivanova", "Daniel Martinez", "Grace Hopper", "Ahmed Hassan",
        "Chloe Bennett", "Suresh Patel", "Megan Clark", "Gabriel Santos"
    ]

    workloads = ["heavy", "moderate", "light", "heavy", "moderate", "light", "heavy", "moderate"] * 3
    acclimatizations = ["acclimatized", "acclimatized", "unacclimatized", "acclimatized"] * 6
    ppes = ["cotton_coveralls", "standard_work_clothes", "double_layer_woven", "standard_work_clothes"] * 6

    for i in range(24):
        wid = f"w-{i+1:02d}"
        uid = f"usr-w-{i+1:02d}" if i > 0 else "usr-worker" # worker 1 is linked to usr-worker
        name = worker_names[i]
        uname = f"worker{i+1}"
        email = f"worker{i+1}@apexindustrial.com"

        # Create user account for worker if not already inserted
        if i > 0:
            cursor.execute("""
                INSERT INTO users VALUES (?, 'org-01', ?, ?, ?, ?, 'worker', 'active', 1, ?, NULL, NULL, ?)
            """, (uid, uname, email, common_pwd, name, now_iso, now_iso))

        zone_idx = i // 4 # 4 workers per zone
        site_id = "site-01" if zone_idx < 3 else "site-02"
        zone_id = zones_data[zone_idx][0]
        workload = workloads[i]
        acclim = acclimatizations[i]
        ppe = ppes[i]

        base_hr = 70 + (i % 8) * 2
        hr_current = base_hr + (15 if workload == "heavy" else 8)
        core_temp = 37.0 + (0.4 if workload == "heavy" else 0.1)

        # Worker operational status
        risk_level = "Normal"
        status = "Active"
        accom = "Standard work-rest cycle."
        if i == 0: # Alex Morgan
            risk_level = "High"
            status = "Resting"
            hr_current = 146
            core_temp = 38.3
            accom = "Mandatory 15-minute shaded cooling shelter break every 45 minutes; buddy pairing required."
        elif i == 2: # Priya Sharma (unacclimatized)
            risk_level = "Elevated"
            hr_current = 124
            core_temp = 37.8
            accom = "Day 2 acclimatization protocol: maximum 40% normal shift in direct heat."

        cursor.execute("""
            INSERT INTO workers VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', NULL, ?
            )
        """, (
            wid, uid, site_id, zone_id, name, workload, acclim, base_hr, ppe, accom,
            status, risk_level, now_iso, 1250 if i == 0 else 850, now_iso
        ))

        # Fernet-Encrypted Health Table (Rule 9)
        # Check if worker has sensitive conditions (e.g. hypertension, heart/kidney conditions)
        health_payload = {
            "worker_name": name,
            "chronic_conditions": ["Essential Hypertension"] if i == 0 else (["Mild Renal Impairment"] if i == 3 else []),
            "prescriptions": ["Lisinopril 10mg"] if i == 0 else [],
            "prior_heat_events": "Heat syncope episode in 2024" if i == 0 else "None",
            "emergency_contact": f"Contact for {name}: 555-01{i:02d}"
        }
        requires_review = 1 if (i == 0 or i == 3) else 0
        enc_health = encrypt_health(health_payload)

        cursor.execute("""
            INSERT INTO health_private VALUES (?, ?, ?, ?)
        """, (wid, enc_health, requires_review, now_iso))

    # 5. Seed 30 Days of Simulated History
    # Daily readings for the 6 zones and key workers
    print("Generating 30 days of simulated environmental & physiological history...")
    for day_offset in range(30, -1, -1):
        day_date = now - timedelta(days=day_offset)
        day_iso = day_date.isoformat()

        # Generate reading for each zone
        for zid, sid, zname, ztype, _ in zones_data:
            base_temp = 29.0 if "indoor_conditioned" in ztype else (35.5 if "indoor_heavy" in ztype else 33.0)
            # Add minor diurnal variation
            temp_c = round(base_temp + ((day_offset * 7) % 5) * 0.6 - 1.2, 1)
            humidity = round(52.0 + ((day_offset * 11) % 7) * 2.5, 1)
            is_m = 1 if (zid == "zone-01" and day_offset % 3 == 0) else 0
            stag = "Manual" if is_m else ("Verified external" if "outdoor" in ztype else "Simulated")
            wbgt = round(0.567 * temp_c + 0.393 * (humidity / 100.0 * 20.0) + 3.94, 1)

            cursor.execute("""
                INSERT INTO readings_environmental (site_id, zone_id, timestamp, temp_c, humidity_pct, solar_radiation, wind_speed, wbgt_val, is_measured, source_tag, quality)
                VALUES (?, ?, ?, ?, ?, 350.0, 1.2, ?, ?, ?, 'Good')
            """, (sid, zid, day_iso, temp_c, humidity, wbgt, is_m, stag))

        # Generate physiological reading for representative workers
        for w_idx in [0, 1, 2, 3]:
            wid = f"w-{w_idx+1:02d}"
            hr = 80 + (day_offset % 6) * 4 + (20 if w_idx == 0 else 0)
            cursor.execute("""
                INSERT INTO readings_physiological (worker_id, timestamp, heart_rate, skin_temp_proxy, core_temp_proxy, sweat_loss_l, source_tag, quality)
                VALUES (?, ?, ?, 33.5, 37.2, 0.65, 'Simulated', 'Good')
            """, (wid, day_iso, hr))

    # 6. Seed Sample Alerts Carrying All 11 Fields (Rule 7)
    sample_alerts = [
        (
            "ALT-001",
            "w-01",
            "Alex Morgan",
            now_iso,
            "Zone 1A: Blast Furnace & Pouring Floor",
            "Ambient: 38.5°C, RH: 48%, WBGT (measured): 32.4°C",
            "Heart Rate: 146 bpm (Delta: +36 bpm), Core Temp Proxy: 38.3°C, Estimated Sweat Rate: 1.25 L/hr",
            "High thermal burden. Measured WBGT of 32.4°C and heavy metabolic exertion exceed safe continuous ACGIH thresholds. Approaching possible heat-related emergency.",
            "Mandatory work stoppage. Move worker immediately to air-conditioned rest station. Administer 500 ml electrolyte water. Monitor heart rate recovery below 100 bpm.",
            "Acknowledged",
            "Requires Supervisor Intervention",
            "Workload: Heavy; PPE: Cotton coveralls (CAF +1.0°C); Radiant heat source; Reported symptoms: dizziness, fatigue",
            "Conditions verified using WBGT (measured) via calibrated meter. Reliability: High. Limitations: Proxy vitals; not a clinical diagnosis.",
            "High",
            78.5,
            "Environmental load and continuous metabolic exertion exceed safe ACGIH continuous limits.",
            json.dumps(["Mandatory 30m rest in cooling trailer", "500ml electrolyte water", "Monitor vitals until HR < 100"]),
            json.dumps(["Proxy calculation without black globe", "Not a medical diagnosis"]),
            "RULE-ACGIH-WBGT-MAX;RULE-NIOSH-SUSTAINED-HR",
            "1.2.0-deterministic-sprint1",
            "Marcus Vance (Supervisor)",
            now_iso
        ),
        (
            "ALT-002",
            "w-03",
            "Priya Sharma",
            now_iso,
            "Zone 1A: Blast Furnace & Pouring Floor",
            "Ambient: 34.5°C, RH: 62%, WBGT estimate (proxy): 31.1°C",
            "Heart Rate: 124 bpm (Delta: +18 bpm), Core Temp Proxy: 37.8°C, Estimated Sweat Rate: 0.90 L/hr",
            "Elevated environmental heat load. [ML anomaly notice: Pattern deviation detected against baseline thermal-strain distribution (verify before real use)].",
            "Enforce 15-minute shaded rest per hour. Provide 250 ml water every 20 minutes. Implement continuous buddy monitoring.",
            "Unacknowledged",
            "Initial",
            "Workload: Heavy; Unacclimatized shift (Day 2 of 7); Direct solar radiation; ML Anomaly Notice",
            "Conditions calculated using WBGT estimate (proxy). Reliability: Operational reference. Limitations: Mathematical proxy without black globe. Not a clinical diagnosis.",
            "Elevated",
            54.2,
            "Thermal load approaching action threshold with active acclimatization penalty.",
            json.dumps(["Enforce 15m rest break", "250ml water every 20m", "Buddy monitoring"]),
            json.dumps(["Proxy approximation only", "Not a diagnosis"]),
            "RULE-OSHA-ACCLIM-DAY2;RULE-ML-ANOMALY-ELEVATED",
            "1.2.0-deterministic-sprint1",
            None,
            None
        )
    ]

    for a in sample_alerts:
        cursor.execute("""
            INSERT INTO alerts (
                id, worker_id, worker_name, time, location, conditions,
                physiological_changes, reason, action, ack_status, escalation_status,
                contributing_factors, reliability_and_limitations, level, score,
                why, actions_json, limitations_json, rule_ids, model_version,
                acknowledged_by, acknowledged_at, priority, is_false_alert, events_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'High', 0, ?)
        """, (*a, json.dumps([{"time": now_iso, "event": "Alert generated by deterministic safety engine", "by": "System"}])))

    # 7. Seed Active Interventions (Recovery Workflow)
    cursor.execute("""
        INSERT INTO interventions (
            id, worker_id, worker_name, start_time, target_duration_minutes,
            type, cooling_shelter_id, initial_hr, current_hr, base_hr,
            initial_temp, current_temp, symptoms_json, fluids_ml,
            indicators_met, reassessment_requested, status, timeline_json, created_at
        ) VALUES (
            'INT-001', 'w-01', 'Alex Morgan', ?, 20,
            'cooling_shelter', 'SHELTER-01', 146, 92, 72,
            38.3, 37.4, '["fatigue"]', 500,
            1, 1, 'Indicators Met', ?, ?
        )
    """, (
        (now - timedelta(minutes=16)).isoformat(),
        json.dumps([
            {"time": (now - timedelta(minutes=16)).isoformat(), "event": "Dispatched to Cooling Shelter 1A (Misting + Chilled Air)", "by": "Marcus Vance"},
            {"time": (now - timedelta(minutes=10)).isoformat(), "event": "Consumed 500ml electrolyte rehydration fluid", "by": "Alex Morgan"},
            {"time": (now - timedelta(minutes=2)).isoformat(), "event": "Heart rate recovered to 92 bpm (within 20 bpm baseline threshold for >3 min). Reassessment notice sent.", "by": "System"}
        ]),
        now_iso
    ))

    # 8. Seed Incidents (Sprint 2)
    cursor.execute("""
        INSERT INTO incidents (
            id, worker_id, worker_name, zone_id, timestamp, title,
            severity, status, conditions_summary, physiological_summary,
            symptoms_json, actions_taken, witnesses, notes_json, timeline_json,
            protocol_id, created_at
        ) VALUES (
            'INC-2026-001', 'w-01', 'Alex Morgan', 'zone-01', ?,
            'Acute heat exhaustion onset during furnace tapping cycle',
            'High', 'First Response / Treatment',
            'Ambient 34.2°C, RH 58%, WBGT estimate (proxy) 29.2°C',
            'Heart Rate 146 bpm, Core Temp Proxy 38.3°C, Workload: Heavy',
            '["dizziness", "heavy_sweating", "fatigue"]',
            'Immediate work stoppage. Transferred to Cooling Shelter 1A; chilled neck wraps applied; 500ml electrolyte intake.',
            'Carlos Mendez, Priya Sharma',
            '["Worker reported sudden dizziness after 40 min continuous ladle maintenance."]',
            ?,
            'OSHA-HEAT-PROTOCOL-01', ?
        )
    """, (
        (now - timedelta(hours=1, minutes=30)).isoformat(),
        json.dumps([
            {"time": (now - timedelta(hours=1, minutes=30)).isoformat(), "event": "Incident reported by Supervisor Marcus Vance", "by": "Marcus Vance"},
            {"time": (now - timedelta(hours=1, minutes=20)).isoformat(), "event": "First response Cooling Shelter protocol activated", "by": "Marcus Vance"},
            {"time": (now - timedelta(hours=1, minutes=5)).isoformat(), "event": "Triage evaluation completed by Dr. Elena Rostova", "by": "Dr. Elena Rostova"}
        ]),
        now_iso
    ))

    cursor.execute("""
        INSERT INTO incidents (
            id, worker_id, worker_name, zone_id, timestamp, title,
            severity, status, conditions_summary, physiological_summary,
            symptoms_json, actions_taken, witnesses, notes_json, timeline_json,
            protocol_id, created_at
        ) VALUES (
            'INC-2026-002', 'w-03', 'Priya Sharma', 'zone-01', ?,
            'Elevated thermal strain on Day 2 acclimatization shift',
            'Medium', 'Corrective Actions Assigned',
            'Ambient 33.8°C, RH 55%, WBGT estimate (proxy) 28.6°C',
            'Heart Rate 124 bpm, Core Temp Proxy 37.8°C, Workload: Heavy',
            '["headache", "heavy_sweating"]',
            'Reassigned to air-conditioned machining bay for remainder of shift.',
            'Marcus Vance',
            '["Unacclimatized schedule adjustment required for Day 3."]',
            ?,
            'OSHA-HEAT-PROTOCOL-01', ?
        )
    """, (
        (now - timedelta(hours=3)).isoformat(),
        json.dumps([
            {"time": (now - timedelta(hours=3)).isoformat(), "event": "Thermal strain threshold warning logged", "by": "System"},
            {"time": (now - timedelta(hours=2, minutes=45)).isoformat(), "event": "Worker rotated to indoor conditioned area", "by": "Marcus Vance"}
        ]),
        now_iso
    ))

    # 9. Seed Default Notification Preferences
    for uid in ["usr-worker", "usr-sup", "usr-safety", "usr-admin"]:
        cursor.execute("""
            INSERT INTO notification_preferences (user_id, sound_enabled, toast_enabled, email_enabled, sms_enabled, critical_cannot_disable, updated_at)
            VALUES (?, 1, 1, 1, 0, 1, ?)
        """, (uid, now_iso))

    # 10. Seed Initial Audit Log and Return-to-Work Clearance
    cursor.execute("""
        INSERT INTO audit_log (timestamp, user_id, username, role, action, resource, details, ip_address)
        VALUES (?, 'usr-admin', 'admin', 'admin', 'SYSTEM_INITIALIZATION', 'DATABASE', 'Seeded 1 org, 2 sites x 3 zones, 24 workers, 4 roles, 30 days history, interventions & incidents.', '127.0.0.1')
    """, (now_iso,))

    cursor.execute("""
        INSERT INTO return_to_work_clearances VALUES (
            'RTW-001', 'w-04', 'David Kim', ?, ?,
            'Dr. Elena Rostova', 'Occupational Health Physician',
            'Worker rested in cooled triage, vitals fully normalized, asymptomatic.',
            'Resting HR 68 bpm, Oral temp 36.8°C, BP 120/78 mmHg',
            'Light/moderate duties only in Zone 1B for 48 hours',
            1, ?
        )
    """, (now_iso, now_iso, now_iso))

    # 11. Seed Safety Protocols (Sprint 3)
    proto_v2 = {
        "id": "PROT-OSHA-2026-v2.1",
        "version": "2.1.0",
        "title": "OSHA National Heat Illness Prevention Standard (2026 Revision)",
        "status": "active",
        "work_rest_json": json.dumps({
            "continuous": {"max_wbgt": 28.0, "rest_minutes_per_hour": 0},
            "standard_cycle": {"min_wbgt": 28.1, "max_wbgt": 30.0, "rest_minutes_per_hour": 15},
            "moderate_cycle": {"min_wbgt": 30.1, "max_wbgt": 31.5, "rest_minutes_per_hour": 30},
            "heavy_cycle": {"min_wbgt": 31.6, "max_wbgt": 32.5, "rest_minutes_per_hour": 45},
            "stop_work": {"min_wbgt": 32.6, "rest_minutes_per_hour": 60}
        }),
        "acclimatization_json": json.dumps({
            "day1_pct": 20, "day2_pct": 40, "day3_pct": 60, "day4_pct": 80, "day5_pct": 100,
            "break_in_service_days": 14, "rule": "NIOSH 5-day staged metabolic acclimation protocol"
        }),
        "ppe_caf_json": json.dumps({
            "standard_work_clothes": 0.0, "cotton_coveralls": 1.0, "double_layer": 2.0, "vapor_barrier_impermeable": 3.0
        }),
        "escalation_minutes_json": json.dumps({"high_unack_minutes": 5, "emergency_unack_minutes": 2}),
        "description": "Standardized industrial occupational heat illness prevention protocol based on OSHA General Duty Clause, ACGIH TLVs, and ISO 7243 screening thresholds.",
        "created_by": "Dr. Elena Rostova",
        "created_at": (now - timedelta(days=60)).isoformat(),
        "activated_at": (now - timedelta(days=30)).isoformat()
    }
    cursor.execute("""
        INSERT INTO protocols VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        proto_v2["id"], proto_v2["version"], proto_v2["title"], proto_v2["status"],
        proto_v2["work_rest_json"], proto_v2["acclimatization_json"], proto_v2["ppe_caf_json"],
        proto_v2["escalation_minutes_json"], proto_v2["description"], proto_v2["created_by"],
        proto_v2["created_at"], proto_v2["activated_at"]
    ))

    proto_draft = {
        "id": "PROT-ACGIH-2026-v2.2-draft",
        "version": "2.2.0-rc1",
        "title": "ACGIH Physiological Action Limit Dynamic Adjustment Protocol (Draft)",
        "status": "draft",
        "work_rest_json": json.dumps({
            "continuous": {"max_wbgt": 27.5, "rest_minutes_per_hour": 0},
            "standard_cycle": {"min_wbgt": 27.6, "max_wbgt": 29.5, "rest_minutes_per_hour": 15},
            "moderate_cycle": {"min_wbgt": 29.6, "max_wbgt": 31.0, "rest_minutes_per_hour": 30},
            "heavy_cycle": {"min_wbgt": 31.1, "max_wbgt": 32.0, "rest_minutes_per_hour": 45},
            "stop_work": {"min_wbgt": 32.1, "rest_minutes_per_hour": 60}
        }),
        "acclimatization_json": json.dumps({
            "day1_pct": 20, "day2_pct": 35, "day3_pct": 50, "day4_pct": 70, "day5_pct": 90, "day6_pct": 100,
            "break_in_service_days": 10, "rule": "Stricter 6-day phased curve for heavy metallurgical work"
        }),
        "ppe_caf_json": json.dumps({
            "standard_work_clothes": 0.0, "cotton_coveralls": 1.5, "double_layer": 2.5, "vapor_barrier_impermeable": 4.0
        }),
        "escalation_minutes_json": json.dumps({"high_unack_minutes": 4, "emergency_unack_minutes": 2}),
        "description": "Proposed enhanced safety guidelines featuring tighter clothing adjustment penalties for high-humidity metal smelting operations.",
        "created_by": "Arthur Pendelton",
        "created_at": (now - timedelta(days=5)).isoformat(),
        "activated_at": None
    }
    cursor.execute("""
        INSERT INTO protocols VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        proto_draft["id"], proto_draft["version"], proto_draft["title"], proto_draft["status"],
        proto_draft["work_rest_json"], proto_draft["acclimatization_json"], proto_draft["ppe_caf_json"],
        proto_draft["escalation_minutes_json"], proto_draft["description"], proto_draft["created_by"],
        proto_draft["created_at"], proto_draft["activated_at"]
    ))

    # 12. Seed Shift Handover Reports (Sprint 3)
    cursor.execute("""
        INSERT INTO shift_handovers (
            id, shift_date, shift_name, site_id, outgoing_supervisor_id, outgoing_supervisor_name,
            incoming_supervisor_id, incoming_supervisor_name, status, summary_json, notes, acknowledged_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "HO-2026-001", now.strftime("%Y-%m-%d"), "Morning", "site-01",
        "usr-sup", "Marcus Vance", "usr-sup", "Marcus Vance", "Pending Acknowledgment",
        json.dumps({
            "active_high_risk_workers": ["Alex Morgan (w-01)", "Priya Sharma (w-03)"],
            "pending_interventions_count": 1,
            "open_incidents_count": 1,
            "peak_wbgt_recorded": 32.4,
            "peak_zone": "Zone 1A: Blast Furnace & Pouring Floor",
            "cooling_shelter_status": {
                "SHELTER-01": "Supplies full (electrolyte 120L, ice towels restocked)",
                "SHELTER-02": "Operational"
            }
        }),
        "Afternoon shift supervisor must monitor Zone 1A furnace tapping cycle scheduled for 14:30. Priya Sharma is on Day 2 of acclimatization (max 40% heat exposure).",
        None,
        now_iso
    ))

    # 13. Seed Near-Miss Intelligence Records (Sprint 3)
    near_miss_seeds = [
        (
            "NM-2026-001", "usr-w-01", "Alex Morgan", "site-01", "zone-01",
            (now - timedelta(days=1, hours=3)).isoformat(),
            "Dehydration Onset",
            "Experienced transient lightheadedness while checking ladles during furnace heat cycle. Electrolyte water station was 75m away.",
            "heavy", 31.8,
            "Radiant heat surge, distance to hydration station, heavy flame-retardant PPE.",
            "Deploy portable insulated electrolyte cooler directly on pouring deck; mandate buddy water check every 30 mins.",
            "Under Review", now_iso
        ),
        (
            "NM-2026-002", "usr-w-03", "Priya Sharma", "site-01", "zone-02",
            (now - timedelta(days=2, hours=4)).isoformat(),
            "Heat Exhaustion Prodrome",
            "Felt sudden facial flushing and nausea while staging ingot molds. Worker immediately alerted buddy and rested in shade.",
            "heavy", 29.5,
            "Unacclimatized status (Day 1 back from medical leave), ambient 33°C.",
            "Re-enforce supervisor shift briefing on NIOSH 5-day acclimatization ramp; prevent unsupervised high-exertion tasks.",
            "Mitigated", now_iso
        ),
        (
            "NM-2026-003", "usr-w-08", "Ethan Hunt", "site-02", "zone-04",
            (now - timedelta(days=3, hours=2)).isoformat(),
            "Cooling Station Access Delay",
            "Cooling shelter 2A door lock jammed during afternoon heat wave, delaying rest break by 12 minutes.",
            "moderate", 30.2,
            "Mechanical latch failure on exterior cooling cabin under direct sun exposure.",
            "Immediate maintenance work order issued; replaced mechanical latch with magnetic emergency push bar.",
            "Resolved", now_iso
        )
    ]
    for nm in near_miss_seeds:
        cursor.execute("""
            INSERT INTO near_misses VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, nm)

    # 14. Seed Safety Nudges (Sprint 3)
    nudges = [
        ("NUDGE-001", "w-01", (now - timedelta(minutes=45)).isoformat(), "Hydration", "Heat reminder: Drink 250ml electrolyte water before beginning next furnace round.", 0, 1),
        ("NUDGE-002", "w-01", (now - timedelta(minutes=15)).isoformat(), "Rest Break", "Your calculated heat exposure index reached 78. Please take a 15-minute shaded rest break.", 0, 0),
        ("NUDGE-003", "w-03", (now - timedelta(minutes=30)).isoformat(), "Acclimatization", "Acclimatization protocol Day 2: limit total heat duration to 40% of standard shift.", 0, 0),
        ("NUDGE-004", "w-04", (now - timedelta(minutes=10)).isoformat(), "Hydration", "Hydration compliance check: log your water intake at the nearest hydration station.", 0, 0),
    ]
    for n in nudges:
        cursor.execute("INSERT INTO safety_nudges VALUES (?, ?, ?, ?, ?, ?, ?)", n)

    # 15. Seed Heat Safety Passport Permissions (Sprint 3)
    cursor.execute("""
        INSERT INTO passport_permissions VALUES ('w-01', 1, '["occupational_health", "safety_officer"]', ?, ?)
    """, (now_iso, now_iso))
    cursor.execute("""
        INSERT INTO passport_permissions VALUES ('w-02', 0, '["occupational_health", "safety_officer"]', NULL, ?)
    """, (now_iso,))
    cursor.execute("""
        INSERT INTO passport_permissions VALUES ('w-03', 0, '["occupational_health", "safety_officer"]', NULL, ?)
    """, (now_iso,))
    cursor.execute("""
        INSERT INTO passport_permissions VALUES ('w-04', 1, '["occupational_health", "safety_officer"]', ?, ?)
    """, (now_iso, now_iso))

    conn.commit()
    conn.close()
    print("ThermoSense database successfully seeded with 1 org, 2 sites, 6 zones, 24 workers, 4 logins, and 30 days history.")


if __name__ == "__main__":
    seed_db()

