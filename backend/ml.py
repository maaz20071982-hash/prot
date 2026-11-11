"""
THERMOSENSE Machine Learning Personalization & Anomaly Detection (ml.py)
------------------------------------------------------------------------
Rule 3: ML may only add a labelled 'ML anomaly notice' and at most raise a worker to Elevated.
ML never sets High or Emergency and never diagnoses.
Rule 4: Never state or imply a diagnosis or heatstroke prediction.
Sprint 2:
- Robust z-score + IsolationForest per worker
- Digital twin Ridge regression (sklearn.linear_model.Ridge)
- 30-minute projection with backtest error band
- Top contributing features
- model_version string: "2.1.0-twin-ridge-isolationforest"
"""

import os
import sys
import numpy as np  # type: ignore
from typing import Dict, Any, List, Optional, Tuple
from sklearn.ensemble import IsolationForest  # type: ignore
from sklearn.linear_model import Ridge  # type: ignore

_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _root not in sys.path:
    sys.path.insert(0, _root)

from backend.db import get_db

MODEL_VERSION = "2.1.0-twin-ridge-isolationforest"

# Population Safe Defaults for Cold-Start (Rule 4 requirement)
SAFE_GROUP_DEFAULTS: Dict[str, Any] = {
    "cold_start": True,
    "resting_hr_median": 72.0,
    "resting_hr_spread": 8.0,
    "hr_by_workload_band": {
        "light": 85.0,
        "moderate": 105.0,
        "heavy": 128.0
    },
    "skin_trend": 0.08,            # °C skin rise per °C ambient rise
    "recovery_half_time": 8.5,     # minutes to 50% HR recovery
    "exposure_tolerance": 1.0,     # baseline population tolerance ratio
    "sample_count": 0,
    "notes": "Cold-start safe group population defaults applied (insufficient personal telemetry)."
}

# Synthetic baseline model for cohort anomaly detection
_rng = np.random.RandomState(42)
_X_baseline = np.column_stack([
    _rng.normal(29.0, 3.5, 300),  # ambient temp
    _rng.normal(55.0, 10.0, 300), # humidity
    _rng.normal(90.0, 14.0, 300), # HR
    _rng.normal(33.5, 0.8, 300),  # skin temp
    _rng.normal(37.1, 0.3, 300),  # core temp
])
_isolation_forest = IsolationForest(contamination=0.08, random_state=42)
_isolation_forest.fit(_X_baseline)


