import { builder } from './builder';
import { repository } from '../repositories/supabase.repository';
import { JobRunner } from '../workers/runner';
import { db } from '../db';
import * as schema from '../db/schema';
import { eq, and, count, countDistinct, sql } from 'drizzle-orm';

// Define object refs first
export const LeagueRef = builder.objectRef<any>('League');
const TeamRef = builder.objectRef<any>('Team');
export const SeasonRef = builder.objectRef<any>('Season');
const FixtureRef = builder.objectRef<any>('Fixture');
const VenueRef = builder.objectRef<any>('Venue');
const MatchEventRef = builder.objectRef<any>('MatchEvent');
const PlayerRef = builder.objectRef<any>('Player');

builder.objectType(VenueRef, {
    fields: (t) => ({
        id: t.exposeString('id'),
        name: t.exposeString('name'),
        city: t.exposeString('city', { nullable: true }),
        capacity: t.exposeInt('capacity', { nullable: true }),
        surface: t.exposeString('surface', { nullable: true }),
        image: t.exposeString('image', { nullable: true }),
        updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    }),
});

const SourceRef = builder.simpleObject('SourceInfo', {
    fields: (t) => ({
        sourceName: t.string(),
        sourceId: t.int(),
    }),
});

builder.objectType(LeagueRef, {
    fields: (t) => ({
        id: t.exposeString('id'),
        name: t.exposeString('name'),
        slug: t.exposeString('slug'),
        country: t.exposeString('country', { nullable: true }),
        logo: t.exposeString('logo', { nullable: true }),
        sourceId: t.exposeInt('sourceId'),
        seasons: t.field({
            type: [SeasonRef],
            resolve: async (parent) => {
                // Only return seasons that have teams imported (i.e., real data)
                const allSeasons = await repository.football.getInternalSeasons(parent.sourceId, parent.id);
                const seasonIds = allSeasons.map((s: any) => s.id);
                if (seasonIds.length === 0) return [];

                // Check which seasons have teams linked
                const linked = await db.select({ seasonId: schema.seasonsToTeams.seasonId })
                    .from(schema.seasonsToTeams)
                    .where(sql`${schema.seasonsToTeams.seasonId} IN (${sql.join(seasonIds.map((id: string) => sql`${id}`), sql`, `)})`);

                const linkedIds = new Set(linked.map((r: any) => r.seasonId));
                return allSeasons.filter((s: any) => linkedIds.has(s.id));
            },
        }),
        metadata: t.field({
            type: SourceRef,
            resolve: (parent: any) => ({
                sourceName: parent.sourceName,
                sourceId: parent.sourceId,
            }),
        }),
        configJson: t.field({
            type: 'String',
            resolve: (parent) => JSON.stringify(parent.metadata || {}),
        }),
        updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    }),
});

builder.objectType(TeamRef, {
    fields: (t) => ({
        id: t.exposeString('id'),
        name: t.exposeString('name'),
        shortName: t.exposeString('shortName', { nullable: true }),
        tla: t.exposeString('tla', { nullable: true }),
        logo: t.exposeString('logo', { nullable: true }),
        venue: t.field({
            type: VenueRef,
            nullable: true,
            resolve: async (parent) => {
                if (!parent.venueId) return null;
                const [v] = await db.select().from(schema.venues).where(eq(schema.venues.id, parent.venueId));
                return v;
            }
        }),
        metadata: t.field({
            type: SourceRef,
            resolve: (parent: any) => ({
                sourceName: parent.sourceName,
                sourceId: parent.sourceId,
            }),
        }),
        updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    }),
});

builder.objectType(SeasonRef, {
    fields: (t) => ({
        id: t.exposeString('id'),
        leagueId: t.exposeString('leagueId'),
        year: t.exposeInt('year'),
        startDate: t.expose('startDate', { type: 'DateTime', nullable: true }),
        endDate: t.expose('endDate', { type: 'DateTime', nullable: true }),
        configJson: t.field({
            type: 'String',
            resolve: (parent) => JSON.stringify(parent.metadata || {}),
        }),
        fixtureCount: t.int({
            resolve: async (parent) => {
                const [res] = await db.select({ val: count() }).from(schema.fixtures).where(eq(schema.fixtures.seasonId, parent.id));
                return Number(res?.val || 0);
            }
        }),
        teamCount: t.int({
            resolve: async (parent) => {
                const [res] = await db.select({ val: count() }).from(schema.seasonsToTeams).where(eq(schema.seasonsToTeams.seasonId, parent.id));
                return Number(res?.val || 0);
            }
        }),
        teams: t.field({
            type: [TeamRef],
            resolve: async (parent) => {
                const res = await db.select({ team: schema.teams })
                    .from(schema.teams)
                    .innerJoin(schema.seasonsToTeams, eq(schema.teams.id, schema.seasonsToTeams.teamId))
                    .where(eq(schema.seasonsToTeams.seasonId, parent.id));
                return res.map((r: { team: any }) => r.team);
            }
        }),
        rankingCriteria: t.field({
            type: [RankingFormulaRef],
            resolve: async (parent) => {
                const criteria = (parent.metadata as any)?.rankingCriteria || ['standard_pts', 'goal_diff', 'goals_for'];
                const all = await repository.football.getRankingFormulas();
                return all.filter(f => criteria.includes(f.id));
            }
        }),
        updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    }),
});

