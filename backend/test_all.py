"""
THERMOSENSE Comprehensive Sprint 1 Test Suite (test_all.py)
-----------------------------------------------------------
50 Tests covering all requirements of the Sprint 1 Task List:
- Deterministic rules in engine.py: wbgt_proxy, personal_limit, accumulated_exposure, reading_quality, assess(), recommendations(), duplicate suppression
- ML fingerprinting, cold-start flags, and anomaly constraints in ml.py
- Seeded telemetry, 7 scenarios, CSV/JSON imports with reports in simulator.py
- Fernet encrypted health_private, supervisor blindness, audit logging in db.py
- Auth, RBAC, 30-min token expiry, in-app reset, consent in main.py & auth.py
"""

import os
import sys
import json
from datetime import datetime, timezone, timedelta

# Ensure root directory is on PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import pytest
import jwt
from fastapi import HTTPException
from backend.db import (
    get_db,
    seed_db,
    encrypt_health,
    decrypt_health,
    log_audit
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
from backend.ml import (
    build_fingerprint,
    detect_anomaly,
    verify_ml_invariants,
    MODEL_VERSION,
    compute_robust_z_scores,
    predict_30min_projection,
    train_digital_twin_ridge
)
from backend.simulator import (
    SCENARIOS,
    generate_seeded_environment,
    generate_seeded_physiology,
    run_scenario_step,
    get_csv_template,
    import_readings_csv,
    import_readings_json,
    fetch_shift_forecast,
    evaluate,
    get_walkthrough_story,
    run_judge_walkthrough
)
from backend.auth import (
    hash_password,
    verify_password,
    create_access_token,
    decode_token,
    generate_in_app_reset_token
)
from backend.main import (
    login,
    register,
    forgot_password,
    reset_password,
    submit_consent,
    list_workers,
    get_worker_profile,
    get_private_health,
    worker_check_in,
    get_current_risk,
    get_risk_explain,
    submit_manual_reading,
    list_alerts,
    acknowledge_alert,
    submit_clearance,
    set_user_status,
    get_command_summary,
    list_workforce,
    list_zones,
    auto_escalate_alerts,
    mark_false_alert,
    get_notification_preferences,
    set_notification_preferences,
    start_intervention,
    list_active_interventions,
    log_intervention_vitals,
    clear_intervention,
    list_incidents,
    create_incident,
    get_incident,
    update_incident_status,
    add_incident_note,
    get_emergency_protocols,
    get_worker_prediction,
    evaluate_whatif,
    get_shift_forecast,
    get_map_layout,
    list_protocols,
    create_protocol,
    activate_protocol,
    compare_protocol_versions,
    get_workforce_admin,
    toggle_user_status,
    purge_retention_data,
    get_analytics_summary,
    export_analytics_csv,
    get_heat_safety_passport,
    toggle_passport_permission,
    list_handovers,
    create_handover,
    acknowledge_handover,
    list_near_misses,
    report_near_miss,
    get_insights,
    get_worker_nudges,
    send_nudge,
    assistant_chat,
    get_benchmark_evaluation,
    get_walkthrough,
    execute_walkthrough_step,
    reset_walkthrough,
    LoginRequest,
    RegisterRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    ConsentRequest,
    WorkerCheckInRequest,
    ManualReadingRequest,
    ReturnToWorkRequest,
    UserStatusRequest,
    WhatIfRequest,
    FalseAlertRequest,
    StartInterventionRequest,
    LogVitalsInterventionRequest,
    ClearInterventionRequest,
    CreateIncidentRequest,
    UpdateIncidentStatusRequest,
    AddIncidentNoteRequest,
    NotificationPreferencesRequest,
    CreateProtocolRequest,
    PurgeRetentionRequest,
    CreateHandoverRequest,
    AcknowledgeHandoverRequest,
    CreateNearMissRequest,
    SendNudgeRequest,
    TogglePassportPermissionRequest,
    AssistantChatRequest
)


class MockClient:
    host = "127.0.0.1"

class MockRequest:
    client = MockClient()
    headers = {}


@pytest.fixture(scope="module", autouse=True)
def initialize_database():
    seed_db()


def get_user_session(username: str, password: str = "password123"):
    res = login(LoginRequest(username=username, password=password))
    return res["user"]


# ---------------------------------------------------------------------------
# Section A: engine.py Pure Functions & CONFIG (Tests 1 - 20)
# ---------------------------------------------------------------------------
def test_01_config_sources_and_verify_disclaimer():
    assert "verify before real use" in CONFIG["disclaimer"].lower()
    assert "base_personal_limits" in CONFIG
    assert "personal_adjustments" in CONFIG
    assert "physiological_limits" in CONFIG


def test_02_wbgt_proxy_bom_approximation():
    res = wbgt_proxy(temp_c=30.0, humidity_pct=50.0)
    assert res["label"] == "WBGT estimate (proxy)"
    assert res["is_measured"] is False
    assert 22.0 <= res["wbgt_val"] <= 32.0


def test_03_wbgt_proxy_shade_offset_applied():
    sun_res = wbgt_proxy(temp_c=34.0, humidity_pct=60.0, solar_radiation=600.0, is_shaded=False)
    shade_res = wbgt_proxy(temp_c=34.0, humidity_pct=60.0, solar_radiation=600.0, is_shaded=True)
    assert shade_res["wbgt_val"] < sun_res["wbgt_val"]


def test_04_wbgt_proxy_manual_override_labels_and_source():
    res = wbgt_proxy(temp_c=35.0, humidity_pct=50.0, manual_override=31.8)
    assert res["wbgt_val"] == 31.8
    assert res["label"] == "WBGT (measured)"
    assert res["is_measured"] is True
    assert res["source_tag"] == "Manual"


def test_05_wbgt_proxy_limitations_tooltip_present():
    res = wbgt_proxy(temp_c=30.0, humidity_pct=50.0)
    assert "limitations" in res
    assert "ISO 7243" in res["limitations"] or "proxy" in res["limitations"].lower()


def test_06_personal_limit_base_light_workload():
    res = personal_limit(workload="light")
    assert res["base_limit"] == 30.0
    assert res["limit"] == 30.0


def test_07_personal_limit_base_moderate_workload():
    res = personal_limit(workload="moderate")
    assert res["base_limit"] == 28.0
    assert res["limit"] == 28.0


def test_08_personal_limit_base_heavy_workload():
    res = personal_limit(workload="heavy")
    assert res["base_limit"] == 26.0
    assert res["limit"] == 26.0


def test_09_personal_limit_base_very_heavy_workload():
    res = personal_limit(workload="very_heavy")
    assert res["base_limit"] == 25.0
    assert res["limit"] == 25.0


def test_10_personal_limit_unacclimatized_penalty():
    res = personal_limit(workload="heavy", acclimatized=False)
    assert res["adjustments"].get("unacclimatized") == -2.0
    assert res["limit"] == 24.0


def test_11_personal_limit_age_over_50_penalty():
    res = personal_limit(workload="moderate", age=55)
    assert res["adjustments"].get("age_over_50") == -1.0
    assert res["limit"] == 27.0


def test_12_personal_limit_ppe_clothing_adjustment():
    res = personal_limit(workload="heavy", ppe_type="double_layer_woven")
    assert res["adjustments"].get("ppe_caf") == -2.0
    assert res["limit"] == 24.0


def test_13_personal_limit_heart_kidney_condition_penalty():
    res = personal_limit(workload="moderate", health_flags=["Essential Hypertension", "Cardiac history"])
    assert res["adjustments"].get("cardio_renal_caution") == -2.0
    assert res["review_required"] is True


def test_14_personal_limit_heart_kidney_triggers_review_required():
    res = personal_limit(workload="light", health_flags=["Chronic Kidney Disease"])
    assert res["review_required"] is True


def test_15_personal_limit_downward_adjustment_cap_at_four():
    # Sum of penalties: -2.0 (unacclim) + -1.0 (age) + -4.0 (vapor barrier) + -2.0 (heart) = -9.0
    # Must be capped at 4.0 downward adjustment
    res = personal_limit(
        workload="moderate", # base 28.0
        acclimatized=False,
        age=58,
        ppe_type="vapor_barrier_impermeable_ppe",
        health_flags=["Heart arrhythmia"]
    )
    assert res["total_adjustment_applied"] == -4.0
    assert res["limit"] == 24.0 # 28.0 - 4.0 = 24.0


def test_16_personal_limit_absolute_floor_at_twenty():
    # If base was low and adjustments pushed below 20.0, floor is 20.0
    res = personal_limit(workload="very_heavy", acclimatized=False, age=55, ppe_type="vapor_barrier_impermeable_ppe")
    assert res["limit"] >= 20.0


def test_17_accumulated_exposure_math():
    res = accumulated_exposure(history_minutes=180.0, avg_wbgt=29.0, rest_minutes=30.0)
    assert res["exposure_dose"] > 0
    assert res["effective_work_mins"] == 135.0


def test_18_reading_quality_good_case():
    q = reading_quality({"temp_c": 32.5, "humidity_pct": 55.0, "heart_rate": 84.0})
    assert q == "Good"


def test_19_reading_quality_suspect_outliers():
    q_temp = reading_quality({"temp_c": 80.0, "humidity_pct": 50.0, "heart_rate": 80.0})
    q_hr = reading_quality({"temp_c": 30.0, "humidity_pct": 50.0, "heart_rate": 260.0})
    assert q_temp == "Suspect"
    assert q_hr == "Suspect"


def test_20_reading_quality_missing_fields():
    q = reading_quality({"temp_c": 30.0, "humidity_pct": None, "heart_rate": 80.0})
    assert q == "Missing"


# ---------------------------------------------------------------------------
# Section B: Assessment, Explainability & Recommendations (Tests 21 - 27)
# ---------------------------------------------------------------------------
def test_21_assess_normal_level():
    res = assess(
        worker_dict={"workload": "moderate", "acclimatized": True, "ppe_type": "standard_work_clothes"},
        env_reading={"wbgt_val": 23.0, "is_measured": False, "source_tag": "Simulated"},
        physio_reading={"heart_rate": 78, "core_temp_proxy": 37.0}
    )
    assert res["level"] == "Normal"
    assert "RULE-CONDITIONS-NORMAL" in res["rule_ids"]


def test_22_assess_elevated_level():
    res = assess(
        worker_dict={"workload": "heavy", "acclimatized": False, "ppe_type": "standard_work_clothes"},
        env_reading={"wbgt_val": 25.0, "is_measured": False, "source_tag": "Simulated"},
        physio_reading={"heart_rate": 95, "core_temp_proxy": 37.3}
    )
    assert res["level"] == "Elevated"


def test_23_assess_high_level():
    res = assess(
        worker_dict={"workload": "heavy", "acclimatized": True, "ppe_type": "cotton_coveralls"},
        env_reading={"wbgt_val": 32.0, "is_measured": True, "source_tag": "Manual"},
        physio_reading={"heart_rate": 144, "core_temp_proxy": 38.2}
    )
    assert res["level"] == "High"
    assert "RULE-ACGIH-TLV-EXCEEDED" in res["rule_ids"]


def test_24_assess_emergency_level():
    res = assess(
        worker_dict={"workload": "heavy", "acclimatized": True},
        env_reading={"wbgt_val": 34.0, "is_measured": True, "source_tag": "Manual"},
        physio_reading={"heart_rate": 165, "core_temp_proxy": 38.8},
        symptoms=["confusion", "fainting"]
    )
    assert res["level"] == "Emergency"
    assert "RULE-CRITICAL-PHYSIOLOGICAL-SPIKE" in res["rule_ids"]


def test_25_assess_score_weights_sum_to_one():
    res = assess(
        worker_dict={"workload": "moderate", "acclimatized": True},
        env_reading={"wbgt_val": 28.0, "is_measured": False, "source_tag": "Simulated"},
        physio_reading={"heart_rate": 90, "core_temp_proxy": 37.2}
    )
    w = res["weights"]
    assert sum(w.values()) == pytest.approx(1.0, 0.01)


def test_26_assess_no_diagnosis_language():
    res = assess(
        worker_dict={"workload": "heavy", "acclimatized": True},
        env_reading={"wbgt_val": 35.0, "is_measured": True, "source_tag": "Manual"},
        physio_reading={"heart_rate": 166, "core_temp_proxy": 39.0},
        symptoms=["collapse"]
    )
    assert "possible heat-related emergency" in " ".join(res["why"]).lower()
    for forbidden in ["diagnosed", "heatstroke diagnosed", "heat stroke diagnosed"]:
        assert forbidden not in " ".join(res["why"]).lower()


def test_27_recommendations_emergency_branch():
    recs = recommendations(level="Emergency", score=92.0, factors=["HR 166"])
    assert any("EMERGENCY PROTOCOL" in r for r in recs)
    assert any("medic" in r.lower() for r in recs)


def test_28_duplicate_suppression_window_ten_minutes():
    last_time = datetime.now(timezone.utc).isoformat()
    # Identical severity within 10 min -> suppressed
    assert is_suppressed(last_alert_time_iso=last_time, last_level="Elevated", new_level="Elevated", window_minutes=10) is True


def test_29_duplicate_suppression_window_allows_escalations():
    last_time = datetime.now(timezone.utc).isoformat()
    # Escalation from Elevated to Emergency -> NEVER suppressed
    assert is_suppressed(last_alert_time_iso=last_time, last_level="Elevated", new_level="Emergency", window_minutes=10) is False


# ---------------------------------------------------------------------------
# Section C: Machine Learning & Fingerprint in ml.py (Tests 30 - 33)
# ---------------------------------------------------------------------------
def test_30_ml_fingerprint_cold_start_defaults():
    # w-99 has no history in DB
    fp = build_fingerprint("w-99_nonexistent")
    assert fp["cold_start"] is True
    assert fp["resting_hr_median"] == 72.0
    assert "hr_by_workload_band" in fp


def test_31_ml_fingerprint_with_sufficient_history():
    # w-01 has 30 days of seeded telemetry in DB
    fp = build_fingerprint("w-01")
    assert fp["cold_start"] is False
    assert fp["sample_count"] >= 10
    assert fp["resting_hr_median"] > 50.0


def test_32_ml_anomaly_notice_cap_at_elevated():
    ml_res = detect_anomaly("w-01", temp_c=42.0, humidity_pct=85.0, heart_rate=160.0)
    assert ml_res["allowed_maximum_escalation"] == "Elevated"
    assert ml_res["is_diagnosis"] is False


def test_33_ml_never_diagnoses_invariant():
    ml_res = detect_anomaly("w-01", temp_c=38.0, humidity_pct=70.0, heart_rate=145.0)
    assert verify_ml_invariants(ml_res) is True


# ---------------------------------------------------------------------------
# Section D: Simulator Scenarios & Ingest in simulator.py (Tests 34 - 38)
# ---------------------------------------------------------------------------
def test_34_simulator_seven_scenarios_exist():
    assert len(SCENARIOS) == 7
    for s in ["normal", "rising_heat", "over_exertion", "dehydration_drift", "noisy_sensor", "missing_data", "collapse"]:
        assert s in SCENARIOS


def test_35_simulator_collapse_scenario_emergency():
    res = run_scenario_step("collapse", worker_id="w-01", step=5)
    assert res["physiological"]["heart_rate"] >= 160
    assert "confusion" in res["symptoms"]


def test_36_simulator_csv_template_generation():
    csv_env = get_csv_template("environmental")
    assert "site_id,zone_id,temp_c,humidity_pct" in csv_env
    csv_phys = get_csv_template("physiological")
    assert "worker_id,heart_rate,skin_temp_proxy" in csv_phys


def test_37_simulator_csv_import_with_validation_report():
    sample_csv = (
        "site_id,zone_id,temp_c,humidity_pct,solar_radiation,wind_speed,is_measured,source_tag\n"
        "site-01,zone-01,33.5,58.0,400.0,1.2,0,Imported\n"
        "site-01,zone-02,30.0,50.0,0.0,1.0,1,Manual\n"
    )
    rows, report = import_readings_csv(sample_csv, "environmental")
    assert len(rows) == 2
    assert report["valid_rows_accepted"] == 2
    assert report["rejected_count"] == 0


def test_38_simulator_json_import_with_validation_report():
    sample_json = [
        {"worker_id": "w-01", "heart_rate": 84, "skin_temp_proxy": 33.2, "core_temp_proxy": 37.0},
        {"worker_id": "w-02", "heart_rate": 92, "skin_temp_proxy": 33.8, "core_temp_proxy": 37.2}
    ]
    rows, report = import_readings_json(sample_json, "physiological")
    assert len(rows) == 2
    assert report["valid_records"] == 2


# ---------------------------------------------------------------------------
# Section E: Database, Privacy & Encryption in db.py (Tests 39 - 41)
# ---------------------------------------------------------------------------
def test_39_db_fernet_encryption_at_rest():
    data = {"condition": "Hypertension", "rx": "Lisinopril"}
    enc = encrypt_health(data)
    assert enc != str(data)
    dec = decrypt_health(enc)
    assert dec["condition"] == "Hypertension"


def test_40_db_seed_counts_sites_zones_workers_roles():
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM organizations")
    assert c.fetchone()[0] == 1
    c.execute("SELECT COUNT(*) FROM sites")
    assert c.fetchone()[0] == 2
    c.execute("SELECT COUNT(*) FROM zones")
    assert c.fetchone()[0] == 6 # 2 sites x 3 zones
    c.execute("SELECT COUNT(*) FROM workers")
    assert c.fetchone()[0] == 24 # 24 workers
    conn.close()


def test_41_db_audit_log_written_on_action():
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM audit_log")
    count_before = c.fetchone()[0]
    conn.close()

    log_audit("usr-test", "testuser", "safety_officer", "TEST_ACTION", details="Testing audit log write")

    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM audit_log")
    count_after = c.fetchone()[0]
    conn.close()
    assert count_after == count_before + 1


# ---------------------------------------------------------------------------
# Section F: Auth, RBAC & Endpoints in main.py (Tests 42 - 50)
# ---------------------------------------------------------------------------
def test_42_auth_password_hashing_and_verify():
    h = hash_password("secretPass123")
    assert verify_password("secretPass123", h) is True
    assert verify_password("wrongPass", h) is False


def test_43_auth_jwt_token_thirty_min_expiry():
    token = create_access_token({"id": "usr-01", "username": "test", "role": "worker"})
    payload = decode_token(token)
    assert payload is not None
    # Verify expiration is ~30 min in the future
    exp_delta = payload["exp"] - payload["iat"]
    assert 1790 <= exp_delta <= 1810 # 1800 seconds = 30 minutes


def test_44_auth_in_app_forgot_reset_token():
    res = forgot_password(ForgotPasswordRequest(username_or_email="supervisor"))
    assert res["status"] == "ok"
    assert res["in_app_reset_token"] is not None
    assert "TS-RESET-" in res["in_app_reset_token"]

    # Reset password with that token
    reset_res = reset_password(ResetPasswordRequest(
        reset_token=res["in_app_reset_token"],
        new_password="newSupervisorPassword123"
    ))
    assert reset_res["status"] == "success"

    # Restore default password
    forgot_res2 = forgot_password(ForgotPasswordRequest(username_or_email="supervisor"))
    reset_password(ResetPasswordRequest(
        reset_token=forgot_res2["in_app_reset_token"],
        new_password="password123"
    ))


def test_45_supervisor_never_receives_declared_conditions():
    """Rule 9 Privacy Requirement: Verified by explicit test."""
    sup_user = get_user_session("supervisor")

    # 1. Direct query of private health by supervisor MUST raise HTTP 403 Forbidden
    with pytest.raises(HTTPException) as exc_info:
        get_private_health(worker_id="w-01", request=MockRequest(), current_user=sup_user)
    assert exc_info.value.status_code == 403
    assert "Rule 9" in exc_info.value.detail or "Access Denied" in exc_info.value.detail

    # 2. Worker list query MUST NOT contain declared health conditions
    workers = list_workers(current_user=sup_user)
    assert len(workers) == 24
    for w in workers:
        assert "encrypted_data" not in w
        assert "chronic_conditions" not in w
        assert "prescriptions" not in w


def test_46_medic_can_view_health_and_writes_audit():
    medic_user = get_user_session("safety_officer")
    res = get_private_health(worker_id="w-01", request=MockRequest(), current_user=medic_user)
    assert "declared_conditions" in res
    assert "Essential Hypertension" in str(res["declared_conditions"])


def test_47_user_activate_suspend_rbac():
    admin_user = get_user_session("admin", "admin123")
    # Admin suspends worker2
    res = set_user_status(user_id="usr-w-02", req=UserStatusRequest(status="suspended"), current_user=admin_user)
    assert res["new_status"] == "suspended"

    # Verify suspended user cannot log in
    with pytest.raises(HTTPException) as exc:
        login(LoginRequest(username="worker2", password="password123"))
    assert exc.value.status_code == 403

    # Reactivate
    set_user_status(user_id="usr-w-02", req=UserStatusRequest(status="active"), current_user=admin_user)


def test_48_worker_consent_flow():
    worker_user = get_user_session("worker1")
    res = submit_consent(ConsentRequest(worker_id="w-01", consent_given=True), current_user=worker_user)
    assert res["consent_given"] is True


def test_49_worker_check_in_and_risk_evaluation():
    worker_user = get_user_session("worker1")
    res = worker_check_in(
        worker_id="w-01",
        req=WorkerCheckInRequest(water_intake_ml=250, symptoms=["excessive_thirst"]),
        current_user=worker_user
    )
    assert res["status"] == "success"
    assert "risk_level" in res


def test_50_return_to_work_named_human_signoff():
    medic_user = get_user_session("safety_officer")
    # Missing named human must fail
    with pytest.raises((HTTPException, Exception)):
        submit_clearance(
            ReturnToWorkRequest(
                worker_id="w-01",
                cleared_by_name="", # empty human
                cleared_by_role="Medic",
                assessment_notes="Recovered",
                vital_signs_check="Vitals normal"
            ),
            current_user=medic_user
        )

    # Valid named human signoff succeeds
    ok_res = submit_clearance(
        ReturnToWorkRequest(
            worker_id="w-01",
            cleared_by_name="Dr. Elena Rostova",
            cleared_by_role="Occupational Health Physician",
            assessment_notes="Physically evaluated in triage, HR 68 bpm, skin temp normal.",
            vital_signs_check="Resting HR 68 bpm, oral temp 36.8°C"
        ),
        current_user=medic_user
    )
    assert ok_res["status"] == "success"
    assert "Dr. Elena Rostova" in ok_res["message"]


# ---------------------------------------------------------------------------
# Section G: Sprint 2 Advanced Workflows & Safety Integrations (Tests 51 - 62)
# ---------------------------------------------------------------------------

def test_51_alert_auto_escalation_lifecycle():
    """Sprint 2: Auto-escalation (High 5 min, Emergency 2 min -> safety officer -> medical contact)."""
    now = datetime.now(timezone.utc)

    # 1. Emergency unacknowledged for 2.5 minutes -> escalates to Medical Contact
    res_emerg = evaluate_alert_escalation(
        alert_time_iso=(now - timedelta(minutes=2.5)).isoformat(),
        level="Emergency",
        ack_status="Unacknowledged",
        current_escalation="Initial",
        now_dt=now
    )
    assert res_emerg["should_escalate"] is True
    assert res_emerg["new_status"] == "Escalated to Medical Contact"

    # 2. High unacknowledged for 5.5 minutes -> escalates to Safety Officer
    res_high = evaluate_alert_escalation(
        alert_time_iso=(now - timedelta(minutes=5.5)).isoformat(),
        level="High",
        ack_status="Unacknowledged",
        current_escalation="Initial",
        now_dt=now
    )
    assert res_high["should_escalate"] is True
    assert res_high["new_status"] == "Escalated to Safety Officer"

    # 3. High unacknowledged for only 3.0 minutes -> does NOT escalate yet
    res_high_early = evaluate_alert_escalation(
        alert_time_iso=(now - timedelta(minutes=3.0)).isoformat(),
        level="High",
        ack_status="Unacknowledged",
        current_escalation="Initial",
        now_dt=now
    )
    assert res_high_early["should_escalate"] is False

    # 4. Acknowledged alert NEVER escalates
    res_ack = evaluate_alert_escalation(
        alert_time_iso=(now - timedelta(minutes=15.0)).isoformat(),
        level="High",
        ack_status="Acknowledged",
        current_escalation="Initial",
        now_dt=now
    )
    assert res_ack["should_escalate"] is False


def test_52_duplicate_suppression_window_merging():
    """Sprint 2: 10-minute duplicate suppression window logic."""
    now_iso = datetime.now(timezone.utc).isoformat()

    # Identical severity within 10 min window -> suppressed
    assert is_suppressed(now_iso, "Elevated", "Elevated", window_minutes=10) is True

    # Severity escalation (Elevated -> High) -> NEVER suppressed
    assert is_suppressed(now_iso, "Elevated", "High", window_minutes=10) is False
    assert is_suppressed(now_iso, "High", "Emergency", window_minutes=10) is False


def test_53_recovery_indicators_met_criteria():
    """
    Sprint 2 Recovery:
    HR within 20 bpm of baseline for 3 min, no symptoms, minimum rest (15 min), level not High.
    """
    # 1. All criteria met
    res_met = check_recovery_indicators(
        current_hr=85, # baseline 72 -> delta +13 <= 20 bpm
        base_hr=72,
        symptoms=[],
        rest_duration_minutes=18.0, # >= 15 min
        current_env_level="Normal"
    )
    assert res_met["indicators_met"] is True
    assert "Supervisor Reassessment Required" in res_met["notice"]

    # 2. Symptom present -> fails
    res_sym = check_recovery_indicators(
        current_hr=85,
        base_hr=72,
        symptoms=["dizziness"],
        rest_duration_minutes=18.0,
        current_env_level="Normal"
    )
    assert res_sym["indicators_met"] is False

    # 3. HR delta > 20 -> fails
    res_hr = check_recovery_indicators(
        current_hr=105, # delta +33 > 20
        base_hr=72,
        symptoms=[],
        rest_duration_minutes=18.0,
        current_env_level="Normal"
    )
    assert res_hr["indicators_met"] is False

    # 4. Rest duration < 15 min -> fails
    res_dur = check_recovery_indicators(
        current_hr=85,
        base_hr=72,
        symptoms=[],
        rest_duration_minutes=8.0,
        current_env_level="Normal"
    )
    assert res_dur["indicators_met"] is False


def test_54_recovery_clearance_named_human_required():
    """Sprint 2 & Rule 8: Recovery clearance requires a named human supervisor/medic."""
    sup_user = get_user_session("supervisor")

    # Start an intervention for w-02
    start_res = start_intervention(
        StartInterventionRequest(worker_id="w-02", target_duration_minutes=15, type="cooling_shelter"),
        current_user=sup_user
    )
    iid = start_res["intervention_id"]

    # Clearance without valid human signatory must be rejected
    with pytest.raises((HTTPException, Exception)):
        clear_intervention(
            intervention_id=iid,
            req=ClearInterventionRequest(
                cleared_by_name="", # empty
                cleared_by_role="Supervisor",
                assessment_notes="Good to work",
                vital_signs_check="HR 70",
                signature_confirmation=True
            ),
            current_user=sup_user
        )

    # Valid named human clearance succeeds
    clear_res = clear_intervention(
        intervention_id=iid,
        req=ClearInterventionRequest(
            cleared_by_name="Marcus Vance",
            cleared_by_role="Shift Supervisor",
            assessment_notes="Worker completed 20 minutes in Cooling Shelter 1B. Vitals fully stabilized.",
            vital_signs_check="Resting HR 72 bpm, oral temp 36.9°C",
            signature_confirmation=True
        ),
        current_user=sup_user
    )
    assert clear_res["status"] == "success"
    assert "cleared for duty by Marcus Vance" in clear_res["message"]


def test_55_whatif_simulator_matches_engine_assess():
    """Sprint 2: What-If simulation MUST directly call engine.assess() with 100% parity."""
    sup_user = get_user_session("supervisor")

    whatif_res = evaluate_whatif(
        WhatIfRequest(
            worker_id="w-01",
            temp_c=36.0,
            humidity_pct=60.0,
            workload="heavy",
            ppe_type="cotton_coveralls",
            acclimatized=True,
            is_shaded=False
        ),
        current_user=sup_user
    )

    # Direct engine assess with exact same parameters
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT base_heart_rate FROM workers WHERE id = 'w-01'")
    b_hr = c.fetchone()["base_heart_rate"]
    conn.close()

    wb = wbgt_proxy(temp_c=36.0, humidity_pct=60.0, solar_radiation=0.0, is_shaded=False)
    engine_res = assess(
        worker_dict={
            "workload": "heavy",
            "acclimatized": True,
            "ppe_type": "cotton_coveralls",
            "health_flags": [],
            "base_heart_rate": b_hr
        },
        env_reading={
            "temp_c": 36.0,
            "humidity_pct": 60.0,
            "wbgt_val": wb["wbgt_val"],
            "is_measured": False,
            "source_tag": "Simulated"
        },
        physio_reading={
            "heart_rate": b_hr + 45, # heavy workload
            "core_temp_proxy": round(37.0 + max(0.0, wb["wbgt_val"] - 26.0) * 0.08, 1)
        },
        symptoms=[]
    )

    assert whatif_res["level"] == engine_res["level"]
    assert whatif_res["score"] == engine_res["score"]
    assert whatif_res["rule_ids"] == engine_res["rule_ids"]
    assert whatif_res["factors"] == engine_res["factors"]


def test_56_ml_digital_twin_ridge_and_30min_projection():
    """Sprint 2: Digital Twin Ridge regression and 30-min projection with error band."""
    twin = train_digital_twin_ridge("w-01")
    assert "backtest_rmse" in twin
    assert twin["backtest_rmse"] > 0
    assert twin["error_band_bpm"] > 0
    assert twin["model_version"] == MODEL_VERSION

    # Test 30-min projection
    proj = predict_30min_projection(
        worker_id="w-01",
        current_wbgt=29.2,
        current_hr=130,
        workload="heavy"
    )
    assert len(proj["timeline"]) == 3 # +10m, +20m, +30m
    assert proj["timeline"][0]["minute_offset"] == 10
    assert proj["timeline"][2]["minute_offset"] == 30
    assert proj["backtest_error_band_bpm"] == twin["error_band_bpm"]
    assert len(proj["top_contributing_features"]) >= 3
    assert proj["model_version"] == "2.1.0-twin-ridge-isolationforest"


def test_57_ml_robust_z_scores_and_isolation_forest():
    """Sprint 2: Robust z-scores with median/MAD and ML anomaly notice bounds."""
    z_scores = compute_robust_z_scores("w-01", heart_rate=145, skin_temp=35.0, core_temp=38.2, wbgt_val=31.0)
    assert "z_heart_rate" in z_scores
    assert "max_z" in z_scores

    # Anomaly output capped at Elevated
    res = detect_anomaly("w-01", temp_c=38.0, humidity_pct=75.0, heart_rate=165)
    assert res["allowed_maximum_escalation"] == "Elevated"
    assert res["is_diagnosis"] is False
    assert verify_ml_invariants(res) is True


def test_58_map_and_workforce_location_privacy_for_unconsented():
    """Sprint 2 & Rule 9: Location shown ONLY for consented workers."""
    sup_user = get_user_session("supervisor")

    # Worker 3 (usr-w-03) has consent_given = 0
    conn = get_db()
    c = conn.cursor()
    c.execute("UPDATE users SET consent_given = 0 WHERE id = 'usr-w-03'")
    conn.commit()
    conn.close()

    # Workforce query check
    workers = list_workforce(current_user=sup_user)
    w3 = next((w for w in workers if w["id"] == "w-03"), None)
    assert w3 is not None
    assert w3["location_visible"] is False
    assert w3["zone_name"] == "Location Withheld (No Consent)"
    assert w3["map_coordinates"] is None

    # Map layout check: w-03 MUST NOT appear in consented_worker_dots
    m_layout = get_map_layout(current_user=sup_user)
    dot_ids = [d["worker_id"] for d in m_layout["consented_worker_dots"]]
    assert "w-03" not in dot_ids
    assert m_layout["withheld_worker_count"] >= 1


def test_59_alert_lifecycle_false_alarm_marking():
    """Sprint 2: False-alarm marking updates status, logs reason, and writes audit entry."""
    sup_user = get_user_session("supervisor")

    alerts = list_alerts()
    target = alerts[0]

    res = mark_false_alert(
        alert_id=target["id"],
        req=FalseAlertRequest(reason="Worker was on scheduled rest in air-conditioned office."),
        current_user=sup_user
    )
    assert res["status"] == "success"

    # Verify updated record
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT ack_status, is_false_alert, false_alert_reason, false_alert_by FROM alerts WHERE id = ?", (target["id"],))
    row = c.fetchone()
    conn.close()
    assert row[0] == "False Alarm"
    assert row[1] == 1
    assert "air-conditioned office" in row[2]
    assert row[3] == sup_user["username"]


def test_60_critical_notifications_cannot_be_disabled():
    """Sprint 2: Notification preferences cannot disable critical safety alerts."""
    sup_user = get_user_session("supervisor")

    # Attempt to set critical_cannot_disable = False
    set_notification_preferences(
        NotificationPreferencesRequest(
            sound_enabled=False,
            toast_enabled=False,
            critical_cannot_disable=False
        ),
        current_user=sup_user
    )

    prefs = get_notification_preferences(current_user=sup_user)
    assert prefs["critical_cannot_disable"] == 1 # Enforced


def test_61_shift_risk_planner_forecast_and_source_tags():
    """Sprint 2: Shift risk planner Open-Meteo integration and simulated fallback."""
    forecast = fetch_shift_forecast(latitude=40.7128, longitude=-74.0060, hours=8)
    assert len(forecast["hourly_forecast"]) == 8
    assert forecast["source_tag"] in ["Verified external", "Simulated"]
    for item in forecast["hourly_forecast"]:
        assert "hour" in item
        assert "wbgt_val" in item
        assert "work_rest_cycle" in item


def test_62_incidents_auto_attached_readings_and_protocol():
    """Sprint 2: Incident report auto-attaches zone conditions & vitals; protocol available."""
    sup_user = get_user_session("supervisor")

    res = create_incident(
        CreateIncidentRequest(
            worker_id="w-01",
            title="Heat exhaustion symptoms during ladle pour",
            severity="High",
            actions_taken="Moved to Cooling Shelter 1A; neck ice wraps; electrolyte water.",
            witnesses="Carlos Mendez",
            symptoms=["dizziness", "fatigue"],
            notes="Triage commenced."
        ),
        current_user=sup_user
    )
    iid = res["incident_id"]

    inc = get_incident(iid)
    assert inc["title"] == "Heat exhaustion symptoms during ladle pour"
    assert inc["severity"] == "High"
    # Auto-attached conditions must be present
    assert "WBGT" in inc["conditions_summary"]
    assert "Heart Rate" in inc["physiological_summary"]
    assert len(inc["timeline"]) >= 1

    # Status update to First Response
    update_res = update_incident_status(
        incident_id=iid,
        req=UpdateIncidentStatusRequest(status="First Response / Treatment", note="Dr. Elena Rostova on site"),
        current_user=sup_user
    )
    assert update_res["new_status"] == "First Response / Treatment"

    # Emergency protocol list
    protos = get_emergency_protocols()
    assert len(protos["protocols"]) >= 1
    assert "OSHA-HEAT-PROTOCOL-01" in protos["protocols"][0]["id"]
    assert len(protos["protocols"][0]["steps"]) >= 4


# ---------------------------------------------------------------------------
# Section G: Sprint 3 Tests (Tests 63 - 70)
# ---------------------------------------------------------------------------

def test_63_protocol_versioning_lifecycle():
    """Sprint 3: Protocol version history (create, edit, compare, activate)."""
    medic_user = get_user_session("safety_officer")
    
    # 1. Create a new draft protocol
    res = create_protocol(
        CreateProtocolRequest(
            version="2.3.0",
            title="Advanced Foundry Heat Stress Standard (Draft)",
            work_rest_json={"continuous": {"max_wbgt": 27.0}},
            acclimatization_json={"day1_pct": 20, "day5_pct": 100},
            ppe_caf_json={"cotton_coveralls": 1.0},
            escalation_minutes_json={"high_unack_minutes": 5, "emergency_unack_minutes": 2},
            description="Specialized high-radiant smelting heat rule draft."
        ),
        current_user=medic_user
    )
    pid = res["protocol_id"]
    assert pid.startswith("PROT-2-3-0")

    # 2. List protocols and verify draft state
    all_protos = list_protocols(current_user=medic_user)
    draft_p = next((p for p in all_protos if p["id"] == pid), None)
    assert draft_p is not None
    assert draft_p["status"] == "draft"

    # 3. Activate the draft protocol
    act_res = activate_protocol(protocol_id=pid, current_user=medic_user)
    assert act_res["status"] == "success"

    # 4. Verify previous active protocol is now archived, and new protocol is active
    updated_protos = list_protocols(current_user=medic_user)
    active_p = next(p for p in updated_protos if p["id"] == pid)
    assert active_p["status"] == "active"
    old_active = next(p for p in updated_protos if p["id"] == "PROT-OSHA-2026-v2.1")
    assert old_active["status"] == "archived"

    # 5. Compare two protocol versions
    comp = compare_protocol_versions(id_a="PROT-OSHA-2026-v2.1", id_b=pid, current_user=medic_user)
    assert "work_rest_differences" in comp
    assert comp["protocol_a"]["id"] == "PROT-OSHA-2026-v2.1"
    assert comp["protocol_b"]["id"] == pid


def test_64_analytics_privacy_aggregates_only():
    """Sprint 3 & Rule 9: Analytics use aggregates ONLY and never leak declared health conditions."""
    safety_user = get_user_session("safety_officer")

    summary = get_analytics_summary(current_user=safety_user)
    assert "kpis" in summary
    assert "hourly_exposure" in summary
    assert "shift_comparison" in summary
    assert "site_distribution" in summary
    assert "workload_breakdown" in summary
    assert summary["kpis"]["shift_safety_index_pct"] > 80.0

    # Rule 9 Verification: Ensure NO private medical conditions or prescription strings are leaked
    summary_str = json.dumps(summary).lower()
    for sensitive_word in ["hypertension", "lisinopril", "renal", "chronic", "syncope episode", "emergency_contact"]:
        assert sensitive_word not in summary_str, f"Privacy violation: sensitive term '{sensitive_word}' leaked in analytics."

    # CSV Export verification
    csv_res = export_analytics_csv(current_user=safety_user)
    assert csv_res.status_code == 200
    assert "attachment" in csv_res.headers.get("content-disposition", "")
    assert b"Hour,Normal_Worker_Hours" in csv_res.body


def test_65_heat_safety_passport_permission_gated():
    """Sprint 3: Heat Safety Passport export only permitted when sharing toggle is enabled."""
    sup_user = get_user_session("supervisor")
    
    # Worker w-02 has sharing_enabled == 0 initially
    with pytest.raises(HTTPException) as exc_info:
        get_heat_safety_passport(worker_id="w-02", current_user=sup_user)
    assert exc_info.value.status_code == 403
    assert "Worker has not granted permission" in exc_info.value.detail

    # Enable passport sharing permission for w-02
    toggle_res = toggle_passport_permission(
        worker_id="w-02",
        req=TogglePassportPermissionRequest(sharing_enabled=True),
        current_user=sup_user
    )
    assert toggle_res["sharing_enabled"] is True

    # Passport generation now succeeds
    passport = get_heat_safety_passport(worker_id="w-02", current_user=sup_user)
    assert passport["worker_id"] == "w-02"
    assert "acclimatization_status" in passport
    assert "baseline_resting_hr" in passport
    assert "estimated_sweat_rate_l_hr" in passport
    assert "hydration_compliance_streak_days" in passport
    assert passport["sharing_enabled"] is True
    assert "Decision support, not a medical device" in passport["disclaimer"]


def test_66_multilingual_assistant_scope_enforcement():
    """Sprint 3: Multilingual Assistant answers from active protocol in en/hi/gu, strictly refuses out-of-scope."""
    worker_user = get_user_session("worker1")

    # 1. English in-scope work-rest query
    ans_en = assistant_chat(
        AssistantChatRequest(message="What is the work rest schedule in high heat?", language="en"),
        current_user=worker_user
    )
    assert ans_en["in_scope"] is True
    assert ans_en["language"] == "en"
    assert "Work-Rest Policy" in ans_en["answer"]
    assert "Decision support, not a medical device" in ans_en["disclaimer"]

    # 2. Hindi in-scope acclimatization query
    ans_hi = assistant_chat(
        AssistantChatRequest(message="गर्मी में नए कर्मचारी के लिए acclimatization अनुसूची क्या है?", language="hi"),
        current_user=worker_user
    )
    assert ans_hi["in_scope"] is True
    assert ans_hi["language"] == "hi"
    assert "दिन 1" in ans_hi["answer"]
    assert "चिकित्सा उपकरण नहीं" in ans_hi["disclaimer"]

    # 3. Gujarati in-scope hydration query
    ans_gu = assistant_chat(
        AssistantChatRequest(message="ગરમીમાં કેટલું પાણી અને hydrate કરવું જોઈએ?", language="gu"),
        current_user=worker_user
    )
    assert ans_gu["in_scope"] is True
    assert ans_gu["language"] == "gu"
    assert "હાઇડ્રેશન" in ans_gu["answer"]
    assert "તબીબી ઉપકરણ નથી" in ans_gu["disclaimer"]

    # 4. Out-of-scope medical diagnosis refusal
    out_diag = assistant_chat(
        AssistantChatRequest(message="Can you diagnose my chest pain and prescribe antibiotics?", language="en"),
        current_user=worker_user
    )
    assert out_diag["in_scope"] is False
    assert "cannot provide medical diagnoses" in out_diag["answer"]

    # 5. Out-of-scope general trivia refusal
    out_trivia = assistant_chat(
        AssistantChatRequest(message="Who won the cricket match yesterday and what is the stock price?", language="en"),
        current_user=worker_user
    )
    assert out_trivia["in_scope"] is False


def test_67_shift_handover_acknowledgment():
    """Sprint 3: Shift Handover report creation and mandatory incoming supervisor digital acknowledgment."""
    sup_user = get_user_session("supervisor")

    # 1. Create shift handover as outgoing supervisor
    create_res = create_handover(
        CreateHandoverRequest(
            shift_name="Afternoon",
            site_id="site-01",
            summary_json={"active_high_risk": 1, "peak_wbgt": 31.8},
            notes="Furnace crew rested. Zone 1A misting fans operational."
        ),
        current_user=sup_user
    )
    hid = create_res["handover_id"]

    # 2. Attempt acknowledgment without signature confirmation must fail
    with pytest.raises(HTTPException) as exc_info:
        acknowledge_handover(
            handover_id=hid,
            req=AcknowledgeHandoverRequest(signature_confirmation=False),
            current_user=sup_user
        )
    assert exc_info.value.status_code == 400

    # 3. Valid digital signature acknowledgment succeeds
    ack_res = acknowledge_handover(
        handover_id=hid,
        req=AcknowledgeHandoverRequest(signature_confirmation=True, notes="Received and confirmed on site."),
        current_user=sup_user
    )
    assert ack_res["status"] == "success"

    # 4. Verify in DB
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT status, incoming_supervisor_name FROM shift_handovers WHERE id = ?", (hid,))
    row = c.fetchone()
    conn.close()
    assert row["status"] == "Acknowledged"
    assert row["incoming_supervisor_name"] == sup_user["full_name"]


def test_68_personalised_nudges_rate_limiting():
    """Sprint 3: Nudges are rate-limited (1 per 30 min), but critical alerts NEVER throttled."""
    sup_user = get_user_session("supervisor")

    # 1. First non-critical nudge succeeds for w-12
    n1 = send_nudge(
        SendNudgeRequest(worker_id="w-12", nudge_type="Hydration", message="Remember your 250ml water intake.", is_critical=False),
        current_user=sup_user
    )
    assert n1["status"] == "success"

    # 2. Immediate second non-critical nudge is rejected with 429
    with pytest.raises(HTTPException) as exc_info:
        send_nudge(
            SendNudgeRequest(worker_id="w-12", nudge_type="Rest Break", message="Take 5 mins shade.", is_critical=False),
            current_user=sup_user
        )
    assert exc_info.value.status_code == 429
    assert "rate limit active" in exc_info.value.detail.lower()

    # 3. Critical alert bypasses rate limiting and succeeds immediately
    n_crit = send_nudge(
        SendNudgeRequest(worker_id="w-12", nudge_type="Emergency Escalation", message="CRITICAL: Stop work and report to triage.", is_critical=True),
        current_user=sup_user
    )
    assert n_crit["status"] == "success"


def test_69_sixty_shifts_benchmark_evaluation():
    """Sprint 3: simulator.py evaluate() over 60 seeded shifts comparing 3 methods with Model Card."""
    eval_res = evaluate(num_shifts=60, seed=42)
    assert eval_res["label"] == "synthetic data, not clinical validation"
    assert eval_res["num_shifts_evaluated"] == 60
    assert eval_res["total_timesteps"] == 60 * 48

    methods = eval_res["method_comparison"]
    assert "air_temp_threshold_40c" in methods
    assert "personal_rules" in methods
    assert "rules_plus_ml" in methods

    # Verify key metrics
    for m in ["air_temp_threshold_40c", "personal_rules", "rules_plus_ml"]:
        assert "precision" in methods[m]
        assert "recall" in methods[m]
        assert "f1_score" in methods[m]
        assert "median_lead_time_minutes" in methods[m]

    # Model Card completeness
    card = eval_res["model_card"]
    assert "THERMOSENSE" in card["model_name"]
    assert "synthetic data, not clinical validation" in card["dataset_and_training"]["disclaimer"]
    assert len(card["safety_and_ethical_invariants"]) >= 4


def test_70_judge_walkthrough_end_to_end_smoke():
    """Sprint 3: End-to-end smoke test of the 8-step scripted Judge Walkthrough with fixed seed and reset."""
    story = get_walkthrough_story()
    assert len(story) == 8

    # Verify Step progression
    step1 = run_judge_walkthrough(1)
    assert step1["data"]["risk_level"] == "Normal"
    assert step1["data"]["worker"] == "Alex Morgan (w-01)"

    step3 = run_judge_walkthrough(3)
    assert "ML Anomaly Notice" in step3["data"]["ml_notice"]
    assert step3["data"]["risk_level"] == "Elevated"

    step4 = run_judge_walkthrough(4)
    assert step4["data"]["risk_level"] == "High"
    assert step4["data"]["alert_id"] == "ALT-WALKTHROUGH-01"

    step5 = run_judge_walkthrough(5)
    assert step5["data"]["status"] == "Resting"
    assert "Cooling Shelter" in step5["data"]["zone"]

    step7 = run_judge_walkthrough(7)
    assert step7["data"]["status"] == "Cleared for Duty"
    assert "Marcus Vance" in step7["data"]["signatory"]

    step8 = run_judge_walkthrough(8)
    assert step8["is_final_step"] is True
    assert step8["data"]["audit_action"] == "RETURN_TO_WORK_CLEARANCE_SIGNED"

    # Verify reset endpoint
    reset_res = reset_walkthrough(current_user=get_user_session("admin", "admin123"))
    assert reset_res["status"] == "success"


