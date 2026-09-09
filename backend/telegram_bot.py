"""Async Telegram bot and Firebase alert poller."""

import asyncio
import html
import logging
import os
import threading
from datetime import datetime, timezone

import firebase_utils
from escalation_logic import check_escalation
from hierarchy_utils import get_chat_id, get_location_for_chat, get_parent, load_mapping
from telegram_config import hierarchy_bot_token, hierarchy_chat_id

logger = logging.getLogger(__name__)
POLL_SECONDS = float(os.getenv("ALERT_POLL_SECONDS", "5"))


def format_alert(alert_id: str, alert: dict) -> str:
    location = alert.get("location") or {}
    readings = alert.get("sensor_readings") or {}
    issue = alert.get("predicted_issue") or {}
    status = alert.get("status") or {}
    history = ", ".join(f"{level}: {value}" for level, value in status.items() if value != "pending") or "None"
    return "\n".join([
        "<b>Water-quality alert</b>",
        f"<b>Alert:</b> {html.escape(alert_id)}",
        f"<b>Location:</b> {html.escape(str(location))}",
        f"<b>Readings:</b> TDS {readings.get('tds', 'n/a')}, turbidity {readings.get('turbidity', 'n/a')}, "
        f"pH {readings.get('ph', 'n/a')}, salinity {readings.get('salinity', 'n/a')}, temp {readings.get('temp', 'n/a')}",
        f"<b>Predicted issue:</b> {html.escape(str(issue.get('disease', 'unknown')))} "
        f"({issue.get('confidence', 'n/a')})",
        f"<b>Confirmation history:</b> {html.escape(history)}",
    ])


def _keyboard(alert_id: str):
    from telegram import InlineKeyboardButton, InlineKeyboardMarkup
    return InlineKeyboardMarkup([[InlineKeyboardButton("✅ Problem Resolved / No Problem", callback_data=f"no_problem:{alert_id}"),
                                  InlineKeyboardButton("❌ Still a Problem", callback_data=f"problem:{alert_id}")]])


async def _send_alert(bot, location_key: str, alert_id: str, alert: dict) -> None:
    chat_id = get_chat_id(location_key) or hierarchy_chat_id()
    if not chat_id:
        logger.error("Cannot send alert %s: no chat_id for %s", alert_id, location_key)
        return
    await bot.send_message(chat_id=chat_id, text=format_alert(alert_id, alert), parse_mode="HTML", reply_markup=_keyboard(alert_id))


async def _deliver_village_alert(application, alert_id: str, alert: dict) -> None:
    """Deliver pending Village alerts, including alerts created before startup."""
    if (alert.get("delivery") or {}).get("village_sent_at"):
        return
    location_key = (alert.get("location") or {}).get("village")
    if not location_key:
        logger.error("Alert %s has no village location_key", alert_id)
        return
    await _send_alert(application.bot, location_key, alert_id, alert)
    firebase_utils.update(
        f"alerts/{alert_id}/delivery",
        {"village_sent_at": datetime.now(timezone.utc).isoformat()},
    )


def send_alert_sync(bot, location_key: str, alert: dict, alert_id: str | None = None) -> None:
    """Adapter for escalation_logic; the bot loop owns the actual coroutine."""
    bot.loop.create_task(_send_alert(bot, location_key, alert_id or "unknown", alert))


async def _new_alert_listener(application) -> None:
    # Do not discard records that were created while the backend was stopped.
    # The delivery marker prevents duplicates across polling cycles/restarts.
    while True:
        try:
            alerts = firebase_utils.get("alerts") or {}
            for alert_id, alert in alerts.items():
                if isinstance(alert, dict) and not alert.get("final_verdict"):
                    await _deliver_village_alert(application, alert_id, alert)
        except Exception as exc:
            logger.exception("Firebase alert listener failed: %s", exc)
        await asyncio.sleep(POLL_SECONDS)


async def _callback(update, context) -> None:
    query = update.callback_query
    await query.answer()
    action, alert_id = query.data.split(":", 1)
    match = get_location_for_chat(query.message.chat.id)
    if not match:
        await query.edit_message_text("This Telegram group is not configured in hierarchy_mapping.")
        return
    location_key, node = match
    level = node.get("level")
    value = "no_problem" if action == "no_problem" else "problem_confirmed"
    firebase_utils.update(f"alerts/{alert_id}/status", {level: value})
    alert = firebase_utils.get(f"alerts/{alert_id}") or {}
    if value == "problem_confirmed":
        verdict = f"Problem confirmed at {level} ({location_key})"
        firebase_utils.update(f"alerts/{alert_id}", {"final_verdict": verdict, "resolved_at": datetime.now(timezone.utc).isoformat()})
        action_chat = os.getenv("TELEGRAM_ACTION_CHAT_ID") or get_chat_id((alert.get("location") or {}).get("district", ""))
        if action_chat:
            await context.bot.send_message(chat_id=action_chat, text=f"<b>{html.escape(verdict)}</b>\nAlert: {html.escape(alert_id)}", parse_mode="HTML")
        await query.edit_message_text(f"Recorded: {verdict}")
        return
    result = check_escalation(
        alert_id,
        lambda district, current: asyncio.create_task(_send_alert(context.bot, district, alert_id, current)),
    )
    if result["concluded"]:
        await query.edit_message_text("Recorded: all lower levels report no problem; district issue suspected.")
        return
    parent = get_parent(location_key)
    if parent:
        await _send_alert(context.bot, parent, alert_id, result["alert"])
        await query.edit_message_text(f"Recorded at {level}; forwarded to {parent}.")
    else:
        if value == "no_problem":
            verdict = f"No problem reported at all configured levels; review completed at {level} ({location_key})"
            firebase_utils.update(f"alerts/{alert_id}", {
                "final_verdict": verdict,
                "resolved_at": datetime.now(timezone.utc).isoformat(),
            })
            await query.edit_message_text(f"Recorded: {verdict}")
            return
        await query.edit_message_text("Recorded, but no parent group is configured.")


def run_bot() -> None:
    from telegram.ext import Application, CallbackQueryHandler
    # Python 3.13 does not create an event loop automatically for a worker
    # thread; python-telegram-bot needs one before run_polling starts.
    asyncio.set_event_loop(asyncio.new_event_loop())
    token = hierarchy_bot_token()
    if not token:
        logger.warning("Telegram hierarchy bot disabled: TELEGRAM_BOT_TOKEN_HIERARCHY is not configured")
        return
    try:
        mapping = load_mapping()
        logger.info("Loaded %d hierarchy nodes from Firebase", len(mapping))
    except Exception as exc:
        logger.error("Could not load hierarchy_mapping at startup: %s", exc)

    async def post_init(application):
        application.create_task(_new_alert_listener(application))

    application = Application.builder().token(token).post_init(post_init).build()
    application.add_handler(CallbackQueryHandler(_callback))
    # Flask/Gunicorn owns the main thread and its signals in this deployment.
    application.run_polling(drop_pending_updates=False, stop_signals=None)


def start_bot_background() -> None:
    if not hierarchy_bot_token():
        return
    threading.Thread(target=run_bot, name="telegram-bot", daemon=True).start()