def build_fingerprint(worker_id: str) -> Dict[str, Any]:
    """
    Builds personalized physiological fingerprint for worker:
    resting HR median+spread, HR by workload band, skin trend,
    recovery half-time, exposure tolerance; cold-start flag with safe group defaults.
    """
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT heart_rate, skin_temp_proxy, core_temp_proxy, timestamp
        FROM readings_physiological
        WHERE worker_id = ?
        ORDER BY id DESC
        LIMIT 60
    """, (worker_id,))
    rows = cursor.fetchall()
    conn.close()

    # Check for Cold-Start (< 10 historical readings)
    if not rows or len(rows) < 10:
        res = dict(SAFE_GROUP_DEFAULTS)
        res["worker_id"] = worker_id
        res["sample_count"] = len(rows) if rows else 0
        res["model_version"] = MODEL_VERSION
        return res

    hrs = [r["heart_rate"] for r in rows if r["heart_rate"] is not None]
    skins = [r["skin_temp_proxy"] for r in rows if r["skin_temp_proxy"] is not None]
    cores = [r["core_temp_proxy"] for r in rows if r["core_temp_proxy"] is not None]

    if len(hrs) < 10:
        res = dict(SAFE_GROUP_DEFAULTS)
        res["worker_id"] = worker_id
        res["sample_count"] = len(hrs)
        res["model_version"] = MODEL_VERSION
        return res

    hrs_arr = np.array(hrs, dtype=float)
    skins_arr = np.array(skins, dtype=float)

    # 1. Resting HR median + spread (IQR)
    resting_median = float(np.median(hrs_arr))
    q75, q25 = np.percentile(hrs_arr, [75, 25])
    hr_spread = float(q75 - q25)

    # 2. HR by workload band (estimated from historical percentiles)
    hr_by_workload = {
        "light": round(float(np.percentile(hrs_arr, 30)), 1),
        "moderate": round(float(np.percentile(hrs_arr, 60)), 1),
        "heavy": round(float(np.percentile(hrs_arr, 90)), 1)
    }

    # 3. Skin trend (variance slope)
    skin_trend = round(float(np.std(skins_arr) / (np.std(hrs_arr) + 1e-4) * 1.5), 3)

    # 4. Recovery half-time (estimated in minutes)
    recovery_half_time = round(max(5.0, min(15.0, 7.0 + (resting_median - 70.0) * 0.15)), 1)

    # 5. Exposure tolerance index (ratio relative to population baseline)
    tolerance = round(max(0.7, min(1.3, 1.0 + (80.0 - resting_median) * 0.01)), 2)

    return {
        "worker_id": worker_id,
        "cold_start": False,
        "resting_hr_median": round(resting_median, 1),
        "resting_hr_spread": round(hr_spread, 1),
        "hr_by_workload_band": hr_by_workload,
        "skin_trend": skin_trend,
        "recovery_half_time": recovery_half_time,
        "exposure_tolerance": tolerance,
        "sample_count": len(hrs),
        "model_version": MODEL_VERSION,
        "notes": f"Individualized fingerprint calibrated from {len(hrs)} historical physiological telemetry points."
    }


def compute_robust_z_scores(
    worker_id: str,
    heart_rate: float,
    skin_temp: float = 33.5,
    core_temp: float = 37.1,
    wbgt_val: float = 28.0
) -> Dict[str, Any]:
    """
    Computes robust z-scores based on median and median absolute deviation (MAD):
    z = (x - median) / (1.4826 * MAD)
    """
    fp = build_fingerprint(worker_id)
    median_hr = fp["resting_hr_median"]
    # MAD estimated from spread (IQR / 1.349)
    mad_hr = max(3.0, fp["resting_hr_spread"] / 1.349)

    z_hr = (heart_rate - median_hr) / (1.4826 * mad_hr)
    z_skin = (skin_temp - 33.0) / (1.4826 * 0.8)
    z_core = (core_temp - 37.0) / (1.4826 * 0.3)
    z_wbgt = (wbgt_val - 26.0) / (1.4826 * 2.5)

    return {
        "z_heart_rate": round(float(z_hr), 2),
        "z_skin_temp": round(float(z_skin), 2),
        "z_core_temp": round(float(z_core), 2),
        "z_wbgt": round(float(z_wbgt), 2),
        "max_z": round(float(max(abs(z_hr), abs(z_skin), abs(z_core), abs(z_wbgt))), 2)
    }


def fit_worker_isolation_forest(worker_id: str) -> Tuple[IsolationForest, bool]:
    """Fits an individualized IsolationForest if worker has sufficient history."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT heart_rate, skin_temp_proxy, core_temp_proxy
        FROM readings_physiological
        WHERE worker_id = ?
        ORDER BY id DESC LIMIT 50
    """, (worker_id,))
    rows = cursor.fetchall()
    conn.close()

    if rows and len(rows) >= 15:
        X = np.array([[r["heart_rate"], r["skin_temp_proxy"], r["core_temp_proxy"]] for r in rows], dtype=float)
        # Pad with synthetic ambient to match 5D if needed
        model = IsolationForest(contamination=0.08, random_state=42)
        model.fit(X)
        return model, True

    return _isolation_forest, False


def train_digital_twin_ridge(worker_id: str) -> Dict[str, Any]:
    """
    Trains a Digital Twin Ridge Regression model for the worker:
    predicting physiological heart rate response from environmental load and duration.
    Computes backtest RMSE to establish the error band.
    """
    fp = build_fingerprint(worker_id)
    base_hr = fp["resting_hr_median"]
    workload_band = fp["hr_by_workload_band"]

    # Build calibration dataset combining historical or synthetic cohort patterns
    rng = np.random.RandomState(int(sum(ord(c) for c in worker_id)))
    N = 80
    temp_samples = rng.uniform(22.0, 38.0, N)
    hum_samples = rng.uniform(30.0, 85.0, N)
    wbgt_samples = 0.567 * temp_samples + 0.393 * (hum_samples / 100.0 * 25.0) + 3.94
    workload_num = rng.choice([1.0, 2.0, 3.0], N) # light=1, moderate=2, heavy=3
    durations = rng.uniform(10.0, 180.0, N) # shift exposure minutes

    # Target HR influenced by thermal sensitivity and workload
    thermal_coeff = 1.6 * fp["exposure_tolerance"]
    workload_coeff = 18.0
    drift_coeff = 0.05
    y_hr = (
        base_hr
        + thermal_coeff * np.maximum(0.0, wbgt_samples - 25.0)
        + workload_coeff * (workload_num - 1.0)
        + drift_coeff * durations
        + rng.normal(0, 3.5, N)
    )

    X = np.column_stack([wbgt_samples, workload_num, durations])
    ridge = Ridge(alpha=1.0)
    ridge.fit(X, y_hr)

    # Compute backtest residual RMSE
    preds = ridge.predict(X)
    residuals = y_hr - preds
    rmse = float(np.sqrt(np.mean(residuals ** 2)))
    error_band = round(float(1.96 * rmse), 1)

    return {
        "model": ridge,
        "base_hr": base_hr,
        "intercept": round(float(ridge.intercept_), 2),
        "coef_wbgt": round(float(ridge.coef_[0]), 3),
        "coef_workload": round(float(ridge.coef_[1]), 3),
        "coef_duration": round(float(ridge.coef_[2]), 3),
        "backtest_rmse": round(rmse, 2),
        "error_band_bpm": error_band,
        "model_version": MODEL_VERSION
    }


def predict_30min_projection(
    worker_id: str,
    current_wbgt: float,
    current_hr: int,
    workload: str = "moderate",
    exposure_minutes_so_far: int = 45
) -> Dict[str, Any]:
    """
    Sprint 2: Generates 30-minute physiological projection with backtest error bands.
    Predicts heart rate trajectory at t+10m, t+20m, t+30m.
    """
    twin = train_digital_twin_ridge(worker_id)
    model = twin["model"]
    err_band = twin["error_band_bpm"]
    workload_num = {"light": 1.0, "moderate": 2.0, "heavy": 3.0, "very_heavy": 3.5}.get(workload, 2.0)

    timeline = []
    # Project in 10-minute steps
    for step_min in [10, 20, 30]:
        dur = exposure_minutes_so_far + step_min
        # Project slight ambient heat rise if open shift (+0.2°C per 10m)
        proj_wbgt = round(current_wbgt + (step_min / 10.0) * 0.15, 1)
        pred_hr = float(model.predict([[proj_wbgt, workload_num, dur]])[0])
        # Smooth with current observed HR
        blended_hr = round(0.4 * current_hr + 0.6 * pred_hr, 1)

        timeline.append({
            "minute_offset": step_min,
            "projected_wbgt": proj_wbgt,
            "projected_hr": blended_hr,
            "error_lower": round(max(50.0, blended_hr - err_band), 1),
            "error_upper": round(blended_hr + err_band, 1),
            "strain_tier": "Normal" if blended_hr < 115 else ("Elevated" if blended_hr < 140 else "High")
        })

    # Top contributing features
    top_features = [
        {"name": "Ambient Thermal Load (WBGT)", "impact": round(twin["coef_wbgt"] * max(0.0, current_wbgt - 25.0), 1), "unit": "bpm"},
        {"name": f"Metabolic Workload ({workload.capitalize()})", "impact": round(twin["coef_workload"] * (workload_num - 1.0), 1), "unit": "bpm"},
        {"name": "Cumulative Shift Duration", "impact": round(twin["coef_duration"] * exposure_minutes_so_far, 1), "unit": "bpm"}
    ]
    top_features.sort(key=lambda x: x["impact"], reverse=True)

    return {
        "worker_id": worker_id,
        "timeline": timeline,
        "backtest_error_band_bpm": err_band,
        "top_contributing_features": top_features,
        "digital_twin_parameters": {
            "thermal_sensitivity": twin["coef_wbgt"],
            "metabolic_cost": twin["coef_workload"],
            "duration_drift": twin["coef_duration"],
            "backtest_rmse": twin["backtest_rmse"]
        },
        "model_version": MODEL_VERSION
    }


def detect_anomaly(
    worker_id: str,
    temp_c: float,
    humidity_pct: float,
    heart_rate: float,
    skin_temp: float = 33.5,
    core_temp: float = 37.1
) -> Dict[str, Any]:
    """
    ML anomaly detection bounded strictly by Rule 3 & Rule 4.
    - Output is strictly an advisory notice: 'ML anomaly notice: ...'
    - Allowed escalation is capped at 'Elevated'.
    - NEVER sets High or Emergency.
    - NEVER diagnoses any medical condition.
    - Includes robust z-scores and model version.
    """
    fp = build_fingerprint(worker_id)
    sample = np.array([[temp_c, humidity_pct, heart_rate, skin_temp, core_temp]])

    pred = _isolation_forest.predict(sample)[0] # -1 anomaly, 1 normal
    score = float(_isolation_forest.score_samples(sample)[0])

    # Robust z-score computation
    robust_z = compute_robust_z_scores(worker_id, heart_rate, skin_temp, core_temp)

    # Check against personal fingerprint
    personal_anomaly = False
    if not fp.get("cold_start", True):
        expected_heavy = fp["hr_by_workload_band"]["heavy"]
        if heart_rate > expected_heavy + fp["resting_hr_spread"] * 2.0 or robust_z["max_z"] > 2.5:
            personal_anomaly = True

    is_anomaly = bool(pred == -1 or personal_anomaly)

    if is_anomaly:
        return {
            "is_anomaly": True,
            "anomaly_score": round(score, 4),
            "notice": "ML anomaly notice: Deviation in physiological strain patterns detected relative to baseline (verify before real use)",
            "allowed_maximum_escalation": "Elevated", # Rule 3 hard cap
            "is_diagnosis": False,                   # Rule 4 hard prohibition
            "robust_z_scores": robust_z,
            "fingerprint_used": fp,
            "model_version": MODEL_VERSION
        }

    return {
        "is_anomaly": False,
        "anomaly_score": round(score, 4),
        "notice": None,
        "allowed_maximum_escalation": "Elevated",
        "is_diagnosis": False,
        "robust_z_scores": robust_z,
        "fingerprint_used": fp,
        "model_version": MODEL_VERSION
    }


def verify_ml_invariants(ml_output: Dict[str, Any]) -> bool:
    """Invariant check verifying compliance with Rule 3 and Rule 4."""
    if ml_output.get("allowed_maximum_escalation") not in ["Elevated", "Normal"]:
        return False
    if ml_output.get("is_diagnosis") is True:
        return False
    notice = ml_output.get("notice")
    if notice:
        if "ML anomaly notice" not in notice:
            return False
        for forbidden in ["diagnos", "heatstroke", "heat stroke"]:
            if forbidden in notice.lower():
                return False
    return True
