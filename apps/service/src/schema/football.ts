import { builder, requireAdmin } from './builder';
import { repository } from '../repositories/supabase.repository';
import { JobRunner } from '../workers/runner';
import { cacheService } from '../services/cache.service';
import { db } from '../db';
import * as schema from '../db/schema';
import { eq, and, count, sql } from 'drizzle-orm';
import { graphicsService } from '../services/graphics.service';

// Define object refs first
export const LeagueRef = builder.objectRef<typeof schema.leagues.$inferSelect>('League');
const TeamRef = builder.objectRef<typeof schema.teams.$inferSelect>('Team');
export const SeasonRef = builder.objectRef<typeof schema.seasons.$inferSelect>('Season');
const FixtureRef = builder.objectRef<typeof schema.fixtures.$inferSelect>('Fixture');
const VenueRef = builder.objectRef<typeof schema.venues.$inferSelect>('Venue');
const MatchEventRef = builder.objectRef<import('../integrations/types').IngestedEvent>('MatchEvent');

type PlayerShape = Partial<typeof schema.players.$inferSelect> & { sourceId: number, name: string, injured: boolean, statistics?: unknown, height?: string | null, weight?: string | null };
const PlayerRef = builder.objectRef<PlayerShape>('Player');
const LineupRef = builder.objectRef<import('../integrations/types').IngestedLineup>('Lineup');

