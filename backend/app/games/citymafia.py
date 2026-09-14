import random
from collections import Counter
from typing import Any

from app.games.base import Effect, GameEngine, GameMeta, deadline, remaining

TABLE_SIZE = 10

FIRST_NIGHT_SECONDS = 60
SPEECH_SECONDS = 60
VOTE_SECONDS = 20
DEFENCE_SECONDS = 30
LAST_WORD_SECONDS = 60
NIGHT_SECONDS = 60
REVEAL_SECONDS = 12

ROLE_MAFIA = "mafia"
ROLE_DON = "don"
ROLE_SHERIFF = "sheriff"
ROLE_DOCTOR = "doctor"
ROLE_CIVILIAN = "civilian"

BLACK_ROLES = (ROLE_MAFIA, ROLE_DON)
NIGHT_ROLES = (ROLE_MAFIA, ROLE_DON, ROLE_SHERIFF, ROLE_DOCTOR)

# The deal is fixed, which is the whole point of the format: everyone at the
# table knows there are exactly three black cards and where the checks are.
DEAL = [
    ROLE_DON,
    ROLE_MAFIA,
    ROLE_MAFIA,
    ROLE_SHERIFF,
    ROLE_DOCTOR,
    ROLE_CIVILIAN,
    ROLE_CIVILIAN,
    ROLE_CIVILIAN,
    ROLE_CIVILIAN,
    ROLE_CIVILIAN,
]

MUTE_AT_FOULS = 3
REMOVE_AT_FOULS = 4
REMOVE_AT_WARNINGS = 2

# Three nights in a row where nobody left the table is a draw, so a night of
# misses and a day of nobody leaving cannot run forever.
STAGNANT_LIMIT = 3


