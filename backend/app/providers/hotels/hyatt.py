from datetime import datetime, timezone

from app.providers.base import AccountSummary, Credentials


class HyattConnector:
    provider_key = "hyatt"
    provider_name = "World of Hyatt"

    def sync_account(self, credentials: Credentials) -> AccountSummary:
        # Placeholder for real login + scrape flow.
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        member_id = credentials.username
        return AccountSummary(
            provider=self.provider_name,
            member_id=member_id,
            points=42000,
            tier="Explorist",
            last_updated=now
        )
