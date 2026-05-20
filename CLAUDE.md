# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read This First

Before touching the ID system, data layer, or schema: read `AI_README_FIRST.MD`. It contains critical architectural contracts that must be followed.

## First-Run Setup

A fresh clone is bootstrapped by:

```bash
npm run setup
```

This interactive script (`scripts/setup.mjs`) writes `apps/service/.env` and the root `.env`, optionally starts a local Postgres in Docker, runs `npm install`, and applies Drizzle migrations. Re-running it uses existing values as defaults, and backs up the previous `apps/service/.env` to `.env.backup`.

**Do not hand-edit env files when troubleshooting missing variables — tell the user to re-run `npm run setup`.** That script is the single source of truth for generated env files. The `.env.example` files document every variable but are not consumed at runtime.

Supabase URL/keys *are* the Postgres connection when the user picks Supabase mode — they aren't an unrelated add-on. In `docker` and `system` modes they are intentionally blank and the storage features (graphics uploads) are disabled.

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

## Architecture

UltraTable is a real-time fantasy sports platform structured as a monorepo with three apps:

| App | Stack | Port | Prod |
|-----|-------|------|------|
| `apps/service` | Fastify 5 + GraphQL Yoga + Drizzle + Better Auth | 8080 | Fly.io |
| `apps/web` | React 19 + Vite + urql + Dexie (IndexedDB) | 5175 | Vercel |
| `apps/admin` | React 19 + Vite + TanStack Query | 5174 | Vercel |

### Service Internals

- **Entry**: `apps/service/src/index.ts` — registers Fastify plugins, mounts Yoga at `/graphql`, auth at `/api/auth/*`, health at `/healthz`
- **Schema**: `apps/service/src/schema/` — Pothos builder splits schema into modules (`football.ts`, `catalog.ts`, `graphics.ts`, `config.ts`, `workers.ts`)
- **Repository**: `apps/service/src/repositories/supabase.repository.ts` — single data access point for all Postgres queries via Drizzle
- **Services**: `apps/service/src/services/` — auth, LRU cache, Pino logging, graphics
- **Integrations**: `apps/service/src/integrations/api-football/` (live) and `mock/` (testing)
- **DB Schema**: `apps/service/src/db/schema.ts` — all Drizzle table definitions; migrations in `apps/service/drizzle/`

### Authentication

Better Auth manages sessions (email/password + Google OAuth). Two-tier user model: `auth_user` (Better Auth) linked to domain `user` (with roles) via `auth_links`. Dev-only `/api/auth/dev-login` endpoint exists for testing roles locally.

## Critical Contracts

### Dual-ID System
Every entity has two IDs — never conflate them:

| Name pattern | Type | Meaning |
|---|---|---|
| `leagueId`, `teamId`, `seasonId` | `String` (UUID) | Internal Postgres primary key |
| `leagueSourceId`, `teamSourceId` | `Int` | External API-Football provider ID |

GraphQL args for external IDs must use the `sourceId` suffix. All GraphQL fields/args must have a `description` property stating which ID type they accept.

### Timestamps
- Every timestamp column must use the `utcTimestamp()` helper in `schema.ts` (enforces `timestamptz(3)`)
- Never use bare `timestamp()` or `sql\`now()\`` — use `NOW_MS` from `supabase.repository.ts`
- Postgres `now()` is microseconds; JS `Date` and GraphQL `DateTime` are milliseconds — mixing causes phantom delta sync bugs

### Hybrid Schema (SQL + JSONB)
Only put data in explicit columns if the DB engine needs it (foreign keys, unique constraints, filter/sort targets). Everything else goes in `metadata: jsonb('metadata')`. Do not add columns for display-only or optional fields.

### Cache Isolation
Raw API cache (`apiGet`) is keyed by `[endpoint]_[remoteId]_[season]` (external IDs).  
Domain cache is keyed by internal UUIDs. They never share keys — this ensures a deleted+recreated entity gets a clean cache slate automatically.

## TypeScript Standards

- **No `any`** — ever. Use `unknown` with type guards, or Drizzle's `$inferSelect`/`$inferInsert` for DB types.
- Zero lint warnings is mandatory. After changes: `npm run lint --workspaces`
- Keep components small and focused. No "God Components" or 1000+ line files.

## Utility Scripts

Write one-off scripts to `/tmp/` (not the workspace root or `apps/`). Include a header comment: what it does, why it was generated, creation datetime. Delete them when done.
