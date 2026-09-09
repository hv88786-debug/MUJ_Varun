"""
predict.py — AquaGuard AI disease-risk prediction engine.

Firebase (sensors) -> rule-based pre-score -> Groq LLM -> Firebase
(ai_prediction / history) -> auto-alert on high/critical severity.

All secrets/config (GROQ_API_KEY, FIREBASE_BASE, ...) come from the
backend's .env — nothing is hardcoded here. If GROQ_API_KEY or
FIREBASE_BASE is missing, the engine simply stays disabled and
app.py logs that fact; it never crashes the rest of the backend.
"""

import json
import os
import threading
import time
from datetime import datetime

import requests

# ── Config, entirely from environment ──────────────────────────────────
GROQ_API_KEY  = os.environ.get("GROQ_API_KEY", "")
FIREBASE_BASE = os.environ.get("FIREBASE_BASE", "")
PREDICT_EVERY = int(os.environ.get("PREDICT_EVERY", "5"))
GROQ_MODEL    = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")
SENSOR_SMOOTH_ALPHA = float(os.environ.get("SENSOR_SMOOTH_ALPHA", "0.35"))

# The live device writes readings under /water. Keep the prediction engine
# on the same Firebase node used by the frontend dashboard.
SENSOR_PATH = os.getenv("FIREBASE_SENSOR_PATH", "sensor").strip("/")
SENSOR_URL  = f"{FIREBASE_BASE}/{SENSOR_PATH}.json" if FIREBASE_BASE else None
SENSOR_VALUES_ARE_PERCENT = os.getenv("SENSOR_VALUES_ARE_PERCENT", "true").lower() != "false"
PREDICT_URL = f"{FIREBASE_BASE}/ai_prediction.json" if FIREBASE_BASE else None
HISTORY_URL = f"{FIREBASE_BASE}/history.json" if FIREBASE_BASE else None
ALERTS_URL  = f"{FIREBASE_BASE}/alerts.json" if FIREBASE_BASE else None


def is_predict_configured() -> bool:
    return bool(GROQ_API_KEY) and bool(FIREBASE_BASE)


def _get_groq_client():
    from groq import Groq  # imported lazily so app.py can boot without the package
    return Groq(api_key=GROQ_API_KEY)


# ── STEP 1: fetch latest sensor reading from Firebase ──────────────────
def fetch_sensors():
    try:
        r = requests.get(SENSOR_URL, timeout=3)
        d = r.json()
        if not d:
            return None
        turbidity = float(d.get("turbidity", 0))
        salinity = float(d.get("salinity", 0))
        if SENSOR_VALUES_ARE_PERCENT:
            turbidity = max(0.0, min(100.0, 100.0 - turbidity))
            salinity = max(0.0, min(100.0, 100.0 - salinity))
        raw_values = {
            "tds": float(d.get("tds", 0)),
            "turbidity": turbidity,
            "temperature": float(d.get("temperature", d.get("temp", 25))),
            "salinity": salinity,
            "ph": float(d.get("ph", 7.0)),
        }
        sensors = {
            **raw_values,
            # Safety is derived from measurements, never from a stale flag.
            "sensor_drinkable": (
                raw_values["tds"] <= 500
                and raw_values["turbidity"] <= 4
                and raw_values["salinity"] <= 500
                and 6.5 <= raw_values["ph"] <= 8.5
                and 5 <= raw_values["temperature"] <= 35
            ),
        }
        # Optional — only present if the ESP32 has a chlorine/coliform sensor
        # or strip reader wired up. None = "not measured", never faked/assumed.
        if "chlorine" in d and d["chlorine"] not in (None, ""):
            sensors["chlorine"] = float(d["chlorine"])
        if "coliform" in d and d["coliform"] not in (None, ""):
            # accept either a boolean/int flag or a CFU count from the strip
            sensors["coliform"] = d["coliform"]
        return smooth_sensors(sensors)
    except Exception as e:
        print(f"  [predict] sensor fetch error: {e}")
        return None


