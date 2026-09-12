import asyncio
import uuid

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.core.rate_limit import consume
from app.core.security import TokenError, decode_token
from app.db.base import utcnow
from app.db.models import Friendship, Room, User
from app.db.session import SessionLocal
from app.games import runtime as games
from app.realtime import matchmaking, presence, rooms, sessions, signaling
from app.realtime.hub import Connection, hub
from app.realtime.protocol import decode, error, event
from app.services import economy
from app.services.shop import equipped_of
from app.services.moderation import blocked_ids, looks_like_spam, sanitize_text, submit_report
from app.services.users import touch_presence

logger = get_logger("gateway")
router = APIRouter()

DISCONNECT_GRACE_SECONDS = 12
MESSAGE_LIMIT = 4000


async def _authenticate(token: str) -> int | None:
    try:
        claims = decode_token(token, "access")
    except TokenError:
        return None
    return int(claims["sub"])


async def _load_user(session: AsyncSession, user_id: int) -> User | None:
    user = await session.get(User, user_id)
    if user is None or (user.is_banned and (user.banned_until is None or user.banned_until > utcnow())):
        return None
    return user


class Session:
    def __init__(self, connection: Connection, user: User) -> None:
        self.connection = connection
        self.user = user
        self.user_id = user.id

    async def send(self, frame: dict) -> None:
        await self.connection.send(frame)

    async def handle(self, kind: str, payload: dict, ack: str | None) -> None:
        handler = HANDLERS.get(kind)
        if handler is None:
            await self.send(error("unknown_type", f"Unsupported message {kind}", ack))
            return
        await handler(self, payload, ack)


async def handle_ping(session: Session, payload: dict, ack: str | None) -> None:
    await presence.heartbeat(session.user_id)
    await session.send(event("pong", {"online": await presence.count_online()}, ack))


async def handle_presence(session: Session, payload: dict, ack: str | None) -> None:
    activity = str(payload.get("activity", "idle"))[:24]
    await presence.set_activity(session.user_id, activity)
    await session.send(event("presence.snapshot", await presence.snapshot(), ack))


async def handle_match_start(session: Session, payload: dict, ack: str | None) -> None:
    mode = "voice" if payload.get("mode") == "voice" else "text"
    if await sessions.active_dialog_id(session.user_id):
        await session.send(error("busy", "Finish the current chat first", ack))
        return

    async with SessionLocal() as db:
        user = await _load_user(db, session.user_id)
        if user is None:
            await session.send(error("forbidden", "Account restricted", ack))
            return

        from app.db.models import UserStats

        stats = await db.get(UserStats, user.id)
        premium = economy.is_premium(user)
        if stats is not None:
            economy.regenerate(stats, premium)
            cost = economy.ENERGY_COST.get(mode, 4)
            if not economy.spend(stats, premium, cost):
                await db.commit()
                await session.send(
                    error("no_energy", f"Not enough energy, {cost} needed", ack)
                )
                return
            await db.commit()

        blocked = list(await blocked_ids(db, user.id))
        preferences = user.preferences or {}
        ticket = matchmaking.Ticket(
            user_id=user.id,
            mode=mode,
            language=user.language or "en",
            gender=user.gender or "unknown",
            want_language=str(payload.get("language") or preferences.get("matchLanguage", "any")),
            want_gender=str(payload.get("gender") or preferences.get("matchGender", "any")),
            interests=[str(item)[:24] for item in (user.interests or [])][:12],
            blocked=blocked[:200],
        )

    await matchmaking.enqueue(ticket)
    await presence.set_activity(session.user_id, f"searching:{mode}")
    partner = await matchmaking.find_partner(ticket)
    if partner is None:
        partner = await matchmaking.find_partner(ticket, allow_recent=True) if payload.get("relaxed") else None

    if partner is None:
        await session.send(
            event(
                "match.searching",
                {"mode": mode, "queue": await matchmaking.queue_size(mode), "position": await matchmaking.position(session.user_id, mode)},
                ack,
            )
        )
        return

    await _pair(session.user_id, partner.user_id, mode)


