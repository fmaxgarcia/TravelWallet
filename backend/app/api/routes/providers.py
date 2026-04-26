from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.providers.base import Credentials, InteractiveLoginRequired
from app.providers.registry import get_connector
from app.providers.storage import get_credentials, get_provider_status, save_credentials

router = APIRouter()


class ProviderCredentialsIn(BaseModel):
    member_id: str
    last_name: str
    password: str


@router.get("/providers/{provider_key}/status")
def provider_status(provider_key: str) -> dict:
    try:
        get_connector(provider_key)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return get_provider_status(provider_key)


@router.post("/providers/{provider_key}/credentials")
def store_provider_credentials(provider_key: str, payload: ProviderCredentialsIn) -> dict:
    try:
        get_connector(provider_key)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    save_credentials(provider_key, payload.member_id, payload.last_name, payload.password)
    return {"status": "stored"}


@router.post("/providers/{provider_key}/sync")
def sync_provider(provider_key: str) -> dict:
    stored = get_credentials(provider_key)
    if stored is None:
        stored = {"member_id": "", "last_name": "", "password": ""}

    try:
        connector = get_connector(provider_key)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    try:
        summary = connector.sync_account(Credentials(**stored))
    except InteractiveLoginRequired as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"status": "ok", "account": summary.__dict__}


@router.post("/providers/{provider_key}/connect")
def connect_provider(provider_key: str) -> dict:
    stored = get_credentials(provider_key)
    credentials = Credentials(**stored) if stored is not None else None

    try:
        connector = get_connector(provider_key)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    try:
        summary = connector.connect_account(credentials)
    except InteractiveLoginRequired as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {"status": "ok", "account": summary.__dict__}
