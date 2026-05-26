import { sql } from 'drizzle-orm';
import {
    boolean,
    check,
    doublePrecision,
    index,
    integer,
    jsonb,
    pgEnum,
    pgTable,
    primaryKey,
    text,
    timestamp,
    unique,
    uniqueIndex,
    uuid,
    varchar,
} from 'drizzle-orm/pg-core';

// Helper for UTC timestamps with millisecond precision.
// Postgres now() returns microsecond precision, but the GraphQL DateTime scalar
// truncates to milliseconds. Using precision: 3 prevents phantom deltas.
const utcTimestamp = (name: string) =>
    timestamp(name, { withTimezone: true, mode: 'date', precision: 3 });

export const fixtureStatusEnum = pgEnum('fixture_status', [
    'scheduled',
    'played',
    'postponed',
    'cancelled',
    'live',
]);

export const jobStatusEnum = pgEnum('job_status', ['running', 'success', 'failed']);

// --- Domain User Schema ---
export const users = pgTable('user', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    roles: jsonb('roles').default('["user"]').notNull(),
    createdAt: utcTimestamp('created_at').defaultNow().notNull(),
    updatedAt: utcTimestamp('updated_at').defaultNow().notNull(),
});

// --- Better Auth Native Schema ---
// `role`, `banned`, `banReason`, `banExpires` are required by Better Auth's
// `admin` plugin (see better-auth/dist/plugins/admin/schema.mjs). We never
// write to `role` directly — it is mirrored from `user.roles` whenever the
// domain role changes, and the plugin's internal admin gate reads it. See
// docs/auth-architecture.md "Role storage" for the full contract.
export const authUsers = pgTable('auth_user', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull(),
    image: text('image'),
    role: text('role'),
    banned: boolean('banned').default(false),
    banReason: text('ban_reason'),
    banExpires: utcTimestamp('ban_expires'),
    createdAt: utcTimestamp('created_at').notNull(),
    updatedAt: utcTimestamp('updated_at').notNull(),
});

// `impersonatedBy` is required by Better Auth's `admin` plugin — when an
// admin starts impersonating, the new session row records the original
// admin's auth_user id here so the UI can surface "Impersonating …" and
// the audit log (admin-page ticket) can trace it back.
export const authSessions = pgTable('auth_session', {
    id: text('id').primaryKey(),
    expiresAt: utcTimestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: utcTimestamp('created_at').notNull(),
    updatedAt: utcTimestamp('updated_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
        .notNull()
        .references(() => authUsers.id, { onDelete: 'cascade' }),
    impersonatedBy: text('impersonated_by'),
});

export const authAccounts = pgTable('auth_account', {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
        .notNull()
        .references(() => authUsers.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: utcTimestamp('access_token_expires_at'),
    refreshTokenExpiresAt: utcTimestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: utcTimestamp('created_at').notNull(),
    updatedAt: utcTimestamp('updated_at').notNull(),
});

export const authVerifications = pgTable('auth_verification', {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: utcTimestamp('expires_at').notNull(),
    createdAt: utcTimestamp('created_at'),
    updatedAt: utcTimestamp('updated_at'),
});

export const authLinks = pgTable(
    'auth_link',
    {
        authUserId: text('auth_user_id')
            .references(() => authUsers.id, { onDelete: 'cascade' })
            .notNull(),
        domainUserId: uuid('domain_user_id')
            .references(() => users.id, { onDelete: 'cascade' })
            .notNull(),
        linkedAt: utcTimestamp('linked_at').defaultNow().notNull(),
    },
    (table) => ({
        pk: unique().on(table.authUserId, table.domainUserId),
    }),
);
// --------------------------

// Per-user opt-in to follow specific leagues. Cascading on both sides keeps
// the account-wipe path simple (deleting the user row removes their follows)
// and makes pruning a league safe too.
export const userLeagueFollows = pgTable(
    'user_league_follows',
    {
        userId: uuid('user_id')
            .references(() => users.id, { onDelete: 'cascade' })
            .notNull(),
        leagueId: uuid('league_id')
            .references(() => leagues.id, { onDelete: 'cascade' })
            .notNull(),
        followedAt: utcTimestamp('followed_at').defaultNow().notNull(),
    },
    (table) => ({
        pk: primaryKey({ columns: [table.userId, table.leagueId] }),
    }),
);

export const catalogCountries = pgTable(
    'catalog_countries',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        name: varchar('name', { length: 255 }).notNull(),
        code: varchar('code', { length: 10 }),
        flag: varchar('flag', { length: 500 }),
        sourceName: varchar('source_name', { length: 50 }).notNull(),
        createdAt: utcTimestamp('created_at').defaultNow().notNull(),
        updatedAt: utcTimestamp('updated_at').defaultNow().notNull(),
    },
    (table) => ({
        unq: unique().on(table.sourceName, table.name),
    }),
);

export const catalogLeagues = pgTable(
    'catalog_leagues',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        countryId: uuid('country_id')
            .references(() => catalogCountries.id)
            .notNull(),
        name: varchar('name', { length: 255 }).notNull(),
        type: varchar('type', { length: 50 }),
        logo: varchar('logo', { length: 500 }),
        sourceName: varchar('source_name', { length: 50 }).notNull(),
        sourceId: integer('source_id').notNull(),
        metadata: jsonb('metadata'),
        createdAt: utcTimestamp('created_at').defaultNow().notNull(),
        updatedAt: utcTimestamp('updated_at').defaultNow().notNull(),
    },
    (table) => ({
        unq: unique().on(table.sourceName, table.sourceId),
    }),
);

