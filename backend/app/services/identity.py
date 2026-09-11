import hashlib
import secrets

ADJECTIVES_EN = [
    "Silent", "Velvet", "Neon", "Crimson", "Lunar", "Amber", "Frozen", "Hidden",
    "Golden", "Quiet", "Rapid", "Electric", "Misty", "Cosmic", "Wild", "Gentle",
    "Solar", "Nocturnal", "Silver", "Echoing", "Vivid", "Distant", "Restless", "Bright",
]
NOUNS_EN = [
    "Fox", "Raven", "Otter", "Falcon", "Panther", "Comet", "Willow", "Nomad",
    "Phantom", "Ember", "Harbor", "Cipher", "Wanderer", "Lynx", "Orbit", "Sparrow",
    "Drifter", "Tiger", "Aurora", "Voyager", "Koi", "Puma", "Whisper", "Meteor",
]
ADJECTIVES_RU = [
    "Тихий", "Ночной", "Быстрый", "Тёплый", "Лунный", "Дерзкий", "Ясный", "Скрытый",
    "Летний", "Смелый", "Лёгкий", "Дальний", "Яркий", "Зимний", "Тайный", "Добрый",
    "Рыжий", "Вольный", "Мягкий", "Звёздный", "Синий", "Резкий", "Странный", "Живой",
]
NOUNS_RU = [
    "Лис", "Ворон", "Барс", "Кит", "Сокол", "Ёж", "Волк", "Филин",
    "Тигр", "Шторм", "Ветер", "Странник", "Пилот", "Кот", "Маяк", "Осьминог",
    "Дракон", "Скиталец", "Пингвин", "Енот", "Метеор", "Сурок", "Компас", "Призрак",
]

AVATAR_PALETTE = [
    "aurora", "sunset", "ocean", "ember", "violet", "mint", "peach", "storm",
]


def _index(seed: str, salt: str, modulo: int) -> int:
    digest = hashlib.sha256(f"{seed}:{salt}".encode()).digest()
    return int.from_bytes(digest[:4], "big") % modulo


def mask_name(seed: str, language: str = "en") -> str:
    if language.startswith("ru") or language.startswith("uk"):
        adjectives, nouns = ADJECTIVES_RU, NOUNS_RU
    else:
        adjectives, nouns = ADJECTIVES_EN, NOUNS_EN
    adjective = adjectives[_index(seed, "adj", len(adjectives))]
    noun = nouns[_index(seed, "noun", len(nouns))]
    number = _index(seed, "num", 9000) + 1000
    return f"{adjective} {noun} {number}"


def avatar_style(seed: str) -> dict[str, str | int]:
    return {
        "palette": AVATAR_PALETTE[_index(seed, "palette", len(AVATAR_PALETTE))],
        "shape": _index(seed, "shape", 6),
        "pattern": _index(seed, "pattern", 8),
    }


def stable_seed(source: str) -> str:
    return hashlib.sha256(source.encode()).hexdigest()[:16]


def new_seed() -> str:
    return secrets.token_hex(8)


def referral_code() -> str:
    return secrets.token_urlsafe(6).replace("-", "a").replace("_", "b")[:8]