class CityMafia(GameEngine):
    meta = GameMeta(
        key="citymafia",
        title="City Mafia",
        subtitle="Ten at the table and a host running the night",
        icon="🎩",
        accent="#C0392B",
        min_players=TABLE_SIZE + 1,
        max_players=TABLE_SIZE + 1,
        voice_required=True,
        duration_minutes=45,
        tags=["voice", "deduction", "host"],
        rules=[
            "Ten seats and a host: two Mafia, a Don, a Sheriff, a Doctor and five Civilians",
            "A minute of speech each in seat order, one nomination per player",
            "The black team must agree on one number at night or the shot misses",
            "Three fouls cost you your speech, four take you off the table",
        ],
    )

    def create(self, players: list[int], options: dict[str, Any]) -> dict[str, Any]:
        # Whoever opened the table runs it, unless the room named someone else.
        host = int(options.get("host") or players[0])
        seated = [player for player in players if player != host]
        return {
            "phase": "lobby",
            "host": host,
            "players": list(players),
            "seated": seated,
            "seats": {},
            "roles": {},
            "alive": [],
            "day": 0,
            "speechOrder": [],
            "speechIndex": 0,
            "firstSpeaker": 0,
            "nominations": {},
            "candidates": [],
            "votes": {},
            "voteRound": 0,
            "tabledTie": [],
            "defenceQueue": [],
            "nightActions": {},
            "checks": {},
            "donChecks": {},
            "lastHeal": None,
            "selfHealUsed": False,
            "fouls": {},
            "warnings": {},
            "muted": [],
            "lastWordFor": None,
            "afterLastWord": "night",
            "pendingDeath": None,
            "stagnant": 0,
            "log": [],
            "deadline": None,
            "winner": None,
        }

    # Seating and the opening night

    def start(self, state: dict[str, Any]) -> list[Effect]:
        seated = list(state["seated"])
        if len(seated) != TABLE_SIZE:
            return [
                Effect(
                    event={
                        "type": "citymafia.error",
                        "payload": {"reason": "need_ten", "seated": len(seated)},
                    },
                    target="user",
                    user_id=state["host"],
                )
            ]

        random.shuffle(seated)
        state["seats"] = {str(index + 1): player for index, player in enumerate(seated)}
        deal = list(DEAL)
        random.shuffle(deal)
        state["roles"] = {str(player): deal[index] for index, player in enumerate(seated)}
        state["alive"] = list(seated)
        state["phase"] = "first_night"
        state["day"] = 0
        state["deadline"] = deadline(FIRST_NIGHT_SECONDS)
        state["log"].append({"day": 0, "text": "first_night"})

        effects: list[Effect] = []
        black = self._black_alive(state)
        for player in seated:
            role = state["roles"][str(player)]
            effects.append(
                Effect(
                    event={
                        "type": "citymafia.role",
                        "payload": {
                            "role": role,
                            "seat": self._seat_of(state, player),
                            "team": [self._seat_of(state, mate) for mate in black]
                            if role in BLACK_ROLES
                            else [],
                        },
                    },
                    target="user",
                    user_id=player,
                )
            )
        effects.append(
            Effect(event={"type": "game.phase", "payload": {"phase": "first_night", "day": 0}})
        )
        return effects

    def _seat_of(self, state: dict[str, Any], user_id: int) -> int:
        for seat, player in state["seats"].items():
            if player == user_id:
                return int(seat)
        return 0

    def _player_at(self, state: dict[str, Any], seat: int) -> int | None:
        return state["seats"].get(str(seat))

    def _black_alive(self, state: dict[str, Any]) -> list[int]:
        return [
            player
            for player in state["alive"]
            if state["roles"].get(str(player)) in BLACK_ROLES
        ]

    def _red_alive(self, state: dict[str, Any]) -> list[int]:
        black = set(self._black_alive(state))
        return [player for player in state["alive"] if player not in black]

    # The day

    def _open_day(self, state: dict[str, Any]) -> list[Effect]:
        state["day"] += 1
        # Each day opens one seat further round the table than the last.
        if state["day"] == 1:
            state["firstSpeaker"] = 1
        else:
            state["firstSpeaker"] = (state["firstSpeaker"] % TABLE_SIZE) + 1

        state["speechOrder"] = self._circle_from(state, state["firstSpeaker"])
        state["speechIndex"] = 0
        state["nominations"] = {}
        state["candidates"] = []
        state["votes"] = {}
        state["voteRound"] = 0
        state["tabledTie"] = []
        state["muted"] = []
        return self._open_speech(state)

    def _circle_from(self, state: dict[str, Any], first_seat: int) -> list[int]:
        order: list[int] = []
        for step in range(TABLE_SIZE):
            seat = ((first_seat - 1 + step) % TABLE_SIZE) + 1
            player = self._player_at(state, seat)
            if player is not None and player in state["alive"]:
                order.append(player)
        return order

    def _open_speech(self, state: dict[str, Any]) -> list[Effect]:
        if state["speechIndex"] >= len(state["speechOrder"]):
            return self._close_circle(state)
        state["phase"] = "speech"
        speaker = state["speechOrder"][state["speechIndex"]]
        state["deadline"] = deadline(SPEECH_SECONDS)
        return [
            Effect(
                event={
                    "type": "game.phase",
                    "payload": {
                        "phase": "speech",
                        "day": state["day"],
                        "speaker": self._seat_of(state, speaker),
                        "muted": speaker in state["muted"],
                    },
                }
            )
        ]

    def _close_circle(self, state: dict[str, Any]) -> list[Effect]:
        candidates = list(dict.fromkeys(state["nominations"].values()))
        candidates = [player for player in candidates if player in state["alive"]]
        state["candidates"] = candidates

        if not candidates:
            return self._open_night(state)
        # On the opening day a lone nomination goes without a vote, which is
        # what stops the first circle turning into a formality.
        if len(candidates) == 1 and state["day"] == 1:
            return self._eliminate(state, candidates[0], "sole_nomination")
        return self._open_vote(state)

    def _open_vote(self, state: dict[str, Any]) -> list[Effect]:
        state["phase"] = "vote"
        state["votes"] = {}
        state["voteRound"] += 1
        state["deadline"] = deadline(VOTE_SECONDS)
        return [
            Effect(
                event={
                    "type": "game.phase",
                    "payload": {
                        "phase": "vote",
                        "day": state["day"],
                        "candidates": [self._seat_of(state, player) for player in state["candidates"]],
                        "round": state["voteRound"],
                    },
                }
            )
        ]

    def _resolve_vote(self, state: dict[str, Any]) -> list[Effect]:
        candidates = state["candidates"]
        tally = Counter(
            target
            for voter, target in state["votes"].items()
            if int(voter) in state["alive"] and target in candidates
        )
        # A silent table is read as a vote against the last nominated, exactly
        # as a judge would count a lowered hand.
        silent = [player for player in state["alive"] if str(player) not in state["votes"]]
        if silent and candidates:
            tally[candidates[-1]] += len(silent)

        effects: list[Effect] = [
            Effect(
                event={
                    "type": "citymafia.tally",
                    "payload": {
                        str(self._seat_of(state, player)): count for player, count in tally.items()
                    },
                }
            )
        ]

        if not tally:
            return effects + self._open_night(state)

        top = max(tally.values())
        tied = [player for player in candidates if tally.get(player, 0) == top]

        if len(tied) == 1:
            if len(candidates) == 1 and top * 2 <= len(state["alive"]):
                # A single candidate still needs the table behind it.
                effects.append(Effect(event={"type": "citymafia.stays", "payload": {}}))
                return effects + self._open_night(state)
            return effects + self._eliminate(state, tied[0], "voted_out")

        if state["voteRound"] == 1:
            # Everyone tied speaks again, then the table votes on them alone.
            state["candidates"] = tied
            state["defenceQueue"] = list(tied)
            return effects + self._open_defence(state)

        if state["tabledTie"] != tied:
            # A second identical tie puts the whole group to the table.
            state["tabledTie"] = list(tied)
            state["candidates"] = tied
            state["defenceQueue"] = list(tied)
            return effects + self._open_defence(state)

        return effects + self._open_table_vote(state)

    def _open_defence(self, state: dict[str, Any]) -> list[Effect]:
        if not state["defenceQueue"]:
            return self._open_vote(state)
        state["phase"] = "defence"
        state["deadline"] = deadline(DEFENCE_SECONDS)
        speaker = state["defenceQueue"][0]
        return [
            Effect(
                event={
                    "type": "game.phase",
                    "payload": {
                        "phase": "defence",
                        "day": state["day"],
                        "speaker": self._seat_of(state, speaker),
                    },
                }
            )
        ]

    def _open_table_vote(self, state: dict[str, Any]) -> list[Effect]:
        state["phase"] = "table_vote"
        state["votes"] = {}
        state["deadline"] = deadline(VOTE_SECONDS)
        return [
            Effect(
                event={
                    "type": "game.phase",
                    "payload": {
                        "phase": "table_vote",
                        "day": state["day"],
                        "candidates": [
                            self._seat_of(state, player) for player in state["tabledTie"]
                        ],
                    },
                }
            )
        ]

    def _resolve_table_vote(self, state: dict[str, Any]) -> list[Effect]:
        tied = list(state["tabledTie"])
        voters = [player for player in state["alive"] if player not in tied]
        yes = sum(1 for voter in voters if state["votes"].get(str(voter)) == "all")
        state["tabledTie"] = []
        state["candidates"] = []

        if yes * 2 > len(voters):
            effects: list[Effect] = []
            for player in tied:
                effects += self._remove(state, player, "table_vote")
            over = self._check_end(state)
            if over:
                return effects + over
            state["stagnant"] = 0
            return effects + self._open_night(state)

        return [
            Effect(event={"type": "citymafia.table_kept", "payload": {}})
        ] + self._open_night(state)

    # Leaving the table

    def _eliminate(self, state: dict[str, Any], player: int, reason: str) -> list[Effect]:
        effects = self._remove(state, player, reason)
        over = self._check_end(state)
        if over:
            return effects + over
        state["stagnant"] = 0
        return effects + self._open_last_word(state, player, "night")

    def _remove(self, state: dict[str, Any], player: int, reason: str) -> list[Effect]:
        if player in state["alive"]:
            state["alive"].remove(player)
        state["log"].append(
            {"day": state["day"], "text": reason, "seat": self._seat_of(state, player)}
        )
        return [
            Effect(
                event={
                    "type": "citymafia.left",
                    "payload": {
                        "seat": self._seat_of(state, player),
                        "reason": reason,
                        "role": state["roles"].get(str(player)),
                    },
                }
            )
        ]

    def _open_last_word(self, state: dict[str, Any], player: int, then: str) -> list[Effect]:
        """A minute of last words, then whatever the table owes next: a vote
        sends the game into the night, a shot sends it into the new day."""
        state["phase"] = "last_word"
        state["lastWordFor"] = player
        state["afterLastWord"] = then
        state["deadline"] = deadline(LAST_WORD_SECONDS)
        return [
            Effect(
                event={
                    "type": "game.phase",
                    "payload": {
                        "phase": "last_word",
                        "day": state["day"],
                        "speaker": self._seat_of(state, player),
                    },
                }
            )
        ]

    def _close_last_word(self, state: dict[str, Any]) -> list[Effect]:
        state["lastWordFor"] = None
        if state.get("afterLastWord") == "day":
            return self._open_day(state)
        return self._open_night(state)

    # The night

    def _open_night(self, state: dict[str, Any]) -> list[Effect]:
        state["phase"] = "night"
        state["nightActions"] = {}
        state["lastWordFor"] = None
        state["deadline"] = deadline(NIGHT_SECONDS)
        return [
            Effect(
                event={"type": "game.phase", "payload": {"phase": "night", "day": state["day"]}}
            )
        ]

    def _resolve_night(self, state: dict[str, Any]) -> list[Effect]:
        actions = state["nightActions"]
        black = self._black_alive(state)
        shots = [
            actions[str(player)]["target"]
            for player in black
            if str(player) in actions and actions[str(player)].get("target")
        ]
        # Every gun has to point at the same number, or the night is a miss.
        victim: int | None = None
        if len(shots) == len(black) and len(set(shots)) == 1:
            victim = shots[0]

        effects: list[Effect] = []

        for player in black:
            entry = actions.get(str(player))
            if not entry or state["roles"].get(str(player)) != ROLE_DON:
                continue
            suspect = entry.get("inspect")
            if suspect:
                found = state["roles"].get(str(suspect)) == ROLE_SHERIFF
                state["donChecks"].setdefault(str(player), {})[str(suspect)] = found
                effects.append(
                    Effect(
                        event={
                            "type": "citymafia.don_check",
                            "payload": {"seat": self._seat_of(state, suspect), "sheriff": found},
                        },
                        target="user",
                        user_id=player,
                    )
                )

        for player, entry in list(actions.items()):
            if state["roles"].get(player) != ROLE_SHERIFF:
                continue
            suspect = entry.get("target")
            if not suspect:
                continue
            is_black = state["roles"].get(str(suspect)) in BLACK_ROLES
            state["checks"].setdefault(player, {})[str(suspect)] = is_black
            effects.append(
                Effect(
                    event={
                        "type": "citymafia.check",
                        "payload": {"seat": self._seat_of(state, suspect), "black": is_black},
                    },
                    target="user",
                    user_id=int(player),
                )
            )

        healed: int | None = None
        for player, entry in actions.items():
            if state["roles"].get(player) == ROLE_DOCTOR:
                healed = entry.get("target")
                if healed == int(player):
                    state["selfHealUsed"] = True
                state["lastHeal"] = healed

        state["phase"] = "reveal"
        state["deadline"] = deadline(REVEAL_SECONDS)

        if victim is None or victim == healed or victim not in state["alive"]:
            state["stagnant"] += 1
            state["pendingDeath"] = None
            effects.append(
                Effect(
                    event={
                        "type": "citymafia.morning",
                        "payload": {"dead": None, "healed": healed is not None and healed == victim},
                    }
                )
            )
            if state["stagnant"] >= STAGNANT_LIMIT:
                return effects + self._finish(state, "draw")
            return effects

        state["stagnant"] = 0
        state["pendingDeath"] = victim
        effects += self._remove(state, victim, "shot")
        effects.append(
            Effect(
                event={
                    "type": "citymafia.morning",
                    "payload": {"dead": self._seat_of(state, victim), "healed": False},
                }
            )
        )
        over = self._check_end(state)
        if over:
            return effects + over
        return effects

    # Fouls, warnings and the host panel

    def _count_against(self, state: dict[str, Any], player: int, bucket: str) -> int:
        counts = state[bucket]
        counts[str(player)] = counts.get(str(player), 0) + 1
        return counts[str(player)]

    def _host_action(
        self, state: dict[str, Any], action: str, payload: dict[str, Any]
    ) -> list[Effect]:
        seat = int(payload.get("seat", 0) or 0)
        target = self._player_at(state, seat)

        if action == "foul" and target:
            total = self._count_against(state, target, "fouls")
            effects = [
                Effect(
                    event={
                        "type": "citymafia.foul",
                        "payload": {"seat": seat, "count": total, "limit": REMOVE_AT_FOULS},
                    }
                )
            ]
            if total >= REMOVE_AT_FOULS:
                effects += self._remove(state, target, "fouled_out")
                over = self._check_end(state)
                return effects + (over or self._after_forced_removal(state, target))
            if total == MUTE_AT_FOULS and target not in state["muted"]:
                state["muted"].append(target)
            return effects

        if action == "warn" and target:
            total = self._count_against(state, target, "warnings")
            effects = [
                Effect(
                    event={
                        "type": "citymafia.warning",
                        "payload": {"seat": seat, "count": total, "limit": REMOVE_AT_WARNINGS},
                    }
                )
            ]
            if total >= REMOVE_AT_WARNINGS:
                effects += self._remove(state, target, "warned_out")
                over = self._check_end(state)
                return effects + (over or self._after_forced_removal(state, target))
            return effects

        if action == "restore" and target and target not in state["alive"]:
            # A host can undo their own mistake while the table is still there.
            state["alive"].append(target)
            state["fouls"][str(target)] = max(0, state["fouls"].get(str(target), 0) - 1)
            state["warnings"][str(target)] = max(0, state["warnings"].get(str(target), 0) - 1)
            return [Effect(event={"type": "citymafia.restored", "payload": {"seat": seat}})]

        if action == "next_phase":
            return self._advance(state)

        if action == "end_game":
            return self._finish(state, "aborted")

        return []

    def _after_forced_removal(self, state: dict[str, Any], player: int) -> list[Effect]:
        """A player taken off the table mid phase gets no last words."""
        if state["phase"] == "speech" and state["speechOrder"]:
            if player in state["speechOrder"]:
                index = state["speechOrder"].index(player)
                if index <= state["speechIndex"]:
                    state["speechIndex"] += 1
                state["speechOrder"].remove(player)
                if index < state["speechIndex"]:
                    state["speechIndex"] -= 1
            return self._open_speech(state)
        if state["phase"] in ("vote", "table_vote"):
            state["candidates"] = [item for item in state["candidates"] if item != player]
            state["votes"].pop(str(player), None)
        return []

    # Public surface

    def action(
        self, state: dict[str, Any], user_id: int, action: str, payload: dict[str, Any]
    ) -> list[Effect]:
        if user_id == state["host"]:
            return self._host_action(state, action, payload)

        # Whoever is giving their last words is already off the table, so the
        # alive check cannot come before it.
        if state["phase"] == "last_word" and user_id == state["lastWordFor"]:
            if action == "done_speaking":
                return self._close_last_word(state)
            return []

        if user_id not in state["alive"]:
            return []

        role = state["roles"].get(str(user_id), ROLE_CIVILIAN)
        seat = int(payload.get("seat", 0) or 0)
        target = self._player_at(state, seat)

        if action == "nominate" and state["phase"] == "speech":
            speaker = state["speechOrder"][state["speechIndex"]]
            if user_id != speaker or target is None or target not in state["alive"]:
                return []
            if target == user_id or str(user_id) in state["nominations"]:
                return []
            state["nominations"][str(user_id)] = target
            return [
                Effect(
                    event={
                        "type": "citymafia.nominated",
                        "payload": {"by": self._seat_of(state, user_id), "seat": seat},
                    }
                )
            ]

        if action == "done_speaking" and state["phase"] == "speech":
            if user_id != state["speechOrder"][state["speechIndex"]]:
                return []
            state["speechIndex"] += 1
            return self._open_speech(state)

        if action == "done_speaking" and state["phase"] == "defence":
            if not state["defenceQueue"] or user_id != state["defenceQueue"][0]:
                return []
            state["defenceQueue"].pop(0)
            if state["defenceQueue"]:
                return self._open_defence(state)
            return self._open_vote(state)

        if action == "vote" and state["phase"] == "vote":
            if target is None or target not in state["candidates"]:
                return []
            state["votes"][str(user_id)] = target
            effects = [
                Effect(
                    event={
                        "type": "citymafia.vote",
                        "payload": {"by": self._seat_of(state, user_id), "count": len(state["votes"])},
                    }
                )
            ]
            if len(state["votes"]) >= len(state["alive"]):
                effects += self._resolve_vote(state)
            return effects

        if action == "vote" and state["phase"] == "table_vote":
            if user_id in state["tabledTie"]:
                return []
            state["votes"][str(user_id)] = "all" if payload.get("all") else "none"
            voters = [player for player in state["alive"] if player not in state["tabledTie"]]
            if len(state["votes"]) >= len(voters):
                return self._resolve_table_vote(state)
            return [
                Effect(
                    event={
                        "type": "citymafia.vote",
                        "payload": {"by": self._seat_of(state, user_id), "count": len(state["votes"])},
                    }
                )
            ]

        if action == "night_action" and state["phase"] in ("night", "first_night"):
            if role not in NIGHT_ROLES:
                return []
            if state["phase"] == "first_night" and role != ROLE_DON:
                return []
            if target is None or target not in state["alive"]:
                return []
            if role in BLACK_ROLES and state["roles"].get(str(target)) in BLACK_ROLES:
                return []
            if role == ROLE_SHERIFF and target == user_id:
                return []
            if role == ROLE_DOCTOR:
                if target == user_id and state["selfHealUsed"]:
                    return []
                if target == state["lastHeal"]:
                    return []

            entry: dict[str, Any] = {"role": role, "target": target}
            if role == ROLE_DON and payload.get("inspect"):
                suspect = self._player_at(state, int(payload["inspect"]))
                if suspect and suspect in state["alive"]:
                    entry["inspect"] = suspect
            state["nightActions"][str(user_id)] = entry

            effects = [
                Effect(
                    event={"type": "citymafia.locked", "payload": {"seat": seat}},
                    target="user",
                    user_id=user_id,
                )
            ]
            # The black team sees each other's guns move, nobody else does.
            if role in BLACK_ROLES:
                for mate in self._black_alive(state):
                    if mate != user_id:
                        effects.append(
                            Effect(
                                event={
                                    "type": "citymafia.team_pick",
                                    "payload": {
                                        "by": self._seat_of(state, user_id),
                                        "seat": seat,
                                    },
                                },
                                target="user",
                                user_id=mate,
                            )
                        )
            if state["phase"] == "night" and self._night_complete(state):
                effects += self._resolve_night(state)
            return effects

        if action == "note_host":
            # The Doctor and the Sheriff can reach the host without the table
            # hearing it, which is how a check gets confirmed on a real stream.
            text = str(payload.get("text", ""))[:200]
            if not text:
                return []
            return [
                Effect(
                    event={
                        "type": "citymafia.note",
                        "payload": {"seat": self._seat_of(state, user_id), "role": role, "text": text},
                    },
                    target="user",
                    user_id=state["host"],
                )
            ]

        return []

    def _night_complete(self, state: dict[str, Any]) -> bool:
        expected = {
            player
            for player in state["alive"]
            if state["roles"].get(str(player)) in NIGHT_ROLES
        }
        return all(str(player) in state["nightActions"] for player in expected)

    def _advance(self, state: dict[str, Any]) -> list[Effect]:
        phase = state["phase"]
        if phase == "first_night":
            return self._open_day(state)
        if phase == "speech":
            state["speechIndex"] += 1
            return self._open_speech(state)
        if phase == "defence":
            if state["defenceQueue"]:
                state["defenceQueue"].pop(0)
            if state["defenceQueue"]:
                return self._open_defence(state)
            return self._open_vote(state)
        if phase == "vote":
            return self._resolve_vote(state)
        if phase == "table_vote":
            return self._resolve_table_vote(state)
        if phase == "last_word":
            return self._close_last_word(state)
        if phase == "night":
            return self._resolve_night(state)
        if phase == "reveal":
            victim = state.get("pendingDeath")
            state["pendingDeath"] = None
            if victim:
                return self._open_last_word(state, victim, "day")
            return self._open_day(state)
        return []

    def tick(self, state: dict[str, Any], now: float) -> list[Effect]:
        if not state.get("deadline") or now < state["deadline"]:
            return []
        return self._advance(state)

    def _check_end(self, state: dict[str, Any]) -> list[Effect] | None:
        black = self._black_alive(state)
        red = self._red_alive(state)
        if not black:
            return self._finish(state, "town")
        if len(black) >= len(red):
            return self._finish(state, "mafia")
        return None

    def _finish(self, state: dict[str, Any], winner: str) -> list[Effect]:
        state["phase"] = "finished"
        state["winner"] = winner
        state["deadline"] = None
        return [
            Effect(
                event={
                    "type": "game.finished",
                    "payload": {
                        "winner": winner,
                        "roles": {
                            str(self._seat_of(state, int(player))): role
                            for player, role in state["roles"].items()
                        },
                    },
                }
            )
        ]

    def player_view(self, state: dict[str, Any], user_id: int) -> dict[str, Any]:
        is_host = user_id == state["host"]
        role = state["roles"].get(str(user_id))
        alive = user_id in state["alive"]
        finished = state["phase"] == "finished"

        visible: dict[str, str] = {}
        if finished or is_host or not alive:
            visible = {
                str(self._seat_of(state, int(player))): value
                for player, value in state["roles"].items()
            }
        elif role in BLACK_ROLES:
            visible = {
                str(self._seat_of(state, int(player))): value
                for player, value in state["roles"].items()
                if value in BLACK_ROLES
            }

        speaker: int | None = None
        if state["phase"] == "speech" and state["speechIndex"] < len(state["speechOrder"]):
            speaker = self._seat_of(state, state["speechOrder"][state["speechIndex"]])
        elif state["phase"] == "defence" and state["defenceQueue"]:
            speaker = self._seat_of(state, state["defenceQueue"][0])
        elif state["phase"] == "last_word" and state["lastWordFor"]:
            speaker = self._seat_of(state, state["lastWordFor"])

        seat = self._seat_of(state, user_id)
        return {
            "phase": state["phase"],
            "day": state["day"],
            "isHost": is_host,
            "yourSeat": seat,
            "yourRole": role,
            "youAlive": alive,
            "seats": {
                seat_no: {
                    "userId": player,
                    "alive": player in state["alive"],
                    "fouls": state["fouls"].get(str(player), 0),
                    "warnings": state["warnings"].get(str(player), 0),
                    "muted": player in state["muted"],
                }
                for seat_no, player in state["seats"].items()
            },
            "visibleRoles": visible,
            "speaker": speaker,
            "youSpeak": speaker is not None and speaker == seat,
            "canNominate": (
                state["phase"] == "speech"
                and speaker == seat
                and str(user_id) not in state["nominations"]
            ),
            "nominations": {
                str(self._seat_of(state, int(by))): self._seat_of(state, target)
                for by, target in state["nominations"].items()
            },
            "candidates": [self._seat_of(state, player) for player in state["candidates"]],
            "tabledTie": [self._seat_of(state, player) for player in state["tabledTie"]],
            "votes": {
                str(self._seat_of(state, int(by))): (
                    target if isinstance(target, str) else self._seat_of(state, target)
                )
                for by, target in state["votes"].items()
            }
            if state["phase"] in ("vote", "table_vote", "finished")
            else {},
            "checks": {
                seat_no: value for seat_no, value in self._checks_for(state, user_id).items()
            },
            "lastHeal": self._seat_of(state, state["lastHeal"])
            if state["lastHeal"] and role == ROLE_DOCTOR
            else None,
            "selfHealUsed": bool(state["selfHealUsed"]) if role == ROLE_DOCTOR else False,
            "nightLocked": str(user_id) in state["nightActions"],
            "teamPicks": {
                str(self._seat_of(state, int(by))): self._seat_of(state, entry["target"])
                for by, entry in state["nightActions"].items()
                if role in BLACK_ROLES and state["roles"].get(by) in BLACK_ROLES
            }
            if role in BLACK_ROLES
            else {},
            "log": state["log"][-14:],
            "winner": state.get("winner"),
            "secondsLeft": remaining(state),
            "canAct": alive
            and (
                (state["phase"] == "night" and role in NIGHT_ROLES)
                or state["phase"] in ("vote", "table_vote")
            ),
        }

    def _checks_for(self, state: dict[str, Any], user_id: int) -> dict[str, bool]:
        role = state["roles"].get(str(user_id))
        if role == ROLE_SHERIFF:
            source = state["checks"].get(str(user_id), {})
        elif role == ROLE_DON:
            source = state["donChecks"].get(str(user_id), {})
        else:
            return {}
        return {str(self._seat_of(state, int(player))): value for player, value in source.items()}

    def scores(self, state: dict[str, Any]) -> dict[int, dict[str, Any]]:
        winner = state.get("winner")
        output: dict[int, dict[str, Any]] = {}
        for player in state["seated"]:
            role = state["roles"].get(str(player), ROLE_CIVILIAN)
            team = "mafia" if role in BLACK_ROLES else "town"
            won = winner == team
            survived = player in state["alive"]
            score = (80 if won else 20) + (25 if survived else 0) + state["day"] * 6
            output[player] = {"score": score, "won": won, "placement": 1 if won else 2}
        # Running a table is work, and a host who finishes one is paid for it.
        output[state["host"]] = {"score": 60 + state["day"] * 6, "won": True, "placement": 1}
        return output
