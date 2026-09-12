from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.rate_limit import enforce
from app.core.security import TokenError, decode_token
from app.db.base import as_utc, utcnow
from app.db.models import User
from app.db.session import get_session

SessionDep = Annotated[AsyncSession, Depends(get_session)]


def client_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()[:45]
    return request.client.host if request.client else "unknown"


async def rate_limit_default(request: Request) -> None:
    await enforce(f"http:{client_key(request)}", settings.rate_limit_http_per_minute, 60)


async def rate_limit_auth(request: Request) -> None:
    await enforce(f"auth:{client_key(request)}", settings.rate_limit_auth_per_minute, 60)


async def current_user(
    session: SessionDep,
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    try:
        payload = decode_token(authorization.split(" ", 1)[1].strip(), "access")
    except TokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token") from exc

    user = await session.get(User, int(payload["sub"]))
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown user")
    until = as_utc(user.banned_until)
    if user.is_banned and (until is None or until > utcnow()):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account is restricted")
    if user.is_banned and until and until <= utcnow():
        user.is_banned = False
        user.banned_until = None
        user.trust_score = max(user.trust_score, 60)
    return user


CurrentUser = Annotated[User, Depends(current_user)]


async def current_admin(user: CurrentUser) -> User:
    from app.services.admin import is_admin

    if not is_admin(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not an administrator")
    return user


CurrentAdmin = Annotated[User, Depends(current_admin)]