# ── STEP 2: rule-based pre-score (fast, no API call) ────────────────────
# Thresholds below are IS 10500:2012 (BIS) drinking-water limits, not
# guessed numbers:
#   TDS        acceptable 500 mg/L, permissible 2000 mg/L
#   Turbidity  acceptable 1 NTU,   permissible 5 NTU
#   pH         acceptable/permissible both 6.5-8.5 — "no relaxation"
#   Chlorine   desirable minimum 0.2 mg/L residual free chlorine
#   Coliform/E.coli — must be absent in any 100 ml sample (hard fail)
# Temperature has no BIS drinking-water limit; 35°C is a practical
# operational heuristic (bacterial growth accelerates above it), kept
# separate from the BIS-sourced parameters below.

def _band_score(value, acceptable, permissible, max_score):
    """BIS gives every parameter two limits, not one. Score accordingly:
    within acceptable -> 0. Between acceptable and permissible -> ramps
    up to half of max_score (water is technically tolerable but not
    ideal). Beyond permissible -> ramps from half to max_score (BIS says
    this is unsafe without an alternate source). Fully continuous, no
    step jumps at either boundary."""
    if value <= acceptable:
        return 0.0
    span = max(permissible - acceptable, 1e-6)
    if value <= permissible:
        return (value - acceptable) / span * (max_score * 0.5)
    over = value - permissible
    return min(max_score * 0.5 + (over / span) * (max_score * 0.5), max_score)


def pre_analyze(s):
    flags = []
    score = 0.0
    hard_critical = False  # set True only by a direct pathogen-presence signal

    tds_score = _band_score(s["tds"], 500, 2000, 25)
    if tds_score > 0:
        tier = "beyond BIS permissible" if s["tds"] > 2000 else "above BIS acceptable"
        flags.append(f"TDS {s['tds']:.0f} mg/L — {tier} (500/2000 mg/L)")
        score += tds_score

    turb_score = _band_score(s["turbidity"], 1, 5, 30)
    if turb_score > 0:
        tier = "beyond BIS permissible" if s["turbidity"] > 5 else "above BIS acceptable"
        flags.append(f"Turbidity {s['turbidity']:.1f} NTU — {tier} (1/5 NTU)")
        score += turb_score

    if s["temperature"] > 35:
        flags.append(f"HIGH TEMP: {s['temperature']:.1f}\u00b0C (favours bacterial growth above 35\u00b0C)")
        score += min((s["temperature"] - 35) / 10 * 15, 15)

    if s["ph"] < 6.5 or s["ph"] > 8.5:
        ph_dev = (6.5 - s["ph"]) if s["ph"] < 6.5 else (s["ph"] - 8.5)
        flags.append(f"pH {s['ph']:.1f} outside BIS range 6.5-8.5 (no relaxation)")
        # BIS allows no permissible band for pH, so this ramps steeper
        # than TDS/turbidity for the same relative deviation
        score += min(ph_dev / 1.0 * 20, 20)

    chlorine = s.get("chlorine")
    if chlorine is not None and chlorine < 0.2:
        deficit = 0.2 - chlorine
        flags.append(f"Residual chlorine {chlorine:.2f} mg/L below BIS desirable 0.2 mg/L — disinfection insufficient")
        score += min(deficit / 0.2 * 10, 10)

    coliform = s.get("coliform")
    if coliform is not None:
        present = (coliform is True) or (isinstance(coliform, (int, float)) and coliform > 0)
        if present:
            flags.append("COLIFORM/E.coli DETECTED — must be absent per BIS; direct pathogen signal")
            hard_critical = True
            score = 100.0

    if s["tds"] > 500 and s["ph"] < 6.8:
        tds_over = s["tds"] - 500
        ph_under = 6.8 - s["ph"]
        flags.append("COMBINED: High TDS + acidic = Typhoid risk")
        score += min((tds_over / 250) * (ph_under / 0.3) * 15, 15)

    if s["turbidity"] > 5 and s["tds"] > 400:
        turb_over = s["turbidity"] - 5
        tds_over2 = s["tds"] - 400
        flags.append("COMBINED: Turbid + high TDS = Bacterial load")
        score += min((turb_over / 4) * (tds_over2 / 200) * 10, 10)

    return flags, min(score, 100), hard_critical