async def _pair(first_id: int, second_id: int, mode: str) -> None:
    async with SessionLocal() as db:
        first = await db.get(User, first_id)
        second = await db.get(User, second_id)
        if first is None or second is None:
            return
        dialog = await sessions.create_dialog(db, first_id, second_id, mode, first.language)
        await db.commit()
        dialog_id = dialog.id
        cosmetics = {first_id: equipped_of(first), second_id: equipped_of(second)}

    await signaling.link_peers(first_id, second_id)
    await presence.set_activity(first_id, f"chatting:{mode}")
    await presence.set_activity(second_id, f"chatting:{mode}")

    for owner, partner, polite in ((first_id, second_id, True), (second_id, first_id, False)):
        await hub.send_to_user(
            owner,
            event(
                "match.found",
                {
                    "dialogId": dialog_id,
                    "mode": mode,
                    "partnerId": partner,
                    "partner": sessions.mask_for(dialog_id, partner, cosmetics=cosmetics[partner]),
                    "you": sessions.mask_for(dialog_id, owner, cosmetics=cosmetics[owner]),
                    "polite": polite,
                    "iceReady": True,
                },
            ),
        )


async def handle_match_cancel(session: Session, payload: dict, ack: str | None) -> None:
    await matchmaking.dequeue_all(session.user_id)
    await presence.set_activity(session.user_id, "idle")
    await session.send(event("match.cancelled", {}, ack))


async def _require_dialog(session: Session) -> tuple[int, dict] | None:
    dialog_id = await sessions.active_dialog_id(session.user_id)
    if dialog_id is None:
        return None
    state = await sessions.read_state(dialog_id)
    if state is None:
        return None
    return dialog_id, state


async def handle_dialog_message(session: Session, payload: dict, ack: str | None) -> None:
    found = await _require_dialog(session)
    if found is None:
        await session.send(error("no_dialog", "No active conversation", ack))
        return
    dialog_id, state = found
    partner_id = sessions.partner_of(state, session.user_id)
    if partner_id is None:
        return

    text = sanitize_text(str(payload.get("text", "")), MESSAGE_LIMIT)
    if not text:
        return
    if looks_like_spam(text):
        await session.send(error("blocked_content", "Links and spam are not allowed", ack))
        return

    async with SessionLocal() as db:
        message = await sessions.store_message(db, dialog_id, session.user_id, "text", text, {})
        await db.commit()
        message_id = message.id
        created = message.created_at.isoformat()

    frame = event(
        "dialog.message",
        {
            "id": message_id,
            "dialogId": dialog_id,
            "text": text,
            "from": session.user_id,
            "createdAt": created,
        },
    )
    await session.send({**frame, "ack": ack} if ack else frame)
    await hub.send_to_user(partner_id, frame)


async def handle_dialog_typing(session: Session, payload: dict, ack: str | None) -> None:
    found = await _require_dialog(session)
    if found is None:
        return
    dialog_id, state = found
    partner_id = sessions.partner_of(state, session.user_id)
    if partner_id:
        await hub.send_to_user(
            partner_id,
            event("dialog.typing", {"dialogId": dialog_id, "typing": bool(payload.get("typing"))}),
        )


async def handle_dialog_signal(session: Session, payload: dict, ack: str | None) -> None:
    found = await _require_dialog(session)
    if found is None:
        return
    dialog_id, state = found
    partner_id = sessions.partner_of(state, session.user_id)
    if partner_id is None:
        return
    kind = str(payload.get("event", ""))[:24]
    if kind not in ("mic_on", "mic_off", "speaking", "silent", "noise_level"):
        return
    await hub.send_to_user(
        partner_id,
        event("dialog.signal", {"dialogId": dialog_id, "event": kind, "value": payload.get("value")}),
    )


async def handle_dialog_like(session: Session, payload: dict, ack: str | None) -> None:
    found = await _require_dialog(session)
    if found is None:
        return
    dialog_id, state = found
    partner_id = sessions.partner_of(state, session.user_id)
    async with SessionLocal() as db:
        mutual = await sessions.set_like(db, dialog_id, session.user_id)
        await db.commit()
    await session.send(event("dialog.liked", {"mutual": mutual}, ack))
    if partner_id:
        await hub.send_to_user(partner_id, event("dialog.partner_liked", {"mutual": mutual}))


