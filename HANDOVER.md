# Handover

Written at the point where work moves off Claude Code on the web and onto the
server at `40.160.90.130`. The web session cannot be resumed there: its
transcript is a hundred and sixty megabytes inside a container that gets
reclaimed, and the CLI keeps its sessions per machine and per project path.
What follows is what that transcript was actually holding.

Read `CLAUDE.md` first; this file is only the live state on top of it.

## Where the code is

Branch `claude/affectionate-cray-idu7f1`, head `2b09bf8`. Everything below is
committed and pushed. There is no work in progress and no dirty tree.

The last eight commits, most recent first:

| | |
|---|---|
| `2b09bf8` | the voice stack rebuilt on the research, on the client |
| `631d04e` | rare frames as whole objects, the developer night sky |
| `790ce6f` | medals on the podium, a picture on every empty screen |
| `ecf9fb9` | the painted icon set, the shield retired |
| `92affb1` | the entrance clip at sixty frames, a skin that carries its own ink |
| `a525618` | one gold star everywhere |
| `08bc98b` | the owner panel and the person action sheet |
| `20a4cc4` | the owner panel backend, promo codes, the notice inbox |

## What is live right now

Render, both services on `2b09bf8`, deployed from this branch:

- mini app, static site: `https://anontma.onrender.com`
- API and websocket: `https://anontma-api.onrender.com`
- free Postgres and Key Value alongside them
- bot `@AnteikuAnonBot`, webhook registered on boot

Verified in production: the dev login route answers 404, the docs answer 404,
`/config/ice` refuses an unauthenticated caller, and a foreign origin gets no
CORS header back.

**Render is meant to be switched off once the server takes over.** Do not do it
before the new host is answering on a real domain with a valid certificate: the
bot webhook and the mini app both require HTTPS, and Telegram will simply stop
delivering.

## What the server still needs

Nothing has been built for it yet. The work, in order:

1. **A domain**, pointed at `40.160.90.130`. Nothing else can start without it.
2. `Dockerfile` for the backend, and a `docker-compose.prod.yml` with the API,
   Caddy, Postgres, Redis and coturn. The `docker-compose.yml` in the repo today
   is the local dependency pair only, not a deployment.
3. **Caddy** for automatic certificates, reverse proxying the API and the
   websocket and serving the built frontend.
4. **coturn**, which is the real prize of moving here. `TODO.md` has carried a
   dedicated TURN server as an open item for a while; the code already mints
   REST credentials from `TURN_SECRET`, so it is configuration rather than
   development. Two phones on mobile data cannot connect without a relay.
5. **A database backup**, `pg_dump` on a timer with a copy off the machine.
   Render was doing this invisibly; nobody is doing it now. Do not migrate data
   onto the box before this exists.
6. Environment in a `.env` beside the compose file, never in the repository:
   `ENVIRONMENT=production`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`,
   `JWT_SECRET`, `DATABASE_URL`, `REDIS_URL`, `PUBLIC_API_URL`,
   `PUBLIC_WEB_URL`, `CORS_ORIGINS`, `ADMIN_TG_IDS=7289857067`,
   `PAYMENTS_MODE`, `TURN_URLS`, `TURN_SECRET`.

One correction to carry over: `render.yaml` now starts uvicorn with
`--ws-max-size 131072`, because the sixty four kilobyte frame check runs after
the frame is already in memory. Whatever starts the API on the server needs the
same flag.

## Open work

From `TODO.md`, the parts that are genuinely unfinished rather than polished:

- more characters and many more name effects
- a full design pass over every screen once the above lands: motion, spacing,
  empty and loading states, phone and desktop, both themes, both locales
- per game illustrated cards, the same treatment across the set
- live Telegram Stars payments, which need `PAYMENTS_MODE=live` and the bot
  token on the API service

Deliberately not done, with reasons in `VOICE.md`: moving media onto a server
through an SFU. It would end the anonymity the product is sold on, cost about a
quarter of a core per stream, and be slower than the mesh for the one to one
calls that are most of the product. The note also says what would change that
answer, which is rooms growing past about six people. This box has eight cores,
so LiveKit becomes possible here in a way it never was on Render. It is still a
decision to take deliberately, not by default.

## How this session worked

Screenshots at 390x844 in both themes and both locales, Playwright against
`/opt/pw-browsers/chromium`. Generated art came from Higgsfield, was keyed out
of its painted background, trimmed to its own alpha bounds and resized to one
optical size; the scripts that did the keying and trimming were scratch files
and did not survive, but the method is in `CLAUDE.md` and the results are in
`frontend/src/assets`.

The DSP was written against headless checks first and only then put in a
browser, which is why the noise suppressor's estimator has the shape it does:
three attempts failed the measurement before the minimum statistics window was
long enough and the bias correction was right. Those numbers are in `VOICE.md`
and are reproducible with `scripts/dsp-check.mjs`.
