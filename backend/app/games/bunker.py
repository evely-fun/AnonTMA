"""Bunker: a social deduction game where you argue for one of too few places.

Built to the rules published at bunker-online.com/ru/rules. A catastrophe and
a broken shelter are dealt first, because they are what decides whose skills
matter: an agronomist is priceless when the greenhouse is the thing that
failed and merely pleasant when it is not.

A round is four passes. Everyone opens that round's cards and speaks for a
minute, the table talks for a minute together, everyone gets thirty seconds
to say why they should be let in, and then fifteen seconds to vote. Seventy
percent of the vote shuts someone out at once; anything less buys the
accused another thirty seconds and a second vote. The opening round never
excludes anyone. It runs until the shelter is full.
"""

import random
from collections import Counter
from typing import Any

from app.games.base import Effect, GameEngine, GameMeta, deadline

SPEECH_SECONDS = 60
DISCUSSION_SECONDS = 60
DEFENCE_SECONDS = 30
VOTE_SECONDS = 15
LAST_WORD_SECONDS = 30

# A vote this size is decisive on the spot. Anything short of it buys the
# accused another thirty seconds and a second count.
DECISIVE_SHARE = 0.7

# Cards never open later than this, however long the game runs.
MAX_CARD_ROUNDS = 7

ALL_FIELDS: tuple[str, ...] = (
    "profession",
    "biology",
    "health",
    "hobby",
    "luggage",
    "fact",
)

# How fast the dossier comes open depends on how many people are at the table:
# a short game has to show its hand early, a long one can hold cards back.
SCHEDULES: tuple[tuple[int, list[tuple[str, ...]]], ...] = (
    (7, [("profession", "biology", "health"), ("hobby", "luggage"), ("fact",)]),
    (10, [("profession", "biology"), ("health", "hobby"), ("luggage",), ("fact",)]),
    (
        15,
        [
            ("profession",),
            ("biology", "health"),
            ("hobby",),
            ("luggage",),
            ("fact",),
        ],
    ),
)


def _schedule(total: int) -> list[tuple[str, ...]]:
    for limit, rounds in SCHEDULES:
        if total <= limit:
            return rounds
    return SCHEDULES[-1][1]

CATASTROPHES = [
    "nuclear_winter",
    "virus",
    "ai_uprising",
    "drought",
    "solar_flare",
    "flood",
]

FAULTS = [
    "greenhouse_down",
    "medbay_looted",
    "generator_failing",
    "water_contaminated",
    "airlock_jammed",
    "stores_spoiled",
]

PROFESSIONS = [
    "surgeon", "agronomist", "engineer", "nurse", "teacher", "cook",
    "virologist", "electrician", "soldier", "psychologist", "vet", "chemist",
    "welder", "pilot", "blogger", "lawyer", "barista", "archaeologist",
]

HEALTH = [
    "healthy", "asthma", "allergy", "short_sighted", "bad_back", "immune",
    "recovering", "diabetes", "insomnia", "broken_arm",
]

HOBBIES = [
    "herbalism", "electronics", "hunting", "sewing", "beekeeping", "chess",
    "diving", "cartography", "brewing", "first_aid", "gardening", "singing",
    "survival", "radio", "carpentry", "astronomy",
]

LUGGAGE = [
    "seed_bank", "toolbox", "antibiotics", "rifle", "water_filter", "books",
    "solar_panel", "cat", "case_of_cash", "guitar", "map", "battery",
    "fishing_net", "cooking_oil", "radio_set", "sleeping_bags",
]

FACTS = [
    "sleepwalks", "afraid_of_dark", "worked_in_morgue", "vegetarian",
    "cannibal", "pyromaniac", "never_lies", "ex_convict", "twin", "orphan",
    "speaks_four_languages", "cannot_swim", "trained_medic", "kleptomaniac",
]