async def handle_dialog_reveal(session: Session, payload: dict, ack: str | None) -> None:
    found = await _require_dialog(session)
    if found is None:
        return
    dialog_id, state = found
    partner_id = sessions.partner_of(state, session.user_id)
    if partner_id is None:
        return

    from app.core.redis_client import get_redis

    client = get_redis()
    key = f"dialog:reveal:{dialog_id}"
    await client.sadd(key, str(session.user_id))
    await client.expire(key, 3600)
    agreed = int(await client.scard(key))

    if agreed < 2:
        await hub.send_to_user(partner_id, event("dialog.reveal_request", {"dialogId": dialog_id}))
        await session.send(event("dialog.reveal_pending", {"dialogId": dialog_id}, ack))
        return

    async with SessionLocal() as db:
        first = await db.get(User, session.user_id)
        second = await db.get(User, partner_id)
        if first is None or second is None:
            return
        payload_first = {"userId": second.id, "anonName": second.anon_name, "username": second.username}
        payload_second = {"userId": first.id, "anonName": first.anon_name, "username": first.username}

    await session.send(event("dialog.revealed", payload_first, ack))
    await hub.send_to_user(partner_id, event("dialog.revealed", payload_second))


async def _close_dialog(user_id: int, reason: str) -> int | None:
    dialog_id = await sessions.active_dialog_id(user_id)
    if dialog_id is None:
        return None
    state = await sessions.read_state(dialog_id)
    partner_id = sessions.partner_of(state, user_id) if state else None

    async with SessionLocal() as db:
        summary = await sessions.end_dialog(db, dialog_id, user_id)
        await db.commit()

    if partner_id:
        await signaling.unlink_peers(user_id, partner_id)
        await presence.set_activity(partner_id, "idle")
        await hub.send_to_user(
            partner_id,
            event(
                "dialog.ended",
                {
                    "dialogId": dialog_id,
                    "reason": reason,
                    "durationSeconds": summary.get("durationSeconds", 0),
                    "reward": summary.get("rewards", {}).get(partner_id, {}),
                    "mutualLike": summary.get("mutualLike", False),
                },
            ),
        )
    await presence.set_activity(user_id, "idle")
    await hub.send_to_user(
        user_id,
        event(
            "dialog.ended",
            {
                "dialogId": dialog_id,
                "reason": "self" if reason == "left" else reason,
                "durationSeconds": summary.get("durationSeconds", 0),
                "reward": summary.get("rewards", {}).get(user_id, {}),
                "mutualLike": summary.get("mutualLike", False),
            },
        ),
    )
    return dialog_id


async def handle_dialog_end(session: Session, payload: dict, ack: str | None) -> None:
    await _close_dialog(session.user_id, "left")
    await session.send(event("dialog.closed", {}, ack))


async def handle_dialog_next(session: Session, payload: dict, ack: str | None) -> None:
    state = await _require_dialog(session)
    mode = "text"
    if state is not None:
        mode = state[1].get("mode", "text")
    await _close_dialog(session.user_id, "skipped")
    await handle_match_start(session, {"mode": payload.get("mode", mode)}, ack)


async def handle_dialog_report(session: Session, payload: dict, ack: str | None) -> None:
    found = await _require_dialog(session)
    if found is None:
        return
    dialog_id, state = found
    partner_id = sessions.partner_of(state, session.user_id)
    if partner_id is None:
        return
    async with SessionLocal() as db:
        await submit_report(
            db,
            reporter_id=session.user_id,
            target_id=partner_id,
            reason=str(payload.get("reason", "other")),
            scope="dialog",
            scope_id=dialog_id,
            details=str(payload.get("details", ""))[:500],
        )
        await db.commit()
    await session.send(event("dialog.reported", {"dialogId": dialog_id}, ack))
    await _close_dialog(session.user_id, "reported")


async def handle_room_join(session: Session, payload: dict, ack: str | None) -> None:
    room_id = int(payload.get("roomId", 0) or 0)
    async with SessionLocal() as db:
        room = await db.get(Room, room_id)
        if room is None or not room.is_active:
            await session.send(error("not_found", "Room is closed", ack))
            return
        members = await rooms.member_map(room_id)
        rejoining = session.user_id in members
        if not rejoining and len(members) >= min(
            room.max_participants, settings.max_room_participants
        ):
            await session.send(error("room_full", "Room is full", ack))
            return
        if await rooms.is_kicked(room_id, session.user_id):
            await session.send(error("room_kicked", "You were removed from this room", ack))
            return
        user = await _load_user(db, session.user_id)
        if user is None:
            return
        entry = await rooms.join(db, room, user)
        await db.commit()

    hub.join(session.connection, rooms.topic(room_id))
    members = await rooms.member_map(room_id)
    await signaling.link_peers(*members.keys())
    await presence.set_activity(session.user_id, f"room:{room_id}")

    await session.send(
        event(
            "room.joined",
            {
                "roomId": room_id,
                "you": entry,
                "members": list(members.values()),
                "peers": [uid for uid in members if uid != session.user_id],
            },
            ack,
        )
    )
    await hub.broadcast(
        rooms.topic(room_id),
        event("room.member_joined", {"roomId": room_id, "member": entry}),
        exclude=session.connection.id,
    )


