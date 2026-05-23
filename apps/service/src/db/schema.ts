import { sql } from 'drizzle-orm';
import {
    boolean,
    index,
    integer,
    jsonb,
    pgEnum,
    pgTable,
    primaryKey,
    text,
    timestamp,
    unique,
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
