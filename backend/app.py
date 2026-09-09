"""
app.py — Varun (Jharkhand / Dhanbad) backend.

Endpoints:
  GET  /health          → liveness check for the frontend's backend-online indicator
  POST /simulate-alert  → dispatches a contamination alert to authorities

Design principle: never report a channel as sent unless it actually sent.
Both Twilio and Telegram report their real, independent outcomes — one
failing does not block or fake the other.
"""

import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

load_dotenv()  # reads .env in the working directory, if present — must
                # run BEFORE importing predict, since predict.py reads its
                # GROQ_API_KEY/FIREBASE_BASE config from os.environ at
                # import time.

from telegram_alerts import (
    format_alert_message,
    is_telegram_configured,
    send_telegram_alert,
)
import predict
import firebase_utils
from hierarchy_utils import load_mapping

app = Flask(__name__)

# CORS: in dev this allows everything (frontend on localhost:5173). In
# production, set FRONTEND_URL in Render's env to your Vercel URL
# (e.g. https://varun.vercel.app) to restrict it — otherwise falls back
# to allowing all origins so nothing breaks if you forget to set it.
_frontend_url = os.environ.get("FRONTEND_URL", "").strip()
CORS(app, origins=[_frontend_url] if _frontend_url else "*")


# ─────────────────────────────────────────────────────────────────────────
# Twilio — STUB ONLY. Real credentials + implementation come later; until
# then this must return twilio_sent=False with a clear reason, never a
# fake success.
# ─────────────────────────────────────────────────────────────────────────
def is_twilio_configured() -> bool:
    return bool(os.environ.get("TWILIO_ACCOUNT_SID")) and bool(
        os.environ.get("TWILIO_AUTH_TOKEN")
    )


def send_twilio_alerts(village: str, concern: str, action: str) -> dict:
    """
    Placeholder for the real Twilio WhatsApp+SMS dispatch. Intentionally
    does not call Twilio yet. Returns the same shape send_telegram_alert()
    uses ({"ok", "error"}) so app.py's calling code stays uniform once
    this is implemented for real.
    """
    if not is_twilio_configured():
        return {
            "ok": False,
            "error": "Twilio not configured — TWILIO_ACCOUNT_SID/AUTH_TOKEN missing (stub, not yet implemented)",
        }
    # Real implementation goes here once credentials are provided —
    # e.g. twilio.rest.Client(...).messages.create(...) per contact.
    return {
        "ok": False,
        "error": "Twilio credentials found but dispatch logic is not implemented yet (stub)",
    }


