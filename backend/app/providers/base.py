from dataclasses import dataclass
from typing import Protocol


@dataclass
class Credentials:
    username: str
    password: str


@dataclass
class AccountSummary:
    provider: str
    member_id: str
    points: int
    tier: str
    last_updated: str


class ProviderConnector(Protocol):
    provider_key: str
    provider_name: str

    def sync_account(self, credentials: Credentials) -> AccountSummary:
        ...
