from app.games.alias import Alias
from app.games.base import GameEngine
from app.games.flappy import VoiceFlappy
from app.games.mafia import Mafia
from app.games.telephone import BrokenTelephone
from app.games.tictactoe import TicTacToe

ENGINES: dict[str, GameEngine] = {
    engine.meta.key: engine
    for engine in (TicTacToe(), Mafia(), BrokenTelephone(), Alias(), VoiceFlappy())
}


def get_engine(key: str) -> GameEngine | None:
    return ENGINES.get(key)


def catalog_payload() -> list[dict]:
    return [
        {
            "key": engine.meta.key,
            "title": engine.meta.title,
            "subtitle": engine.meta.subtitle,
            "icon": engine.meta.icon,
            "accent": engine.meta.accent,
            "minPlayers": engine.meta.min_players,
            "maxPlayers": engine.meta.max_players,
            "voiceRequired": engine.meta.voice_required,
            "durationMinutes": engine.meta.duration_minutes,
            "tags": list(engine.meta.tags),
            "rules": list(engine.meta.rules),
        }
        for engine in ENGINES.values()
    ]