ACTIONS = [
    "swap",       # trade one characteristic with another player
    "reveal",     # open one of someone else's cards early
    "heal",       # replace a health card, yours or a neighbour's
    "steal",      # take someone's luggage
    "alibi",      # drop one vote against you
    "immunity",   # cancel this vote entirely, it runs again without you
    "dictator",   # throw anyone out with no vote at all
]

# Weighted so the game breaker stays rare.
ACTION_WEIGHTS = [18, 18, 16, 16, 16, 14, 2]


def _places(total: int) -> int:
    """Half the table, rounded down, and never fewer than two."""
    return max(2, total // 2)


class Bunker(GameEngine):
    meta = GameMeta(
        key="bunker",
        title="Bunker",
        subtitle="Argue your way into a shelter with too few places",
        icon="🚪",
        accent="#1F7A8C",
        min_players=6,
        max_players=15,
        voice_required=True,
        duration_minutes=30,
        tags=["voice", "party", "deduction"],
        rules=[
            "Six to fifteen players and half as many places, rounded down",
            "A round is a minute each, a minute together, thirty seconds to defend, then the vote",
            "Seventy percent shuts you out at once, less than that buys you a second chance",
            "The opening round never excludes anyone, and it ends when the shelter is full",
        ],
    )

    def create(self, players: list[int], options: dict[str, Any]) -> dict[str, Any]:
        roster = list(players)
        random.shuffle(roster)
        dossiers: dict[str, dict[str, Any]] = {}
        for player in roster:
            dossiers[str(player)] = {
                "profession": {
                    "value": random.choice(PROFESSIONS),
                    "years": random.choice([1, 2, 3, 5, 8, 12, 20, 25]),
                },
                "biology": {
                    "sex": random.choice(["male", "female"]),
                    "age": random.randint(18, 64),
                    "fertile": random.random() < 0.7,
                },
                "health": {"value": random.choice(HEALTH)},
                "hobby": {"value": random.choice(HOBBIES), "years": random.randint(1, 15)},
                "luggage": {"value": random.choice(LUGGAGE)},
                "fact": {"value": random.choice(FACTS)},
            }

        return {
            "phase": "lobby",
            "players": list(players),
            "alive": list(players),
            "places": _places(len(players)),
            "catastrophe": random.choice(CATASTROPHES),
            "shelter": {
                "fault": random.choice(FAULTS),
                "years": random.choice([1, 3, 5, 10, 20]),
                "area": random.choice([50, 80, 120, 200, 300]),
                "rooms": random.sample(
                    ["greenhouse", "medbay", "stores", "workshop", "armoury", "library"], 3
                ),
            },
            "dossiers": dossiers,
            # What everyone has been shown so far, per player and card.
            "opened": {str(player): [] for player in players},
            "cards": {
                str(player): random.choices(ACTIONS, weights=ACTION_WEIGHTS, k=2)
                for player in players
            },
            "usedCards": {str(player): [] for player in players},
            "round": 0,
            "speaker": None,
            "queue": [],
            "defenceQueue": [],
            "spoken": [],
            "votes": {},
            "voteRound": 0,
            "runoff": [],
            "immune": [],
            "accused": None,
            "log": [],
            "deadline": None,
            "winner": None,
            "epilogue": None,
        }

    # Lifecycle ---------------------------------------------------------------

    def start(self, state: dict[str, Any]) -> list[Effect]:
        effects: list[Effect] = [
            Effect(
                event={
                    "type": "bunker.dossier",
                    "payload": {"dossier": state["dossiers"][str(player)],
                                "cards": state["cards"][str(player)]},
                },
                target="user",
                user_id=player,
            )
            for player in state["players"]
        ]
        effects += self._open_round(state)
        return effects

    def _open_round(self, state: dict[str, Any]) -> list[Effect]:
        state["round"] += 1
        state["spoken"] = []
        state["votes"] = {}
        state["voteRound"] = 0
        state["runoff"] = []
        state["immune"] = []
        state["accused"] = None
        state["defenceQueue"] = []
        # Speaking order is reshuffled each round so nobody is always last.
        queue = [player for player in state["alive"]]
        random.shuffle(queue)
        state["queue"] = queue
        return self._next_speaker(state)

    def _next_speaker(self, state: dict[str, Any]) -> list[Effect]:
        while state["queue"]:
            candidate = state["queue"].pop(0)
            if candidate in state["alive"]:
                state["speaker"] = candidate
                state["phase"] = "speech"
                state["deadline"] = deadline(SPEECH_SECONDS)
                self._open_cards(state, candidate)
                return [
                    Effect(
                        event={
                            "type": "bunker.speaker",
                            "payload": {
                                "speaker": candidate,
                                "round": state["round"],
                                "opened": state["opened"],
                            },
                        }
                    )
                ]
        return self._open_discussion(state)

    def _open_cards(self, state: dict[str, Any], player: int) -> None:
        schedule = _schedule(len(state["players"]))
        opened = state["opened"].setdefault(str(player), [])
        if state["round"] > min(len(schedule), MAX_CARD_ROUNDS):
            return
        for card in schedule[state["round"] - 1]:
            if card not in opened:
                opened.append(card)

    def _open_discussion(self, state: dict[str, Any]) -> list[Effect]:
        state["speaker"] = None
        state["phase"] = "debate"
        state["spoken"] = []
        state["deadline"] = deadline(DISCUSSION_SECONDS)
        return [
            Effect(
                event={"type": "game.phase",
                       "payload": {"phase": "debate", "round": state["round"]}}
            )
        ]

    def _open_defence(self, state: dict[str, Any], queue: list[int] | None = None) -> list[Effect]:
        """Thirty seconds each to say why the shelter should keep you."""
        if queue is not None:
            state["defenceQueue"] = [player for player in queue if player in state["alive"]]
        while state["defenceQueue"]:
            speaker = state["defenceQueue"][0]
            if speaker in state["alive"]:
                state["phase"] = "defence"
                state["speaker"] = speaker
                state["deadline"] = deadline(DEFENCE_SECONDS)
                return [
                    Effect(
                        event={
                            "type": "game.phase",
                            "payload": {
                                "phase": "defence",
                                "round": state["round"],
                                "speaker": speaker,
                            },
                        }
                    )
                ]
            state["defenceQueue"].pop(0)
        state["speaker"] = None
        return self._open_vote(state, state.get("runoff") or None)

    def _open_vote(self, state: dict[str, Any], runoff: list[int] | None = None) -> list[Effect]:
        # The opening round is introductions only; nobody is shut out on it.
        if state["round"] < 2:
            return self._open_round(state)
        state["phase"] = "vote"
        state["votes"] = {}
        state["voteRound"] += 1
        state["runoff"] = list(runoff or [])
        state["deadline"] = deadline(VOTE_SECONDS)
        return [
            Effect(
                event={
                    "type": "game.phase",
                    "payload": {
                        "phase": "vote",
                        "round": state["round"],
                        "runoff": state["runoff"],
                    },
                }
            )
        ]

    # Actions -----------------------------------------------------------------

    def action(
        self, state: dict[str, Any], user_id: int, action: str, payload: dict[str, Any]
    ) -> list[Effect]:
        if state["phase"] == "finished":
            return []
        if user_id not in state["alive"]:
            return []

        if action == "done_speaking" and state["phase"] == "speech":
            if state.get("speaker") != user_id:
                return []
            return self._next_speaker(state)

        if action == "done_speaking" and state["phase"] == "defence":
            if state.get("speaker") != user_id or not state["defenceQueue"]:
                return []
            state["defenceQueue"].pop(0)
            return self._open_defence(state)

        if action == "done_debating" and state["phase"] == "debate":
            spoken = set(state.get("spoken", [])) | {user_id}
            state["spoken"] = list(spoken)
            # A majority can cut the discussion short rather than wait it out.
            if len(spoken) > len(state["alive"]) // 2:
                return self._open_defence(state, list(state["alive"]))
            return [
                Effect(event={"type": "bunker.ready", "payload": {"count": len(spoken)}})
            ]

        if action == "vote" and state["phase"] == "vote":
            return self._cast(state, user_id, payload)

        if action == "play_card":
            # A card cannot be played to talk your way out of a lost vote.
            if state["phase"] == "last_word":
                return []
            return self._play_card(state, user_id, payload)

        return []

    def _cast(self, state: dict[str, Any], user_id: int, payload: dict[str, Any]) -> list[Effect]:
        target = int(payload.get("target", 0) or 0)
        # Voting for yourself is not a way out.
        if target == user_id or target not in state["alive"]:
            return []
        if state["runoff"] and target not in state["runoff"]:
            return []
        state["votes"][str(user_id)] = target
        effects = [
            Effect(
                event={
                    "type": "bunker.vote",
                    "payload": {"by": user_id, "target": target, "count": len(state["votes"])},
                }
            )
        ]
        voters = [player for player in state["alive"] if player not in state["immune"]]
        if len(state["votes"]) >= len(voters):
            effects += self._resolve_vote(state)
        return effects

    def _play_card(
        self, state: dict[str, Any], user_id: int, payload: dict[str, Any]
    ) -> list[Effect]:
        card = str(payload.get("card", ""))
        held = state["cards"].get(str(user_id), [])
        if card not in held:
            return []
        target = int(payload.get("target", 0) or 0)
        if target and target not in state["alive"]:
            return []

        held.remove(card)
        state["usedCards"].setdefault(str(user_id), []).append(card)
        state["log"].append({"round": state["round"], "card": card, "by": user_id, "target": target})

        public = Effect(
            event={
                "type": "bunker.card_played",
                "payload": {"by": user_id, "card": card, "target": target or None},
            }
        )

        if card == "swap" and target:
            field = str(payload.get("field", "hobby"))
            if field in ALL_FIELDS:
                mine = state["dossiers"][str(user_id)]
                theirs = state["dossiers"][str(target)]
                mine[field], theirs[field] = theirs[field], mine[field]
                return [public, *self._resend(state, user_id), *self._resend(state, target)]

        if card == "reveal" and target:
            field = str(payload.get("field", "fact"))
            opened = state["opened"].setdefault(str(target), [])
            if field not in opened:
                opened.append(field)
            return [public]

        if card == "heal":
            subject = target or user_id
            state["dossiers"][str(subject)]["health"] = {"value": "healthy"}
            return [public, *self._resend(state, subject)]

        if card == "steal" and target:
            mine = state["dossiers"][str(user_id)]
            theirs = state["dossiers"][str(target)]
            mine["luggage"], theirs["luggage"] = theirs["luggage"], {"value": "nothing"}
            return [public, *self._resend(state, user_id), *self._resend(state, target)]

        if card == "alibi":
            # One vote against you is discarded, whenever it was cast.
            for voter, choice in list(state["votes"].items()):
                if choice == user_id:
                    del state["votes"][voter]
                    break
            return [public]

        if card == "immunity":
            # The round is voted again with this player out of the reckoning.
            if user_id not in state["immune"]:
                state["immune"].append(user_id)
            return [public, *self._open_vote(state, state.get("runoff") or None)]

        if card == "dictator" and target:
            return [public, *self._eliminate(state, target, "dictator")]

        return [public]

    def _resend(self, state: dict[str, Any], player: int) -> list[Effect]:
        return [
            Effect(
                event={
                    "type": "bunker.dossier",
                    "payload": {
                        "dossier": state["dossiers"][str(player)],
                        "cards": state["cards"][str(player)],
                    },
                },
                target="user",
                user_id=player,
            )
        ]

    # Resolution --------------------------------------------------------------

    def _resolve_vote(self, state: dict[str, Any]) -> list[Effect]:
        tally = Counter(state["votes"].values())
        # Sitting it out is not free: a silent player votes against themselves.
        for player in state["alive"]:
            if player in state["immune"]:
                continue
            if str(player) not in state["votes"]:
                tally[player] += 1

        if not tally:
            return self._open_round(state)

        cast = sum(tally.values())
        top = max(tally.values())
        tied = sorted(player for player, votes in tally.items() if votes == top)
        board = Effect(
            event={
                "type": "bunker.tally",
                "payload": {str(key): value for key, value in tally.items()},
            }
        )

        # Seventy percent of the vote behind one name settles it on the spot.
        if len(tied) == 1 and cast and top / cast >= DECISIVE_SHARE:
            return [board] + self._accuse(state, tied[0], tally)

        second = state["voteRound"] >= 2
        if not second:
            # Short of decisive, or tied: everyone still in the running gets
            # another thirty seconds, and the table votes again on them alone.
            state["runoff"] = tied
            return [
                board,
                Effect(event={"type": "bunker.runoff", "payload": {"between": tied}}),
            ] + self._open_defence(state, tied)

        if len(tied) == 1:
            return [board] + self._accuse(state, tied[0], tally)

        # A tie that survives a second vote shuts every name in it out, and
        # the opening round is the one place that cannot happen.
        state["log"].append({"round": state["round"], "text": "tie"})
        effects = [board, Effect(event={"type": "bunker.tie", "payload": {"between": tied}})]
        for player in tied:
            effects += self._remove(state, player, "tie")
        ended = self._check_end(state)
        if ended:
            return effects + ended
        return effects + self._open_round(state)

    def _accuse(self, state: dict[str, Any], player: int, tally: Counter) -> list[Effect]:
        state["accused"] = player
        state["phase"] = "last_word"
        state["deadline"] = deadline(LAST_WORD_SECONDS)
        return [
            Effect(
                event={
                    "type": "bunker.accused",
                    "payload": {
                        "accused": player,
                        "tally": {str(key): value for key, value in tally.items()},
                    },
                }
            )
        ]

    def _remove(self, state: dict[str, Any], player: int, reason: str) -> list[Effect]:
        """Shut one person out. The hatch closes and their dossier is laid out."""
        if player in state["alive"]:
            state["alive"].remove(player)
        state["accused"] = None
        state["log"].append({"round": state["round"], "text": "out", "user": player, "reason": reason})
        return [
            Effect(
                event={
                    "type": "bunker.out",
                    "payload": {
                        "user": player,
                        "reason": reason,
                        "dossier": state["dossiers"][str(player)],
                    },
                }
            )
        ]

    def _eliminate(self, state: dict[str, Any], player: int, reason: str) -> list[Effect]:
        effects = self._remove(state, player, reason)
        ended = self._check_end(state)
        if ended:
            return effects + ended
        return effects + self._open_round(state)

    def _check_end(self, state: dict[str, Any]) -> list[Effect]:
        if len(state["alive"]) > state["places"]:
            return []
        state["phase"] = "finished"
        state["winner"] = "survivors"
        state["deadline"] = None
        state["epilogue"] = self._epilogue(state)
        return [
            Effect(
                event={
                    "type": "game.finished",
                    "payload": {
                        "survivors": state["alive"],
                        "epilogue": state["epilogue"],
                        "dossiers": state["dossiers"],
                    },
                }
            )
        ]

    def _epilogue(self, state: dict[str, Any]) -> dict[str, Any]:
        """What the shelter actually got, judged against what it needed."""
        inside = [state["dossiers"][str(player)] for player in state["alive"]]
        professions = {entry["profession"]["value"] for entry in inside}
        hobbies = {entry["hobby"]["value"] for entry in inside}
        facts = [entry["fact"]["value"] for entry in inside]
        skills = professions | hobbies

        fault = state["shelter"]["fault"]
        needed = {
            "greenhouse_down": {"agronomist", "gardening", "beekeeping"},
            "medbay_looted": {"surgeon", "nurse", "first_aid", "herbalism", "vet"},
            "generator_failing": {"engineer", "electrician", "electronics", "welder"},
            "water_contaminated": {"chemist", "virologist", "diving", "survival"},
            "airlock_jammed": {"welder", "engineer", "carpentry"},
            "stores_spoiled": {"cook", "hunting", "fishing", "agronomist", "brewing"},
        }.get(fault, set())

        medic = bool(skills & {"surgeon", "nurse", "vet", "first_aid", "trained_medic"})
        sick = any(entry["health"]["value"] not in ("healthy", "immune") for entry in inside)
        fertile = sum(1 for entry in inside if entry["biology"]["fertile"]) >= 2
        dangerous = sum(1 for value in facts if value in ("cannibal", "pyromaniac"))

        score = 0
        score += 2 if skills & needed else 0
        score += 1 if medic or not sick else 0
        score += 1 if fertile else 0
        score -= 2 if dangerous >= 2 else 0

        if score >= 4:
            outcome = "thrive"
        elif score >= 2:
            outcome = "survive"
        elif score >= 0:
            outcome = "struggle"
        else:
            outcome = "doomed"

        return {
            "outcome": outcome,
            "faultFixed": bool(skills & needed),
            "medic": medic,
            "canRepopulate": fertile,
            "dangerous": dangerous,
        }

    # Clock -------------------------------------------------------------------

    def tick(self, state: dict[str, Any], now: float) -> list[Effect]:
        if not state.get("deadline") or now < state["deadline"]:
            return []
        phase = state["phase"]

        if phase == "speech":
            return self._next_speaker(state)
        if phase == "debate":
            return self._open_defence(state, list(state["alive"]))
        if phase == "defence":
            if state["defenceQueue"]:
                state["defenceQueue"].pop(0)
            return self._open_defence(state)
        if phase == "vote":
            # Everyone who stayed quiet has already voted against themselves.
            return self._resolve_vote(state)
        if phase == "last_word":
            accused = state.get("accused")
            if accused is None:
                return self._open_round(state)
            return self._eliminate(state, accused, "vote")
        return []

    # Views -------------------------------------------------------------------

    def player_view(self, state: dict[str, Any], user_id: int) -> dict[str, Any]:
        from app.games.base import remaining

        public: dict[str, dict[str, Any]] = {}
        for player in state["players"]:
            shown = state["opened"].get(str(player), [])
            dossier = state["dossiers"][str(player)]
            public[str(player)] = {card: dossier[card] for card in shown if card in dossier}

        return {
            "phase": state["phase"],
            "round": state["round"],
            "players": list(state["players"]),
            "alive": list(state["alive"]),
            "places": state["places"],
            "catastrophe": state["catastrophe"],
            "shelter": state["shelter"],
            "speaker": state.get("speaker"),
            "youSpeak": state.get("speaker") == user_id,
            "opened": public,
            "yourDossier": state["dossiers"].get(str(user_id), {}),
            "yourCards": state["cards"].get(str(user_id), []),
            "votes": dict(state["votes"]),
            "runoff": list(state["runoff"]),
            "accused": state.get("accused"),
            "youAlive": user_id in state["alive"],
            "canVote": state["phase"] == "vote" and user_id in state["alive"],
            "voteRound": state["voteRound"],
            "defending": state["phase"] == "defence" and state.get("speaker") == user_id,
            "winner": state.get("winner"),
            "epilogue": state.get("epilogue"),
            "secondsLeft": remaining(state),
        }

    def scores(self, state: dict[str, Any]) -> dict[int, dict[str, Any]]:
        survivors = state["alive"]
        output: dict[int, dict[str, Any]] = {}
        for player in state["players"]:
            won = player in survivors
            score = (70 if won else 20) + state["round"] * 6
            output[player] = {"score": score, "won": won, "placement": 1 if won else 2}
        return output
