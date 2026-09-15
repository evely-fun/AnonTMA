# Anteiku

An anonymous voice and text chat that runs as a Telegram Mini App. Strangers
are matched, wear a generated mask, and nothing links a conversation back to a
Telegram account unless both sides choose to reveal. Rooms, party games, a coin
economy and cosmetics sit on top of that.

## Where things are

```
backend/app/
  api/v1/           REST: auth, users, rooms, games, shop, economy, admin, owner
  realtime/         the websocket: gateway, hub, presence, matchmaking, signalling
  games/            one module per game, each a state machine over effects
  services/         the business rules: economy, shop, moderation, staff, owner
  db/models.py      every table
frontend/src/
  features/voice/   the whole audio stack, see VOICE.md
  features/games/   boards and art
  pages/            one file per screen
  shared/ui/        primitives, icons, painted marks
  shared/i18n/      en.ts and ru.ts, both always
  styles/index.css  the token layer, see DESIGN.md
```

`DESIGN.md` is the visual law, `VOICE.md` the audio law, `DEPLOY.md` the
operational one. Read the relevant one before changing that area; they exist so
decisions are not re-argued from memory.

## How it runs locally

Three processes. Redis is not optional: without it `/config/bootstrap` hangs and
the app shows "Cannot reach the server", which looks like a frontend bug and is
not one.

```bash
redis-server --port 6379 --save '' --appendonly no --daemonize yes

cd backend && ENVIRONMENT=development DATABASE_URL="sqlite+aiosqlite:///./smoke.db" \
  ADMIN_TG_IDS=7289857067 .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8001

cd frontend && npm run dev          # 5173
```

Sign in without Telegram: `POST /api/v1/auth/dev?tg_id=<id>` returns a token
pair. The route is refused when `ENVIRONMENT=production`.

## Checks

```bash
cd frontend
npx tsc --noEmit -p tsconfig.json         # must be clean before any commit
node --expose-gc scripts/dsp-check.mjs    # 16, the noise suppressor and the voice changer
node scripts/codec-check.mjs              # 16, Opus parameters and the safety code
node scripts/voice-check.mjs              # two browsers, a real call, needs the servers up
cd ../backend && .venv/bin/python tests/smoke_realtime.py
```

Browser work is verified with Playwright at `/opt/pw-browsers/chromium`, 390x844,
both themes and both locales. A screenshot is the evidence; a claim that
something renders is not.

## House rules

**Design.** `DESIGN.md` is binding. The two that get broken most often: actions
are ink rather than colour, and labels are never uppercase. Light is the default
theme and dark is not an afterthought, so both are checked every time.

**Icons.** Anything that names a thing is a painted clay mark from
`shared/ui/marks.tsx`. Anything you tap is a stroked glyph. New art is generated
in that same soft matte clay, cut out of its background, and normalised to one
optical size before it ships.

**Language.** Every string lands in `en.ts` and `ru.ts` together. Russian
plurals need the `Plural` and `Many` suffixes.

**Comments.** Sparse, and about why rather than what. A comment that repeats the
line below it is noise. No decorative separators.

**Commits.** Prose, lower case subject, no scope prefixes beyond `feat:`,
`fix:`, `chore:`. Say what changed and what it fixes. Never put a model name in
a commit, a PR, a code comment or anything else that reaches the repository.

**Money and rank.** The server decides. The client renders what it is told and
never what it hopes: `/users/{id}/actions` returns the list of things a viewer
may do, and the UI draws exactly that.

## Things that have already bitten

- **A byte rate is not a liveness check.** Opus runs with DTX, so a quiet call
  legitimately drops to a few hundred bytes a second. Count packets.
- **The owner panel must stay anonymous.** No Telegram id, username or real name
  reaches staff anywhere in `services/owner.py`. People are found by anonymous
  name or internal id only.
- **Exclusive items are not purchasable.** They arrive by grant or promo code,
  and `buy` refuses them with `not_for_sale`.
- **Painted tiles carry their own ink.** A skin that is a photograph rather than
  a tint sets its own label, elevated and accent colours, or the light theme
  prints dark text on a dark picture.
- **The voice pipeline falls back rather than going silent**, except when a mask
  is on: there the raw microphone is the user's real voice, so it publishes
  nothing and warns instead.

## The admin account

Telegram id `7289857067` is the owner. It holds `owner.panel` and
`owner.announce`, the only account with the entrance switch, and the developer
cosmetics: the Asuka portrait, four rare wreath frames, the crimson name and two
painted backgrounds.
