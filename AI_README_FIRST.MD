# 🚨 AI AGENT ARCHITECTURE GUIDE

**NEVER TAKE CONTROL OF A BROWSER FOR VERIFYING UNLESS CLEARLY ASKED**

> [!IMPORTANT]
> **DIRECTORY ISOLATION RULES**

- **Legacy**: We used to have a `/src` directory for the old legacy architecture. It has been deleted.
    > - **Active Development**: All new projects, backends, and frontends live EXCLUSIVELY under the `/apps/` directory.
    > - **BFF (Back-end for Front-end)**: We are currently building a new GraphQL service and Postgres database in `/apps/service`.
    > - **Rewriting Strategy**: When building new frontends, we use `/src` as a blueprint but rewrite it natively from scratch in a new `/apps/[app-name]` directory.
    >
    > **LOCAL DEV PORTS**
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

### Per-frontend OAuth redirect URIs

- In production each frontend container (`apps/admin`, `apps/web`) rewrites `/api/auth/*` to the service container. The OAuth redirect URI lives on the **frontend's** hostname, not the service's, so the user never leaves their SPA and the session cookie is same-site.
- This works because `BETTER_AUTH_URL` is **unset** in production. Better Auth's default `trustedProxyHeaders: true` then derives the base URL per request from `X-Forwarded-Host`, so the redirect URI matches whichever frontend started the flow.
- Google Cloud Console gets one redirect URI per frontend (e.g. `https://admin.ultratable.io/api/auth/callback/google` AND `https://ultratable.io/api/auth/callback/google`), not one on the service domain.
- `ALLOWED_ORIGINS` feeds both Fastify CORS and Better Auth's `trustedOrigins` — every frontend origin must be listed.

### Viewer query nulls, not throws

- `Query.viewer` returns `null` when unauthenticated. It does NOT throw an `Unauthenticated` error. This lets frontends render a signed-out state without try/catch and is what the resolver tests in [apps/service/src/schema/viewer.test.ts](apps/service/src/schema/viewer.test.ts) pin.

### Dev login is non-production only

- `/api/auth/dev-login` mints a session for a canned role. It calls `signUpEmail` (which fires the bootstrap hook), then force-sets the requested role. It returns 403 when `NODE_ENV=production`. Don't route any real auth flow through it.

---

## 7. AI Agent Operational Rules

- **ANSWER QUESTIONS FIRST (DO NOT MUTATE)**: If the owner explicitly asks a question (e.g., "why...", "did you...", "how does..."), you must **JUST ANSWER IT**. Do NOT make autonomous code changes, do NOT trigger deployments, and do NOT proactively mutate state while answering a direct query. Always wait for explicit instruction to proceed with changes after answering.
- **Strict TypeScript (No `any`)**: We explicitly chose TypeScript to avoid loose typing. **DO NOT use `any` under any circumstances.** Always define proper interfaces, use `unknown` with assertions if the type is truly not known, and leverage Drizzle's `$inferSelect`/`$inferInsert` for database types. Maintaining a strict, zero-warning TypeScript environment is mandatory. Always verify your changes do not introduce warnings by running `npm run lint --workspaces`.
- **Keep It Tight (Small & Modular)**: DO NOT build massive "God Components" (like a 1700-line `App.tsx`). Break your code down into small, focused, and independently testable components. This saves context memory, prevents hallucination, makes patching code much safer, and enforces strict type boundaries (via component props).
- **Token Efficiency**: Do NOT waste tokens doing massive, expensive architectural operations or gigantic refactors that simple instructions to the Owner (David) could accomplish.
- **Ask First**: If a task requires manipulating hundreds of files or executing a convoluted process, write a short, clear prompt for the owner to run natively instead of blowing through the context window.
- **Utility Script Generation**: When creating one-off utility, migration, or debugging scripts:
    1. **Always write them to `/tmp/`** (e.g., `/tmp/migrate-auth-tables.ts`). NEVER scatter them in the workspace root or inside `apps/`.
    2. **Include a header comment** at the top of every script explaining: (a) what it does, (b) why it was generated, and (c) datetime of creation.
    3. **Clean up after yourself** — delete any temp scripts once the task is complete. If a script has lasting value, propose promoting it to `scripts/` with proper documentation.
