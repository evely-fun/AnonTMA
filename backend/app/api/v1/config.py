from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, rate_limit_default
from app.core.config import settings
from app.games.registry import catalog_payload
from app.realtime import presence

router = APIRouter(prefix="/config", tags=["config"], dependencies=[Depends(rate_limit_default)])


@router.get("/ice")
async def ice_servers(user: CurrentUser) -> dict:
    servers: list[dict] = [{"urls": settings.stun_urls}]
    if settings.turn_urls:
        servers.append(
            {
                "urls": settings.turn_urls,
                "username": settings.turn_username,
                "credential": settings.turn_credential,
            }
        )
    return {"iceServers": servers, "iceTransportPolicy": "all"}


@router.get("/bootstrap")
async def bootstrap(user: CurrentUser) -> dict:
    return {
        "games": catalog_payload(),
        "presence": await presence.snapshot(),
        "limits": {
            "maxRoomParticipants": settings.max_room_participants,
            "wsMessagesPer10s": settings.rate_limit_ws_messages_per_10s,
        },
        "botUsername": settings.telegram_bot_username,
    }


@router.get("/presence")
async def presence_snapshot(user: CurrentUser) -> dict:
    return await presence.snapshot()
