# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read This First

This file covers **what to run and where things live**. The architectural contracts and agent operating rules live in [AI_README_FIRST.MD](AI_README_FIRST.MD) — read that before touching the ID system, data layer, schema, or GraphQL resolvers. Specifically:

- **§1 ID Philosophy** — dual-ID system, naming convention, timestamp/timezone rules, hybrid SQL+JSONB column policy
- **§3–4 Cache Isolation & Lifecycle** — raw API cache vs. domain cache keying
- **§5 Architecture & Design Principles** — library-over-bespoke, DataLoader requirement for nested resolvers, performance and SOLID/DRY guidance
- **§6 Auth Contracts** — identity ≠ account, never auto-link by email, per-frontend OAuth redirect URIs, viewer-returns-null. Deep dive: [docs/auth-architecture.md](docs/auth-architecture.md).
- **§7 AI Agent Operational Rules** — no `any`, keep components small, write one-off scripts to `/tmp/`, ask first for large refactors

## First-Run Setup

A fresh clone is bootstrapped by:

```bash
npm run setup
```

This interactive script (`scripts/setup.mjs`) writes `apps/service/.env` and the root `.env`, optionally starts a local Postgres in Docker, runs `npm install`, and applies Drizzle migrations. Re-running it uses existing values as defaults, and backs up the previous `apps/service/.env` to `.env.backup`.

**Do not hand-edit env files when troubleshooting missing variables — tell the user to re-run `npm run setup`.** That script is the single source of truth for generated env files. The `.env.example` files document every variable but are not consumed at runtime.

Supabase URL/keys _are_ the Postgres connection when the user picks Supabase mode — they aren't an unrelated add-on. In `docker` and `system` modes they are intentionally blank and the storage features (graphics uploads) are disabled.

## Commands

### Root (all workspaces)

```bash
npm run setup            # First-run: prompts for env vars, writes apps/service/.env + root .env
npm run dev              # Start all three services (kills orphan processes first)
npm run test             # Run vitest across all workspaces
npm run test:run         # Non-watch test run
npm run lint             # Lint all workspaces
npm run health:check     # Verify all three ports are responding
```

### Service (`apps/service/`)

```bash
npm run dev              # Nodemon + ts-node
npm run db:generate      # Drizzle schema → migration files
npm run db:push          # Apply migrations to Postgres
npm run db:reset         # Wipe and reseed database
npm run test:integration # Integration tests only
```

### Web / Admin (`apps/web/`, `apps/admin/`)

```bash
npm run dev     # Vite dev server (web: 5175, admin: 5174)
npm run build   # tsc + vite build
```

**Always use `npm run dev` (or `start:all`) instead of starting services individually.** Never use `pkill` — it leaves orphan processes and dangling sockets.

Both frontends build their UI from **shadcn/ui primitives** vendored under each app's `src/components/ui/`. Before adding or restyling a popup, dropdown, dialog, table, etc., read [docs/frontend-patterns.md](docs/frontend-patterns.md) — it covers `npx shadcn add`, the theme variable contract, and vendor-vs-compose.

## Architecture

UltraTable is a real-time fantasy sports platform structured as a monorepo with three apps:

| App            | Stack                                            | Port | Prod   |
| -------------- | ------------------------------------------------ | ---- | ------ |
| `apps/service` | Fastify 5 + GraphQL Yoga + Drizzle + Better Auth | 8080 | Fly.io |
| `apps/web`     | React 19 + Vite + urql + Dexie (IndexedDB)       | 5175 | Vercel |
| `apps/admin`   | React 19 + Vite + TanStack Query                 | 5174 | Vercel |

### Service Internals

- **Entry**: `apps/service/src/index.ts` — registers Fastify plugins, mounts Yoga at `/graphql`, auth at `/api/auth/*`, health at `/healthz`
- **Schema**: `apps/service/src/schema/` — Pothos builder splits schema into modules (`football.ts`, `catalog.ts`, `graphics.ts`, `config.ts`, `workers.ts`)
- **Repository**: `apps/service/src/repositories/` — storage-agnostic facade (`interfaces.ts` defines `IRepository`, `index.ts` exports the active backend). The Postgres implementation lives in `postgres/` as per-domain sub-repos. Consumers import `{ repository }` from `'../repositories'` and never name the backend.
- **Services**: `apps/service/src/services/` — auth, LRU cache, Pino logging, graphics
- **Integrations**: `apps/service/src/integrations/api-football/` (live) and `mock/` (testing)
- **DB Schema**: `apps/service/src/db/schema.ts` — all Drizzle table definitions; migrations in `apps/service/drizzle/`

### Authentication

Better Auth manages sessions (email/password + Google OAuth). Two-tier user model: `auth_user` (one per provider identity) linked to domain `user` (with roles) via `auth_links`. A `user.create.after` hook in [apps/service/src/services/auth-bootstrap.ts](apps/service/src/services/auth-bootstrap.ts) creates a fresh domain user + link for every new identity — no auto-linking by email. The GraphQL `Query.viewer` returns the joined domain account (or `null` when unauthenticated), defined in [apps/service/src/schema/viewer.ts](apps/service/src/schema/viewer.ts). Dev-only `/api/auth/dev-login` endpoint mints sessions for canned roles locally.

In production, `apps/admin` and `apps/web` each rewrite `/api/auth/*` to the service container, so the OAuth redirect URI lives on each frontend's own hostname. Each frontend also has its own Google OAuth client: the public `VITE_GOOGLE_CLIENT_ID` lives in `apps/{admin,web}/.env` (bundled into the JS), the matching secret stays server-side as `GOOGLE_CLIENT_SECRET_{ADMIN,WEB}` in `apps/service/.env`. See [docs/auth-architecture.md](docs/auth-architecture.md) for the full model — read it before touching sign-in, the hook, or the viewer.

## Verifying Changes

Zero lint warnings is mandatory. After any change, run:

```bash
npm run lint --workspaces
```

For everything else — architectural contracts (ID system, timestamps, hybrid schema, cache isolation, DataLoader rule) and operational rules (no `any`, small components, `/tmp/` for one-off scripts) — see [AI_README_FIRST.MD](AI_README_FIRST.MD).
