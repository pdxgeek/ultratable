import { pgTable, uuid, varchar, integer, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core';

export const fixtureStatusEnum = pgEnum('fixture_status', [
    'scheduled',
    'played',
    'postponed',
    'cancelled',
    'live',
]);

export const leagues = pgTable('leagues', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).unique().notNull(),
    country: varchar('country', { length: 100 }),
    logo: varchar('logo', { length: 500 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const teams = pgTable('teams', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    shortName: varchar('short_name', { length: 100 }),
    tla: varchar('tla', { length: 10 }), // e.g. "ARS", "CHE"
    logo: varchar('logo', { length: 500 }),
    venue: varchar('venue', { length: 255 }),
    metadata: jsonb('metadata'), // provider specific IDs
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const seasons = pgTable('seasons', {
    id: uuid('id').primaryKey().defaultRandom(),
    leagueId: uuid('league_id').references(() => leagues.id).notNull(),
    year: integer('year').notNull(),
    startDate: timestamp('start_date'),
    endDate: timestamp('end_date'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const fixtures = pgTable('fixtures', {
    id: uuid('id').primaryKey().defaultRandom(),
    seasonId: uuid('season_id').references(() => seasons.id).notNull(),
    homeTeamId: uuid('home_team_id').references(() => teams.id).notNull(),
    awayTeamId: uuid('away_team_id').references(() => teams.id).notNull(),
    status: fixtureStatusEnum('status').default('scheduled').notNull(),
    scheduledAt: timestamp('scheduled_at').notNull(),
    homeGoals: integer('home_goals'),
    awayGoals: integer('away_goals'),
    metadata: jsonb('metadata'), // events_summary, referee, weather, etc.
    rawResponse: jsonb('raw_response'), // original API signal
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const standingsRows = pgTable('standings_rows', {
    id: varchar('id').primaryKey(), // composite "${seasonId}:${teamId}"
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
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
