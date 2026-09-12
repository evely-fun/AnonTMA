from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, rate_limit_default
from app.core.config import settings
from app.games.registry import catalog_payload
from app.realtime import presence

router = APIRouter(prefix="/config", tags=["config"], dependencies=[Depends(rate_limit_default)])


# Phones on mobile carriers sit behind symmetric NAT, where STUN alone never
# produces a working pair. Open Relay is a free community TURN service and acts
# as the fallback until a dedicated TURN server is configured.
FALLBACK_TURN = {
    "urls": [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turn:openrelay.metered.ca:443?transport=tcp",
    ],
    "username": "openrelayproject",
    "credential": "openrelayproject",
}


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
    else:
        servers.append(dict(FALLBACK_TURN))
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
