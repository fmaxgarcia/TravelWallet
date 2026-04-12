import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DATA_DIR = Path(__file__).resolve().parents[2] / "data"
CREDENTIALS_FILE = DATA_DIR / "credentials.json"


def _load_store() -> dict[str, Any]:
    if not CREDENTIALS_FILE.exists():
        return {"providers": {}}
    with CREDENTIALS_FILE.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _save_store(payload: dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with CREDENTIALS_FILE.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)


def save_credentials(provider_key: str, username: str, password: str) -> None:
    payload = _load_store()
    payload.setdefault("providers", {})[provider_key] = {
        "username": username,
        "password": password,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    _save_store(payload)


def get_credentials(provider_key: str) -> dict[str, str] | None:
    payload = _load_store()
    provider = payload.get("providers", {}).get(provider_key)
    if not provider:
        return None
    return {
        "username": provider.get("username", ""),
        "password": provider.get("password", "")
    }
