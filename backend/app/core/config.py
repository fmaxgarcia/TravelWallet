from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "TravelWallet API"
    database_url: str = "sqlite:///./travelwallet.db"
    supabase_url: str = ""
    supabase_anon_key: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


settings = Settings()
