from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select

from app.api.deps import CurrentUser, SessionDep, rate_limit_default
from app.core.config import settings
from app.db.models import Friendship, FriendRequest, RequestStatus, User, UserStats
from app.realtime import presence
from app.realtime.hub import hub
from app.schemas.social import FriendRequestCreate, FriendRequestView, FriendView
from app.services.moderation import is_blocked
from app.services.progression import title_for_level

router = APIRouter(prefix="/friends", tags=["friends"], dependencies=[Depends(rate_limit_default)])
MAX_FRIENDS = 500


async def _bundle(session: SessionDep, user_ids: list[int]) -> dict[int, tuple[User, UserStats]]:
    if not user_ids:
        return {}
    rows = await session.execute(
        select(User, UserStats).join(UserStats, UserStats.user_id == User.id).where(User.id.in_(user_ids))
    )
    return {row_user.id: (row_user, row_stats) for row_user, row_stats in rows.all()}


@router.get("", response_model=list[FriendView])
async def list_friends(user: CurrentUser, session: SessionDep) -> list[FriendView]:
    rows = await session.execute(select(Friendship).where(Friendship.user_id == user.id))
    links = list(rows.scalars())
    bundle = await _bundle(session, [link.friend_id for link in links])
    online = await presence.filter_online(list(bundle.keys()))
    activity = await presence.activities(list(online))

    views: list[FriendView] = []
    for link in links:
        pair = bundle.get(link.friend_id)
        if pair is None:
            continue
        friend, stats = pair
        views.append(
            FriendView.model_validate(
                {
                    "id": friend.id,
                    "anonName": link.alias or friend.anon_name,
                    "avatarSeed": friend.avatar_seed,
                    "alias": link.alias,
                    "level": stats.level,
                    "title": title_for_level(stats.level),
                    "favourite": link.favourite,
                    "isOnline": friend.id in online,
                    "activity": activity.get(friend.id),
                    "lastSeenAt": friend.last_seen_at,
                }
            )
        )
    views.sort(key=lambda item: (not item.is_online, not item.favourite, item.anon_name))
    return views


@router.get("/requests", response_model=list[FriendRequestView])
async def list_requests(user: CurrentUser, session: SessionDep) -> list[FriendRequestView]:
    rows = await session.execute(
        select(FriendRequest).where(
            ((FriendRequest.to_user_id == user.id) | (FriendRequest.from_user_id == user.id))
            & (FriendRequest.status == RequestStatus.pending)
        )
    )
    requests = list(rows.scalars())
    counterpart_ids = [
        item.from_user_id if item.to_user_id == user.id else item.to_user_id for item in requests
    ]
    bundle = await _bundle(session, counterpart_ids)

    views: list[FriendRequestView] = []
    for item in requests:
        incoming = item.to_user_id == user.id
        counterpart_id = item.from_user_id if incoming else item.to_user_id
        pair = bundle.get(counterpart_id)
        if pair is None:
            continue
        counterpart, stats = pair
        views.append(
            FriendRequestView.model_validate(
                {
                    "id": item.id,
                    "userId": counterpart.id,
                    "anonName": counterpart.anon_name,
                    "avatarSeed": counterpart.avatar_seed,
                    "level": stats.level,
                    "direction": "incoming" if incoming else "outgoing",
                    "message": item.message,
                    "createdAt": item.created_at,
                }
            )
        )
    return views


