from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Friendship, UserStats


async def are_friends(session: AsyncSession, first_id: int, second_id: int) -> bool:
    rows = await session.execute(
        select(Friendship.id).where(
            (Friendship.user_id == first_id) & (Friendship.friend_id == second_id)
        )
    )
    return rows.first() is not None


async def link_friends(session: AsyncSession, first_id: int, second_id: int) -> bool:
    """Create the pair of rows that make a mutual friendship. Idempotent."""
    if first_id == second_id:
        return False
    if await are_friends(session, first_id, second_id):
        return True

    session.add(Friendship(user_id=first_id, friend_id=second_id))
    session.add(Friendship(user_id=second_id, friend_id=first_id))
    for user_id in (first_id, second_id):
        stats = await session.get(UserStats, user_id)
        if stats is not None:
            stats.friends_count += 1
    await session.flush()
    return True
