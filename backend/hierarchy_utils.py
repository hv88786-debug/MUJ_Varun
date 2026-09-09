"""Lookups for the Firebase-backed administrative hierarchy."""

import logging
import os
from typing import Any

import firebase_utils

logger = logging.getLogger(__name__)


def load_mapping() -> dict[str, dict[str, Any]]:
    mapping = firebase_utils.get("hierarchy_mapping") or {}
    return mapping if isinstance(mapping, dict) else {}


def _node(location_key: str) -> dict[str, Any] | None:
    node = load_mapping().get(location_key)
    if not isinstance(node, dict):
        logger.error("No hierarchy_mapping entry found for location_key=%s", location_key)
        return None
    return node


def get_chat_id(location_key: str) -> str | None:
    node = _node(location_key)
    level = str(node.get("level", "")).upper() if node else ""
    configured = (
        os.getenv(f"TELEGRAM_CHAT_ID_{level}") if level else None
    ) or os.getenv("TELEGRAM_CHAT_ID_HIERARCHY")
    return configured or (str(node["chat_id"]) if node and node.get("chat_id") is not None else None)


def get_parent(location_key: str) -> str | None:
    node = _node(location_key)
    return node.get("parent") if node else None


def get_location_for_chat(chat_id: int | str) -> tuple[str, dict[str, Any]] | None:
    wanted = str(chat_id)
    for location_key, node in load_mapping().items():
        level = str(node.get("level", "")).upper()
        configured = (
            os.getenv(f"TELEGRAM_CHAT_ID_{level}") if level else None
        ) or os.getenv("TELEGRAM_CHAT_ID_HIERARCHY")
        mapped_chat_id = configured or node.get("chat_id")
        if str(mapped_chat_id) == wanted:
            return location_key, node
    logger.error("No hierarchy_mapping entry found for Telegram chat_id=%s", chat_id)
    return None