@router.post("/requests", response_model=FriendRequestView)
async def create_request(
    payload: FriendRequestCreate, user: CurrentUser, session: SessionDep
) -> FriendRequestView:
    if payload.user_id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot add yourself")
    target = await session.get(User, payload.user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if await is_blocked(session, user.id, target.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Unavailable")

    existing_link = await session.execute(
        select(Friendship.id).where(
            (Friendship.user_id == user.id) & (Friendship.friend_id == target.id)
        )
    )
    if existing_link.first() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Already friends")

    mirrored = await session.execute(
        select(FriendRequest).where(
            (FriendRequest.from_user_id == target.id)
            & (FriendRequest.to_user_id == user.id)
            & (FriendRequest.status == RequestStatus.pending)
        )
    )
    mirror = mirrored.scalar_one_or_none()
    if mirror is not None:
        await _accept(session, mirror, user.id)
        stats = await session.get(UserStats, target.id)
        return FriendRequestView.model_validate(
            {
                "id": mirror.id,
                "userId": target.id,
                "anonName": target.anon_name,
                "avatarSeed": target.avatar_seed,
                "level": stats.level if stats else 1,
                "direction": "accepted",
                "message": mirror.message,
                "createdAt": mirror.created_at,
            }
        )

    rows = await session.execute(
        select(FriendRequest).where(
            (FriendRequest.from_user_id == user.id) & (FriendRequest.to_user_id == target.id)
        )
    )
    request = rows.scalar_one_or_none()
    if request is None:
        request = FriendRequest(
            from_user_id=user.id, to_user_id=target.id, message=payload.message
        )
        session.add(request)
    else:
        request.status = RequestStatus.pending
        request.message = payload.message
    await session.flush()

    await hub.send_to_user(
        target.id,
        {
            "type": "friend.request",
            "payload": {
                "id": request.id,
                "userId": user.id,
                "anonName": user.anon_name,
                "avatarSeed": user.avatar_seed,
                "message": request.message,
            },
        },
    )
    stats = await session.get(UserStats, target.id)
    return FriendRequestView.model_validate(
        {
            "id": request.id,
            "userId": target.id,
            "anonName": target.anon_name,
            "avatarSeed": target.avatar_seed,
            "level": stats.level if stats else 1,
            "direction": "outgoing",
            "message": request.message,
            "createdAt": request.created_at,
        }
    )


async def _accept(session: SessionDep, request: FriendRequest, actor_id: int) -> None:
    request.status = RequestStatus.accepted
    for left, right in ((request.from_user_id, request.to_user_id), (request.to_user_id, request.from_user_id)):
        exists = await session.execute(
            select(Friendship.id).where(
                (Friendship.user_id == left) & (Friendship.friend_id == right)
            )
        )
        if exists.first() is None:
            session.add(Friendship(user_id=left, friend_id=right))
            stats = await session.get(UserStats, left)
            if stats:
                stats.friends_count += 1
    await session.flush()
    partner_id = request.from_user_id if actor_id == request.to_user_id else request.to_user_id
    await hub.send_to_user(
        partner_id, {"type": "friend.accepted", "payload": {"userId": actor_id}}
    )


@router.post("/requests/{request_id}/accept")
async def accept_request(request_id: int, user: CurrentUser, session: SessionDep) -> dict:
    request = await session.get(FriendRequest, request_id)
    if request is None or request.to_user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    if request.status != RequestStatus.pending:
        raise HTTPException(status.HTTP_409_CONFLICT, "Request is closed")
    await _accept(session, request, user.id)
    return {"ok": True}


@router.post("/requests/{request_id}/decline")
async def decline_request(request_id: int, user: CurrentUser, session: SessionDep) -> dict:
    request = await session.get(FriendRequest, request_id)
    if request is None or user.id not in (request.to_user_id, request.from_user_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    request.status = (
        RequestStatus.declined if request.to_user_id == user.id else RequestStatus.cancelled
    )
    return {"ok": True}


@router.delete("/{friend_id}")
async def remove_friend(friend_id: int, user: CurrentUser, session: SessionDep) -> dict:
    await session.execute(
        delete(Friendship).where(
            ((Friendship.user_id == user.id) & (Friendship.friend_id == friend_id))
            | ((Friendship.user_id == friend_id) & (Friendship.friend_id == user.id))
        )
    )
    for owner_id in (user.id, friend_id):
        stats = await session.get(UserStats, owner_id)
        if stats:
            stats.friends_count = max(0, stats.friends_count - 1)
    return {"ok": True}


@router.post("/{friend_id}/favourite")
async def toggle_favourite(friend_id: int, user: CurrentUser, session: SessionDep) -> dict:
    rows = await session.execute(
        select(Friendship).where(
            (Friendship.user_id == user.id) & (Friendship.friend_id == friend_id)
        )
    )
    link = rows.scalar_one_or_none()
    if link is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not a friend")
    link.favourite = not link.favourite
    return {"favourite": link.favourite}


@router.get("/invite")
async def invite_link(user: CurrentUser) -> dict:
    bot = settings.telegram_bot_username or "your_bot"
    return {
        "url": f"https://t.me/{bot}/app?startapp=ref_{user.referral_code}",
        "shareUrl": (
            f"https://t.me/share/url?url=https://t.me/{bot}/app?startapp=ref_{user.referral_code}"
        ),
        "code": user.referral_code,
    }
