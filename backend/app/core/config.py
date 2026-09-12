from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: Literal["development", "production"] = "production"
    app_name: str = "AnonTMA"
    api_prefix: str = "/api/v1"

    telegram_bot_token: str = ""
    telegram_bot_username: str = ""
    telegram_webhook_secret: str = ""
    public_web_url: str = "http://localhost:5173"
    public_api_url: str = "http://localhost:8000"

    jwt_secret: str = "change-me-in-production-please-use-64-random-hex-characters"
    jwt_algorithm: str = "HS256"
    access_token_ttl_seconds: int = 1800
    refresh_token_ttl_seconds: int = 2592000
    init_data_max_age_seconds: int = 3600

    payload_encryption_key: str = ""

    database_url: str = "sqlite+aiosqlite:///./anontma.db"
    redis_url: str = "redis://localhost:6379/0"

    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173"]
    )

    rate_limit_http_per_minute: int = 120
    rate_limit_ws_messages_per_10s: int = 40
    rate_limit_auth_per_minute: int = 40

    payments_mode: Literal["test", "live"] = "test"

    turn_urls: Annotated[list[str], NoDecode] = Field(default_factory=list)
    turn_username: str = ""
    turn_credential: str = ""
    stun_urls: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"]
    )

    max_room_participants: int = 12
    matchmaking_ttl_seconds: int = 120

    @field_validator("cors_origins", "turn_urls", "stun_urls", mode="before")
    @classmethod
    def split_csv(cls, value: object) -> object:
        if isinstance(value, str):
            stripped = value.strip()
            if stripped.startswith("["):
                import json

                return json.loads(stripped)
            return [item.strip() for item in stripped.split(",") if item.strip()]
        return value

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def sqlalchemy_url(self) -> str:
        url = self.database_url
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