builder.objectType(VenueRef, {
    fields: (t) => ({
        id: t.exposeString('id'),
        name: t.exposeString('name'),
        city: t.exposeString('city', { nullable: true }),
        capacity: t.exposeInt('capacity', { nullable: true }),
        surface: t.exposeString('surface', { nullable: true }),
        image: t.string({
            nullable: true,
            resolve: async (parent) => {
                try {
                    const url = await graphicsService.resolveUrl(parent.id, 'venue');
                    if (url) return url;
                } catch { /* fall through */ }
                return parent.image || null;
            }
        }),
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
        logo: t.string({
            nullable: true,
            resolve: async (parent) => {
                try {
                    const url = await graphicsService.resolveUrl(parent.id, 'league');
                    if (url) return url;
                } catch { /* fall through */ }
                return parent.logo || null;
            }
        }),
        sourceId: t.exposeInt('sourceId'),
        seasons: t.field({
            type: [SeasonRef],
            resolve: async (parent) => {
                // Only return seasons that have teams imported (i.e., real data)
                const allSeasons = await repository.football.getInternalSeasons(parent.sourceId, parent.id);
                const seasonIds = allSeasons.map((s) => s.id);
                if (seasonIds.length === 0) return [];

                // Check which seasons have teams linked
                const linked = await db.select({ seasonId: schema.seasonsToTeams.seasonId })
                    .from(schema.seasonsToTeams)
                    .where(sql`${schema.seasonsToTeams.seasonId} IN (${sql.join(seasonIds.map((id: string) => sql`${id}`), sql`, `)})`);

                const linkedIds = new Set(linked.map((r) => r.seasonId));
                return allSeasons.filter((s) => linkedIds.has(s.id));
            },
        }),
        metadata: t.field({
            type: SourceRef,
            resolve: (parent) => ({
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
        logo: t.string({
            nullable: true,
            resolve: async (parent) => {
                try {
                    const url = await graphicsService.resolveUrl(parent.id, 'team');
                    if (url) return url;
                } catch { /* fall through */ }
                return parent.logo || null;
            }
        }),
        sourceId: t.exposeInt('sourceId'),
        // N+1 WARNING: This resolver fires per-team. Not triggered by the web app's
        // SYNC_DATA_QUERY (scalar fields only), but custom queries requesting nested
        // team.venue will trigger O(N) individual DB queries. Consider a dataloader if
        // this becomes a hotspot.
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
            resolve: (parent) => ({
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
                return res.map((r) => r.team);
            }
        }),
        rankingCriteria: t.field({
            type: [RankingFormulaRef],
            resolve: async (parent) => {
                const metadata = parent.metadata as Record<string, unknown> | null;
                const criteria = (metadata?.rankingCriteria as string[]) || ['standard_pts', 'goal_diff', 'goals_for'];
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
        season: t.int({
            resolve: async (parent) => {
                if (!parent.seasonId) return 0;
                const [s] = await db.select().from(schema.seasons).where(eq(schema.seasons.id, parent.seasonId));
                return s?.year ?? 0;
            }
        }),
        leagueSourceId: t.int({
            nullable: true,
            resolve: async (parent) => {
                if (!parent.seasonId) return null;
                const [s] = await db.select().from(schema.seasons).where(eq(schema.seasons.id, parent.seasonId));
                if (!s) return null;
                const [l] = await db.select().from(schema.leagues).where(eq(schema.leagues.id, s.leagueId));
                return l?.sourceId ?? null;
            }
        }),
        homeTeamId: t.exposeString('homeTeamId'),
        awayTeamId: t.exposeString('awayTeamId'),
        venueId: t.exposeString('venueId', { nullable: true }),
        scheduledAt: t.expose('scheduledAt', { type: 'DateTime' }),
        status: t.exposeString('status'),
        gameweek: t.exposeInt('gameweek', { nullable: true }),
        goalsHome: t.int({
            nullable: true,
            resolve: (parent) => parent.homeGoals,
        }),
        goalsAway: t.int({
            nullable: true,
            resolve: (parent) => parent.awayGoals,
        }),
        updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
        // N+1 WARNING: homeTeam, awayTeam, venue, and season resolvers each fire
        // individual DB queries per fixture. The web app's SYNC_DATA_QUERY only
        // requests scalar fields, so these never fire on the hot path. Custom
        // queries requesting nested objects on 380+ fixtures will be slow.
        // Consider a dataloader pattern if this becomes a performance issue.
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
            resolve: (parent) => ({
                sourceName: parent.sourceName as string,
                sourceId: parent.sourceId as number,
            }),
        }),
        events: t.field({
            type: [MatchEventRef],
            resolve: async (parent) => {
                return repository.football.getMatchEvents(parent.sourceId);
            }
        }),
        lineups: t.field({
            type: [LineupRef],
            resolve: async (parent) => {
                return repository.football.getLineups(parent.sourceId);
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
        playerId: t.exposeString('playerId', { nullable: true }),
        assistName: t.exposeString('assistName', { nullable: true }),
        assistSourceId: t.exposeInt('assistSourceId', { nullable: true }),
        type: t.exposeString('type'),
        detail: t.exposeString('detail'),
        comments: t.exposeString('comments', { nullable: true }),
        minute: t.exposeInt('minute'),
        extraMinute: t.exposeInt('extraMinute', { nullable: true }),
    }),
});

builder.objectType(PlayerRef, {
    fields: (t) => ({
        id: t.string({
            nullable: true,
            resolve: (parent) => parent.id || null,
        }),
        sourceId: t.exposeInt('sourceId'),
        name: t.exposeString('name'),
        firstname: t.exposeString('firstname', { nullable: true }),
        lastname: t.exposeString('lastname', { nullable: true }),
        age: t.exposeInt('age', { nullable: true }),
        nationality: t.exposeString('nationality', { nullable: true }),
        height: t.string({ nullable: true, resolve: (parent) => parent.height || null }),
        weight: t.string({ nullable: true, resolve: (parent) => parent.weight || null }),
        injured: t.exposeBoolean('injured'),
        photo: t.string({
            nullable: true,
            resolve: async (parent) => {
                // If we have an internal UUID, check the graphics registry first
                if (parent.id) {
                    try {
                        const url = await graphicsService.resolveUrl(parent.id, 'player');
                        if (url) return url;
                    } catch { /* fall through */ }
                }
                return parent.photo || null;
            }
        }),
        statistics: t.expose('statistics', { type: 'JSON', nullable: true }),
    }),
});

builder.objectType(LineupRef, {
    fields: (t) => ({
        teamSourceId: t.exposeInt('teamSourceId'),
        teamName: t.exposeString('teamName'),
        teamLogo: t.exposeString('teamLogo', { nullable: true }),
        formation: t.exposeString('formation', { nullable: true }),
        coachName: t.exposeString('coachName', { nullable: true }),
        coachPhoto: t.exposeString('coachPhoto', { nullable: true }),
        startXI: t.expose('startXI', { type: [PlayerRef] }),
        substitutes: t.expose('substitutes', { type: [PlayerRef] }),
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

const RankingFormulaRef = builder.objectRef<typeof schema.rankingFormulas.$inferSelect>('RankingFormula');

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
        resolve: async (_, { leagueId, season, since }) => {
            return repository.football.getFixtures(leagueId, season, since || undefined);
        },
    })
);

builder.queryField('fixture', (t) =>
    t.field({
        type: FixtureRef,
        nullable: true,
        args: {
            id: t.arg.string({ required: true }),
        },
        resolve: async (_, { id }) => {
            const [fixture] = await db.select().from(schema.fixtures).where(eq(schema.fixtures.id, id));
            return fixture;
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

            return result.map((r) => r.venue);
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
                        return cached.filter((r) => new Date(r.team.updatedAt as Date) > since).map((r) => r.team);
                    }
                    return cached.map((r) => r.team);
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
        resolve: async (_root, _args, ctx) => {
            requireAdmin(ctx);
            const result = await repository.football.getLeagues();
            cacheService.invalidate('leagues');
            return result;
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
        resolve: async (_, { leagueId, season }, ctx) => {
            requireAdmin(ctx);
            let result: Array<typeof schema.fixtures.$inferSelect> = [];
            await JobRunner.run(`sync-fixtures-${leagueId}-${season}`, async () => {
                const syncRes = await repository.football.syncFixtures(leagueId, season);
                result = syncRes.data;
                return {
                    processedCount: syncRes.stats.processedCount,
                    apiCallsCount: syncRes.stats.apiCallsCount,
                    context: { leagueId, season }
                };
            });
            cacheService.invalidate(`fixtures:${leagueId}:${season}`);
            cacheService.invalidate(`teams:${leagueId}:${season}`);
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
        resolve: async (_, { id, configJson }, ctx) => {
            requireAdmin(ctx);
            let metadata: Record<string, unknown>;
            try {
                metadata = JSON.parse(configJson);
            } catch {
                throw new Error("Invalid JSON configuration");
            }
            const [updated] = await db.update(schema.leagues)
                .set({ metadata, updatedAt: new Date() })
                .where(eq(schema.leagues.id, id))
                .returning();
            cacheService.invalidate('leagues');
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
        resolve: async (_, { id, configJson, rankingCriteria }, ctx) => {
            requireAdmin(ctx);
            let metadata: Record<string, unknown>;
            try {
                metadata = JSON.parse(configJson);
            } catch {
                throw new Error("Invalid JSON configuration");
            }

            if (rankingCriteria && rankingCriteria.length > 0) {
                metadata.rankingCriteria = rankingCriteria;
            }

            const [updated] = await db.update(schema.seasons)
                .set({ metadata, updatedAt: new Date() })
                .where(eq(schema.seasons.id, id))
                .returning();
            cacheService.invalidate('seasons');
            return updated;
        }
    })
);

