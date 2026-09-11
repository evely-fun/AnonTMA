from dataclasses import dataclass

BASE_XP = 80
CURVE = 1.55
MAX_LEVEL = 120

LEVEL_TITLES = [
    (1, "Newcomer"),
    (5, "Talker"),
    (10, "Companion"),
    (18, "Storyteller"),
    (28, "Voice Master"),
    (40, "Night Owl"),
    (55, "Legend"),
    (75, "Mythic"),
    (100, "Immortal"),
]


@dataclass(slots=True)
class Progress:
    level: int
    xp: int
    xp_into_level: int
    xp_for_next: int
    ratio: float
    title: str


def xp_for_level(level: int) -> int:
    if level <= 1:
        return 0
    return int(BASE_XP * ((level - 1) ** CURVE))


def level_for_xp(xp: int) -> int:
    level = 1
    while level < MAX_LEVEL and xp >= xp_for_level(level + 1):
        level += 1
    return level


def title_for_level(level: int) -> str:
    title = LEVEL_TITLES[0][1]
    for threshold, name in LEVEL_TITLES:
        if level >= threshold:
            title = name
    return title


def describe(xp: int) -> Progress:
    level = level_for_xp(xp)
    current = xp_for_level(level)
    following = xp_for_level(level + 1)
    span = max(following - current, 1)
    into = max(xp - current, 0)
    return Progress(
        level=level,
        xp=xp,
        xp_into_level=into,
        xp_for_next=span,
        ratio=min(into / span, 1.0),
        title=title_for_level(level),
    )


def dialog_reward(duration_seconds: int, liked: bool, mode: str) -> tuple[int, int]:
    minutes = duration_seconds / 60
    base = 6 if mode == "voice" else 4
    xp = int(min(base * minutes, 140))
    if liked:
        xp += 15
    coins = max(1, xp // 4)
    return xp, coins


def game_reward(won: bool, placement: int, players: int, score: int) -> tuple[int, int]:
    xp = 25 if won else 10
    if players > 1 and placement > 0:
        xp += max(0, (players - placement) * 6)
    xp += min(score // 10, 40)
    coins = max(1, xp // 3)
    return xp, coins


def rating_delta(won: bool, own_rating: int, opponent_rating: int, k: int = 24) -> int:
    expected = 1 / (1 + 10 ** ((opponent_rating - own_rating) / 400))
    actual = 1.0 if won else 0.0
    return round(k * (actual - expected))
