# 🚨 AI AGENT ARCHITECTURE GUIDE

**MY DEV ENVIRONMENT IS NOT THE AGENT'S DEV ENVIRONMENT — STAY OUT.** Your ports are not the operator's ports. Your containers are not the operator's containers. Your volume is not the operator's volume. Do not run `npm run setup`, `npm run dev` / `start:all`, `docker compose up/down/restart` against the default `ultratable` project name, `db:migrate` / `db:bootstrap` / `db:reset`, or anything else that mutates the operator's env files, running containers, dev servers, or database. The three live-mutation scripts hard-refuse when invoked from an agent session. **When you genuinely need a live run, spin up your own isolated stack** in a git worktree with `COMPOSE_PROJECT_NAME=claude-dev-ultratable` and auto-shifted ports — never `--i-am-the-human` (that bypass is for the human if a heuristic misfires, not for the agent). Full pattern in [§9](#9-ai-agent-operational-rules).

**NEVER TAKE CONTROL OF A BROWSER FOR VERIFYING UNLESS CLEARLY ASKED**

> [!IMPORTANT]
> **DIRECTORY ISOLATION RULES**

- **Legacy**: We used to have a `/src` directory for the old legacy architecture. It has been deleted.
    > - **Active Development**: All new projects, backends, and frontends live EXCLUSIVELY under the `/apps/` directory.
    > - **BFF (Back-end for Front-end)**: We are currently building a new GraphQL service and Postgres database in `/apps/service`.
    > - **Rewriting Strategy**: When building new frontends, we use `/src` as a blueprint but rewrite it natively from scratch in a new `/apps/[app-name]` directory.
    >
    > **LOCAL DEV PORTS** (defaults — overridable via `SERVICE_PORT` / `ADMIN_PORT` / `WEB_PORT` in the root `.env`, written by `npm run setup`)
    >
    > - **Service (GraphQL)**: `http://localhost:8080` — Fastify + Yoga GraphQL endpoint
    > - **Web App**: `http://localhost:5175` — Vite React frontend for end users
    > - **Admin App**: `http://localhost:5174` — Vite React frontend for admin operations
    >
    > **STARTING/STOPPING DEV SERVERS**
    >
    > - **Start all**: `npm run start:all` (or `npm run dev`) — kills any existing processes on the ports, then starts all three services via `concurrently`. **Always use this instead of starting services individually.**
    > - **Stop all**: Kill the `start:all` process (Ctrl+C) — this will stop all three services cleanly.
    > - **Never use `pkill` or `kill -9`** to stop individual services — it leaves orphan child processes and dangling sockets. Always stop/restart via the `start:all` script.
    >
    > **FIRST-RUN / ENV FILES**
    >
    > - The repo is bootstrapped by `npm run setup` (see [`scripts/setup.mjs`](scripts/setup.mjs)). It writes [`apps/service/.env`](apps/service/.env.example) and the root [`.env`](.env.example). Re-running uses existing values as defaults and backs up the previous `.env` to `.env.backup`.
    > - Three Postgres modes: `docker` (local container in [`docker-compose.yml`](docker-compose.yml)), `supabase` (hosted), or `system` (BYO `DATABASE_URL`). **Supabase URL/keys ARE the Postgres connection** for the Supabase mode — never treat them as an unrelated add-on.
    > - When you see missing env vars at runtime, do NOT hand-edit `.env` files unless the user explicitly asks. Tell the user to run `npm run setup` instead — that script is the single source of truth for generated env files.
    >
    > **DB MIGRATIONS & BOOTSTRAP**
    >
    > - The canonical path is `db:generate` → commit → `db:migrate`. `db:bootstrap` exists only to stamp `drizzle.__drizzle_migrations` on a DB that was originally set up via `db:push`. It has three branches, in order:
    >     1. Migrations table has rows → no-op.
    >     2. Migrations table empty AND `public.leagues` is missing → fresh DB; skip stamping and exit 0 so `setup.mjs`'s `db:bootstrap && db:migrate` chain falls through to migrate, which creates the schema.
    >     3. Migrations table empty AND `public.leagues` exists → push-style DB; stamp from the journal.
    > - **`public.leagues` is a load-bearing canary** in [`apps/service/src/scripts/bootstrap-migrations.ts`](apps/service/src/scripts/bootstrap-migrations.ts) because it's been in migration `0000` since day one. If you ever rename or drop `leagues`, swap the canary for another table that's guaranteed to exist after migration `0000`. Skipping this step silently breaks the fresh-DB path for new contributors.
    >
    > **ID GENERATION RULES**
    >
    > - **EVERY ID IS A NATIVE POSTGRES UUID EXCEPT FOR DIRECT CALLS TO REMOTE APIS**.
    > - **NANOIDS WERE USED IN THE LEGACY SYSTEM BUT HAVE BEEN REPLACED BY `uuid().defaultRandom()` IN DRIZZLE ORM**.