export const leagues = pgTable(
    'leagues',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        name: varchar('name', { length: 255 }).notNull(),
        slug: varchar('slug', { length: 255 }).unique().notNull(),
        country: varchar('country', { length: 100 }),
        logo: varchar('logo', { length: 500 }),
        sourceName: varchar('source_name', { length: 50 }).notNull(),
        sourceId: integer('source_id').notNull(),
        metadata: jsonb('metadata'),
        createdAt: utcTimestamp('created_at').defaultNow().notNull(),
        updatedAt: utcTimestamp('updated_at').defaultNow().notNull(),
    },
    (table) => ({
        unq: unique().on(table.sourceName, table.sourceId),
    }),
);

export const venues = pgTable(
    'venues',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        name: varchar('name', { length: 255 }).notNull(),
        city: varchar('city', { length: 255 }),
        capacity: integer('capacity'),
        surface: varchar('surface', { length: 100 }),
        image: varchar('image', { length: 500 }),
        sourceName: varchar('source_name', { length: 50 }).notNull(),
        sourceId: integer('source_id').notNull(),
        createdAt: utcTimestamp('created_at').defaultNow().notNull(),
        updatedAt: utcTimestamp('updated_at').defaultNow().notNull(),
    },
    (table) => ({
        unq: unique().on(table.sourceName, table.sourceId),
    }),
);

export const teams = pgTable(
    'teams',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        name: varchar('name', { length: 255 }).notNull(),
        shortName: varchar('short_name', { length: 100 }),
        tla: varchar('tla', { length: 10 }), // e.g. "ARS", "CHE"
        logo: varchar('logo', { length: 500 }),
        venueId: uuid('venue_id').references(() => venues.id),
        sourceName: varchar('source_name', { length: 50 }).notNull(),
        sourceId: integer('source_id').notNull(),
        metadata: jsonb('metadata'), // provider specific extras
        rawResponse: jsonb('raw_response'),
        createdAt: utcTimestamp('created_at').defaultNow().notNull(),
        updatedAt: utcTimestamp('updated_at').defaultNow().notNull(),
    },
    (table) => ({
        unq: unique().on(table.sourceName, table.sourceId),
    }),
);

