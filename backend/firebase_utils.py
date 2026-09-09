"""Small Firebase Realtime Database REST client used by the bot and API."""

import os
from typing import Any
from urllib.parse import quote

import requests
from dotenv import load_dotenv

load_dotenv()

FIREBASE_BASE = os.getenv("FIREBASE_BASE", "").rstrip("/")
REQUEST_TIMEOUT = float(os.getenv("FIREBASE_TIMEOUT", "8"))


class FirebaseError(RuntimeError):
    """Raised when Firebase cannot be read or written."""


def _url(path: str) -> str:
    if not FIREBASE_BASE:
        raise FirebaseError("FIREBASE_BASE is not configured")
    clean_path = "/".join(quote(part, safe="") for part in path.strip("/").split("/"))
    return f"{FIREBASE_BASE}/{clean_path}.json"


def _params() -> dict[str, str]:
    # Firebase database secret is suitable for a hackathon demo. Prefer an
    # ID token in production and keep either credential out of source code.
    secret = os.getenv("FIREBASE_DATABASE_SECRET")
    token = os.getenv("FIREBASE_ID_TOKEN")
    if secret:
        return {"auth": secret}
    if token:
        return {"access_token": token}
    return {}


def request(method: str, path: str, value: Any = None) -> Any:
    try:
        response = requests.request(
            method, _url(path), params=_params(), json=value, timeout=REQUEST_TIMEOUT
        )
    except requests.RequestException as exc:
        raise FirebaseError(f"Firebase network error: {exc}") from exc
    if not response.ok:
        raise FirebaseError(f"Firebase returned HTTP {response.status_code}: {response.text[:300]}")
    try:
        return response.json()
    except ValueError as exc:
        raise FirebaseError("Firebase returned invalid JSON") from exc


def get(path: str) -> Any:
    return request("GET", path)


def set_value(path: str, value: Any) -> Any:
    return request("PUT", path, value)


def update(path: str, value: dict[str, Any]) -> Any:
    return request("PATCH", path, value)


def push(path: str, value: Any) -> tuple[str, Any]:
    result = request("POST", path, value)
    key = result.get("name") if isinstance(result, dict) else None
    if not key:
        raise FirebaseError("Firebase did not return a push key")
    return key, value