This document is **CRITICAL** for any AI agent working on UltraTable. Read this before touching the ID system or data layer.

## 1. The ID Philosophy

UltraTable uses a **Dual-ID System**. Never assume an ID from an API is our primary key.

### Internal IDs (Postgres UUID)

- **Format**: Standard UUID v4 strings.
- **Owner**: UltraTable PostgreSQL Database.
- **Persistence**: These are the primary keys generated automatically by Drizzle ORM in our Postgres tables across all schemas.
- **Purpose**: They allow us to delete, recreate, and re-import data without colliding with old state. If a league is deleted and recreated, it MUST get a new UUID.

### External/Remote IDs

- **Format**: Provider-specific (e.g., API-Football League ID `40`).
- **Owner**: The Provider (API-Football, etc.).
- **Storage**: Stored in `source_id` columns on catalog tables.
- **Purpose**: Only used for fetching data from upstream.

### ⚠️ ID Naming Convention (MANDATORY)

**NEVER use the same variable/parameter/field name for both a UUID and a source ID.** This caused a critical bug where `leagueId` meant UUID in one context and source ID in another.

| Name Pattern                     | Type            | Meaning                           | Example             |
| -------------------------------- | --------------- | --------------------------------- | ------------------- |
| `leagueId`, `seasonId`, `teamId` | `String` (UUID) | Internal Postgres primary key     | `60bea9cc-4c53-...` |
| `leagueSourceId`, `teamSourceId` | `Int` (number)  | External API-Football provider ID | `40` (Championship) |
| `seasonYear`                     | `Int` (number)  | Calendar year of the season       | `2025`              |

**Rules:**

1. GraphQL args that accept an **external/provider ID** MUST use `sourceId` suffix (e.g., `leagueSourceId: Int!`)
2. GraphQL args that accept an **internal UUID** use plain names (e.g., `leagueId: String!`)
3. Repository method parameters MUST always be explicit: `leagueSourceId: number` for provider IDs
4. Never pass a source ID where a UUID is expected, or vice versa
5. All GraphQL fields and args MUST have a `description` property documenting what ID type they expect

### ⚠️ Timestamp & Timezone Consistency (MANDATORY)

**EVERY timestamp column MUST be `timestamptz(3)`** — timezone-aware (`with time zone`) and millisecond precision (`(3)`). This was a hard-won fix after phantom delta sync bugs caused by precision mismatches.

**Rules:**

1. **ALWAYS use the `utcTimestamp()` helper** in `schema.ts` for every timestamp column. NEVER use bare `timestamp()`. The helper enforces `withTimezone: true, mode: 'date', precision: 3`.
2. **ALWAYS use `NOW_MS`** (defined in `repositories/postgres/shared.ts`) instead of `sql\`now()\``for server-side timestamps. It wraps`date_trunc('milliseconds', now())` to match column precision.
3. **NEVER mix precisions.** Postgres `now()` returns microseconds (6 digits). JavaScript `Date` and the GraphQL `DateTime` scalar both use milliseconds (3 digits). If you store microseconds but compare with milliseconds, you get phantom results on every delta query.
4. **Supabase runs in UTC.** All timestamps are stored and compared in UTC. No timezone conversion is needed in application code.

| Layer            | Precision                           | Format                       |
| ---------------- | ----------------------------------- | ---------------------------- |
| Postgres column  | `timestamptz(3)` — 3 decimal places | `2026-03-03T22:41:20.072+00` |
| GraphQL DateTime | milliseconds                        | `2026-03-03T22:41:20.072Z`   |
| JavaScript Date  | milliseconds                        | `1709506880072`              |

