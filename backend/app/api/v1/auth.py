from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import CurrentUser, SessionDep, rate_limit_auth
from app.core.config import settings
from app.core.security import TokenError, create_token, decode_token
from app.core.logging import get_logger
from app.core.telegram_auth import (
    InitDataError,
    TelegramUser,
    describe_init_data,
    validate_init_data,
)
from app.schemas.user import AuthRequest, RefreshRequest, TokenPair
from app.services.users import ensure_user

logger = get_logger("auth")
router = APIRouter(prefix="/auth", tags=["auth"])


def _issue(user_id: int) -> TokenPair:
    return TokenPair(
        accessToken=create_token(user_id, "access"),
        refreshToken=create_token(user_id, "refresh"),
        expiresIn=settings.access_token_ttl_seconds,
    )


@router.post("/telegram", response_model=TokenPair, dependencies=[Depends(rate_limit_auth)])
async def authenticate(payload: AuthRequest, session: SessionDep) -> TokenPair:
    try:
        init_data = validate_init_data(payload.init_data)
    except InitDataError as exc:
        logger.warning("init data rejected", reason=str(exc), **describe_init_data(payload.init_data))
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid init data: {exc}") from exc

    start_param = payload.start_param or init_data.start_param
    user = await ensure_user(session, init_data.user, start_param)
    await session.flush()
    return _issue(user.id)


@router.post("/refresh", response_model=TokenPair, dependencies=[Depends(rate_limit_auth)])
async def refresh(payload: RefreshRequest, session: SessionDep) -> TokenPair:
    try:
        claims = decode_token(payload.refresh_token, "refresh")
    except TokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token") from exc
    from app.db.models import User

    user = await session.get(User, int(claims["sub"]))
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown user")
    return _issue(user.id)


@router.post("/dev", response_model=TokenPair, dependencies=[Depends(rate_limit_auth)])
async def development_login(
    tg_id: int, session: SessionDep, start_param: str | None = None
) -> TokenPair:
    """Mirrors the Telegram login, start parameter included, so referral and
    deep link flows can be exercised without a real client."""
    if settings.is_production:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not available")
    profile = TelegramUser(
        id=tg_id,
        first_name=f"Dev{tg_id}",
        last_name=None,
        username=f"dev{tg_id}",
        language_code="en",
        is_premium=False,
        photo_url=None,
    )
    user = await ensure_user(session, profile, start_param)
    await session.flush()
    return _issue(user.id)


@router.get("/session")
async def session_info(user: CurrentUser) -> dict:
    return {"userId": user.id, "anonName": user.anon_name, "level": user.stats.level if user.stats else 1}
