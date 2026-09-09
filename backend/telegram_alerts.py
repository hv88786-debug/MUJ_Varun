"""
telegram_alerts.py — Sends contaminated-water alerts to authorities via a
Telegram bot (Bot API `sendMessage`), alongside or instead of Twilio.

SETUP (one-time):
  1. Message @BotFather on Telegram, run /newbot, follow the prompts.
     BotFather gives you a BOT_TOKEN like "123456789:AAH...".
  2. Add the bot to the authority group (or DM it directly for a single
     recipient) and get the CHAT_ID:
       - Easiest: add the bot to the group, send any message in the group,
         then GET https://api.telegram.org/bot<TOKEN>/getUpdates and read
         the "chat":{"id": ...} field from the response.
       - Group chat IDs are negative numbers (e.g. -1001234567890).
  3. Set these as environment variables — NEVER hardcode them, and NEVER
     put them in frontend code (they'd be visible to anyone using the site):
       TELEGRAM_BOT_TOKEN=123456789:AAH...
       TELEGRAM_CHAT_ID=-1001234567890
     e.g. in a .env file (loaded via python-dotenv) or your host's secrets
     manager (Render/Railway/Heroku config vars, etc).

This module makes a REAL HTTP call to the Telegram Bot API. If the
environment variables aren't set, `is_telegram_configured()` returns False
and `send_telegram_alert()` refuses to run rather than pretending to
succeed — the caller is expected to check `is_telegram_configured()` (or
read the `ok` field of the returned dict) and report that honestly to the
frontend instead of faking a sent/success status.
"""

import os
import requests
from telegram_config import alerts_bot_token, alerts_chat_id

TELEGRAM_API_BASE = "https://api.telegram.org"
REQUEST_TIMEOUT_SECONDS = 8


def is_telegram_configured() -> bool:
    """True only if both required env vars are present and non-empty."""
    return bool(alerts_bot_token()) and bool(alerts_chat_id())


def format_alert_message(
    village: str,
    tds: float,
    turbidity: float,
    ph: float,
    temperature: float,
    ai_risk_pct: float,
    timestamp: str,
    concern: str = "",
    action: str = "",
) -> str:
    """Builds the human-readable alert text sent to the Telegram chat."""
    lines = [
        "🚨 *URGENT — Water Contamination Alert*",
        f"📍 Village: *{village}*",
        "",
        f"TDS: {tds} mg/L",
        f"Turbidity: {turbidity} NTU",
        f"pH: {ph}",
        f"Temperature: {temperature} °C",
        f"AI Risk: {ai_risk_pct}%",
    ]
    if concern:
        lines.append(f"\n⚠️ {concern}")
    if action:
        lines.append(f"✅ Action required: {action}")
    lines.append(f"\n🕒 {timestamp}")
    lines.append("\n— Sent automatically by Varun")
    return "\n".join(lines)


def send_telegram_alert(message: str) -> dict:
    """
    Sends `message` to the configured Telegram chat via the Bot API.

    Returns a dict: {"ok": bool, "error": str | None}. Never raises for
    expected failure modes (missing config, network error, Telegram API
    error) — callers should check "ok" and surface "error" to logs/UI
    rather than assuming success.
    """
    if not is_telegram_configured():
        return {
            "ok": False,
            "error": "TELEGRAM_BOT_TOKEN_ALERTS and/or TELEGRAM_CHAT_ID_ALERTS not set in environment",
        }

    bot_token = alerts_bot_token()
    chat_id = alerts_chat_id()
    url = f"{TELEGRAM_API_BASE}/bot{bot_token}/sendMessage"

    try:
        resp = requests.post(
            url,
            json={
                "chat_id": chat_id,
                "text": message,
                "parse_mode": "Markdown",
            },
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        return {"ok": False, "error": f"Network error calling Telegram API: {exc}"}

    try:
        payload = resp.json()
    except ValueError:
        return {
            "ok": False,
            "error": f"Telegram API returned non-JSON response (HTTP {resp.status_code})",
        }

    if resp.status_code != 200 or not payload.get("ok"):
        return {
            "ok": False,
            "error": payload.get("description", f"HTTP {resp.status_code}"),
        }

    return {"ok": True, "error": None}