> [!CAUTION]
> If you add a new table or column with a timestamp, you MUST use `utcTimestamp('column_name')`. Using bare `timestamp()` will create a column without timezone awareness and with microsecond precision, both of which cause bugs.

### ⚠️ Column vs JSONB — Hybrid Schema (MANDATORY)

**We use a hybrid SQL/JSONB pattern.** Only columns that the database engine needs to operate on should be explicit. Everything else goes in `metadata: jsonb('metadata')`.

| **Use a column**                  | **Use `metadata` JSONB**                         |
| --------------------------------- | ------------------------------------------------ |
| Foreign keys / joins              | Display-only attributes (name, age, photo, etc.) |
| UNIQUE / index constraints        | Provider-specific raw data                       |
| WHERE / filter / ORDER BY targets | Optional or future-enrichment fields             |
| Identity fields used for lookups  | Data that varies by source or context            |

> [!CAUTION]
> Don't add columns just because the data "feels important." If you're not joining on it, filtering by it, or constraining it — it belongs in `metadata`. Adding unnecessary columns makes the schema brittle and requires migrations for every enrichment change.

---

## 2. The ID Resolution Flow

When you have a Remote ID (like `40`) and you need the internal database entities:

1. **Check Mappings**: Use `database.getInternalId(provider, type, remoteId)`.
2. **Handle Failure**: If no mapping exists, you are likely importing new data.
3. **Hierarchy**: In the new hierarchical model, `League` has an ID, and `LeagueSeason` has its own ID. Always be careful to map local UUIDs effectively to their external sources.

---

## 3. The Cache Isolation Pattern

**CRITICAL**: We maintain a strict separation between Raw API data and Mapped Domain data.

### Raw API Cache (`apiGet`)

- **Key Format**: `[endpoint]_[remoteId]_[season]` (e.g., `fixtures_40_2025`).
- **Data**: Raw JSON directly from the provider.
- **Utility**: Managed by `apiGet` in `client.ts`.

### Domain List Cache (`saveFixtures` / `saveTeams`)

- **Key Format**: `domain_[type]_[internalId]` (e.g., `domain_fixtures_123e4567-e89b-12d3-a456-426614174000`).
- **Data**: Arrays of **mapped internal objects** (with UUIDs).
- **Utility**: Managed by `database` in `db.ts`.

> [!IMPORTANT]
> **Domain Cache MUST be keyed by Internal UUIDs**.
> This ensures that if a league/season is deleted and recreated (getting a new UUID), the domain cache is automatically "cleared" for that instance.

---

## 4. Lifecycle & Recreation

Because Domain Data is keyed by **Internal UUIDs**, recreating a league provides a 100% clean state for the UI.
However, because Raw Data is keyed by **Remote IDs**, we can still hit the `apiGet` cache and avoid unnecessary network calls if the remote data is still valid.

This is the **Safe Isolation Pattern**:

1. `apiGet` stores what the WORLD says about league 40.
2. `db.saveFixtures` stores what YOUR APP says about internal season X.
3. They never touch. No collisions. No bullshit.

---

## 5. Architecture & Design Principles

You must strictly adhere to the following coding standards when working on this project:

- **Library over Bespoke**: Always prefer well-tested, widely-used community libraries instead of writing custom bespoke utility code (e.g., using `winston` instead of homemade logging, or standard packages for queueing/hashing). On the frontends specifically, this means **shadcn/ui primitives** for every popup, dropdown, dialog, table, etc. — never hand-roll focus traps, click-outside handlers, or popup positioning. See [docs/frontend-patterns.md](docs/frontend-patterns.md).
- **Dependency Inversion**: Put data input and output operations behind cleanly defined interfaces. Storage and Database modules should be swappable with minimal churn elsewhere in the application.
- **SOLID & DRY**: Follow SOLID design principles. Do not repeat code. Write functional code wherever possible.
- **Maintainability**: Use exceptional naming conventions. Avoid creating giant code blocks or monolith files. Break complex logic into smaller, testable modules.
- **Performance**: Always be concerned about performance and memory overhead. Explicitly call out any discovered optimization opportunities to the repository owner.
- **Batch nested GraphQL resolvers with DataLoader**: Any resolver that fetches a single row by ID from a parent's foreign key (e.g., `Fixture.homeTeam`, `Team.venue`) MUST go through a per-request DataLoader in [`apps/service/src/loaders/index.ts`](apps/service/src/loaders/index.ts), not a direct `db.select().where(eq(id, parent.fooId))`. The latter silently produces an N+1 the moment a query asks for that field across a list. When adding a new entity that gets resolved this way, extend the loader factory with a new `xLoader` and call `ctx.loaders.xLoader.load(parent.xId)` from the resolver — loader instances are created fresh per request, so there is no cross-request cache risk.

