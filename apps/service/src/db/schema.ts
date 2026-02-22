import { pgTable, uuid, varchar, integer, timestamp, jsonb, pgEnum, unique, boolean, text } from 'drizzle-orm/pg-core';

// Helper for UTC timestamps
const utcTimestamp = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const fixtureStatusEnum = pgEnum('fixture_status', [
    'scheduled',
    'played',
    'postponed',
    'cancelled',
    'live',
]);

export const jobStatusEnum = pgEnum('job_status', [
    'running',
    'success',
    'failed',
]);

export const catalogCountries = pgTable('catalog_countries', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    code: varchar('code', { length: 10 }),
    flag: varchar('flag', { length: 500 }),
    sourceName: varchar('source_name', { length: 50 }).notNull(),
    createdAt: utcTimestamp('created_at').defaultNow().notNull(),
    updatedAt: utcTimestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    unq: unique().on(table.sourceName, table.name),
}));

export const catalogLeagues = pgTable('catalog_leagues', {
    id: uuid('id').primaryKey().defaultRandom(),
    countryId: uuid('country_id').references(() => catalogCountries.id).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    type: varchar('type', { length: 50 }),
    logo: varchar('logo', { length: 500 }),
    sourceName: varchar('source_name', { length: 50 }).notNull(),
    sourceId: integer('source_id').notNull(),
    metadata: jsonb('metadata'),
    createdAt: utcTimestamp('created_at').defaultNow().notNull(),
    updatedAt: utcTimestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    unq: unique().on(table.sourceName, table.sourceId),
}));

export const leagues = pgTable('leagues', {
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
}, (table) => ({
    unq: unique().on(table.sourceName, table.sourceId),
}));

export const teams = pgTable('teams', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    shortName: varchar('short_name', { length: 100 }),
    tla: varchar('tla', { length: 10 }), // e.g. "ARS", "CHE"
    logo: varchar('logo', { length: 500 }),
    venue: varchar('venue', { length: 255 }),
    sourceName: varchar('source_name', { length: 50 }).notNull(),
    sourceId: integer('source_id').notNull(),
    metadata: jsonb('metadata'), // provider specific extras
    rawResponse: jsonb('raw_response'),
    createdAt: utcTimestamp('created_at').defaultNow().notNull(),
    updatedAt: utcTimestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    unq: unique().on(table.sourceName, table.sourceId),
}));

export const seasons = pgTable('seasons', {
    id: uuid('id').primaryKey().defaultRandom(),
    leagueId: uuid('league_id').references(() => leagues.id).notNull(),
    year: integer('year').notNull(),
    startDate: utcTimestamp('start_date'),
    endDate: utcTimestamp('end_date'),
    metadata: jsonb('metadata'),
    createdAt: utcTimestamp('created_at').defaultNow().notNull(),
    updatedAt: utcTimestamp('updated_at').defaultNow().notNull(),
});

export const fixtures = pgTable('fixtures', {
    id: uuid('id').primaryKey().defaultRandom(),
    leagueId: uuid('league_id').references(() => leagues.id).notNull(),
    seasonId: uuid('season_id').references(() => seasons.id).notNull(),
    homeTeamId: uuid('home_team_id').references(() => teams.id).notNull(),
    awayTeamId: uuid('away_team_id').references(() => teams.id).notNull(),
    status: fixtureStatusEnum('status').default('scheduled').notNull(),
    scheduledAt: utcTimestamp('scheduled_at').notNull(),
    homeGoals: integer('home_goals'),
    awayGoals: integer('away_goals'),
    sourceName: varchar('source_name', { length: 50 }).notNull(),
    sourceId: integer('source_id').notNull(),
    metadata: jsonb('metadata'), // events_summary, referee, weather, etc.
    rawResponse: jsonb('raw_response'), // original API signal
    createdAt: utcTimestamp('created_at').defaultNow().notNull(),
    updatedAt: utcTimestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    unq: unique().on(table.sourceName, table.sourceId),
}));

export const standingsRows = pgTable('standings_rows', {
    id: varchar('id').primaryKey(), // leagueId-season-teamId
    seasonId: uuid('season_id').references(() => seasons.id).notNull(),
    teamId: uuid('team_id').references(() => teams.id).notNull(),
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
    jobId: uuid('job_id').references(() => jobs.id).notNull(),
    status: jobStatusEnum('status').default('running').notNull(),
    startedAt: utcTimestamp('started_at').defaultNow().notNull(),
    finishedAt: utcTimestamp('finished_at'),
    errorMessage: text('error_message'),
    context: jsonb('context'),
    processedCount: integer('processed_count').default(0),
    apiCallsCount: integer('api_calls_count').default(0),
});
