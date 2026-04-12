from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.providers.base import Credentials
from app.providers.registry import get_connector
from app.providers.storage import get_credentials, save_credentials

router = APIRouter()


class ProviderCredentialsIn(BaseModel):
    username: str
    password: str


@router.post("/providers/{provider_key}/credentials")
def store_provider_credentials(provider_key: str, payload: ProviderCredentialsIn) -> dict:
    try:
        get_connector(provider_key)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    save_credentials(provider_key, payload.username, payload.password)
    return {"status": "stored"}


@router.post("/providers/{provider_key}/sync")
def sync_provider(provider_key: str) -> dict:
    stored = get_credentials(provider_key)
    if stored is None:
        raise HTTPException(status_code=404, detail="Credentials not found")

    try:
        connector = get_connector(provider_key)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    summary = connector.sync_account(Credentials(**stored))
    return {"status": "ok", "account": summary.__dict__}
