"""Telegram credentials loaded from environment variables."""

import os


def alerts_bot_token() -> str | None:
    return os.getenv("TELEGRAM_BOT_TOKEN_ALERTS") or os.getenv("TELEGRAM_BOT_TOKEN")


def alerts_chat_id() -> str | None:
    return os.getenv("TELEGRAM_CHAT_ID_ALERTS") or os.getenv("TELEGRAM_CHAT_ID")


def hierarchy_bot_token() -> str | None:
    return os.getenv("TELEGRAM_BOT_TOKEN_HIERARCHY") or os.getenv("TELEGRAM_BOT_TOKEN")


def hierarchy_chat_id() -> str | None:
    return os.getenv("TELEGRAM_CHAT_ID_HIERARCHY") or os.getenv("TELEGRAM_ACTION_CHAT_ID")