// Coach is a first-class entity, populated from API-Football's
// `/coachs?team=<sourceId>` endpoint by the per-team coach sync. Tier
// lists project coaches via this table — the old "scrape from fixture
// lineups" path was leaky (one upstream call per fixture per drawer
// open) and gave us no stable identity. With a coach source id we
// dedupe Pep-the-person across teams; the per-team item identity stays
// `<teamId>|<coachId>` at the tier_rankable_item layer.
//
// `teamId` is the coach's CURRENT team (per upstream). Mutates as
// coaches move; tier_rankable_item snapshots stay frozen to the team
// they were added at, so historical rankings don't change underfoot.
export const coaches = pgTable(
    'coaches',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        name: varchar('name', { length: 255 }).notNull(),
        firstName: varchar('first_name', { length: 255 }),
        lastName: varchar('last_name', { length: 255 }),
        age: integer('age'),
        birthDate: varchar('birth_date', { length: 32 }),
        birthPlace: varchar('birth_place', { length: 255 }),
        birthCountry: varchar('birth_country', { length: 255 }),
        nationality: varchar('nationality', { length: 255 }),
        height: varchar('height', { length: 32 }),
        weight: varchar('weight', { length: 32 }),
        photo: varchar('photo', { length: 500 }),
        teamId: uuid('team_id').references(() => teams.id),
        sourceName: varchar('source_name', { length: 50 }).notNull(),
        sourceId: integer('source_id').notNull(),
        career: jsonb('career'),
        rawResponse: jsonb('raw_response'),
        createdAt: utcTimestamp('created_at').defaultNow().notNull(),
        updatedAt: utcTimestamp('updated_at').defaultNow().notNull(),
    },
    (table) => ({
        unq: unique().on(table.sourceName, table.sourceId),
        teamIdx: index('coaches_team_idx').on(table.teamId),
    }),
);

export const seasons = pgTable(
    'seasons',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        leagueId: uuid('league_id')
            .references(() => leagues.id)
            .notNull(),
        year: integer('year').notNull(),
        startDate: utcTimestamp('start_date'),
        endDate: utcTimestamp('end_date'),
        metadata: jsonb('metadata'),
        isCompleted: boolean('is_completed').default(false).notNull(),
        lastLiveSyncAt: utcTimestamp('last_live_sync_at'),
        createdAt: utcTimestamp('created_at').defaultNow().notNull(),
        updatedAt: utcTimestamp('updated_at').defaultNow().notNull(),
    },
    (table) => ({
        unq: unique().on(table.leagueId, table.year),
    }),
);

export const fixtures = pgTable(
    'fixtures',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        leagueId: uuid('league_id')
            .references(() => leagues.id)
            .notNull(),
        seasonId: uuid('season_id')
            .references(() => seasons.id)
            .notNull(),
        homeTeamId: uuid('home_team_id')
            .references(() => teams.id)
            .notNull(),
        awayTeamId: uuid('away_team_id')
            .references(() => teams.id)
            .notNull(),
        venueId: uuid('venue_id').references(() => venues.id),
        status: fixtureStatusEnum('status').default('scheduled').notNull(),
        scheduledAt: utcTimestamp('scheduled_at').notNull(),
        homeGoals: integer('home_goals'),
        awayGoals: integer('away_goals'),
        sourceName: varchar('source_name', { length: 50 }).notNull(),
        sourceId: integer('source_id').notNull(),
        gameweek: integer('gameweek'),
        metadata: jsonb('metadata'), // events_summary, referee, weather, etc.
        rawResponse: jsonb('raw_response'), // original API signal
        createdAt: utcTimestamp('created_at').defaultNow().notNull(),
        updatedAt: utcTimestamp('updated_at').defaultNow().notNull(),
    },
    (table) => ({
        unq: unique().on(table.sourceName, table.sourceId),
    }),
);

export const standingsRows = pgTable('standings_rows', {
    id: varchar('id').primaryKey(), // leagueId-season-teamId
    seasonId: uuid('season_id')
        .references(() => seasons.id)
        .notNull(),
    teamId: uuid('team_id')
        .references(() => teams.id)
        .notNull(),
    position: integer('position').notNull(),
    played: integer('played').default(0).notNull(),
    won: integer('won').default(0).notNull(),
    drawn: integer('drawn').default(0).notNull(),
    lost: integer('lost').default(0).notNull(),
    goalsFor: integer('goals_for').default(0).notNull(),
    goalsAgainst: integer('goals_against').default(0).notNull(),
    goalDiff: integer('goal_diff').default(0).notNull(),
    points: integer('points').default(0).notNull(),
    form: varchar('form', { length: 50 }),
    metadata: jsonb('metadata'),
    updatedAt: utcTimestamp('updated_at').defaultNow().notNull(),
});

