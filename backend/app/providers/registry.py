from app.providers.hotels.hyatt import HyattConnector

CONNECTORS = {
    HyattConnector.provider_key: HyattConnector()
}


def get_connector(provider_key: str):
    connector = CONNECTORS.get(provider_key)
    if connector is None:
        raise KeyError(f"Unknown provider: {provider_key}")
    return connector
