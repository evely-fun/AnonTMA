import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from urllib.parse import parse_qsl

from app.core.config import settings


class InitDataError(Exception):
    pass


@dataclass(slots=True)
class TelegramUser:
    id: int
    first_name: str
    last_name: str | None
    username: str | None
    language_code: str | None
    is_premium: bool
    photo_url: str | None


@dataclass(slots=True)
class InitData:
    user: TelegramUser
    auth_date: int
    start_param: str | None
    chat_instance: str | None
    query_id: str | None


def _secret_key(bot_token: str) -> bytes:
    return hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()


def _check_string(pairs: list[tuple[str, str]]) -> str:
    return "\n".join(f"{key}={value}" for key, value in sorted(pairs, key=lambda item: item[0]))


def validate_init_data(raw: str, *, max_age: int | None = None) -> InitData:
    if not raw or len(raw) > 8192:
        raise InitDataError("init data missing or too large")
    if not settings.telegram_bot_token:
        raise InitDataError("bot token is not configured")

    pairs = parse_qsl(raw, keep_blank_values=True, strict_parsing=False)
    data = dict(pairs)
    received_hash = data.pop("hash", "")
    data.pop("signature", None)
    if not received_hash:
        raise InitDataError("hash is missing")

    payload_pairs = [(key, value) for key, value in pairs if key not in ("hash", "signature")]
    expected = hmac.new(
        _secret_key(settings.telegram_bot_token), _check_string(payload_pairs).encode(), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected, received_hash):
        raise InitDataError("signature mismatch")

    try:
        auth_date = int(data.get("auth_date", "0"))
    except ValueError as exc:
        raise InitDataError("auth_date is invalid") from exc

    window = settings.init_data_max_age_seconds if max_age is None else max_age
    now = int(time.time())
    if auth_date <= 0 or now - auth_date > window or auth_date - now > 60:
        raise InitDataError("init data expired")

    try:
        user_payload = json.loads(data.get("user", "{}"))
    except json.JSONDecodeError as exc:
        raise InitDataError("user payload is invalid") from exc
    if not user_payload.get("id"):
        raise InitDataError("user payload is empty")

    user = TelegramUser(
        id=int(user_payload["id"]),
        first_name=str(user_payload.get("first_name", ""))[:64],
        last_name=(str(user_payload["last_name"])[:64] if user_payload.get("last_name") else None),
        username=(str(user_payload["username"])[:64] if user_payload.get("username") else None),
        language_code=(str(user_payload.get("language_code", "en"))[:8]),
        is_premium=bool(user_payload.get("is_premium", False)),
        photo_url=(str(user_payload["photo_url"])[:512] if user_payload.get("photo_url") else None),
    )
    start_param = data.get("start_param")
    return InitData(
        user=user,
        auth_date=auth_date,
        start_param=start_param[:128] if start_param else None,
        chat_instance=data.get("chat_instance"),
        query_id=data.get("query_id"),
    )
