import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
CREDENTIALS_FILE = DATA_DIR / "credentials.json"
SESSIONS_DIR = DATA_DIR / "sessions"
SESSION_STATE_FILENAME = "session_state.json"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _provider_payload(payload: dict[str, Any], provider_key: str) -> dict[str, Any]:
    return payload.setdefault("providers", {}).setdefault(provider_key, {})


def _load_store() -> dict[str, Any]:
    if not CREDENTIALS_FILE.exists():
        return {"providers": {}}
    with CREDENTIALS_FILE.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _save_store(payload: dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with CREDENTIALS_FILE.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)


def save_credentials(provider_key: str, member_id: str, last_name: str, password: str) -> None:
    payload = _load_store()
    provider = _provider_payload(payload, provider_key)
    provider.update(
        {
            "member_id": member_id,
            "last_name": last_name,
            "password": password,
            "updated_at": _utc_now(),
        }
    )
    _save_store(payload)


def get_credentials(provider_key: str) -> dict[str, str] | None:
    payload = _load_store()
    provider = payload.get("providers", {}).get(provider_key)
    if not provider:
        return None
    return {
        "member_id": provider.get("member_id") or provider.get("username", ""),
        "last_name": provider.get("last_name", ""),
        "password": provider.get("password", ""),
    }


def get_session_profile_dir(provider_key: str) -> Path:
    return SESSIONS_DIR / provider_key


def get_session_state_file(provider_key: str) -> Path:
    return get_session_profile_dir(provider_key) / SESSION_STATE_FILENAME


def save_session_state(provider_key: str, payload: dict[str, Any]) -> None:
    session_dir = get_session_profile_dir(provider_key)
    session_dir.mkdir(parents=True, exist_ok=True)
    with get_session_state_file(provider_key).open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)


def load_session_state(provider_key: str) -> dict[str, Any] | None:
    state_file = get_session_state_file(provider_key)
    if not state_file.exists():
        return None
    with state_file.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def mark_session_connected(provider_key: str) -> None:
    payload = _load_store()
    provider = _provider_payload(payload, provider_key)
    session = provider.setdefault("session", {})
    now = _utc_now()
    session.update(
        {
            "state": "connected",
            "connected_at": session.get("connected_at") or now,
            "last_validated_at": now,
            "last_error": "",
            "updated_at": now,
        }
    )
    _save_store(payload)


def mark_session_reconnect_required(provider_key: str, reason: str) -> None:
    payload = _load_store()
    provider = _provider_payload(payload, provider_key)
    session = provider.setdefault("session", {})
    session.update({"state": "reconnect_required", "last_error": reason, "updated_at": _utc_now()})
    _save_store(payload)


def get_provider_status(provider_key: str) -> dict[str, Any]:
    payload = _load_store()
    provider = payload.get("providers", {}).get(provider_key, {})
    session = provider.get("session", {})
    member_id = provider.get("member_id") or provider.get("username", "")
    last_name = provider.get("last_name", "")
    password = provider.get("password", "")
    has_credentials = bool(member_id and password)
    profile_dir = get_session_profile_dir(provider_key)
    session_state = session.get("state") or "not_connected"
    session_state_file = get_session_state_file(provider_key)
    cookie_store = profile_dir / "Default" / "Cookies"
    has_session = profile_dir.exists() and (session_state_file.exists() or cookie_store.exists())
    return {
        "has_credentials": has_credentials,
        "has_last_name": bool(last_name),
        "has_session": has_session,
        "session_state": "connected" if has_session else session_state,
        "connected_at": session.get("connected_at"),
        "last_validated_at": session.get("last_validated_at"),
        "last_error": session.get("last_error", ""),
    }
