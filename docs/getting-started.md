# Getting Started — Local Development

This guide walks a fresh clone to a running three-service stack. Once it's up, **[first-league.md](first-league.md)** takes you from "stack is running" to a synced league with teams, fixtures, and a standings table on the web. For the production rollout, see [DEPLOYMENT.md](DEPLOYMENT.md). For architecture deep dives, see [auth-architecture.md](auth-architecture.md) and [frontend-patterns.md](frontend-patterns.md).

## Project layout

UltraTable is a monorepo with three workspaces under `/apps`:

| App            | Stack                                            | Dev port | Production |
| -------------- | ------------------------------------------------ | -------- | ---------- |
| `apps/service` | Fastify 5 + GraphQL Yoga + Drizzle + Better Auth | 8080     | Fly.io     |
| `apps/web`     | React 19 + Vite + urql + Dexie (IndexedDB)       | 5175     | Vercel     |
| `apps/admin`   | React 19 + Vite + shadcn/ui                      | 5174     | Vercel     |

## Prerequisites

- **[Volta](https://volta.sh/)** — `curl https://get.volta.sh | bash`. The root `package.json`'s `volta` field pins Node + npm; Volta auto-installs the right versions the moment you `cd` into the repo. No manual `nvm` / `fnm` / `brew install node` needed.
- **Docker** — only if you want the setup script to provision a local Postgres for you. Skip it if you're using Supabase or a system Postgres.

> Without Volta you can still install Node manually, but the pinned versions in `package.json` (`volta.node`, `volta.npm`) are the source of truth — match them or you may hit lockfile / engine drift.

## One-command setup

From a fresh clone:

```bash
npm run setup
```

This interactive script ([scripts/setup.mjs](../scripts/setup.mjs)):

1. Checks that Node, npm, and (optionally) Docker are installed.
2. Asks how you want to run Postgres:
    - **`docker`** — spins up `postgres:16-alpine` via `docker compose up -d postgres`.
    - **`supabase`** — collects your Supabase project URL, anon key, service role key, and connection string.
    - **`system`** — you bring your own `DATABASE_URL`.
3. Asks for your API-Football key (optional — the service starts without it, but sport-data endpoints will 401 until you add one).
4. Generates a `BETTER_AUTH_SECRET` automatically.
5. Writes [`apps/service/.env`](../apps/service/.env.example) and the root [`.env`](../.env.example).
6. Offers to run `npm install` and the two-step migration flow in `apps/service`: `npm run db:bootstrap` (stamps `drizzle.__drizzle_migrations` for DBs that were originally set up via `db:push`; idempotent) followed by `npm run db:migrate` (applies any pending migration files).

Re-run it any time to change credentials — existing values become the prompt defaults, so press Enter to keep them. Each run timestamps the prior `apps/service/.env` to `apps/service/.env.backup.<ISO timestamp>` so nothing is lost.

> **Supabase = Postgres.** The Supabase URL / keys aren't an add-on — they're how you connect to a Supabase-hosted Postgres + storage. Pick `supabase` _or_ `docker` / `system`, not both.

> When you see missing env vars at runtime, **do not hand-edit `.env` files** — re-run `npm run setup`. That script is the single source of truth for generated env files.

## Starting all services

```bash
npm run dev
```

Wraps `concurrently` to start all three dev servers, killing any stale processes on the relevant ports first. **Never** start them individually with `pkill` / `kill -9` — use `Ctrl+C` on the `dev` process so child processes shut down cleanly.

| Service                   | URL (default)                                             |
| ------------------------- | --------------------------------------------------------- |
| GraphQL / Yoga playground | [http://localhost:8080/graphql](http://localhost:8080/graphql) |
| Health check              | [http://localhost:8080/healthz](http://localhost:8080/healthz) |
| Admin UI                  | [http://localhost:5174](http://localhost:5174)             |
| Web UI                    | [http://localhost:5175](http://localhost:5175)             |

The ports above are the defaults. The setup script prompts for `SERVICE_PORT` / `ADMIN_PORT` / `WEB_PORT` and writes them to the root `.env` (plus each app's `.env`); re-run `npm run setup` to change them. The Fastify CORS allowlist, Vite proxies, dev tooling (`start:all`, `health:check`, `wait-for-port`), and the docker-compose service all read these values automatically.

## Useful commands

```bash
npm run health:check                       # ping all three ports
npm run db:migrate --prefix apps/service   # apply pending migrations (canonical path)
npm run db:bootstrap --prefix apps/service # one-time: stamp __drizzle_migrations on a db:push-bootstrapped DB
npm run db:reset --prefix apps/service     # wipe + reseed
npm run lint --workspaces                  # lint all packages (zero warnings is mandatory)
npm run test                               # vitest across all workspaces
docker compose up -d postgres              # bring just Postgres up
docker compose down                        # stop everything
```

## Production-like local run via Docker

The `docker-compose.yml` also builds the service image so you can run it the way Fly.io does:

```bash
docker compose up --build -d service  # uses apps/service/.env
docker compose logs -f service
```

## Schema changes

Schema changes go through `db:generate` → commit the migration → `db:migrate`:

```bash
npm run db:generate --prefix apps/service   # diff schema.ts → new migration file
git add apps/service/drizzle/                # commit the migration with the schema change
npm run db:migrate --prefix apps/service     # apply locally
```

`db:push` still exists as an escape hatch for prototyping (diffs the live DB against the TS schema), but it bypasses the migration history — if you use it, run `db:bootstrap` afterward so the migration runner stays in sync.
