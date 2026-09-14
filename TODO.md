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
- **Game art**, five role cards, four phase banners and a nine piece Bunker
  deck, all in the same clay as the covers.
- **Bunker** rebuilt on the official rules: four passes a round, the seventy
  percent threshold, a second vote, ties that take everyone in them.
- **Economy**, an invite ladder that pays most for the first few, streak
  freezes, and a stars shelf selling coins and one set stars alone can buy.
- **Alias** in pairs over four rounds, swapping roles between them.
- **Broken Telephone** as the drawing chain, with a canvas and a gallery.
- **Owner panel**, people found by anonymous name only, grants written to a
  ledger, promo codes minted and revoked, codes redeemed from settings.
- **One person sheet**, the server decides what a viewer may do about someone:
  a block and a report for a player, a warning and a mute for a moderator, a
  ban for an admin. Every sanction writes the person a notice.
- **Entrance**, a switch only the owner account has, and a clip the room sees
  when they walk in.

## **Economy**

Done. Still worth doing later: live payments need `PAYMENTS_MODE=live` and a
bot token on the API service, and the stars catalogue could use seasonal sets.

## **Home**

Done: one card with its own drawing per mode, and the mode switch above it.

## **Cosmetics, partly done**

- Done: six drawn characters, and three crest frames with looped movement.
- Still to do: more characters, and many more name effects.
- Every asset generated in our own style, backgrounds cut, checked against a
  real card before it ships.

## **Full design pass**

Every screen once the above lands. Motion, spacing, empty and loading states,
phone and desktop, both themes, both locales.

## Known smaller items

- Per game illustrated cards, the same treatment across the set.
- A dedicated coturn instead of the free Open Relay host: set `TURN_URLS` and
  `TURN_SECRET` on the API service, the code already mints REST credentials.