async def handle_room_leave(session: Session, payload: dict, ack: str | None) -> None:
    room_id = int(payload.get("roomId", 0) or 0) or (await rooms.current_room(session.user_id) or 0)
    if not room_id:
        return
    async with SessionLocal() as db:
        await rooms.leave(db, room_id, session.user_id)
        await db.commit()
    hub.leave(session.connection, rooms.topic(room_id))
    members = await rooms.member_map(room_id)
    await signaling.unlink_peers(session.user_id, *members.keys())
    await presence.set_activity(session.user_id, "idle")
    await hub.broadcast(
        rooms.topic(room_id), event("room.member_left", {"roomId": room_id, "userId": session.user_id})
    )
    await session.send(event("room.left", {"roomId": room_id}, ack))


async def handle_room_state(session: Session, payload: dict, ack: str | None) -> None:
    room_id = int(payload.get("roomId", 0) or 0)
    current = (await rooms.member_map(room_id)).get(session.user_id)
    changes: dict = {}
    if "muted" in payload:
        wanted = bool(payload["muted"])
        if current and current.get("forcedMute") and not wanted:
            await session.send(error("force_muted", "The host muted you", ack))
            return
        changes["muted"] = wanted
    if "hand" in payload:
        changes["hand"] = bool(payload["hand"])
    if not changes:
        return
    entry = await rooms.update_member(room_id, session.user_id, **changes)
    if entry is None:
        return
    await hub.broadcast(
        rooms.topic(room_id), event("room.member_updated", {"roomId": room_id, "member": entry})
    )


async def handle_room_message(session: Session, payload: dict, ack: str | None) -> None:
    room_id = int(payload.get("roomId", 0) or 0)
    if await rooms.current_room(session.user_id) != room_id:
        return
    text = sanitize_text(str(payload.get("text", "")), 600)
    if not text or looks_like_spam(text):
        return
    async with SessionLocal() as db:
        message = await sessions.store_message(db, room_id, session.user_id, "text", text, {"scope": "room"})
        message.scope = "room"
        await db.commit()
        message_id = message.id
    await hub.broadcast(
        rooms.topic(room_id),
        event(
            "room.message",
            {
                "id": message_id,
                "roomId": room_id,
                "from": session.user_id,
                "anonName": session.user.anon_name,
                "text": text,
            },
        ),
    )


ROOM_ACTIONS = ("mute", "unmute", "kick", "promote", "demote", "transfer")


