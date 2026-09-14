from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.models import StaffRole, TicketTopic, User

# Higher numbers can do everything the numbers below them can.
RANK = {
    StaffRole.none: 0,
    StaffRole.helper: 1,
    StaffRole.moderator: 2,
    StaffRole.admin: 3,
    StaffRole.owner: 4,
}

# What each rank is actually allowed to touch. Moderation and support are
# deliberately separate ladders: a moderator handles reports and nothing else,
# a helper answers questions and never sees a case.
RIGHTS: dict[str, set[str]] = {
    StaffRole.none: set(),
    StaffRole.helper: {"support.app"},
    StaffRole.moderator: {"moderation.queue", "moderation.act"},
    StaffRole.admin: {
        "moderation.queue",
        "moderation.act",
        "support.app",
        "support.all",
        "staff.assign",
        "economy.grant",
    },
    StaffRole.owner: {
        "moderation.queue",
        "moderation.act",
        "support.app",
        "support.all",
        "staff.assign",
        "staff.assign_admin",
        "economy.grant",
    },
}

# Which queue a topic lands in. Anything about how the app or a game works is
# a helper's job, money and breakage are not.
HELPER_TOPICS = {TicketTopic.app, TicketTopic.game}
ADMIN_TOPICS = {TicketTopic.technical, TicketTopic.shop, TicketTopic.report}


def role_of(user: User) -> str:
    """The owner list in the environment always wins over the stored column."""
    if str(user.tg_id) in set(settings.admin_tg_ids):
        return StaffRole.owner
    return user.staff_role or StaffRole.none


def rank_of(user: User) -> int:
    return RANK.get(role_of(user), 0)


def can(user: User, right: str) -> bool:
    return right in RIGHTS.get(role_of(user), set())


def is_staff(user: User) -> bool:
    return rank_of(user) > 0


def topics_for(user: User) -> set[str]:
    """The set of ticket topics this person is allowed to read."""
    if can(user, "support.all"):
        return set(TicketTopic)
    if can(user, "support.app"):
        return set(HELPER_TOPICS)
    return set()


async def set_role(
    session: AsyncSession, actor: User, target_id: int, role: str
) -> tuple[bool, str]:
    if role not in RANK:
        return False, "unknown_role"
    if not can(actor, "staff.assign"):
        return False, "not_allowed"
    # Only an owner hands out admin, and nobody hands out owner from here.
    if role == StaffRole.owner:
        return False, "owner_is_fixed"
    if role == StaffRole.admin and not can(actor, "staff.assign_admin"):
        return False, "owner_only"

    target = await session.get(User, target_id)
    if target is None:
        return False, "no_such_user"
    if rank_of(target) >= rank_of(actor) and target.id != actor.id:
        return False, "outranked"

    target.staff_role = role
    return True, role


async def roster(session: AsyncSession) -> list[dict]:
    rows = await session.execute(
        select(User).where(User.staff_role != StaffRole.none).order_by(User.id)
    )
    return [
        {
            "userId": user.id,
            "anonName": user.anon_name,
            "avatarSeed": user.avatar_seed,
            "role": role_of(user),
        }
        for user in rows.scalars()
    ]