builder.objectType(FixtureRef, {
    fields: (t) => ({
        id: t.exposeString('id'),
        seasonId: t.exposeString('seasonId'),
        homeTeamId: t.exposeString('homeTeamId'),
        awayTeamId: t.exposeString('awayTeamId'),
        venueId: t.exposeString('venueId', { nullable: true }),
        scheduledAt: t.expose('scheduledAt', { type: 'DateTime' }),
        status: t.exposeString('status'),
        goalsHome: t.int({
            nullable: true,
            resolve: (parent: any) => parent.homeGoals ?? null,
        }),
        goalsAway: t.int({
            nullable: true,
            resolve: (parent: any) => parent.awayGoals ?? null,
        }),
        updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
        homeTeam: t.field({
            type: TeamRef,
            resolve: async (parent) => {
                const [t] = await db.select().from(schema.teams).where(eq(schema.teams.id, parent.homeTeamId));
                return t;
            }
        }),
        awayTeam: t.field({
            type: TeamRef,
            resolve: async (parent) => {
                const [t] = await db.select().from(schema.teams).where(eq(schema.teams.id, parent.awayTeamId));
                return t;
            }
        }),
        venue: t.field({
            type: VenueRef,
            nullable: true,
            resolve: async (parent) => {
                if (!parent.venueId) return null;
                const [v] = await db.select().from(schema.venues).where(eq(schema.venues.id, parent.venueId));
                return v;
            }
        }),
        metadata: t.field({
            type: SourceRef,
            resolve: (parent: any) => ({
                sourceName: parent.sourceName,
                sourceId: parent.sourceId,
            }),
        }),
        events: t.field({
            type: [MatchEventRef],
            resolve: async (parent) => {
                return repository.football.getMatchEvents(parent.sourceId);
            }
        }),
    }),
});

builder.objectType(MatchEventRef, {
    fields: (t) => ({
        fixtureId: t.exposeInt('fixtureId'),
        teamId: t.exposeInt('teamId'),
        playerName: t.exposeString('playerName', { nullable: true }),
        playerSourceId: t.exposeInt('playerSourceId', { nullable: true }),
        type: t.exposeString('type'),
        detail: t.exposeString('detail'),
        comments: t.exposeString('comments', { nullable: true }),
        minute: t.exposeInt('minute'),
        extraMinute: t.exposeInt('extraMinute', { nullable: true }),
    }),
});

builder.objectType(PlayerRef, {
    fields: (t) => ({
        sourceId: t.exposeInt('sourceId'),
        name: t.exposeString('name'),
        firstname: t.exposeString('firstname'),
        lastname: t.exposeString('lastname'),
        age: t.exposeInt('age'),
        nationality: t.exposeString('nationality'),
        height: t.exposeString('height', { nullable: true }),
        weight: t.exposeString('weight', { nullable: true }),
        injured: t.exposeBoolean('injured'),
        photo: t.exposeString('photo', { nullable: true }),
        statistics: t.expose('statistics', { type: 'JSON', nullable: true }),
    }),
});

builder.queryField('leagues', (t) =>
    t.field({
        type: [LeagueRef],
        resolve: async () => {
            return repository.football.getLeagues();
        },
    })
);

builder.queryField('seasons', (t) =>
    t.field({
        type: [SeasonRef],
        args: {
            leagueId: t.arg.string({ required: false }),
        },
        resolve: async (_, { leagueId }) => {
            if (!leagueId) {
                return repository.football.getAllInternalSeasons();
            }
            const [league] = await db.select().from(schema.leagues).where(eq(schema.leagues.id, leagueId));
            if (!league) return [];
            return repository.football.getInternalSeasons(league.sourceId);
        },
    })
);

builder.queryField('allSeasons', (t) =>
    t.field({
        type: [SeasonRef],
        resolve: async () => {
            return repository.football.getAllInternalSeasons();
        },
    })
);

const RankingFormulaRef = builder.objectRef<any>('RankingFormula');

builder.objectType(RankingFormulaRef, {
    fields: (t) => ({
        id: t.exposeString('id'),
        name: t.exposeString('name'),
        description: t.exposeString('description', { nullable: true }),
        logicType: t.exposeString('logicType'),
    }),
});

builder.queryField('rankingFormulas', (t) =>
    t.field({
        type: [RankingFormulaRef],
        resolve: () => repository.football.getRankingFormulas(),
    }),
);

builder.queryField('fixtures', (t) =>
    t.field({
        type: [FixtureRef],
        args: {
            leagueId: t.arg.int({ required: true }),
            season: t.arg.int({ required: true }),
            since: t.arg({ type: 'DateTime', required: false }),
        },
        resolve: async (_: any, { leagueId, season, since }: any) => {
            return repository.football.getFixtures(leagueId, season, since || undefined);
        },
    })
);