---

## 6. Auth Contracts

Auth is provided by Better Auth and lives in [apps/service](apps/service). The deep dive is in [docs/auth-architecture.md](docs/auth-architecture.md) — read that before touching sign-in, the hook, or the viewer query. The non-negotiable rules:

### Identity ≠ Account (two-tier model)

- `auth_user` rows are **identities** (one per provider sign-in). `user` rows are **domain accounts** (roles, profile, the GraphQL surface). They're bridged by `auth_link` (many identities → one account).
- The GraphQL `Viewer` type always exposes the domain account UUID, never the auth_user ID. `Viewer.identities` is the list of linked auth identities — exposed for the account page, not as the primary key.

### Never auto-link by email

- The `databaseHooks.user.create.after` hook ([apps/service/src/services/auth-bootstrap.ts](apps/service/src/services/auth-bootstrap.ts)) creates a **fresh** domain user + auth_link for every new identity. Even if the new identity's email matches an existing domain user, do NOT auto-merge.
- The `users.email` UNIQUE constraint will reject duplicates; the hook swallows that failure and logs it. The auth_user stays unlinked, the context falls back to a default `user` role, and the account-page flow is the only path to explicit linking. Don't change this — auto-merging on email match is a security footgun.

### Two OAuth clients (one per frontend) + ID-token flow