async def handle_room_moderate(session: Session, payload: dict, ack: str | None) -> None:
    room_id = int(payload.get("roomId", 0) or 0)
    target_id = int(payload.get("userId", 0) or 0)
    action = str(payload.get("action", ""))

    if action not in ROOM_ACTIONS or not room_id or not target_id:
        await session.send(error("bad_request", "Unknown action", ack))
        return
    if target_id == session.user_id:
        await session.send(error("bad_request", "Pick another member", ack))
        return

    members = await rooms.member_map(room_id)
    actor = members.get(session.user_id)
    target = members.get(target_id)
    if actor is None or target is None:
        await session.send(error("not_found", "Member is not in the room", ack))
        return
    if actor.get("role") not in ("host", "cohost"):
        await session.send(error("forbidden", "Only the host can do that", ack))
        return
    if target.get("role") == "host":
        await session.send(error("forbidden", "The host cannot be moderated", ack))
        return
    if action in ("promote", "demote", "transfer") and actor.get("role") != "host":
        await session.send(error("forbidden", "Only the host can do that", ack))
        return

    if action == "kick":
        async with SessionLocal() as db:
            await rooms.kick(room_id, target_id)
            await rooms.leave(db, room_id, target_id)
            await db.commit()
        await signaling.unlink_peers(target_id, *members.keys())
        await hub.send_to_user(
            target_id, event("room.kicked", {"roomId": room_id, "by": session.user_id})
        )
        await hub.broadcast(
            rooms.topic(room_id),
            event("room.member_left", {"roomId": room_id, "userId": target_id}),
        )
        await session.send(event("room.moderated", {"action": action, "userId": target_id}, ack))
        return

    if action == "transfer":
        async with SessionLocal() as db:
            room = await db.get(Room, room_id)
            if room is not None:
                room.owner_id = target_id
                await db.commit()
        promoted = await rooms.update_member(room_id, target_id, role="host")
        demoted = await rooms.update_member(room_id, session.user_id, role="member")
        for entry in (promoted, demoted):
            if entry is not None:
                await hub.broadcast(
                    rooms.topic(room_id),
                    event("room.member_updated", {"roomId": room_id, "member": entry}),
                )
        await session.send(event("room.moderated", {"action": action, "userId": target_id}, ack))
        return

    changes: dict = {}
    if action == "mute":
        changes = {"muted": True, "forcedMute": True}
    elif action == "unmute":
        changes = {"forcedMute": False}
    elif action == "promote":
        changes = {"role": "cohost"}
    elif action == "demote":
        changes = {"role": "member"}

    entry = await rooms.update_member(room_id, target_id, **changes)
    if entry is None:
        await session.send(error("not_found", "Member is not in the room", ack))
        return

    await hub.broadcast(
        rooms.topic(room_id), event("room.member_updated", {"roomId": room_id, "member": entry})
    )
    await hub.send_to_user(
        target_id, event("room.moderation", {"roomId": room_id, "action": action})
    )
    await session.send(event("room.moderated", {"action": action, "userId": target_id}, ack))


async def handle_room_report(session: Session, payload: dict, ack: str | None) -> None:
    room_id = int(payload.get("roomId", 0) or 0)
    target_id = int(payload.get("userId", 0) or 0)
    if not room_id or not target_id or target_id == session.user_id:
        return
    members = await rooms.member_map(room_id)
    if session.user_id not in members or target_id not in members:
        return
    async with SessionLocal() as db:
        await submit_report(
            db,
            reporter_id=session.user_id,
            target_id=target_id,
            reason=str(payload.get("reason", "other")),
            scope="room",
            scope_id=room_id,
            details=str(payload.get("details", ""))[:500],
        )
        await db.commit()
    await session.send(event("room.reported", {"userId": target_id}, ack))


async def handle_rtc(session: Session, payload: dict, ack: str | None) -> None:
    kind = str(payload.get("kind", ""))
    if not await signaling.relay(session.user_id, kind, payload):
        await session.send(error("signal_rejected", "Peer is not reachable", ack))


async def handle_call_invite(session: Session, payload: dict, ack: str | None) -> None:
    target_id = int(payload.get("userId", 0) or 0)
    mode = "voice" if payload.get("mode") != "text" else "text"
    if target_id <= 0 or target_id == session.user_id:
        return

    async with SessionLocal() as db:
        link = await db.execute(
            select(Friendship.id).where(
                (Friendship.user_id == session.user_id) & (Friendship.friend_id == target_id)
            )
        )
        if link.first() is None:
            await session.send(error("not_friend", "You can call friends only", ack))
            return
        target = await db.get(User, target_id)
        if target is None or not (target.preferences or {}).get("allowFriendCalls", True):
            await session.send(error("unavailable", "User is not accepting calls", ack))
            return

    if not await presence.is_online(target_id):
        await session.send(error("offline", "Friend is offline", ack))
        return
    if await signaling.active_call(target_id):
        await session.send(error("busy", "Friend is already on a call", ack))
        return

    call_id = await signaling.create_call(session.user_id, target_id, mode)
    await signaling.link_peers(session.user_id, target_id)
    await session.send(event("call.ringing", {"callId": call_id, "userId": target_id, "mode": mode}, ack))
    await hub.send_to_user(
        target_id,
        event(
            "call.incoming",
            {
                "callId": call_id,
                "mode": mode,
                "from": {
                    "userId": session.user_id,
                    "anonName": session.user.anon_name,
                    "avatarSeed": session.user.avatar_seed,
                },
            },
        ),
    )