# ── STEP 3: ask Groq for the actual disease-risk prediction ────────────
def get_groq_prediction(sensors, flags, score, hard_critical=False):
    client = _get_groq_client()

    flags_text = "\n".join(f"  - {f}" for f in flags) if flags else "  - No violations"
    extra = ""
    if "chlorine" in sensors:
        extra += f" Chlorine={sensors['chlorine']:.2f}mg/L"
    if "coliform" in sensors:
        extra += f" Coliform_present={bool(sensors['coliform'])}"

    prompt = f"""AquaGuard AI. Sensors: TDS={sensors['tds']:.0f}mg/L Turbidity={sensors['turbidity']:.1f}NTU Temp={sensors['temperature']:.0f}C Salinity={sensors['salinity']:.2f}ppm pH={sensors['ph']:.1f}{extra}
Score:{score:.0f}/100 Flags:{len(flags)}{" HARD_CRITICAL:coliform detected, must be severity=critical, drinkable=false" if hard_critical else ""}
{flags_text}
JSON only, no text:
{{"cholera_risk":<0-100>,"typhoid_risk":<0-100>,"diarrhea_risk":<0-100>,"dysentery_risk":<0-100>,"overall_contamination":<0-100>,"drinkable":<true/false>,"severity":"<safe|low|medium|high|critical>","primary_concern":"<10 words max>","action":"<10 words max>"}}"""

    response = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=180,
        temperature=0.1,
    )

    text = response.choices[0].message.content.strip()
    if not text:
        raise RuntimeError("Groq returned an empty prediction response")
    if text.startswith("```"):
        text = text.removeprefix("```").removeprefix("json").removesuffix("```").strip()
    start = text.find("{")
    end = text.rfind("}") + 1
    if start < 0 or end <= start:
        raise RuntimeError(f"Groq returned non-JSON prediction: {text[:200]}")
    result = json.loads(text[start:end])

    # Drinkable override — if the model says safe to drink, zero the risks.
    # Never lets a direct pathogen signal be waved away by the LLM, though.
    if result.get("drinkable") is True and not hard_critical:
        result["cholera_risk"] = 0
        result["typhoid_risk"] = 0
        result["diarrhea_risk"] = 0
        result["dysentery_risk"] = 0
        result["overall_contamination"] = 0
        result["severity"] = "safe"
    if hard_critical:
        result["cholera_risk"] = result["typhoid_risk"] = 100
        result["diarrhea_risk"] = result["dysentery_risk"] = 100
        result["overall_contamination"] = 100
        result["drinkable"] = False
        result["severity"] = "critical"

    return result