- `apps/admin` and `apps/web` each have **their own Google OAuth client** (same Google Cloud project, different consent screens, independent revocation). Each client has its own JS origin and redirect URI on its frontend's host.
- **Public `clientId`s live in each frontend's `.env`** as `VITE_GOOGLE_CLIENT_ID` and bundle into the JS. This is by design — client IDs are public.
- **`clientSecret`s live on the service**, namespaced: `GOOGLE_CLIENT_SECRET_ADMIN`, `GOOGLE_CLIENT_SECRET_WEB`. They never reach a browser.
- Service passes **`clientId: [adminId, webId]`** to Better Auth's `socialProviders.google` ([PR #9292](https://github.com/better-auth/better-auth/pull/9292), Better Auth's canonical cross-platform pattern). Tokens whose `aud` matches *either* client are accepted.
- **Frontend sign-in uses Google Identity Services (GIS) in the browser** to obtain an ID token under its own client ID, then posts the token to the service via `authClient.signIn.social({ provider: 'google', idToken: { token } })`. The service verifies, runs the bootstrap hook for new identities, and sets the session cookie. No redirect to Google, no per-host server-side dispatch.
- The `clientSecret` is unused in the user-facing ID-token flow (the JWT is verified against Google's public keys). It's kept on the service as a fallback for the auth-code/redirect flow and any future server-side token operations.
- `npm run setup` collects both client-id/secret pairs once and writes them to the three .env files (service, admin, web) atomically.

### Per-frontend OAuth redirect URIs

- In production each frontend container (`apps/admin`, `apps/web`) rewrites `/api/auth/*` to the service container. The OAuth redirect URI lives on the **frontend's** hostname, not the service's, so the user never leaves their SPA and the session cookie is same-site.
- This works because `BETTER_AUTH_URL` is **unset** in production. Better Auth's default `trustedProxyHeaders: true` then derives the base URL per request from `X-Forwarded-Host`, so the redirect URI matches whichever frontend started the flow.
- Each Google OAuth client gets exactly one production redirect URI (its own frontend's host) — they're not shared.
- `ALLOWED_ORIGINS` feeds both Fastify CORS and Better Auth's `trustedOrigins` — every frontend origin must be listed.

### Viewer query nulls, not throws

- `Query.viewer` returns `null` when unauthenticated. It does NOT throw an `Unauthenticated` error. This lets frontends render a signed-out state without try/catch and is what the resolver tests in [apps/service/src/schema/viewer.test.ts](apps/service/src/schema/viewer.test.ts) pin.

### Authorization goes through CASL — no inline role checks

Every "is the viewer allowed to do X" decision flows through a single per-request CASL ability built in [apps/service/src/auth/abilities.ts](apps/service/src/auth/abilities.ts) and attached to the GraphQL context as `ctx.ability`. The frontend mirrors the same rule shape in [apps/web/src/auth/abilities.ts](apps/web/src/auth/abilities.ts) and [apps/admin/src/auth/abilities.ts](apps/admin/src/auth/abilities.ts) so server and client stay in sync. **The full pattern (rule shape, when to use direct CASL vs the legacy helpers, how to add a rule, how to test, how to use `<Can>` on the frontend) lives in [docs/auth-architecture.md](docs/auth-architecture.md) under "Authorization (CASL)" — read it before adding any new auth gate.** Non-negotiable rules:

- **Never write inline role checks.** `if (ctx.user.roles.includes('admin'))`, `if (viewer.roles.includes('admin'))`, manual `entity.ownerId !== ctx.user.id` ownership checks — none of these belong in a resolver or a component. Express the gate as a CASL rule and call `ctx.ability.can(...)` (server) or `<Can I="..." a="...">` (frontend).
- **`user.roles` is the source of truth, `auth_user.role` is a mirror.** Role mutations go through `repository.users.setDomainUserRoles`, which also writes the mirror. Never call Better Auth's `auth.api.setRole` — it would desync the columns.
- **Adding a new gated action means adding a CASL rule, not a new helper.** The rule lives once in `abilities.ts` (mirrored to the two frontend copies); resolvers/components consume it. If you find yourself wanting a fourth `requireXxx` helper, that's the signal to add a CASL rule instead.
- **Server and frontend rules must match.** If the server says `can('manage', 'PredictionGroup', { ownerId: viewer.id })`, both `apps/web/src/auth/abilities.ts` and `apps/admin/src/auth/abilities.ts` get the same line. A drift here is the classic "the button appears but the click 403s" footgun.

The legacy `requireAdmin` / `requireViewer` / `requireSelfOrAdmin` helpers in [apps/service/src/schema/builder.ts](apps/service/src/schema/builder.ts) still exist and delegate to CASL — leave them in place when you're touching unrelated code, but new gates should call `abilityOf(ctx).can(...)` / `cannot(...)` directly.

### Dev login is non-production only

- `/api/auth/dev-login` mints a session for a canned role. It calls `signUpEmail` (which fires the bootstrap hook), then force-sets the requested role. It returns 403 when `NODE_ENV=production`. Don't route any real auth flow through it.

---

## 7. Provider Rate Limiting

Every call to an upstream provider goes through a single chokepoint at the provider class. Two distinct concerns are baked in at that layer, and they look different on purpose.

### Metered JSON API — `v3.football.api-sports.io`

- **Single chokepoint:** [`apps/service/src/integrations/api-football/index.ts`](apps/service/src/integrations/api-football/index.ts)'s private `request()` method. Every provider method (`getCountries`, `getLeagues`, `getSeasons`, `getTeams`, `getFixtures`, `getFixturesByIds`, `getMatchEvents`, `getPlayerData`, `getLineups`, `getCoachesByTeam`, `getSquad`) routes through it. The wrapper schedules every request through a per-instance `Bottleneck` limiter.
- **Header-driven plan detection.** A response interceptor reads `X-RateLimit-Limit` off any response and resizes the reservoir to match the account's actual plan — Free=10/min, Pro=300/min, anything else. No env var declaring the tier, no `/status` probe at boot. The limiter starts conservative (10/min) and widens once it sees the first response header.
- **Automatic 429 handling.** On a 429, the limiter reads `Retry-After` and queues a retry up to 3 attempts. Callers never see transient rate-limit errors.

> [!CAUTION]
> When adding a new method on `ApiFootballProvider`, it MUST go through `this.request(...)`, never `this.client.get(...)` directly. The wrapper is the rate-limit chokepoint; a direct call silently bypasses the budget and will trip 429s under load.

### Asset CDN — `media.api-sports.io`

- **Separate host, separate budget.** Image binaries from the CDN don't count against the metered API's per-minute window, so they have their own (looser) limiter rather than sharing the API's reservoir.
- **Lives at** [`apps/service/src/services/graphics.service.ts`](apps/service/src/services/graphics.service.ts) as a module-level `Bottleneck({ maxConcurrent: 10 })` — concurrency-bounded, no per-minute reservoir.
- **Why a cap is necessary even without upstream throttling:** a 20-team squad sync lands ~500 fire-and-forget `graphicsService.sideload(...)` calls in rapid succession. Without a concurrency cap the Node HTTP agent's socket pool saturates and requests time out at the axios layer before they ever leave the process. The cap is about the local connection pool, not the CDN.

### Adding a new provider

Follow the same shape: rate-limit the **metered** API at the provider class (header-driven if the upstream exposes them, otherwise a static reservoir), and concurrency-bound the **asset CDN** at the service that consumes it. Don't fold both into one limiter — they have different bottlenecks at different layers and one config can only optimize for one of them.

---

## 8. Workers / Background Job Execution

The 15-second authenticated GraphQL timeout in [`apps/service/src/index.ts`](apps/service/src/index.ts) (`REQUEST_TIMEOUT_MS_AUTH`) is a hard ceiling on any resolver. Any mutation whose runtime scales with input size (number of teams, fixtures, players, …) MUST dispatch off the request thread or it will eventually fail in production.

The job runner at [`apps/service/src/workers/runner.ts`](apps/service/src/workers/runner.ts) gives every long-running operation a persistent execution record and a polling-friendly status. Two variants:

| Variant                              | Returns                                       | Throws on task error?              | When to use                                                                |
| ------------------------------------ | --------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------- |
| `JobRunner.run(name, task)`          | `void` after the task settles                 | Yes — re-throws after persisting   | Short tasks that fit inside the GraphQL request budget (sub-second).        |
| `JobRunner.runInBackground(name, task)` | `JobExecution` row immediately, status `'running'` | No — failures land in `errorMessage` | Tasks that may take seconds or minutes. The caller MUST NOT block the request. |

Both variants share the same persistence (`status`, `processedCount`, `totalCount`, `apiCallsCount`, `errorMessage`, `finishedAt`) so the admin's `WorkersView` polls progress regardless of which one the resolver chose.

### The `runJob` dispatcher

[`apps/service/src/schema/workers.ts`](apps/service/src/schema/workers.ts) exposes a generic `runJob(name: String!)` mutation. The name's prefix selects the work (e.g. `sync-fixtures-39-2024` dispatches to `repository.fixtures.syncFixtures(39, 2024, reporter)`); the resolver wires the call through `runInBackground` and returns the freshly-created `JobExecution`. The admin's `WorkersView` already polls `jobExecutions` for completion — there is no separate "wait for it" path.

**Adding a new background-eligible mutation:** do NOT introduce a new top-level GraphQL mutation that wraps `JobRunner.run` in a closure (the pattern of `let result; await JobRunner.run(...); return result` does not survive background execution — by the time the resolver returns, `result` is still empty). Instead, add a new name-prefix branch inside the `runJob` resolver and let it dispatch via `runInBackground`.

### Cache invalidation belongs in the repository method

When a sync runs via `runInBackground`, the resolver returns before the task completes. Any `cacheService.invalidate(...)` call placed in the resolver runs against stale state and gets overwritten the moment the background task finishes. Move invalidations into the `repository.X.syncY()` method that owns the work, where they fire after the writes land.

### In-process execution — known limitation

`runInBackground` runs the task on the same Node process (a microtask tick after the resolver returns). There is no Redis queue, BullMQ broker, or separate worker tier. A process restart kills any in-flight job; its execution row stays in `'running'` status with no `finishedAt`. This is acceptable for the current scale of admin-triggered syncs; if it becomes a problem, a persistent queue is the next step. **Don't add a queue speculatively** — the API surface stays the same when the day comes.

---

## 9. AI Agent Operational Rules

- **STAY OUT OF THE OPERATOR'S DEV ENVIRONMENT**: The agent's job is to read, reason, and write code — not to drive the running system on the operator's machine. **The operator's containers, volumes, ports, env files, and database are not the agent's.** That means: do **not** run `npm run setup` (mutates env files, spins containers, runs `npm install`, applies migrations), do **not** run `npm run dev` / `npm run start:all` (kills the operator's dev-server processes by port and replaces them), do **not** run `docker compose up/down/restart` / `scripts/docker-deploy.sh` against the default `ultratable` project name (touches the operator's containers and volumes), and do **not** run `db:migrate` / `db:bootstrap` / `db:reset` / any DDL against the live DB. Do **not** hand-edit `apps/{service,admin,web}/.env` or the root `.env`.

  **First, prefer not running anything live.** Most verification can be done with the test suite (`npm run test`), syntax-check (`node --check`), and `npm run lint --workspaces` — none of those touch the running environment.

  **If you genuinely need a live run, use a fully isolated stack.** Your ports are not the operator's ports. Your containers are not the operator's containers. Your volume is not the operator's volume. Concretely:

  - **Use a git worktree** so your env files don't sit on top of theirs: `git worktree add ../ultratable-claude <branch>` then `cd` into it.
  - **Use a distinct docker-compose project name** so containers, networks, and volumes are namespaced separately from `ultratable-*`. Set `COMPOSE_PROJECT_NAME=claude-dev-ultratable` in your shell, or pass `-p claude-dev-ultratable` to every `docker compose` invocation. The operator's `ultratable-postgres-1` and `ultratable_ultratable_pg_data` keep running untouched; your stack lives at `claude-dev-ultratable-postgres-1` with its own `claude-dev-ultratable_ultratable_pg_data` volume.
  - **Use different host ports.** `scripts/setup.mjs` already auto-shifts in fresh-install mode — if the operator's postgres is on 5432, yours lands on 5433; if their MinIO is on 9000/9001, yours lands on 9002/9003. Same for service/admin/web (8080/5174/5175 → 8081/5175/5176, etc.). The shifted ports get baked into the worktree's `.env` files; the operator's `.env` is never touched.
  - **Tear down when done.** `COMPOSE_PROJECT_NAME=claude-dev-ultratable docker compose down -v` removes only your namespaced containers and volumes — the operator's stack is unaffected.

  The three live-mutation scripts (`scripts/setup.mjs`, `scripts/start-all.js`, `scripts/docker-deploy.sh`) all source [scripts/agent-guard.mjs](scripts/agent-guard.mjs) and refuse to run when the session has `CLAUDECODE`, `AI_AGENT`, etc. set. **Do not bypass with `--i-am-the-human`** — that flag exists for the human operator on the off chance a heuristic misfires. The agent's path forward is the isolated-stack pattern above, not the bypass.
- **ANSWER QUESTIONS FIRST (DO NOT MUTATE)**: If the owner explicitly asks a question (e.g., "why...", "did you...", "how does..."), you must **JUST ANSWER IT**. Do NOT make autonomous code changes, do NOT trigger deployments, and do NOT proactively mutate state while answering a direct query. Always wait for explicit instruction to proceed with changes after answering.
- **Strict TypeScript (No `any`)**: We explicitly chose TypeScript to avoid loose typing. **DO NOT use `any` under any circumstances.** Always define proper interfaces, use `unknown` with assertions if the type is truly not known, and leverage Drizzle's `$inferSelect`/`$inferInsert` for database types. Maintaining a strict, zero-warning TypeScript environment is mandatory. Always verify your changes do not introduce warnings by running `npm run lint --workspaces`.
- **Keep It Tight (Small & Modular)**: DO NOT build massive "God Components" (like a 1700-line `App.tsx`). Break your code down into small, focused, and independently testable components. This saves context memory, prevents hallucination, makes patching code much safer, and enforces strict type boundaries (via component props).
- **Token Efficiency**: Do NOT waste tokens doing massive, expensive architectural operations or gigantic refactors that simple instructions to the Owner (David) could accomplish.
- **Ask First**: If a task requires manipulating hundreds of files or executing a convoluted process, write a short, clear prompt for the owner to run natively instead of blowing through the context window.
- **Utility Script Generation**: When creating one-off utility, migration, or debugging scripts:
    1. **Always write them to `/tmp/`** (e.g., `/tmp/migrate-auth-tables.ts`). NEVER scatter them in the workspace root or inside `apps/`.
    2. **Include a header comment** at the top of every script explaining: (a) what it does, (b) why it was generated, and (c) datetime of creation.
    3. **Clean up after yourself** — delete any temp scripts once the task is complete. If a script has lasting value, propose promoting it to `scripts/` with proper documentation.