async def handle_call_answer(session: Session, payload: dict, ack: str | None) -> None:
    call_id = str(payload.get("callId", ""))[:64]
    accept = bool(payload.get("accept"))
    call = await signaling.read_call(call_id)
    if call is None or session.user_id not in (call["caller"], call["callee"]):
        await session.send(error("call_gone", "Call is no longer available", ack))
        return

    other = call["caller"] if session.user_id == call["callee"] else call["callee"]
    if accept:
        await signaling.mark_accepted(call_id)
        await hub.send_to_user(other, event("call.accepted", {"callId": call_id, "polite": True}))
        await session.send(event("call.accepted", {"callId": call_id, "polite": False}, ack))
        await presence.set_activity(session.user_id, "call")
        await presence.set_activity(other, "call")
    else:
        await signaling.close_call(call_id)
        await signaling.unlink_peers(session.user_id, other)
        await hub.send_to_user(other, event("call.declined", {"callId": call_id}))
        await session.send(event("call.declined", {"callId": call_id}, ack))


async def handle_call_end(session: Session, payload: dict, ack: str | None) -> None:
    call_id = str(payload.get("callId", "")) or (await signaling.active_call(session.user_id) or "")
    if not call_id:
        return
    call = await signaling.close_call(call_id)
    if call is None:
        return
    other = call["caller"] if session.user_id == call["callee"] else call["callee"]
    await signaling.unlink_peers(session.user_id, other)
    await presence.set_activity(session.user_id, "idle")
    await presence.set_activity(other, "idle")
    await hub.send_to_user(other, event("call.ended", {"callId": call_id}))
    await session.send(event("call.ended", {"callId": call_id}, ack))


async def handle_game_create(session: Session, payload: dict, ack: str | None) -> None:
    game_key = str(payload.get("gameKey", ""))[:32]
    room_id = int(payload.get("roomId", 0) or 0) or None
    options = payload.get("options") if isinstance(payload.get("options"), dict) else {}

    players: list[int] = [session.user_id]
    if room_id:
        members = await rooms.member_map(room_id)
        players = list(members.keys())
        if session.user_id not in players:
            await session.send(error("not_in_room", "Join the room first", ack))
            return

    created = await games.create_game(game_key, session.user_id, players, room_id, options or {})
    if created is None:
        await session.send(error("bad_game", "Wrong game or player count", ack))
        return

    game_id = created["gameId"]
    hub.join(session.connection, games.topic(game_id))
    for player in players:
        await hub.send_to_user(
            player,
            event("game.created", {"gameId": game_id, "gameKey": game_key, "players": players, "host": session.user_id}),
        )
    if room_id:
        await hub.broadcast(rooms.topic(room_id), event("room.game", {"gameId": game_id, "gameKey": game_key}))

    if len(players) == 1:
        await games.start_game(game_id)
    else:
        await games.push_state(game_id)


async def handle_game_join(session: Session, payload: dict, ack: str | None) -> None:
    game_id = int(payload.get("gameId", 0) or 0)
    hub.join(session.connection, games.topic(game_id))
    snapshot = await games.snapshot(game_id, session.user_id)
    if snapshot is None:
        await session.send(error("game_gone", "Game is over", ack))
        return
    await session.send(event("game.state", snapshot, ack))


async def handle_game_start(session: Session, payload: dict, ack: str | None) -> None:
    game_id = int(payload.get("gameId", 0) or 0)
    if not await games.start_game(game_id):
        await session.send(error("cannot_start", "Game cannot start yet", ack))


async def handle_game_action(session: Session, payload: dict, ack: str | None) -> None:
    game_id = int(payload.get("gameId", 0) or 0)
    action = str(payload.get("action", ""))[:32]
    body = payload.get("payload") if isinstance(payload.get("payload"), dict) else {}
    await games.handle_action(game_id, session.user_id, action, body or {})


async def handle_game_leave(session: Session, payload: dict, ack: str | None) -> None:
    game_id = int(payload.get("gameId", 0) or 0)
    hub.leave(session.connection, games.topic(game_id))
    await games.handle_leave(game_id, session.user_id)


