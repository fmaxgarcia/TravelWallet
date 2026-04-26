from fastapi.testclient import TestClient

from app.api.routes import providers as provider_routes
from app.main import app
from app.providers import storage
from app.providers.base import AccountSummary, InteractiveLoginRequired
from app.providers.hotels import hyatt as hyatt_module


def _use_tmp_provider_store(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(storage, "DATA_DIR", tmp_path)
    monkeypatch.setattr(storage, "CREDENTIALS_FILE", tmp_path / "credentials.json")
    monkeypatch.setattr(storage, "SESSIONS_DIR", tmp_path / "sessions")


def test_provider_status_defaults(monkeypatch, tmp_path) -> None:
    _use_tmp_provider_store(monkeypatch, tmp_path)

    client = TestClient(app)
    response = client.get("/providers/hyatt/status")

    assert response.status_code == 200
    assert response.json() == {
        "connected_at": None,
        "has_credentials": False,
        "has_last_name": False,
        "has_session": False,
        "last_error": "",
        "last_validated_at": None,
        "session_state": "not_connected",
    }


def test_provider_status_detects_saved_browser_session(monkeypatch, tmp_path) -> None:
    _use_tmp_provider_store(monkeypatch, tmp_path)

    profile_dir = tmp_path / "sessions" / "hyatt" / "Default"
    profile_dir.mkdir(parents=True)
    (profile_dir / "Cookies").write_text("", encoding="utf-8")

    client = TestClient(app)
    response = client.get("/providers/hyatt/status")

    assert response.status_code == 200
    assert response.json()["has_session"] is True
    assert response.json()["session_state"] == "connected"


def test_provider_status_reflects_saved_credentials(monkeypatch, tmp_path) -> None:
    _use_tmp_provider_store(monkeypatch, tmp_path)

    client = TestClient(app)
    response = client.post(
        "/providers/hyatt/credentials",
        json={"member_id": "123456", "last_name": "Garcia", "password": "secret"},
    )

    assert response.status_code == 200

    status_response = client.get("/providers/hyatt/status")
    assert status_response.status_code == 200
    assert status_response.json()["has_credentials"] is True
    assert status_response.json()["has_session"] is False


def test_sync_requires_interactive_login(monkeypatch, tmp_path) -> None:
    _use_tmp_provider_store(monkeypatch, tmp_path)

    class FakeConnector:
        def sync_account(self, credentials):  # noqa: ANN001
            raise InteractiveLoginRequired(
                "No saved Hyatt session is available. Click Sync to sign in."
            )

        def connect_account(self, credentials=None):  # noqa: ANN001
            raise AssertionError("connect_account should not be called")

    monkeypatch.setattr(provider_routes, "get_connector", lambda _provider_key: FakeConnector())

    client = TestClient(app)
    response = client.post("/providers/hyatt/sync")

    assert response.status_code == 409
    assert response.json() == {
        "detail": "No saved Hyatt session is available. Click Sync to sign in."
    }


def test_connect_uses_saved_credentials(monkeypatch, tmp_path) -> None:
    _use_tmp_provider_store(monkeypatch, tmp_path)

    received = {}

    class FakeConnector:
        def sync_account(self, credentials):  # noqa: ANN001
            raise AssertionError("sync_account should not be called")

        def connect_account(self, credentials=None):  # noqa: ANN001
            received["member_id"] = credentials.member_id if credentials is not None else None
            received["last_name"] = credentials.last_name if credentials is not None else None
            return AccountSummary(
                provider="World of Hyatt",
                member_id="123456",
                points=1000,
                tier="Member",
                last_updated="2026-04-18 10:00 UTC",
            )

    monkeypatch.setattr(provider_routes, "get_connector", lambda _provider_key: FakeConnector())
    storage.save_credentials("hyatt", "123456", "Garcia", "secret")

    client = TestClient(app)
    response = client.post("/providers/hyatt/connect")

    assert response.status_code == 200
    assert response.json()["account"]["member_id"] == "123456"
    assert received == {"member_id": "123456", "last_name": "Garcia"}


def test_hyatt_sync_falls_back_to_browser_login(monkeypatch, tmp_path) -> None:
    _use_tmp_provider_store(monkeypatch, tmp_path)

    calls = []

    def fake_run_session_flow(
        self,
        *,
        headless,  # noqa: ANN001
        credentials,  # noqa: ANN001
        initial_url,  # noqa: ANN001
        interactive,  # noqa: ANN001
    ):
        calls.append((headless, interactive, initial_url))
        if headless and not interactive:
            raise InteractiveLoginRequired("saved session expired")
        return AccountSummary(
            provider="World of Hyatt",
            member_id="123456",
            points=8211,
            tier="Member",
            last_updated="2026-04-26 10:00 UTC",
        )

    monkeypatch.setattr(hyatt_module.HyattConnector, "_run_session_flow", fake_run_session_flow)

    connector = hyatt_module.HyattConnector()
    summary = connector.sync_account(hyatt_module.Credentials("123456", "Garcia", "secret"))

    assert summary.points == 8211
    assert calls == [
        (True, False, "https://www.hyatt.com/profile/en-US/account-overview"),
        (False, True, "https://www.hyatt.com/en-US/member/sign-in/traditional?returnUrl=https%3A%2F%2Fwww.hyatt.com"),
    ]