def fallback_prediction(sensors, score, flags=None, hard_critical=False):
    """Sensor-based estimate when Groq is unavailable. Uses the same BIS
    band scoring as pre_analyze (via _band_score) so this path and the
    Groq path never disagree just because they used different formulas."""
    if hard_critical:
        return {
            "cholera_risk": 100, "typhoid_risk": 100,
            "diarrhea_risk": 100, "dysentery_risk": 100,
            "overall_contamination": 100, "drinkable": False,
            "severity": "critical",
            "primary_concern": "Coliform/E.coli detected in water",
            "action": "Do not drink; boil or treat immediately, notify authorities",
        }

    turb_score = _band_score(sensors["turbidity"], 1, 5, 100)
    tds_score = _band_score(sensors["tds"], 500, 2000, 100)
    ph_outside = sensors["ph"] < 6.5 or sensors["ph"] > 8.5
    chlorine_low = sensors.get("chlorine") is not None and sensors["chlorine"] < 0.2

    # cholera/diarrhea track turbidity + microbial-load proxies most closely;
    # typhoid tracks TDS + acidity; dysentery is a blend of both
    cholera = min(100, max(score, turb_score * 0.9 + (15 if chlorine_low else 0)))
    diarrhea = min(100, max(score, turb_score * 0.8 + (10 if chlorine_low else 0)))
    typhoid = min(100, max(score, tds_score * 0.8 + (15 if ph_outside else 0)))
    dysentery = min(100, max(score, (turb_score + tds_score) / 2))

    turbidity = sensors["turbidity"]
    return {
        "cholera_risk": round(cholera),
        "typhoid_risk": round(typhoid),
        "diarrhea_risk": round(diarrhea),
        "dysentery_risk": round(dysentery),
        "overall_contamination": round(max(cholera, typhoid, diarrhea, dysentery)),
        "drinkable": score < 15,
        "severity": "critical" if score >= 70 else "high" if score >= 40 else "medium" if score >= 15 else "safe",
        "primary_concern": (flags[0] if flags else
                             "High turbidity detected" if turbidity > 1 else
                             "Water parameters need monitoring"),
        "action": "Do not drink; inspect and treat water",
    }


# ── STEP 3.5: smooth predictions across cycles ──────────────────────────
# Without this, a single noisy sensor reading (or a slightly different Groq
# response) can make the risk numbers jump a lot even if the underlying
# water quality barely changed. We blend each new prediction with the last
# one so the numbers move gradually, in the direction the data is actually
# trending — SMOOTH_ALPHA controls how fast: higher = reacts faster to new
# data, lower = smoother/slower.
SMOOTH_ALPHA = float(os.environ.get("PREDICT_SMOOTH_ALPHA", "0.4"))
_RISK_FIELDS = (
    "cholera_risk", "typhoid_risk", "diarrhea_risk",
    "dysentery_risk", "overall_contamination",
)
_last_pred = None  # holds the previous cycle's (smoothed) prediction
_last_sensors = None


def smooth_sensors(sensors, alpha=SENSOR_SMOOTH_ALPHA):
    """Blend successive sensor readings to reduce one-cycle spikes."""
    global _last_sensors
    if _last_sensors is None:
        _last_sensors = dict(sensors)
        return dict(sensors)
    smoothed = dict(sensors)
    for field in ("tds", "turbidity", "temperature", "salinity", "ph"):
        old_value = _last_sensors.get(field, sensors[field])
        smoothed[field] = alpha * sensors[field] + (1 - alpha) * old_value
    _last_sensors = smoothed
    return dict(smoothed)


def smooth_prediction(pred, alpha=SMOOTH_ALPHA, bypass=False):
    global _last_pred
    smoothed = dict(pred)
    if bypass:
        # a direct pathogen signal (coliform detected) is a fact, not
        # noise — don't average it down with a previously "safe" cycle,
        # and reset the anchor so subsequent cycles smooth from here
        _last_pred = smoothed
        return smoothed
    if _last_pred is not None:
        for field in _RISK_FIELDS:
            new_val = pred.get(field, 0)
            old_val = _last_pred.get(field, new_val)
            smoothed[field] = round(alpha * new_val + (1 - alpha) * old_val, 1)
        # if the smoothed contamination is safe/near-zero, don't let a stale
        # "drinkable: False" from a spiky previous reading linger
        if smoothed["overall_contamination"] < 10 and pred.get("drinkable"):
            smoothed["drinkable"] = True
        # re-derive severity from the smoothed number, not the raw LLM call,
        # so severity/risk_level never disagree with the smoothed risk %
        oc = smoothed["overall_contamination"]
        smoothed["severity"] = (
            "critical" if oc >= 70 else
            "high" if oc >= 40 else
            "medium" if oc >= 15 else
            "safe"
        )
    _last_pred = smoothed
    return smoothed