export const seasonsToTeams = pgTable(
    'seasons_to_teams',
    {
        seasonId: uuid('season_id')
            .references(() => seasons.id)
            .notNull(),
        teamId: uuid('team_id')
            .references(() => teams.id)
            .notNull(),
        updatedAt: utcTimestamp('updated_at').defaultNow().notNull(),
    },
    (table) => ({
        unq: unique().on(table.seasonId, table.teamId),
    }),
);

export const jobs = pgTable('jobs', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).unique().notNull(),
    scheduleCron: varchar('schedule_cron', { length: 100 }),
    isActive: boolean('is_active').default(true).notNull(),
    lastRunAt: utcTimestamp('last_run_at'),
    createdAt: utcTimestamp('created_at').defaultNow().notNull(),
    updatedAt: utcTimestamp('updated_at').defaultNow().notNull(),
});

export const jobExecutions = pgTable('job_executions', {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
        .references(() => jobs.id)
        .notNull(),
    status: jobStatusEnum('status').default('running').notNull(),
    startedAt: utcTimestamp('started_at').defaultNow().notNull(),
    finishedAt: utcTimestamp('finished_at'),
    errorMessage: text('error_message'),
    context: jsonb('context'),
    processedCount: integer('processed_count').default(0),
    totalCount: integer('total_count').default(0),
    apiCallsCount: integer('api_calls_count').default(0),
    updatedAt: utcTimestamp('updated_at').defaultNow().notNull(),
});

export const systemLogs = pgTable('system_logs', {
    id: uuid('id').primaryKey().defaultRandom(),
    level: varchar('level', { length: 20 }).notNull(), // info, warn, error
    module: varchar('module', { length: 100 }).notNull(),
    message: text('message').notNull(),
    context: jsonb('context'),
    createdAt: utcTimestamp('created_at').defaultNow().notNull(),
});

export const rankingFormulas = pgTable('ranking_formulas', {
    id: varchar('id', { length: 50 }).primaryKey(), // e.g. "points", "goalDiff"
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    logicType: varchar('logic_type', { length: 50 }).notNull(), // "standard", "headToHead"
    createdAt: utcTimestamp('created_at').defaultNow().notNull(),
    updatedAt: utcTimestamp('updated_at').defaultNow().notNull(),
});

export const players = pgTable(
    'players',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        name: varchar('name', { length: 255 }).notNull(),
        sourceName: varchar('source_name', { length: 50 }).notNull(),
        sourceId: integer('source_id').notNull(),
        metadata: jsonb('metadata'),
        createdAt: utcTimestamp('created_at').defaultNow().notNull(),
        updatedAt: utcTimestamp('updated_at').defaultNow().notNull(),
    },
    (table) => ({
        unq: unique().on(table.sourceName, table.sourceId),
    }),
);

export const teamRosters = pgTable(
    'team_rosters',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        teamId: uuid('team_id')
            .references(() => teams.id, { onDelete: 'cascade' })
            .notNull(),
        playerId: uuid('player_id')
            .references(() => players.id, { onDelete: 'cascade' })
            .notNull(),
        seasonId: uuid('season_id')
            .references(() => seasons.id, { onDelete: 'cascade' })
            .notNull(),
        metadata: jsonb('metadata'), // { squadNumber, position, startedAt, endedAt, registered, ... }
        createdAt: utcTimestamp('created_at').defaultNow().notNull(),
        updatedAt: utcTimestamp('updated_at').defaultNow().notNull(),
    },
    (table) => ({
        unq: unique().on(table.teamId, table.playerId, table.seasonId),
    }),
);

