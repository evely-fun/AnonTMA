import random
from collections import Counter
from typing import Any

from app.games.base import Effect, GameEngine, GameMeta, deadline, remaining

NIGHT_SECONDS = 40
REVEAL_SECONDS = 8
DISCUSSION_SECONDS = 100
VOTE_SECONDS = 35
DEFENCE_SECONDS = 20

ROLE_MAFIA = "mafia"
ROLE_DOCTOR = "doctor"
ROLE_DETECTIVE = "detective"
ROLE_CIVILIAN = "civilian"


def _distribute(players: list[int]) -> dict[str, str]:
    pool = list(players)
    random.shuffle(pool)
    total = len(pool)
    mafia_count = max(1, total // 4)
    roles: dict[str, str] = {}

    for _ in range(mafia_count):
        roles[str(pool.pop())] = ROLE_MAFIA
    if total >= 5 and pool:
        roles[str(pool.pop())] = ROLE_DOCTOR
    if total >= 6 and pool:
        roles[str(pool.pop())] = ROLE_DETECTIVE
    for remaining_player in pool:
        roles[str(remaining_player)] = ROLE_CIVILIAN
    return roles


class Mafia(GameEngine):
    meta = GameMeta(
        key="mafia",
        title="Mafia",
        subtitle="Voice deduction for 4 to 12 players",
        icon="🕵️",
        accent="#E0514C",
        min_players=4,
        max_players=12,
        voice_required=True,
        duration_minutes=15,
        tags=["voice", "party", "deduction"],
        rules=[
            "At night the mafia picks a victim, the doctor saves, the detective checks",
            "By day everyone speaks and votes for one suspect",
            "Town wins when every mafia is out, mafia wins when they equal the town",
        ],
    )

    def create(self, players: list[int], options: dict[str, Any]) -> dict[str, Any]:
        return {
            "phase": "lobby",
            "players": list(players),
            "alive": list(players),
            "roles": {},
            "day": 0,
            "nightActions": {},
            "votes": {},
            "checks": {},
            "log": [],
            "accused": None,
            "deadline": None,
            "winner": None,
            "revealRoles": bool(options.get("revealRoles", True)),
        }

    def start(self, state: dict[str, Any]) -> list[Effect]:
        state["roles"] = _distribute(state["players"])
        state["phase"] = "night"
        state["day"] = 1
        state["deadline"] = deadline(NIGHT_SECONDS)
        state["log"].append({"day": 1, "text": "night_started"})

        effects: list[Effect] = []
        mafia_team = [int(key) for key, role in state["roles"].items() if role == ROLE_MAFIA]
        for player in state["players"]:
            role = state["roles"][str(player)]
            effects.append(
                Effect(
                    event={
                        "type": "mafia.role",
                        "payload": {
                            "role": role,
                            "team": mafia_team if role == ROLE_MAFIA else [],
                        },
                    },
                    target="user",
                    user_id=player,
                )
            )
        effects.append(
            Effect(event={"type": "game.phase", "payload": {"phase": "night", "day": 1}})
        )
        return effects

    def action(
        self, state: dict[str, Any], user_id: int, action: str, payload: dict[str, Any]
    ) -> list[Effect]:
        if user_id not in state["alive"]:
            return []
        role = state["roles"].get(str(user_id), ROLE_CIVILIAN)
        target = int(payload.get("target", 0) or 0)

        if action == "night_action" and state["phase"] == "night":
            if target not in state["alive"] or role == ROLE_CIVILIAN:
                return []
            if role == ROLE_MAFIA and state["roles"].get(str(target)) == ROLE_MAFIA:
                return []
            state["nightActions"][str(user_id)] = {"role": role, "target": target}
            effects = [
                Effect(
                    event={"type": "mafia.night_locked", "payload": {"target": target}},
                    target="user",
                    user_id=user_id,
                )
            ]
            if role == ROLE_MAFIA:
                for mate in self._mafia_alive(state):
                    if mate != user_id:
                        effects.append(
                            Effect(
                                event={"type": "mafia.team_pick", "payload": {"by": user_id, "target": target}},
                                target="user",
                                user_id=mate,
                            )
                        )
            if self._night_complete(state):
                effects += self._resolve_night(state)
            return effects

        if action == "vote" and state["phase"] == "vote":
            if target not in state["alive"] and target != 0:
                return []
            state["votes"][str(user_id)] = target
            effects = [
                Effect(event={"type": "mafia.vote", "payload": {"by": user_id, "target": target, "count": len(state["votes"])}})
            ]
            if len(state["votes"]) >= len(state["alive"]):
                effects += self._resolve_vote(state)
            return effects

        if action == "skip_phase" and state["phase"] == "discussion":
            state["skips"] = list(set(state.get("skips", []) + [user_id]))
            if len(state["skips"]) > len(state["alive"]) // 2:
                return self._open_vote(state)
            return [Effect(event={"type": "mafia.skip", "payload": {"count": len(state["skips"])}})]

        return []

    def _mafia_alive(self, state: dict[str, Any]) -> list[int]:
        return [
            player for player in state["alive"] if state["roles"].get(str(player)) == ROLE_MAFIA
        ]

    def _night_complete(self, state: dict[str, Any]) -> bool:
        expected = {
            player
            for player in state["alive"]
            if state["roles"].get(str(player)) in (ROLE_MAFIA, ROLE_DOCTOR, ROLE_DETECTIVE)
        }
        submitted = {int(key) for key in state["nightActions"]}
        return expected.issubset(submitted)

    def _resolve_night(self, state: dict[str, Any]) -> list[Effect]:
        picks = Counter()
        healed: int | None = None
        checked: tuple[int, int] | None = None

        for raw_id, entry in state["nightActions"].items():
            if entry["role"] == ROLE_MAFIA:
                picks[entry["target"]] += 1
            elif entry["role"] == ROLE_DOCTOR:
                healed = entry["target"]
            elif entry["role"] == ROLE_DETECTIVE:
                checked = (int(raw_id), entry["target"])

        victim = picks.most_common(1)[0][0] if picks else None
        saved = victim is not None and victim == healed
        effects: list[Effect] = []

        if checked is not None:
            detective_id, suspect = checked
            is_mafia = state["roles"].get(str(suspect)) == ROLE_MAFIA
            state["checks"].setdefault(str(detective_id), {})[str(suspect)] = is_mafia
            effects.append(
                Effect(
                    event={"type": "mafia.check_result", "payload": {"target": suspect, "isMafia": is_mafia}},
                    target="user",
                    user_id=detective_id,
                )
            )

        if victim is not None and not saved and victim in state["alive"]:
            state["alive"].remove(victim)
            state["log"].append({"day": state["day"], "text": "killed", "user": victim})
        elif saved:
            state["log"].append({"day": state["day"], "text": "saved", "user": victim})

        state["nightActions"] = {}
        state["phase"] = "reveal"
        state["deadline"] = deadline(REVEAL_SECONDS)
        effects.append(
            Effect(
                event={
                    "type": "mafia.night_result",
                    "payload": {
                        "victim": None if saved else victim,
                        "saved": saved,
                        "alive": state["alive"],
                        "role": state["roles"].get(str(victim)) if victim and not saved and state["revealRoles"] else None,
                    },
                }
            )
        )
        outcome = self._check_end(state)
        return effects + outcome

    def _open_vote(self, state: dict[str, Any]) -> list[Effect]:
        state["phase"] = "vote"
        state["votes"] = {}
        state["skips"] = []
        state["deadline"] = deadline(VOTE_SECONDS)
        return [Effect(event={"type": "game.phase", "payload": {"phase": "vote", "day": state["day"]}})]

    def _resolve_vote(self, state: dict[str, Any]) -> list[Effect]:
        tally = Counter(value for value in state["votes"].values() if value)
        effects: list[Effect] = []
        eliminated: int | None = None

        if tally:
            top, count = tally.most_common(1)[0]
            tied = [player for player, votes in tally.items() if votes == count]
            if len(tied) == 1 and count > len(state["alive"]) / 2 - 0.5:
                eliminated = top

        if eliminated and eliminated in state["alive"]:
            state["alive"].remove(eliminated)
            state["log"].append({"day": state["day"], "text": "voted_out", "user": eliminated})

        effects.append(
            Effect(
                event={
                    "type": "mafia.vote_result",
                    "payload": {
                        "eliminated": eliminated,
                        "role": state["roles"].get(str(eliminated)) if eliminated and state["revealRoles"] else None,
                        "tally": {str(key): value for key, value in tally.items()},
                        "alive": state["alive"],
                    },
                }
            )
        )

        ended = self._check_end(state)
        if ended:
            return effects + ended

        state["day"] += 1
        state["phase"] = "night"
        state["votes"] = {}
        state["deadline"] = deadline(NIGHT_SECONDS)
        effects.append(
            Effect(event={"type": "game.phase", "payload": {"phase": "night", "day": state["day"]}})
        )
        return effects

    def _check_end(self, state: dict[str, Any]) -> list[Effect]:
        mafia = self._mafia_alive(state)
        town = [player for player in state["alive"] if player not in mafia]
        winner: str | None = None
        if not mafia:
            winner = "town"
        elif len(mafia) >= len(town):
            winner = "mafia"
        if winner is None:
            return []

        state["phase"] = "finished"
        state["winner"] = winner
        state["deadline"] = None
        return [
            Effect(
                event={
                    "type": "game.finished",
                    "payload": {"winner": winner, "roles": state["roles"], "alive": state["alive"]},
                }
            )
        ]

    def tick(self, state: dict[str, Any], now: float) -> list[Effect]:
        if not state.get("deadline") or now < state["deadline"]:
            return []
        phase = state["phase"]

        if phase == "night":
            return self._resolve_night(state)
        if phase == "reveal":
            state["phase"] = "discussion"
            state["skips"] = []
            state["deadline"] = deadline(DISCUSSION_SECONDS)
            return [
                Effect(event={"type": "game.phase", "payload": {"phase": "discussion", "day": state["day"]}})
            ]
        if phase == "discussion":
            return self._open_vote(state)
        if phase == "vote":
            return self._resolve_vote(state)
        return []

    def player_view(self, state: dict[str, Any], user_id: int) -> dict[str, Any]:
        role = state["roles"].get(str(user_id))
        alive = user_id in state["alive"]
        finished = state["phase"] == "finished"
        visible_roles: dict[str, str] = {}

        if finished or not alive:
            visible_roles = dict(state["roles"])
        elif role == ROLE_MAFIA:
            visible_roles = {
                key: value for key, value in state["roles"].items() if value == ROLE_MAFIA
            }
        elif role is not None:
            visible_roles = {str(user_id): role}

        return {
            "phase": state["phase"],
            "day": state["day"],
            "players": state["players"],
            "alive": state["alive"],
            "yourRole": role,
            "youAlive": alive,
            "visibleRoles": visible_roles,
            "checks": state["checks"].get(str(user_id), {}),
            "votes": state["votes"] if state["phase"] in ("vote", "finished") else {},
            "nightLocked": str(user_id) in state["nightActions"],
            "log": state["log"][-12:],
            "winner": state.get("winner"),
            "secondsLeft": remaining(state),
            "canAct": alive
            and (
                (state["phase"] == "night" and role in (ROLE_MAFIA, ROLE_DOCTOR, ROLE_DETECTIVE))
                or state["phase"] == "vote"
            ),
        }

    def scores(self, state: dict[str, Any]) -> dict[int, dict[str, Any]]:
        winner = state.get("winner")
        output: dict[int, dict[str, Any]] = {}
        for player in state["players"]:
            role = state["roles"].get(str(player), ROLE_CIVILIAN)
            team = "mafia" if role == ROLE_MAFIA else "town"
            won = winner == team
            survived = player in state["alive"]
            score = (60 if won else 15) + (20 if survived else 0) + state["day"] * 5
            output[player] = {"score": score, "won": won, "placement": 1 if won else 2}
        return output