# ── STEP 4: push prediction back to Firebase ────────────────────────────
_RISK_LEVEL_MAP = {
    "safe": "SAFE", "low": "SAFE",
    "medium": "WARNING",
    "high": "CRITICAL", "critical": "CRITICAL",
}


def upload(sensors, pred, village=None):
    village = village or os.getenv("DEFAULT_VILLAGE_NAME", "Nasirabad")
    severity = pred.get("severity", "safe")
    payload = {
        "cholera":    pred.get("cholera_risk", 0),
        "typhoid":    pred.get("typhoid_risk", 0),
        "diarrhea":   pred.get("diarrhea_risk", 0),
        "dysentery":  pred.get("dysentery_risk", 0),
        "overall":    pred.get("overall_contamination", 0),
        "drinkable":  pred.get("drinkable", True),
        "severity":   severity,
        "risk_level": _RISK_LEVEL_MAP.get(severity, "SAFE"),
        "concern":    pred.get("primary_concern", ""),
        "action":     pred.get("action", ""),
        "village":    village,
        "timestamp":  datetime.now().isoformat(),
        "sensors":    sensors,
    }
    requests.put(PREDICT_URL, json=payload, timeout=3)
    requests.post(HISTORY_URL, json=payload, timeout=3)
    return payload


def run_prediction_once(village=None):
    """One full predict cycle. Raises on missing config/Firebase/Groq errors
    so the Flask route can turn that into a clean error response."""
    if not is_predict_configured():
        raise RuntimeError(
            "Prediction engine not configured — set GROQ_API_KEY and "
            "FIREBASE_BASE in backend/.env"
        )
    sensors = fetch_sensors()
    if not sensors:
        raise RuntimeError("Firebase sensor data unavailable")
    flags, score, hard_critical = pre_analyze(sensors)
    try:
        pred = get_groq_prediction(sensors, flags, score, hard_critical=hard_critical)
    except Exception as error:
        print(f"  [predict] Groq prediction failed; using sensor fallback: {error}")
        pred = fallback_prediction(sensors, score, flags=flags, hard_critical=hard_critical)
    if not sensors.get("sensor_drinkable", False):
        pred["drinkable"] = False
        if max(pred.get(field, 0) for field in _RISK_FIELDS) == 0:
            pred = fallback_prediction(sensors, score, flags=flags, hard_critical=hard_critical)
    pred = smooth_prediction(pred, bypass=hard_critical)
    return upload(sensors, pred, village=village)


# ── Background loop: predicts every PREDICT_EVERY seconds ──────────────
def prediction_loop(on_high_severity=None):
    """
    Runs forever in a background thread. `on_high_severity(payload)` is
    called whenever a prediction comes back high/critical, so app.py can
    hook that into the existing Telegram/Twilio alert dispatch.
    """
    print(f"[predict] engine started — predicting every {PREDICT_EVERY}s")
    while True:
        try:
            payload = run_prediction_once()
            print(f"[predict] {payload['severity'].upper()} — "
                  f"overall={payload['overall']}% drinkable={payload['drinkable']}")
            if payload["severity"] in ("high", "critical") and on_high_severity:
                on_high_severity(payload)
        except Exception as e:
            print(f"[predict] cycle error: {e}")
        time.sleep(PREDICT_EVERY)


def start_background_loop(on_high_severity=None):
    """Call once from app.py at startup. No-op (with a log line) if the
    engine isn't configured, so the rest of the backend still runs fine."""
    if not is_predict_configured():
        print("[predict] disabled — GROQ_API_KEY/FIREBASE_BASE not set in .env")
        return
    t = threading.Thread(target=prediction_loop, args=(on_high_severity,), daemon=True)
    t.start()