@app.route("/health", methods=["GET"])
def health():
    return jsonify(
        {
            "status": "ok",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    ), 200


@app.route("/hierarchy-mapping", methods=["GET"])
def hierarchy_mapping():
    """Read-only mapping endpoint for the dashboard's vertical tracker."""
    try:
        return jsonify(load_mapping()), 200
    except firebase_utils.FirebaseError as exc:
        app.logger.error("Could not load hierarchy mapping: %s", exc)
        return jsonify({"error": str(exc)}), 503


@app.route("/alert-status/<alert_id>", methods=["GET"])
def alert_status(alert_id):
    try:
        alert = firebase_utils.get(f"alerts/{alert_id}")
    except firebase_utils.FirebaseError as exc:
        return jsonify({"error": str(exc)}), 503
    if not alert:
        return jsonify({"error": "Alert not found"}), 404
    return jsonify({
        "alert_id": alert_id,
        "location": alert.get("location", {}),
        "status": alert.get("status", {}),
        "final_verdict": alert.get("final_verdict"),
        "resolved_at": alert.get("resolved_at"),
        "timestamp": alert.get("timestamp"),
        "sensor_readings": alert.get("sensor_readings", {}),
        "predicted_issue": alert.get("predicted_issue", {}),
    }), 200


@app.route("/predict-now", methods=["GET", "POST"])
def predict_now():
    """
    Runs one prediction cycle on demand: Firebase sensors -> Groq ->
    Firebase ai_prediction/history. Requires GROQ_API_KEY + FIREBASE_BASE
    in backend/.env.
    """
    body = request.get_json(silent=True) or {}
    village = body.get("village", "Nasirabad")
    try:
        payload = predict.run_prediction_once(village=village)
        return jsonify(payload), 200
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        app.logger.error(f"Prediction failed: {e}")
        return jsonify({"error": str(e)}), 500


def _dispatch_alerts_for_prediction(payload: dict) -> None:
    """Bridges the background prediction engine's high/critical results
    into the existing Telegram/Twilio alert channels used by
    /simulate-alert, so a bad AI reading auto-notifies authorities."""
    village = payload.get("village", "Unknown village")
    concern = payload.get("concern", "")
    action = payload.get("action", "")
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    twilio_result = send_twilio_alerts(village, concern, action)
    if not twilio_result["ok"]:
        app.logger.info(f"Twilio not sent (auto-alert): {twilio_result['error']}")

    if is_telegram_configured():
        sensors = payload.get("sensors", {})
        message = format_alert_message(
            village=village,
            tds=sensors.get("tds", "—"),
            turbidity=sensors.get("turbidity", "—"),
            ph=sensors.get("ph", "—"),
            temperature=sensors.get("temperature", "—"),
            ai_risk_pct=payload.get("overall", "—"),
            timestamp=timestamp,
            concern=concern,
            action=action,
        )
        result = send_telegram_alert(message)
        if not result["ok"]:
            app.logger.error(f"Telegram auto-alert failed: {result['error']}")
    else:
        app.logger.info("Telegram not configured — skipping auto-alert")


@app.route("/simulate-alert", methods=["POST"])
def simulate_alert():
    data = request.get_json(silent=True) or {}
    village = data.get("village", "Unknown village")
    severity = data.get("severity", "warning")
    concern = data.get("concern", "")
    action = data.get("action", "")

    # The demo creates a durable hierarchical alert. In production this is
    # populated by the ESP32/prediction pipeline; for the hackathon it is
    # also convenient to create one from the existing frontend button.
    location = data.get("location") or {
        "village": data.get("village_key", "village_X"),
        "panchayat": data.get("panchayat_key", "panchayat_Y"),
        "tehsil": data.get("tehsil_key", "tehsil_Z"),
        "district": data.get("district_key", "district_D"),
    }
    alert_id = None
    try:
        alert_id, _ = firebase_utils.push("alerts", {
            "location": location,
            "sensor_readings": {
                "tds": data.get("tds", 0), "turbidity": data.get("turbidity", 0),
                "ph": data.get("ph", 7), "salinity": data.get("salinity", 0),
                "temp": data.get("temp", data.get("temperature", 0)),
            },
            "predicted_issue": {
                "disease": data.get("disease", concern or "water_quality_risk"),
                "confidence": data.get("confidence", data.get("ai_risk_pct", 0)),
            },
            "status": {"village": "pending", "panchayat": "pending", "tehsil": "pending", "district": "pending"},
            "final_verdict": None,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "resolved_at": None,
        })
        return jsonify({
            "alert_id": alert_id,
            "severity": severity,
            "village": village,
            "flow": "hierarchical_alert_created",
            "message": "Alert stored; the village Telegram group will be notified by the listener.",
        }), 202
    except firebase_utils.FirebaseError as exc:
        app.logger.warning("Hierarchical alert was not created; using legacy dispatch: %s", exc)

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    # ── Channel 1: Twilio (stub for now) ──
    twilio_result = send_twilio_alerts(village, concern, action)
    twilio_sent = twilio_result["ok"]
    if not twilio_sent:
        app.logger.info(f"Twilio not sent: {twilio_result['error']}")

    # ── Channel 2: Telegram (real) ──
    telegram_configured = is_telegram_configured()
    telegram_sent = False
    telegram_error = None

    if telegram_configured:
        # Note: the current frontend POST body only includes
        # severity/village/concern/action — no live TDS/turbidity/pH/
        # temperature/AI-risk figures. Those fields default to "—" here
        # until the frontend's /simulate-alert call is extended to send
        # them (see README).
        message = format_alert_message(
            village=village,
            tds=data.get("tds", "—"),
            turbidity=data.get("turbidity", "—"),
            ph=data.get("ph", "—"),
            temperature=data.get("temperature", "—"),
            ai_risk_pct=data.get("ai_risk_pct", "—"),
            timestamp=timestamp,
            concern=concern,
            action=action,
        )
        result = send_telegram_alert(message)
        telegram_sent = result["ok"]
        telegram_error = result["error"]
        if not telegram_sent:
            app.logger.error(f"Telegram dispatch failed: {telegram_error}")
    else:
        telegram_error = "Telegram not configured — TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID missing"
        app.logger.info(telegram_error)

    return jsonify(
        {
            "contacts": 6,  # count of authorities in ALERT_CONTACTS on the frontend
            "severity": severity,
            "village": village,
            "twilio_sent": twilio_sent,
            "twilio_error": twilio_result["error"],
            "telegram_configured": telegram_configured,
            "telegram_sent": telegram_sent,
            "telegram_error": telegram_error,
        }
    ), 200


# Starts the Groq+Firebase prediction loop in the background (no-op, with
# a log line, if GROQ_API_KEY/FIREBASE_BASE aren't set in .env). Placed at
# module level (not inside `if __name__ == "__main__"`) so it also runs
# under Gunicorn on Render, which imports this module rather than
# executing it as a script.
predict.start_background_loop(on_high_severity=_dispatch_alerts_for_prediction)

if __name__ == "__main__":
    # Local dev only — Render runs this via Gunicorn instead (see Procfile).
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
