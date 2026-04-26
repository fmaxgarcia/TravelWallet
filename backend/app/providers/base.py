from dataclasses import dataclass
from typing import Protocol


@dataclass
class Credentials:
    member_id: str
    last_name: str
    password: str


@dataclass
class AccountSummary:
    provider: str
    member_id: str
    points: int
    tier: str
    last_updated: str


class InteractiveLoginRequired(RuntimeError):
    """Raised when a provider needs the user to complete an interactive login."""


class ProviderConnector(Protocol):
    provider_key: str
    provider_name: str

    def sync_account(self, credentials: Credentials) -> AccountSummary: ...

    def connect_account(self, credentials: Credentials | None = None) -> AccountSummary: ...