HANDLERS = {
    "ping": handle_ping,
    "presence.update": handle_presence,
    "match.start": handle_match_start,
    "match.cancel": handle_match_cancel,
    "dialog.message": handle_dialog_message,
    "dialog.typing": handle_dialog_typing,
    "dialog.signal": handle_dialog_signal,
    "dialog.like": handle_dialog_like,
    "dialog.reveal": handle_dialog_reveal,
    "dialog.end": handle_dialog_end,
    "dialog.next": handle_dialog_next,
    "dialog.report": handle_dialog_report,
    "room.join": handle_room_join,
    "room.leave": handle_room_leave,
    "room.state": handle_room_state,
    "room.message": handle_room_message,
    "room.moderate": handle_room_moderate,
    "room.report": handle_room_report,
    "rtc.signal": handle_rtc,
    "call.invite": handle_call_invite,
    "call.answer": handle_call_answer,
    "call.end": handle_call_end,
    "game.create": handle_game_create,
    "game.join": handle_game_join,
    "game.start": handle_game_start,
    "game.action": handle_game_action,
    "game.leave": handle_game_leave,
}


async def _bootstrap(session: Session) -> None:
    dialog_id = await sessions.active_dialog_id(session.user_id)
    dialog_payload = None
    if dialog_id:
        state = await sessions.read_state(dialog_id)
        if state:
            partner_id = sessions.partner_of(state, session.user_id)
            dialog_payload = {
                "dialogId": dialog_id,
                "mode": state.get("mode"),
                "partnerId": partner_id,
                "partner": sessions.mask_for(dialog_id, partner_id) if partner_id else None,
            }

    room_id = await rooms.current_room(session.user_id)
    if room_id:
        hub.join(session.connection, rooms.topic(room_id))

    await session.send(
        event(
            "ready",
            {
                "userId": session.user_id,
                "anonName": session.user.anon_name,
                "dialog": dialog_payload,
                "roomId": room_id,
                "presence": await presence.snapshot(),
                "serverTime": utcnow().isoformat(),
            },
        )
    )


async def _cleanup(user_id: int, connection: Connection) -> None:
    last = await presence.mark_offline(user_id, connection.id)
    hub.unregister(connection)
    if not last:
        return

    await matchmaking.dequeue_all(user_id)
    await asyncio.sleep(DISCONNECT_GRACE_SECONDS)
    if await presence.is_online(user_id):
        return

    room_id = await rooms.current_room(user_id)
    if room_id:
        async with SessionLocal() as db:
            await rooms.leave(db, room_id, user_id)
            await db.commit()
        await hub.broadcast(
            rooms.topic(room_id), event("room.member_left", {"roomId": room_id, "userId": user_id})
        )

    call_id = await signaling.active_call(user_id)
    if call_id:
        call = await signaling.close_call(call_id)
        if call:
            other = call["caller"] if user_id == call["callee"] else call["callee"]
            await hub.send_to_user(other, event("call.ended", {"callId": call_id, "reason": "peer_left"}))

    await _close_dialog(user_id, "disconnected")
    await signaling.unlink_peers(user_id)


@router.websocket("/ws")
async def websocket_endpoint(socket: WebSocket, token: str = Query(default="")) -> None:
    user_id = await _authenticate(token)
    if user_id is None:
        await socket.close(code=4401)
        return

    async with SessionLocal() as db:
        user = await _load_user(db, user_id)
        if user is None:
            await socket.close(code=4403)
            return
        await touch_presence(db, user)
        await db.commit()
        await db.refresh(user)

    await socket.accept()
    connection = Connection(uuid.uuid4().hex, user_id, socket)
    hub.register(connection)
    await presence.mark_online(user_id, connection.id)
    session = Session(connection, user)
    await _bootstrap(session)

    try:
        while True:
            raw = await socket.receive_text()
            if not await consume(f"ws:{user_id}", settings.rate_limit_ws_messages_per_10s, 10):
                await session.send(error("rate_limited", "Slow down"))
                continue
            envelope = decode(raw)
            if envelope is None:
                await session.send(error("bad_frame", "Malformed message"))
                continue
            try:
                await session.handle(envelope.type, envelope.payload, envelope.ack)
            except Exception as exc:
                logger.warning("handler failed", type=envelope.type, error=str(exc))
                await session.send(error("internal", "Something went wrong", envelope.ack))
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.info("socket closed", error=str(exc))
    finally:
        connection.closed = True
        await _cleanup(user_id, connection)