builder.queryField('venues', (t) =>
    t.field({
        type: [VenueRef],
        args: {
            leagueId: t.arg.int({ required: true }),
            season: t.arg.int({ required: true }),
        },
        resolve: async (_, { leagueId, season }) => {
            // Get all venue IDs referenced by fixtures for this league/season
            const [localLeague] = await db.select().from(schema.leagues).where(eq(schema.leagues.sourceId, leagueId));
            if (!localLeague) return [];

            const [localSeason] = await db.select().from(schema.seasons)
                .where(and(eq(schema.seasons.leagueId, localLeague.id), eq(schema.seasons.year, season)));
            if (!localSeason) return [];

            const result = await db.selectDistinct({ venue: schema.venues })
                .from(schema.venues)
                .innerJoin(schema.fixtures, eq(schema.fixtures.venueId, schema.venues.id))
                .where(eq(schema.fixtures.seasonId, localSeason.id));

            return result.map((r: any) => r.venue);
        },
    })
);

builder.queryField('teams', (t) =>
    t.field({
        type: [TeamRef],
        args: {
            leagueId: t.arg.int({ required: false }),
            season: t.arg.int({ required: false }),
            since: t.arg({ type: 'DateTime', required: false }),
        },
        resolve: async (_, { leagueId, season, since }) => {
            if (leagueId && season) {
                // Try cached data first (fast path)
                const [localLeague] = await db.select().from(schema.leagues).where(eq(schema.leagues.sourceId, leagueId));
                if (!localLeague) return [];

                const [localSeason] = await db.select().from(schema.seasons)
                    .where(and(eq(schema.seasons.leagueId, localLeague.id), eq(schema.seasons.year, season)));
                if (!localSeason) return [];

                const cached = await db.select({ team: schema.teams })
                    .from(schema.teams)
                    .innerJoin(schema.seasonsToTeams, eq(schema.teams.id, schema.seasonsToTeams.teamId))
                    .where(eq(schema.seasonsToTeams.seasonId, localSeason.id));

                if (cached.length > 0) {
                    if (since) {
                        return cached.filter((r: any) => new Date(r.team.updatedAt) > since).map((r: any) => r.team);
                    }
                    return cached.map((r: any) => r.team);
                }

                // No cached data — do full sync (first time only)
                return repository.football.getTeams(leagueId, season, since || undefined);
            }
            return db.select().from(schema.teams);
        },
    })
);

builder.mutationField('ingestLeagues', (t) =>
    t.field({
        type: [LeagueRef],
        resolve: async () => {
            return repository.football.getLeagues();
        },
    })
);

builder.mutationField('syncFixtures', (t) =>
    t.field({
        type: [FixtureRef],
        args: {
            leagueId: t.arg.int({ required: true }),
            season: t.arg.int({ required: true }),
        },
        resolve: async (_: any, { leagueId, season }: any) => {
            let result: any[] = [];
            await JobRunner.run(`sync-fixtures-${leagueId}-${season}`, async () => {
                const syncRes = await repository.football.syncFixtures(leagueId, season);
                result = syncRes.data;
                return {
                    processedCount: syncRes.stats.processedCount,
                    apiCallsCount: syncRes.stats.apiCallsCount,
                    context: { leagueId, season }
                };
            });
            return result;
        },
    })
);

builder.queryField('player', (t) =>
    t.field({
        type: PlayerRef,
        nullable: true,
        args: {
            sourceId: t.arg.int({ required: true }),
            season: t.arg.int({ required: true }),
        },
        resolve: async (_, { sourceId, season }) => {
            return repository.football.getPlayerData(sourceId, season);
        },
    })
);

builder.mutationField('saveLeagueConfig', (t) =>
    t.field({
        type: LeagueRef,
        args: {
            id: t.arg.string({ required: true }),
            configJson: t.arg.string({ required: true }),
        },
        resolve: async (_, { id, configJson }) => {
            let metadata = {};
            try {
                metadata = JSON.parse(configJson);
            } catch (e) {
                throw new Error("Invalid JSON configuration");
            }
            const [updated] = await db.update(schema.leagues)
                .set({ metadata, updatedAt: new Date() })
                .where(eq(schema.leagues.id, id))
                .returning();
            return updated;
        }
    })
);

builder.mutationField('saveSeasonConfig', (t) =>
    t.field({
        type: SeasonRef,
        args: {
            id: t.arg.string({ required: true }),
            configJson: t.arg.string({ required: true }),
            rankingCriteria: t.arg.stringList({ required: false }),
        },
        resolve: async (_, { id, configJson, rankingCriteria }) => {
            let metadata: any = {};
            try {
                metadata = JSON.parse(configJson);
            } catch (e) {
                throw new Error("Invalid JSON configuration");
            }

            if (rankingCriteria && rankingCriteria.length > 0) {
                metadata.rankingCriteria = rankingCriteria;
            }

            const [updated] = await db.update(schema.seasons)
                .set({ metadata, updatedAt: new Date() })
                .where(eq(schema.seasons.id, id))
                .returning();
            return updated;
        }
    })
);

