import base64
import hashlib
import hmac
import time

from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, rate_limit_default
from app.core.config import settings
from app.games.registry import catalog_payload
from app.realtime import presence

router = APIRouter(prefix="/config", tags=["config"], dependencies=[Depends(rate_limit_default)])


# Mobile carriers put phones behind symmetric NAT, where STUN alone never
# produces a working candidate pair, so a relay is not optional for two phones
# on mobile data: it is the only thing that will connect them.
#
# Open Relay's staticauth host runs coturn in shared secret mode. That mode
# does not accept the secret as a password. The username has to be an expiry
# stamp and the credential an HMAC of it, which is the TURN REST scheme every
# coturn deployment uses. We were sending the literal secret, so every relay
# allocation was rejected and the relay might as well not have been configured.
FALLBACK_TURN_HOST = "staticauth.openrelay.metered.ca"
FALLBACK_TURN_SECRET = "openrelayprojectsecret"
TURN_TTL_SECONDS = 6 * 60 * 60


def turn_credentials(secret: str, ttl: int = TURN_TTL_SECONDS) -> tuple[str, str]:
    """A time limited username and password, per the coturn REST scheme."""
    expiry = int(time.time()) + ttl
    username = f"{expiry}:anteiku"
    digest = hmac.new(secret.encode(), username.encode(), hashlib.sha1).digest()
    return username, base64.b64encode(digest).decode()


def fallback_relay() -> list[dict]:
    username, credential = turn_credentials(FALLBACK_TURN_SECRET)
    return [
        {
            "urls": [
                f"turn:{FALLBACK_TURN_HOST}:80",
                f"turn:{FALLBACK_TURN_HOST}:80?transport=tcp",
                f"turn:{FALLBACK_TURN_HOST}:443",
                f"turn:{FALLBACK_TURN_HOST}:443?transport=tcp",
                f"turns:{FALLBACK_TURN_HOST}:443?transport=tcp",
            ],
            "username": username,
            "credential": credential,
        }
    ]


@router.get("/ice")
async def ice_servers(user: CurrentUser) -> dict:
    servers: list[dict] = [{"urls": settings.stun_urls}]
    if settings.turn_urls:
        if settings.turn_secret:
            # A shared secret deployment mints a fresh credential per client.
            username, credential = turn_credentials(settings.turn_secret)
        else:
            username, credential = settings.turn_username, settings.turn_credential
        servers.append(
            {"urls": settings.turn_urls, "username": username, "credential": credential}
        )
    else:
        servers.extend(fallback_relay())
    return {
        "iceServers": servers,
        "iceTransportPolicy": settings.ice_transport_policy,
        "iceCandidatePoolSize": settings.ice_candidate_pool_size,
        "hasTurn": True,
        "ttlSeconds": TURN_TTL_SECONDS,
    }


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