export const playerSourceMappings = pgTable(
    'player_source_mappings',
    {
        playerId: uuid('player_id')
            .references(() => players.id, { onDelete: 'cascade' })
            .notNull(),
        sourceName: varchar('source_name', { length: 50 }).notNull(),
        sourceId: integer('source_id').notNull(),
        createdAt: utcTimestamp('created_at').defaultNow().notNull(),
        updatedAt: utcTimestamp('updated_at').defaultNow().notNull(),
    },
    (table) => ({
        pk: primaryKey({ columns: [table.sourceName, table.sourceId] }),
        playerIdx: index('psm_player_id_idx').on(table.playerId),
    }),
);

// --- Predictions ---
// Snapshot of a viewer's ordered prediction for a season (e.g. projected
// final-standings finish). Snapshots are immutable: new predictions create
// new rows. Deletions are soft (`deletedAt`) so the per-season cap can count
// deleted rows too — preventing create/delete loops from bypassing the limit.
// See issue #105 for the full contract.
export const predictionSnapshots = pgTable(
    'prediction_snapshots',
    {
        // Stable external identifier. Surfaced as the GraphQL `id` and used
        // for any future shareable URL — internal numeric ids are never
        // exposed. See AI_README_FIRST §1.
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id')
            .references(() => users.id, { onDelete: 'cascade' })
            .notNull(),
        seasonId: uuid('season_id')
            .references(() => seasons.id, { onDelete: 'cascade' })
            .notNull(),
        type: varchar('type', { length: 50 }).notNull(),
        lockedAt: utcTimestamp('locked_at').defaultNow().notNull(),
        // Soft-delete marker. Null = live; set to now() on delete. Rows are
        // never physically removed in normal operation. The cap counts both
        // live and soft-deleted rows on purpose.
        deletedAt: utcTimestamp('deleted_at'),
    },
    (table) => ({
        // Live-row read path: filter `deletedAt IS NULL` and look up by
        // (userId, seasonId, type). Partial index keeps the hot path tight.
        livePerScopeIdx: index('prediction_snapshots_live_per_scope_idx')
            .on(table.userId, table.seasonId, table.type)
            .where(sql`${table.deletedAt} IS NULL`),
        // Cap-count path: counts every row including soft-deleted ones, so
        // the index intentionally has no partial filter.
        scopeIdx: index('prediction_snapshots_scope_idx').on(
            table.userId,
            table.seasonId,
            table.type,
        ),
    }),
);

export const predictionSnapshotEntries = pgTable(
    'prediction_snapshot_entries',
    {
        snapshotId: uuid('snapshot_id')
            .references(() => predictionSnapshots.id, { onDelete: 'cascade' })
            .notNull(),
        teamId: uuid('team_id')
            .references(() => teams.id)
            .notNull(),
        position: integer('position').notNull(),
    },
    (table) => ({
        pk: primaryKey({ columns: [table.snapshotId, table.teamId] }),
        // One team per position within a snapshot; pairs with the (snapshot,
        // team) PK to enforce the bijection required by `lockInPrediction`.
        uniqueSnapshotPosition: unique().on(table.snapshotId, table.position),
    }),
);

