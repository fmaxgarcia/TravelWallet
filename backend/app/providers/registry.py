from app.providers.hotels.hyatt import HyattConnector
from app.providers.hotels.marriott import MarriottConnector

CONNECTORS = {
    HyattConnector.provider_key: HyattConnector(),
    MarriottConnector.provider_key: MarriottConnector(),
}


def get_connector(provider_key: str):
    connector = CONNECTORS.get(provider_key)
    if connector is None:
        raise KeyError(f"Unknown provider: {provider_key}")
    return connector
