"""Pure escalation decisions plus the Firebase/Telegram side effects."""

from datetime import datetime, timezone
from typing import Callable

import firebase_utils
from hierarchy_utils import get_chat_id


def should_auto_conclude(status: dict) -> bool:
    # The live demo uses Village -> Tehsil. Keep this list easy to expand
    # when Panchayat/District group IDs are available.
    return all(status.get(level) == "no_problem" for level in ("village", "tehsil"))


def check_escalation(alert_id: str, send_alert: Callable[[str, dict], None] | None = None) -> dict:
    """Check current status; injectable send_alert keeps this function testable."""
    alert = firebase_utils.get(f"alerts/{alert_id}") or {}
    status = alert.get("status") or {}
    if alert.get("final_verdict") or not should_auto_conclude(status):
        return {"concluded": bool(alert.get("final_verdict")), "alert": alert}

    verdict = "District-level water distribution issue suspected"
    firebase_utils.update(
        f"alerts/{alert_id}",
        {"final_verdict": verdict, "resolved_at": datetime.now(timezone.utc).isoformat()},
    )
    alert["final_verdict"] = verdict
    if send_alert:
        district_key = (alert.get("location") or {}).get("district")
        if district_key:
            send_alert(district_key, alert)
        else:
            # Bad location data should be visible in logs, not crash a callback.
            get_chat_id("missing-district")
    return {"concluded": True, "alert": alert}