// --- Gameweek Predictions (#144) ---
// Per-(user, season, gameweek) score picks. A separate entity from the
// Projected-Finish snapshot family above — they share only the `'predictions'`
// role and live in this file because they're related, not because they're
// the same shape. See issue #144 for the design rationale (and PR #145 for
// the shared-table approach we explicitly rejected).
//
// Two pieces:
//
//   1. `gameweek_predictions` — a thin container. One live row per
//      (user, season, gameweek) — enforced by a partial unique. Created
//      lazily on the user's first pick commit for that week. Soft-delete
//      flips `deleted_at`; subsequent submits create a fresh container,
//      no auto un-soft-delete.
//
//   2. `gameweek_prediction_picks` — an append-only ledger. Every commit
//      inserts a new row; the "current" pick for a fixture is the most
//      recent row in the chain. `created_at` doubles as `locked_at`
//      (committing == locking). The pick chain is the audit trail —
//      there is no separate events table.
//
// Removing a manually-added fixture from a slip is out of scope for v1
// (the user just leaves scores blank). The `manually_added` flag stays
// a plain `bool` with no DB-side rescheduled-window constraint; that
// rule is resolver-enforced so the entity can absorb a broader add story
// later without a migration.
export const gameweekPredictions = pgTable(
    'gameweek_predictions',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id')
            .references(() => users.id, { onDelete: 'cascade' })
            .notNull(),
        seasonId: uuid('season_id')
            .references(() => seasons.id, { onDelete: 'cascade' })
            .notNull(),
        gameweek: integer('gameweek').notNull(),
        createdAt: utcTimestamp('created_at').defaultNow().notNull(),
        // Bumped on every appended pick — drives the history-panel sort
        // ("newest activity first") without a sub-query.
        updatedAt: utcTimestamp('updated_at').defaultNow().notNull(),
        // Soft-delete marker. Null = live. Picks are intentionally NOT
        // cascade-deleted by setting this — the chain stays for any
        // future admin tooling.
        deletedAt: utcTimestamp('deleted_at'),
    },
    (table) => ({
        // Hard rule: one live slip per (user, season, gameweek). The
        // partial filter lets the user soft-delete and resubmit (creating
        // a fresh container) without conflict.
        oneLivePerGameweek: uniqueIndex('gameweek_predictions_one_live_per_gameweek_idx')
            .on(table.userId, table.seasonId, table.gameweek)
            .where(sql`${table.deletedAt} IS NULL`),
        // History-panel listing path.
        liveByUserSeasonIdx: index('gameweek_predictions_live_by_user_season_idx')
            .on(table.userId, table.seasonId)
            .where(sql`${table.deletedAt} IS NULL`),
    }),
);

export const gameweekPredictionPicks = pgTable(
    'gameweek_prediction_picks',
    {
        // Surrogate PK — every commit is its own row, so (prediction, fixture)
        // is no longer unique. Also gives the GraphQL `id` a stable handle
        // for the per-fixture history popover.
        id: uuid('id').primaryKey().defaultRandom(),
        predictionId: uuid('prediction_id')
            .references(() => gameweekPredictions.id, { onDelete: 'cascade' })
            .notNull(),
        fixtureId: uuid('fixture_id')
            .references(() => fixtures.id)
            .notNull(),
        homeGoals: integer('home_goals'),
        awayGoals: integer('away_goals'),
        // Free-text per-fixture note. Soft cap (≤ 500 chars) enforced in
        // the resolver — a CHECK here would push the limit into migrations
        // any time we want to retune it.
        note: text('note'),
        // True = pulled in via the Add-fixture popup (rescheduled cup /
        // midweek game in the between-gameweek window). Rescheduled-window
        // validation is resolver-enforced.
        manuallyAdded: boolean('manually_added').notNull().default(false),
        // Commit time. Doubles as `locked_at` — there is no separate lock
        // column. Rows are immutable; no `updated_at`.
        createdAt: utcTimestamp('created_at').defaultNow().notNull(),
    },
    (table) => ({
        // Hot read path: latest pick per fixture for a slip.
        latestPerFixtureIdx: index('gameweek_prediction_picks_latest_per_fixture_idx').on(
            table.predictionId,
            table.fixtureId,
            table.createdAt,
        ),
        // Whole-slip timeline (per-fixture history popover, audit views).
        slipTimelineIdx: index('gameweek_prediction_picks_slip_timeline_idx').on(
            table.predictionId,
            table.createdAt,
        ),
        nonNegativeGoals: check(
            'gameweek_prediction_picks_non_negative_goals_check',
            sql`(${table.homeGoals} IS NULL OR ${table.homeGoals} >= 0)
                AND (${table.awayGoals} IS NULL OR ${table.awayGoals} >= 0)`,
        ),
    }),
);

