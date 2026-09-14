# Outstanding work

Kept here rather than in a chat so it survives between sessions. Ordered by
what blocks the most. Everything below comes from the brief, plus Emil's
comments on it.

## Done and in the repository

- **City Mafia**, ten seats and a host, the full federation rule set, host
  panel, private notes, fouls and warnings. Engine, board and cover.
- **Staff roles**, owner, admin, moderator, helper, with moderation and support
  as separate ladders.
- **Support desk**, topics that route to the right queue, threaded both ways,
  reachable from settings.
- **Streak with no ceiling**, a curve instead of a table, smaller payouts that
  climb, weekly and monthly milestones, and a flame that grows through five
  stages.
- **Icon pack**, five generated tab marks with a coloured and a grey state cut
  from one file.
- **Home**, one ink card with its own drawing per mode, identical in both
  themes.
- **Avatar pack**, six drawn characters. **Crest frames**, ears, petals, crown.

## **2. Bunker to the official rules**

Rebuild against https://bunker-online.com/ru/rules.

- Six to fifteen players, places are half the table rounded down.
- A minute of introduction per player, a minute of general discussion, thirty
  seconds of defence each, fifteen seconds to vote.
- How many traits open per round comes from a table keyed on the player count,
  and the profession always opens in round one.
- Seventy percent of the votes excludes at once. A plurality under that gives
  thirty seconds of defence and a revote. A tie does the same. A tie on the
  revote excludes everyone tied, except in round one, which never excludes.
- Seven rounds at most, and the game ends as soon as the bunker is full.
- Action cards are barred during last words.

## **Economy, still to do**

- A Telegram Stars shop. Nothing exists yet.
- Much bigger rewards for an invite, weighted to the first few. Today an invite
  pays a flat hundred coins.
- Streak freezes in the Duolingo shape: a freeze is spent automatically on a
  missed day, and can be bought and stockpiled. Nothing exists yet.

## **Home**

Done: one card with its own drawing per mode, and the mode switch above it.

## **Cosmetics, partly done**

- Done: six drawn characters, and three crest frames with looped movement.
- Still to do: more characters, and many more name effects.
- Every asset generated in our own style, backgrounds cut, checked against a
  real card before it ships.

## **8. Alias**

Pairs of two players, four rounds, a skipped word costs a point.

## **9. Broken Telephone**

The drawing chain: write a situation in thirty seconds, the neighbour draws it
in sixty, the next writes what they see. Two rounds, then a vote on the best
chain. Needs a canvas and per step image storage.

## **10. Full design pass**

Every screen once the above lands. Motion, spacing, empty and loading states,
phone and desktop, both themes, both locales.

## Known smaller items

- Per game illustrated cards, the same treatment across the set.
- A dedicated coturn instead of the free Open Relay host: set `TURN_URLS` and
  `TURN_SECRET` on the API service, the code already mints REST credentials.