// --- Tier rankable types (recipes) ---
// A small registry of *recipes* for ranking categories — `coach`,
// `player`, `venue`, …. Each row declares that a category exists; the
// matching server-side resolver knows how to project source data onto
// the tier-rankable-item display contract (name / imageUrl / teamId)
// and how to derive a per-instance natural key.
//
// Coaches: no first-class table — the `coach` recipe extracts data from
// fixture lineups. The fixture entity is the load-bearing thing; this
// row is a lens that lets the tier-list product project coaches out of
// it.
//
// Players / venues: first-class tables exist, but their schemas have
// variable shape (player name might live in `name` / `playerName` /
// `firstName`+`lastName`). The recipe pins which fields project where.
//
// `default_formula_id` is the formula seam for future objective-score
// computation (per-recipe — e.g. coaches → points-per-game). Wired but
// not consumed yet. Boot-time validation asserts every row here has a
// registered TS recipe with the same id (and vice versa).
export const tierRankableTypes = pgTable('tier_rankable_type', {
    id: text('id').primaryKey(), // 'coach', 'player', 'venue', …
    name: text('name').notNull(),
    defaultFormulaId: varchar('default_formula_id', { length: 50 }).references(
        () => rankingFormulas.id,
    ),
    createdAt: utcTimestamp('created_at').defaultNow().notNull(),
    updatedAt: utcTimestamp('updated_at').defaultNow().notNull(),
});

// --- Tier Lists ---
// A live-editable per-(user, season, recipe) ranking surface. Each item
// carries a snapshot of the recipe's projection (name, image, team)
// plus the natural key the recipe derived. The recipe row itself only
// declares "this category exists" — projection logic lives in the
// matching TS resolver.
export const tierLists = pgTable(
    'tier_list',
    {
        // Stable external identifier — surfaced as the GraphQL `id` and
        // used for any future share link / overlay route. Internal numeric
        // ids are never exposed (AI_README_FIRST §1).
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id')
            .references(() => users.id, { onDelete: 'cascade' })
            .notNull(),
        seasonId: uuid('season_id')
            .references(() => seasons.id, { onDelete: 'cascade' })
            .notNull(),
        // Which recipe this list ranks against. Constrains the add-drawer
        // and item validation. FK to the registry so a typo in user
        // input can't write garbage.
        tierRankableTypeId: text('tier_rankable_type_id')
            .references(() => tierRankableTypes.id)
            .notNull(),
        title: text('title').notNull(),
        // Ordered tier scheme, top to bottom. Each entry is
        // `{ key: <stable short id>, name: <display label> }`. Items
        // reference `key`, not `name`, so renames don't touch them. Bounds
        // (MIN_TIERS..MAX_TIERS) are enforced by the resolver.
        tiers: jsonb('tiers').notNull(),
        // Per-list display toggles (e.g. `showTeamNames`). Stored as JSONB
        // so new toggles can land without a migration. See
        // [[../config/tier-lists.ts]] for the canonical shape.
        displayConfig: jsonb('display_config')
            .notNull()
            .default(sql`'{"showTeamNames": true}'::jsonb`),
        // User-flipped read-only flag. When true, the resolver rejects edit
        // mutations with `TIER_LIST_LOCKED` and the editor renders
        // read-only. Never auto-set; the same user can flip it back any time.
        isLocked: boolean('is_locked').notNull().default(false),
        createdAt: utcTimestamp('created_at').defaultNow().notNull(),
        updatedAt: utcTimestamp('updated_at').defaultNow().notNull(),
        // Soft-delete marker. Null = live; set to now() on delete. Caps
        // count both live and soft-deleted rows so a create/delete loop
        // can't bypass the per-(user, season) limit.
        deletedAt: utcTimestamp('deleted_at'),
    },
    (table) => ({
        // Live-row read path: viewer's tier lists in a season, newest
        // first, filtered to live rows.
        liveByScopeIdx: index('tier_list_live_by_scope_idx')
            .on(table.userId, table.seasonId, table.tierRankableTypeId)
            .where(sql`${table.deletedAt} IS NULL`),
        // Cap-count path: counts every row including soft-deleted ones, so
        // the index intentionally has no partial filter.
        scopeIdx: index('tier_list_scope_idx').on(table.userId, table.seasonId),
    }),
);

export const tierRankableItems = pgTable(
    'tier_rankable_item',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        tierListId: uuid('tier_list_id')
            .references(() => tierLists.id, { onDelete: 'cascade' })
            .notNull(),
        // Which recipe was used to project this slot. Must match the
        // parent tier list's recipe; resolver enforces it.
        tierRankableTypeId: text('tier_rankable_type_id')
            .references(() => tierRankableTypes.id)
            .notNull(),
        // Stable per-instance identifier within the recipe ("${teamId}|pep
        // guardiola" for the coach recipe). `(tier_rankable_type_id,
        // natural_key)` is the cross-user identity for an instance and
        // powers aggregates like "most-ranked Pep". No UNIQUE — two
        // users can both have the same coach in their lists.
        naturalKey: text('natural_key').notNull(),
        // null = in the pool row; non-null = in the named tier on the parent.
        tierKey: text('tier_key'),
        // Float per row. Reorder by midpoint (insert between A=1.0 and
        // B=2.0 by writing 1.5) so a drag doesn't re-number siblings.
        position: doublePrecision('position').notNull(),
        // Snapshot of the recipe's projection at add time. Reads use these
        // directly; refresh-from-source (future) re-runs the recipe and
        // overwrites these without touching the per-user overrides below.
        name: text('name').notNull(),
        imageUrl: text('image_url'),
        teamId: uuid('team_id').references(() => teams.id),
        // Source back-pointer — where the snapshot came from.
        //   sourceType = 'fixture' | 'player' | 'venue' | …
        //   sourceId   = uuid of the source row
        //   sourcePath = sub-selector (e.g. { teamSourceId: 50 } to pick
        //                which lineup in a fixture)
        sourceType: text('source_type'),
        sourceId: uuid('source_id'),
        sourcePath: jsonb('source_path'),
        // Per-user customisation. Displayed name = nameOverride ?? name
        // (same for image). Refresh-from-source overwrites `name` /
        // `image_url` but never touches these.
        nameOverride: text('name_override'),
        imageUrlOverride: text('image_url_override'),
        // Secondary line. Per-user, no canonical version — different
        // recipes use it for different things (striker position, venue
        // capacity, etc.).
        subtitle: text('subtitle'),
        addedAt: utcTimestamp('added_at').defaultNow().notNull(),
        deletedAt: utcTimestamp('deleted_at'),
    },
    (table) => ({
        // Editor hot path: live items for one tier list, by row (tier or
        // pool) then position.
        liveByListIdx: index('tier_rankable_item_live_by_list_idx').on(
            table.tierListId,
            table.deletedAt,
            table.tierKey,
            table.position,
        ),
        // Reverse-lookup: every item using a given recipe + instance
        // identifier — powers "most-ranked Pep" aggregates across users.
        instanceIdx: index('tier_rankable_item_instance_idx').on(
            table.tierRankableTypeId,
            table.naturalKey,
        ),
        // Reverse-lookup by team — supports team-profile widgets ("every
        // item associated with team X").
        teamIdx: index('tier_rankable_item_team_idx').on(table.teamId),
        // Source-pointer integrity: either freeform (both null) or sourced
        // (both set).
        sourcePointerCheck: check(
            'tier_rankable_item_source_pointer_check',
            sql`(${table.sourceType} IS NULL) = (${table.sourceId} IS NULL)`,
        ),
    }),
);

export const graphics = pgTable(
    'graphics',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        entityType: varchar('entity_type', { length: 50 }).notNull(), // "team", "league", "player", "venue"
        entityId: uuid('entity_id').notNull(),
        sourceUrl: varchar('source_url', { length: 2048 }),
        blobPath: varchar('blob_path', { length: 500 }).notNull(), // The deterministic path: gfx/blobs/{hash}.png
        mimeType: varchar('mime_type', { length: 100 }).default('image/png').notNull(),
        metadata: jsonb('metadata'), // dimensions, alt text, etc.
        createdAt: utcTimestamp('created_at').defaultNow().notNull(),
        updatedAt: utcTimestamp('updated_at').defaultNow().notNull(),
    },
    (table) => ({
        unq: unique().on(table.entityType, table.entityId),
    }),
);
