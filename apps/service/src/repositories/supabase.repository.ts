import { ConfigRepository, FootballRepository, IRepository, SyncResult } from './interfaces';
import { db } from '../db';
import * as schema from '../db/schema';
import { eq, sql, and, gt, inArray, notInArray, lte } from 'drizzle-orm';
import { IFootballProvider } from '../integrations/types';
import { JobReporter } from '../workers/runner';
import { ApiFootballProvider } from '../integrations/api-football';
import { MockFootballProvider } from '../integrations/mock';
import { graphicsService } from '../services/graphics.service';
import { globalLogger } from '../services/log.service';
import { cacheService, TTL, fixtureTTL, seasonTTL } from '../services/cache.service';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Postgres now() returns microsecond precision, but the GraphQL DateTime scalar
 * truncates to milliseconds. Using raw now() causes phantom deltas: the client
 * watermark (ms) is always less than the stored value (µs), so rows re-appear
 * in every delta sync. Truncating to milliseconds keeps them in sync.
 */
const NOW_MS = sql`date_trunc('milliseconds', now())`;

export class SupabaseConfigRepository implements ConfigRepository {
    private async updateEnvs(updates: Record<string, string>) {
        // In production, the filesystem is ephemeral (Docker/Fly.io) — .env changes would be lost on redeploy.
        if (process.env.NODE_ENV === 'production') {
            throw new Error('Config mutations are disabled in production. Use environment variables instead.');
        }
        const envPath = path.resolve(process.cwd(), '.env');
        let content = '';
        try {
            content = await fs.readFile(envPath, 'utf-8');
        } catch {
            // ignore if .env is missing
        }

        const lines = content.split('\n');
        for (const [key, value] of Object.entries(updates)) {
            const index = lines.findIndex(l => l.startsWith(`${key}=`));
            if (index !== -1) {
                lines[index] = `${key}=${value}`;
            } else {
                lines.push(`${key}=${value}`);
            }
        }

        await fs.writeFile(envPath, lines.join('\n').trim());
    }

    async getDatabaseUrlMasked(): Promise<string | null> {
        const url = process.env.DATABASE_URL;
        if (!url || url.includes('[HOST]')) return null;
        const host = url.split('@')[1] || url;
        return `postgresql://****@${host}`;
    }

    async getApiFootballKeyMasked(): Promise<string | null> {
        const key = process.env.API_FOOTBALL_KEY;
        if (!key || key.includes('[YOUR_KEY]')) return null;
        return `${key.slice(0, 4)}****${key.slice(-4)}`;
    }

    async getSupabaseUrl(): Promise<string | null> {
        return process.env.SUPABASE_URL || null;
    }

    async getSupabaseAnonKeyMasked(): Promise<string | null> {
        const key = process.env.SUPABASE_ANON_KEY;
        if (!key || key.includes('[ANON_KEY]')) return null;
        return `${key.slice(0, 4)}****${key.slice(-4)}`;
    }

    async updateDatabaseUrl(url: string): Promise<boolean> {
        try {
            await this.updateEnvs({ 'DATABASE_URL': url });
            return true;
        } catch { return false; }
    }

    async updateApiFootballKey(key: string): Promise<boolean> {
        try {
            await this.updateEnvs({ 'API_FOOTBALL_KEY': key });
            return true;
        } catch { return false; }
    }

    async updateSupabaseConfig(url: string, anonKey: string): Promise<boolean> {
        try {
            await this.updateEnvs({
                'SUPABASE_URL': url,
                'SUPABASE_ANON_KEY': anonKey
            });
            return true;
        } catch { return false; }
    }
}

const logger = globalLogger.child({ module: 'SupabaseFootballRepository' });

export class SupabaseFootballRepository implements FootballRepository {
    private provider: IFootballProvider;

    constructor(providerOverride?: IFootballProvider) {
        if (providerOverride) {
            this.provider = providerOverride;
        } else {
            const providerName = process.env.FOOTBALL_PROVIDER || 'api-football';
            if (providerName === 'mock') {
                this.provider = new MockFootballProvider();
            } else {
                this.provider = new ApiFootballProvider();
            }
        }
    }

    async getLeagues(): Promise<Array<typeof schema.leagues.$inferSelect>> {
        if (!db) return [];
        const cached = cacheService.get<Array<typeof schema.leagues.$inferSelect>>('leagues');
        if (cached) return cached;

        const existing = await db.select().from(schema.leagues);
        if (existing.length > 0) {
            cacheService.set('leagues', existing, TTL.STABLE);
            return existing;
        }

        const ingested = await this.provider.getLeagues();

        const leaguesToInsert = ingested.map((l) => ({
            name: l.name,
            slug: l.slug,
            country: l.country,
            logo: l.logo,
            sourceName: l.sourceName,
            sourceId: l.sourceId,
            metadata: {}
        }));

        await db.insert(schema.leagues).values(leaguesToInsert).onConflictDoNothing();
        const result = await db.select().from(schema.leagues);
        cacheService.set('leagues', result, TTL.STABLE);
        return result;
    }

    async getInternalSeasons(leagueSourceId: number, internalLeagueId?: string): Promise<Array<typeof schema.seasons.$inferSelect>> {
        if (!db) return [];
        let leagueId = internalLeagueId;
        if (!leagueId) {
            const [league] = await db.select().from(schema.leagues).where(eq(schema.leagues.sourceId, leagueSourceId));
            if (!league) return [];
            leagueId = league.id;
        }
        const cacheKey = `seasons:${leagueId}`;
        const cached = cacheService.get<Array<typeof schema.seasons.$inferSelect>>(cacheKey);
        if (cached) return cached;

        const result = await db.select().from(schema.seasons).where(eq(schema.seasons.leagueId, leagueId as string));
        cacheService.set(cacheKey, result, TTL.STABLE);
        return result;
    }

    async getAllInternalSeasons(): Promise<Array<typeof schema.seasons.$inferSelect>> {
        if (!db) return [];
        const cached = cacheService.get<Array<typeof schema.seasons.$inferSelect>>('seasons:all');
        if (cached) return cached;

        const result = await db.select().from(schema.seasons);
        cacheService.set('seasons:all', result, TTL.ACTIVE);
        return result;
    }

    async getRankingFormulas(): Promise<Array<typeof schema.rankingFormulas.$inferSelect>> {
        if (!db) return [];
        const cached = cacheService.get<Array<typeof schema.rankingFormulas.$inferSelect>>('formulas');
        if (cached) return cached;

        const result = await db.select().from(schema.rankingFormulas).orderBy(schema.rankingFormulas.id);
        cacheService.set('formulas', result, TTL.FROZEN);
        return result;
    }

    /**
     * Read-only: returns teams for a given league+season from the database.
     * Does NOT call the external API. Cached for 30 minutes.
     */
    async getTeams(leagueSourceId: number, seasonYear: number, since?: Date): Promise<Array<typeof schema.teams.$inferSelect>> {
        if (!db) return [];

        const cacheKey = `teams:${leagueSourceId}:${seasonYear}`;
        if (!since) {
            const cached = cacheService.get<Array<typeof schema.teams.$inferSelect>>(cacheKey);
            if (cached) return cached;
        }

        const [localLeague] = await db.select().from(schema.leagues).where(eq(schema.leagues.sourceId, leagueSourceId));
        if (!localLeague) return [];

        const [localSeason] = await db.select().from(schema.seasons)
            .where(sql`${schema.seasons.leagueId} = ${localLeague.id} AND ${schema.seasons.year} = ${seasonYear}`);
        if (!localSeason) return [];

        let query = db.select({ team: schema.teams })
            .from(schema.teams)
            .innerJoin(schema.seasonsToTeams, eq(schema.teams.id, schema.seasonsToTeams.teamId))
            .where(eq(schema.seasonsToTeams.seasonId, localSeason.id));

        if (since) {
            query = db.select({ team: schema.teams })
                .from(schema.teams)
                .innerJoin(schema.seasonsToTeams, eq(schema.teams.id, schema.seasonsToTeams.teamId))
                .where(and(
                    eq(schema.seasonsToTeams.seasonId, localSeason.id),
                    gt(schema.teams.updatedAt, since)
                ));
        }

        const res = await query;
        const result = res.map((r) => r.team);
        if (!since) {
            cacheService.set(cacheKey, result, TTL.STABLE);
        }
        return result;
    }

    /**
     * Read-only: returns teams for a given season UUID from the database.
     * Queries directly by seasonId — no league/source ID resolution needed.
     */
    async getTeamsBySeasonId(seasonId: string, since?: Date): Promise<Array<typeof schema.teams.$inferSelect>> {
        if (!db) return [];

        const cacheKey = `teams:season:${seasonId}`;
        if (!since) {
            const cached = cacheService.get<Array<typeof schema.teams.$inferSelect>>(cacheKey);
            if (cached) return cached;
        }

        const conditions = [eq(schema.seasonsToTeams.seasonId, seasonId)];
        if (since) {
            conditions.push(gt(schema.teams.updatedAt, since));
        }

        const res = await db.select({ team: schema.teams })
            .from(schema.teams)
            .innerJoin(schema.seasonsToTeams, eq(schema.teams.id, schema.seasonsToTeams.teamId))
            .where(and(...conditions));

        const result = res.map((r) => r.team);
        if (!since) {
            cacheService.set(cacheKey, result, TTL.STABLE);
        }
        return result;
    }

    /**
     * Sync: fetches teams from the external API, upserts into DB, and sideloads graphics.
     * Called by syncFixtures() and admin import operations — NOT by read queries.
     */
    async syncTeams(leagueSourceId: number, seasonYear: number): Promise<Array<typeof schema.teams.$inferSelect>> {
        if (!db) return [];

        // 0. Ensure internal IDs exist
        const [localLeague] = await db.select().from(schema.leagues).where(eq(schema.leagues.sourceId, leagueSourceId));
        if (!localLeague) throw new Error(`League ${leagueSourceId} not found`);

        const [localSeason] = await db.select().from(schema.seasons)
            .where(sql`${schema.seasons.leagueId} = ${localLeague.id} AND ${schema.seasons.year} = ${seasonYear}`);
        if (!localSeason) throw new Error(`Season ${seasonYear} not found for league ${leagueSourceId}`);

        // 1. Fetch from provider
        const { teams, venues } = await this.provider.getTeams(leagueSourceId, seasonYear);

        // 2. Upsert venues
        await this.upsertVenues(venues);

        // Map venues for easy ID lookup
        const currentVenues = await db.select().from(schema.venues).where(eq(schema.venues.sourceName, this.provider.name));
        const venueMap = new Map<number, string>(currentVenues.map((v) => [v.sourceId, v.id]));

        // 3. Upsert teams
        const teamsToInsert = teams.map((t) => ({
            name: t.name,
            shortName: t.shortName,
            tla: t.tla,
            logo: t.logo,
            venueId: t.venueSourceId ? venueMap.get(t.venueSourceId) : null,
            sourceName: t.sourceName,
            sourceId: t.sourceId,
            metadata: {},
            updatedAt: NOW_MS
        }));

        await db.insert(schema.teams)
            .values(teamsToInsert)
            .onConflictDoUpdate({
                target: [schema.teams.sourceName, schema.teams.sourceId],
                set: {
                    name: sql`EXCLUDED.name`,
                    shortName: sql`EXCLUDED.short_name`,
                    tla: sql`EXCLUDED.tla`,
                    logo: sql`EXCLUDED.logo`,
                    venueId: sql`EXCLUDED.venue_id`,
                    updatedAt: NOW_MS
                }
            });

        // 4. Populate seasons_to_teams linkage
        const teamList = await db.select().from(schema.teams).where(eq(schema.teams.sourceName, this.provider.name));
        const teamMap = new Map<number, string>(teamList.map((t) => [t.sourceId, t.id]));

        // 3.1 Sideload Graphics (only for entities not already registered)
        const allEntityIds = [
            ...teams.map(t => teamMap.get(t.sourceId)).filter(Boolean).map(id => ({ id: id!, type: 'team' })),
            ...venues.map(v => venueMap.get(v.sourceId)).filter(Boolean).map(id => ({ id: id!, type: 'venue' })),
        ];
        const existingGraphicIds = new Set<string>();
        if (allEntityIds.length > 0) {
            const existing = await db.select({ entityId: schema.graphics.entityId })
                .from(schema.graphics)
                .where(inArray(schema.graphics.entityId, allEntityIds.map(e => e.id)));
            for (const g of existing) existingGraphicIds.add(g.entityId);
        }

        for (const t of teams) {
            if (t.logo) {
                const teamId = teamMap.get(t.sourceId);
                if (teamId && !existingGraphicIds.has(teamId)) {
                    graphicsService.registerFromUrl(teamId, 'team', t.logo).catch((e: Error) =>
                        logger.warn({ error: e.message }, `Soft-fail on sideload for team ${teamId}`)
                    );
                }
            }
        }

        for (const v of venues) {
            if (v.image) {
                const venueId = venueMap.get(v.sourceId);
                if (venueId && !existingGraphicIds.has(venueId)) {
                    graphicsService.registerFromUrl(venueId, 'venue', v.image).catch((e: Error) =>
                        logger.warn({ error: e.message }, `Soft-fail on sideload for venue ${venueId}`)
                    );
                }
            }
        }

        const linkages = teams.map((item) => {
            const teamId = teamMap.get(item.sourceId);
            if (!teamId) return null;
            return {
                seasonId: localSeason.id,
                teamId: teamId,
                updatedAt: NOW_MS
            };
        }).filter(Boolean);

        if (linkages.length > 0) {
            await db.insert(schema.seasonsToTeams)
                .values(linkages as unknown as typeof schema.seasonsToTeams.$inferInsert[])
                .onConflictDoUpdate({
                    target: [schema.seasonsToTeams.seasonId, schema.seasonsToTeams.teamId],
                    set: { updatedAt: NOW_MS }
                });
        }

        // 5. Auto-import squad rosters for each team
        let squadApiCalls = 0;
        for (const t of teams) {
            const teamId = teamMap.get(t.sourceId);
            if (!teamId) continue;
            try {
                await this.importSquad(teamId, t.sourceId, localSeason.id);
                squadApiCalls++;
            } catch (e: unknown) {
                logger.warn({ error: (e as Error).message, teamSourceId: t.sourceId }, 'Soft-fail on squad import');
            }
        }
        logger.info({ leagueSourceId, seasonYear, teamCount: teams.length, squadApiCalls }, 'Squad import complete');

        // 6. Invalidate cache and return fresh data
        cacheService.invalidate(`teams:${leagueSourceId}:${seasonYear}`);
        return this.getTeams(leagueSourceId, seasonYear);
    }

    private async upsertVenues(venues: import('../integrations/types').IngestedVenue[]) {
        if (!db || venues.length === 0) return;

        // Deduplicate and filter
        const uniqueVenues = Array.from(
            new Map(
                venues
                    .filter(v => v.sourceId !== null && v.sourceId !== undefined)
                    .map(v => [v.sourceId, v])
            ).values()
        );

        if (uniqueVenues.length === 0) return;

        await db.insert(schema.venues)
            .values(uniqueVenues)
            .onConflictDoUpdate({
                target: [schema.venues.sourceName, schema.venues.sourceId],
                set: {
                    name: sql`EXCLUDED.name`,
                    city: sql`COALESCE(EXCLUDED.city, ${schema.venues.city})`,
                    capacity: sql`COALESCE(EXCLUDED.capacity, ${schema.venues.capacity})`,
                    surface: sql`COALESCE(EXCLUDED.surface, ${schema.venues.surface})`,
                    image: sql`COALESCE(EXCLUDED.image, ${schema.venues.image})`,
                    updatedAt: NOW_MS
                }
            });
    }

    async syncSeasons(leagueId: number): Promise<SyncResult<typeof schema.seasons.$inferSelect>> {
        if (!db) return { data: [], stats: { processedCount: 0, apiCallsCount: 0 } };

        const [localLeague] = await db.select().from(schema.leagues).where(eq(schema.leagues.sourceId, leagueId));
        if (!localLeague) throw new Error(`League with sourceId ${leagueId} not found locally.`);

        const ingested = await this.provider.getSeasons(leagueId);

        const seasonsToInsert = ingested.map((s) => ({
            leagueId: localLeague.id,
            year: s.year,
            startDate: s.startDate ? new Date(s.startDate) : null,
            endDate: s.endDate ? new Date(s.endDate) : null,
            metadata: {}
        }));

        await db.insert(schema.seasons).values(seasonsToInsert).onConflictDoNothing();
        const data = await db.select().from(schema.seasons).where(eq(schema.seasons.leagueId, localLeague.id));
        return {
            data,
            stats: {
                processedCount: seasonsToInsert.length,
                apiCallsCount: 1
            }
        };
    }

    async syncFixtures(leagueSourceId: number, seasonYear: number, reporter?: JobReporter): Promise<SyncResult<typeof schema.fixtures.$inferSelect>> {
        if (!db) return { data: [], stats: { processedCount: 0, apiCallsCount: 0 } };
        let apiCallsCount = 0;

        // 1. Ensure season exists
        const [localLeague] = await db.select().from(schema.leagues).where(eq(schema.leagues.sourceId, leagueSourceId));
        if (!localLeague) throw new Error(`League ${leagueSourceId} not found`);

        let [localSeason] = await db.select().from(schema.seasons)
            .where(sql`${schema.seasons.leagueId} = ${localLeague.id} AND ${schema.seasons.year} = ${seasonYear}`);

        if (!localSeason) {
            // Only create the specific season we need, NOT all seasons
            const [created] = await db.insert(schema.seasons).values({
                leagueId: localLeague.id,
                year: seasonYear,
                updatedAt: new Date()
            }).onConflictDoUpdate({
                target: [schema.seasons.leagueId, schema.seasons.year],
                set: { updatedAt: new Date() }
            }).returning();
            localSeason = created;
        }

        if (!localSeason) throw new Error(`Season ${seasonYear} not found for league ${leagueSourceId}`);

        // 2. Ensure teams exist for this league/season
        await this.syncTeams(leagueSourceId, seasonYear);
        apiCallsCount++;

        // 3. Fetch fixtures and venues from provider
        const { fixtures, venues } = await this.provider.getFixtures(leagueSourceId, seasonYear);
        apiCallsCount++;

        // 3.1 Upsert any venues from fixtures (neutral grounds)
        await this.upsertVenues(venues);

        const currentVenues = await db.select().from(schema.venues).where(eq(schema.venues.sourceName, this.provider.name));
        const venueMap = new Map<number, string>(currentVenues.map((v) => [v.sourceId, v.id]));

        // Fetch all teams for this provider to get IDs
        const teams = await db.select().from(schema.teams).where(eq(schema.teams.sourceName, this.provider.name));
        const teamMap = new Map<number, string>(teams.map((t) => [t.sourceId, t.id]));

        const fixturesToInsert = fixtures.map((normalized) => {
            const homeId = teamMap.get(normalized.homeTeamSourceId);
            const awayId = teamMap.get(normalized.awayTeamSourceId);

            if (!homeId || !awayId) {
                logger.warn({ homeSource: normalized.homeTeamSourceId, awaySource: normalized.awayTeamSourceId, fixtureSource: normalized.sourceId },
                    `Dropping fixture ${normalized.sourceId}: missing team mapping (home=${!!homeId}, away=${!!awayId})`);
                return null;
            }

            return {
                sourceName: normalized.sourceName,
                sourceId: normalized.sourceId,
                leagueId: localLeague.id,
                seasonId: localSeason.id,
                homeTeamId: homeId,
                awayTeamId: awayId,
                venueId: normalized.venueSourceId ? venueMap.get(normalized.venueSourceId) : null,
                scheduledAt: new Date(normalized.scheduledAt),
                status: normalized.status,
                homeGoals: normalized.homeGoals,
                awayGoals: normalized.awayGoals,
                gameweek: normalized.gameweek,
                metadata: {},
                updatedAt: NOW_MS
            };
        }).filter(Boolean);

        // 4. Batch upsert with progress reporting
        // 4. Batch upsert fixtures in chunks of 50 with progress reporting
        const totalCount = fixturesToInsert.length;
        let processedCount = 0;
        const BATCH_SIZE = 50;

        for (let i = 0; i < totalCount; i += BATCH_SIZE) {
            const batch = fixturesToInsert.slice(i, i + BATCH_SIZE);
            await db.insert(schema.fixtures)
                .values(batch as unknown as typeof schema.fixtures.$inferInsert[])
                .onConflictDoUpdate({
                    target: [schema.fixtures.sourceName, schema.fixtures.sourceId],
                    set: {
                        scheduledAt: sql`EXCLUDED.scheduled_at`,
                        status: sql`EXCLUDED.status`,
                        homeGoals: sql`EXCLUDED.home_goals`,
                        awayGoals: sql`EXCLUDED.away_goals`,
                        venueId: sql`EXCLUDED.venue_id`,
                        gameweek: sql`EXCLUDED.gameweek`,
                        updatedAt: NOW_MS
                    }
                });

            processedCount += batch.length;
            if (reporter) {
                await reporter.updateProgress({ processedCount, totalCount });
            }
        }

        // Final report
        if (reporter) {
            await reporter.updateProgress({ processedCount, totalCount });
        }

        const data = await this.getFixtures(leagueSourceId, seasonYear);
        return {
            data,
            stats: {
                processedCount,
                totalCount,
                apiCallsCount
            }
        };
    }

    async getFixtures(leagueSourceId: number, seasonYear: number, since?: Date): Promise<Array<typeof schema.fixtures.$inferSelect>> {
        if (!db) return [];

        // 1. Resolve the season record (needed by both polling and main query)
        const [season] = await db.select()
            .from(schema.seasons)
            .innerJoin(schema.leagues, eq(schema.seasons.leagueId, schema.leagues.id))
            .where(and(
                eq(schema.leagues.sourceId, leagueSourceId),
                eq(schema.seasons.year, seasonYear)
            ));

        if (!season) return [];

        const seasonRecord = season.seasons;

        // --- LIVE FIXTURE POLLING LOGIC (runs BEFORE cache) ---
        // This must run before the cache check so that past-due fixtures
        // ("out of state" games) are always detected and updated, even when
        // the cache is populated with stale data.
        const now = new Date();
        const FIVE_MINUTES_MS = 5 * 60 * 1000;
        let pollingDidUpdate = false;

        if (!seasonRecord.isCompleted) {
            const timeSinceLastSync = seasonRecord.lastLiveSyncAt
                ? now.getTime() - seasonRecord.lastLiveSyncAt.getTime()
                : Infinity;

            logger.info({ leagueSourceId, seasonYear, isCompleted: seasonRecord.isCompleted, lastLiveSyncAt: seasonRecord.lastLiveSyncAt?.toISOString(), timeSinceLastSyncMs: timeSinceLastSync, thresholdMs: FIVE_MINUTES_MS }, 'Live polling: decision check');

            if (timeSinceLastSync > FIVE_MINUTES_MS) {
                // Atomic lock: claim the sync slot with a conditional UPDATE.
                // If another request already set lastLiveSyncAt recently, 0 rows will be returned.
                const threshold = new Date(now.getTime() - FIVE_MINUTES_MS).toISOString();
                const claimed = await db.update(schema.seasons)
                    .set({ lastLiveSyncAt: now })
                    .where(and(
                        eq(schema.seasons.id, seasonRecord.id),
                        sql`(${schema.seasons.lastLiveSyncAt} IS NULL OR ${schema.seasons.lastLiveSyncAt} <= ${threshold})`
                    ))
                    .returning({ id: schema.seasons.id });

                logger.info({ claimed: claimed.length }, 'Live polling: lock claim result');

                // If 0 rows returned, another process already claimed this sync window
                if (claimed.length === 0) {
                    logger.info('Live polling: skipped — lock not claimed');
                } else {

                    // 2. Find past-due fixtures that aren't in a terminal state
                    const TERMINAL_STATUSES: ('played' | 'postponed' | 'cancelled')[] = ['played', 'postponed', 'cancelled'];
                    const pastDue = await db.select({ id: schema.fixtures.id, sourceId: schema.fixtures.sourceId })
                        .from(schema.fixtures)
                        .where(and(
                            eq(schema.fixtures.seasonId, seasonRecord.id),
                            lte(schema.fixtures.scheduledAt, now),
                            notInArray(schema.fixtures.status, TERMINAL_STATUSES)
                        ));

                    if (pastDue.length > 0) {
                        try {
                            const sourceIdsToFetch = pastDue.map((f: { sourceId: number }) => f.sourceId);
                            logger.info({ leagueSourceId, seasonYear }, `Live polling: fetching ${sourceIdsToFetch.length} past-due fixtures`);

                            // Fetch latest status from upstream
                            const { fixtures: updatedFixtures } = await this.provider.getFixturesByIds(sourceIdsToFetch);

                            if (updatedFixtures.length > 0) {
                                const currentVenues = await db.select().from(schema.venues).where(eq(schema.venues.sourceName, this.provider.name));
                                const venueMap = new Map<number, string>(currentVenues.map((v) => [v.sourceId, v.id]));

                                const teams = await db.select().from(schema.teams).where(eq(schema.teams.sourceName, this.provider.name));
                                const teamMap = new Map<number, string>(teams.map((t) => [t.sourceId, t.id]));

                                const fixturesToUpdate = updatedFixtures.map(normalized => {
                                    const homeId = teamMap.get(normalized.homeTeamSourceId);
                                    const awayId = teamMap.get(normalized.awayTeamSourceId);
                                    if (!homeId || !awayId) return null;
                                    return {
                                        sourceName: normalized.sourceName,
                                        sourceId: normalized.sourceId,
                                        leagueId: season.leagues.id,
                                        seasonId: seasonRecord.id,
                                        homeTeamId: homeId,
                                        awayTeamId: awayId,
                                        venueId: normalized.venueSourceId ? venueMap.get(normalized.venueSourceId) : null,
                                        scheduledAt: new Date(normalized.scheduledAt),
                                        status: normalized.status,
                                        homeGoals: normalized.homeGoals,
                                        awayGoals: normalized.awayGoals,
                                        gameweek: normalized.gameweek,
                                        updatedAt: NOW_MS
                                    };
                                }).filter(Boolean);

                                if (fixturesToUpdate.length > 0) {
                                    await db.insert(schema.fixtures)
                                        .values(fixturesToUpdate as unknown as typeof schema.fixtures.$inferInsert[])
                                        .onConflictDoUpdate({
                                            target: [schema.fixtures.sourceName, schema.fixtures.sourceId],
                                            set: {
                                                scheduledAt: sql`EXCLUDED.scheduled_at`,
                                                status: sql`EXCLUDED.status`,
                                                homeGoals: sql`EXCLUDED.home_goals`,
                                                awayGoals: sql`EXCLUDED.away_goals`,
                                                venueId: sql`EXCLUDED.venue_id`,
                                                gameweek: sql`EXCLUDED.gameweek`,
                                                updatedAt: NOW_MS
                                            }
                                        });
                                    pollingDidUpdate = true;
                                }
                            }
                        } catch (e: unknown) {
                            const err = e instanceof Error ? e : new Error(String(e));
                            logger.error({ error: err.message }, 'Live polling failed');
                        }
                    } else {
                        // Check if the season is truly complete:
                        // 1. No future matches remain
                        // 2. No non-terminal fixtures remain (scheduled/live/etc.)
                        // Both conditions must hold to avoid false positives where
                        // a poll resolves one batch of stale fixtures but other
                        // non-terminal fixtures remain.
                        const futureMatches = await db.select({ count: sql`count(*)` })
                            .from(schema.fixtures)
                            .where(and(
                                eq(schema.fixtures.seasonId, seasonRecord.id),
                                gt(schema.fixtures.scheduledAt, now)
                            ));

                        const nonTerminal = await db.select({ count: sql`count(*)` })
                            .from(schema.fixtures)
                            .where(and(
                                eq(schema.fixtures.seasonId, seasonRecord.id),
                                notInArray(schema.fixtures.status, TERMINAL_STATUSES)
                            ));

                        const futureCount = Number(futureMatches[0]?.count || 0);
                        const nonTerminalCount = Number(nonTerminal[0]?.count || 0);

                        if (futureCount === 0 && nonTerminalCount === 0) {
                            logger.info({ leagueSourceId, futureCount, nonTerminalCount }, `Live polling: marking season ${seasonYear} complete`);
                            await db.update(schema.seasons)
                                .set({ isCompleted: true })
                                .where(eq(schema.seasons.id, seasonRecord.id));
                        } else {
                            logger.info({ leagueSourceId, futureCount, nonTerminalCount }, `Live polling: season ${seasonYear} NOT complete`);
                        }
                    }
                } // end if (claimed.length > 0)
            } else {
                logger.info({ timeSinceLastSyncMs: timeSinceLastSync }, 'Live polling: skipped — last sync too recent');
            }
        } else {
            logger.info({ leagueSourceId, seasonYear }, 'Live polling: skipped — season is completed');
        }

        // Invalidate cache if polling updated fixtures so we serve fresh data
        if (pollingDidUpdate) {
            cacheService.invalidate(`fixtures:${leagueSourceId}:${seasonYear}`);
        }

        // Cache check (skip if caller wants delta via `since`)
        if (!since) {
            const cacheKey = `fixtures:${leagueSourceId}:${seasonYear}`;
            const cached = cacheService.get<Array<typeof schema.fixtures.$inferSelect>>(cacheKey);
            if (cached) return cached;
        }

        let query = db.select().from(schema.fixtures).where(eq(schema.fixtures.seasonId, seasonRecord.id));

        if (since) {
            query = db.select().from(schema.fixtures).where(and(
                eq(schema.fixtures.seasonId, seasonRecord.id),
                gt(schema.fixtures.updatedAt, since)
            ));
        }

        const result = await query;
        if (!since) {
            cacheService.set(`fixtures:${leagueSourceId}:${seasonYear}`, result, TTL.ACTIVE);
        }
        return result;
    }

    /**
     * Read-only: returns fixtures for a given season UUID.
     * Queries directly by seasonId — no league/source ID resolution needed.
     * Includes the same live polling logic as getFixtures().
     */
    async getFixturesBySeasonId(seasonId: string, since?: Date, forceRefresh?: boolean): Promise<Array<typeof schema.fixtures.$inferSelect>> {
        if (!db) return [];

        // 1. Resolve the season record directly by UUID
        const [seasonRecord] = await db.select().from(schema.seasons).where(eq(schema.seasons.id, seasonId));
        if (!seasonRecord) return [];

        // Resolve the league for logging and live polling API calls
        const [leagueRecord] = await db.select().from(schema.leagues).where(eq(schema.leagues.id, seasonRecord.leagueId));

        // --- LIVE FIXTURE POLLING LOGIC (runs BEFORE cache) ---
        const now = new Date();
        const FIVE_MINUTES_MS = 5 * 60 * 1000;
        let pollingDidUpdate = false;

        if (!seasonRecord.isCompleted) {
            const timeSinceLastSync = seasonRecord.lastLiveSyncAt
                ? now.getTime() - seasonRecord.lastLiveSyncAt.getTime()
                : Infinity;

            logger.info({ seasonId, seasonYear: seasonRecord.year, isCompleted: seasonRecord.isCompleted, lastLiveSyncAt: seasonRecord.lastLiveSyncAt?.toISOString(), timeSinceLastSyncMs: timeSinceLastSync, thresholdMs: FIVE_MINUTES_MS, forceRefresh: !!forceRefresh }, 'Live polling: decision check');

            if (forceRefresh || timeSinceLastSync > FIVE_MINUTES_MS) {
                // When forceRefresh is true, use current time as threshold so the lock
                // claim succeeds even if the last sync was recent. The CAS pattern
                // still prevents truly concurrent polls.
                const threshold = forceRefresh
                    ? now.toISOString()
                    : new Date(now.getTime() - FIVE_MINUTES_MS).toISOString();
                const claimed = await db.update(schema.seasons)
                    .set({ lastLiveSyncAt: now })
                    .where(and(
                        eq(schema.seasons.id, seasonRecord.id),
                        sql`(${schema.seasons.lastLiveSyncAt} IS NULL OR ${schema.seasons.lastLiveSyncAt} <= ${threshold})`
                    ))
                    .returning({ id: schema.seasons.id });

                logger.info({ claimed: claimed.length }, 'Live polling: lock claim result');

                if (claimed.length === 0) {
                    logger.info('Live polling: skipped — lock not claimed');
                } else {
                    const TERMINAL_STATUSES: ('played' | 'postponed' | 'cancelled')[] = ['played', 'postponed', 'cancelled'];
                    const pastDue = await db.select({ id: schema.fixtures.id, sourceId: schema.fixtures.sourceId })
                        .from(schema.fixtures)
                        .where(and(
                            eq(schema.fixtures.seasonId, seasonRecord.id),
                            lte(schema.fixtures.scheduledAt, now),
                            notInArray(schema.fixtures.status, TERMINAL_STATUSES)
                        ));

                    // --- STALE FIXTURE POLLING (runs every 5 min when past-due exist) ---
                    if (pastDue.length > 0) {
                        try {
                            const sourceIdsToFetch = pastDue.map((f: { sourceId: number }) => f.sourceId);
                            logger.info({ seasonId, seasonYear: seasonRecord.year, count: sourceIdsToFetch.length }, 'Stale polling: fetching past-due fixtures by ID');

                            const { fixtures: updatedFixtures } = await this.provider.getFixturesByIds(sourceIdsToFetch);

                            if (updatedFixtures.length > 0) {
                                const currentVenues = await db.select().from(schema.venues).where(eq(schema.venues.sourceName, this.provider.name));
                                const venueMap = new Map<number, string>(currentVenues.map((v) => [v.sourceId, v.id]));

                                const teams = await db.select().from(schema.teams).where(eq(schema.teams.sourceName, this.provider.name));
                                const teamMap = new Map<number, string>(teams.map((t) => [t.sourceId, t.id]));

                                const fixturesToUpdate = updatedFixtures.map(normalized => {
                                    const homeId = teamMap.get(normalized.homeTeamSourceId);
                                    const awayId = teamMap.get(normalized.awayTeamSourceId);
                                    if (!homeId || !awayId) return null;
                                    return {
                                        sourceName: normalized.sourceName,
                                        sourceId: normalized.sourceId,
                                        leagueId: seasonRecord.leagueId,
                                        seasonId: seasonRecord.id,
                                        homeTeamId: homeId,
                                        awayTeamId: awayId,
                                        venueId: normalized.venueSourceId ? venueMap.get(normalized.venueSourceId) : null,
                                        scheduledAt: new Date(normalized.scheduledAt),
                                        status: normalized.status,
                                        homeGoals: normalized.homeGoals,
                                        awayGoals: normalized.awayGoals,
                                        gameweek: normalized.gameweek,
                                        updatedAt: NOW_MS
                                    };
                                }).filter(Boolean);

                                if (fixturesToUpdate.length > 0) {
                                    await db.insert(schema.fixtures)
                                        .values(fixturesToUpdate as unknown as typeof schema.fixtures.$inferInsert[])
                                        .onConflictDoUpdate({
                                            target: [schema.fixtures.sourceName, schema.fixtures.sourceId],
                                            set: {
                                                scheduledAt: sql`EXCLUDED.scheduled_at`,
                                                status: sql`EXCLUDED.status`,
                                                homeGoals: sql`EXCLUDED.home_goals`,
                                                awayGoals: sql`EXCLUDED.away_goals`,
                                                venueId: sql`EXCLUDED.venue_id`,
                                                gameweek: sql`EXCLUDED.gameweek`,
                                                updatedAt: NOW_MS
                                            }
                                        });
                                    pollingDidUpdate = true;
                                    logger.info({ updated: fixturesToUpdate.length }, 'Stale polling: upsert complete');
                                }
                            } else {
                                logger.info({ requested: sourceIdsToFetch.length }, 'Stale polling: API returned 0 fixtures (ids param may not be available — daily discovery will catch them)');
                            }
                        } catch (e: unknown) {
                            const err = e instanceof Error ? e : new Error(String(e));
                            logger.error({ error: err.message }, 'Stale polling failed');
                        }
                    }

                    // --- DAILY FIXTURE DISCOVERY (catches new/rescheduled matches) ---
                    // Runs once per day per season, or immediately on forceRefresh.
                    // Uses in-memory cache as gate — runs on first access after restart.
                    const discoveryKey = `fixture-discovery:${seasonId}`;
                    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
                    const lastDiscovery = cacheService.get<number>(discoveryKey);
                    const discoveryNeeded = forceRefresh || !lastDiscovery;

                    if (discoveryNeeded && leagueRecord) {
                        try {
                            logger.info({ seasonId, seasonYear: seasonRecord.year, leagueSourceId: leagueRecord.sourceId, forceRefresh: !!forceRefresh }, 'Fixture discovery: fetching full season to find new/rescheduled matches');

                            const { fixtures: allFixtures } = await this.provider.getFixtures(leagueRecord.sourceId, seasonRecord.year);

                            if (allFixtures.length > 0) {
                                const currentVenues = await db.select().from(schema.venues).where(eq(schema.venues.sourceName, this.provider.name));
                                const venueMap = new Map<number, string>(currentVenues.map((v) => [v.sourceId, v.id]));

                                const teams = await db.select().from(schema.teams).where(eq(schema.teams.sourceName, this.provider.name));
                                const teamMap = new Map<number, string>(teams.map((t) => [t.sourceId, t.id]));

                                const fixturesToUpsert = allFixtures.map(normalized => {
                                    const homeId = teamMap.get(normalized.homeTeamSourceId);
                                    const awayId = teamMap.get(normalized.awayTeamSourceId);
                                    if (!homeId || !awayId) return null;
                                    return {
                                        sourceName: normalized.sourceName,
                                        sourceId: normalized.sourceId,
                                        leagueId: seasonRecord.leagueId,
                                        seasonId: seasonRecord.id,
                                        homeTeamId: homeId,
                                        awayTeamId: awayId,
                                        venueId: normalized.venueSourceId ? venueMap.get(normalized.venueSourceId) : null,
                                        scheduledAt: new Date(normalized.scheduledAt),
                                        status: normalized.status,
                                        homeGoals: normalized.homeGoals,
                                        awayGoals: normalized.awayGoals,
                                        gameweek: normalized.gameweek,
                                        updatedAt: NOW_MS
                                    };
                                }).filter(Boolean);

                                if (fixturesToUpsert.length > 0) {
                                    // Only update (and bump updatedAt) when data actually changed.
                                    // IS DISTINCT FROM handles NULLs correctly.
                                    await db.insert(schema.fixtures)
                                        .values(fixturesToUpsert as unknown as typeof schema.fixtures.$inferInsert[])
                                        .onConflictDoUpdate({
                                            target: [schema.fixtures.sourceName, schema.fixtures.sourceId],
                                            set: {
                                                scheduledAt: sql`EXCLUDED.scheduled_at`,
                                                status: sql`EXCLUDED.status`,
                                                homeGoals: sql`EXCLUDED.home_goals`,
                                                awayGoals: sql`EXCLUDED.away_goals`,
                                                venueId: sql`EXCLUDED.venue_id`,
                                                gameweek: sql`EXCLUDED.gameweek`,
                                                updatedAt: NOW_MS
                                            },
                                            where: sql`
                                                ${schema.fixtures.scheduledAt} IS DISTINCT FROM EXCLUDED.scheduled_at
                                                OR ${schema.fixtures.status} IS DISTINCT FROM EXCLUDED.status
                                                OR ${schema.fixtures.homeGoals} IS DISTINCT FROM EXCLUDED.home_goals
                                                OR ${schema.fixtures.awayGoals} IS DISTINCT FROM EXCLUDED.away_goals
                                                OR ${schema.fixtures.venueId} IS DISTINCT FROM EXCLUDED.venue_id
                                                OR ${schema.fixtures.gameweek} IS DISTINCT FROM EXCLUDED.gameweek
                                            `
                                        });
                                    pollingDidUpdate = true;
                                    logger.info({ total: fixturesToUpsert.length }, 'Fixture discovery: upsert complete (only changed/new rows affected)');
                                }
                            }

                            // Gate the next discovery for 24 hours
                            cacheService.set(discoveryKey, Date.now(), ONE_DAY_MS);
                        } catch (e: unknown) {
                            const err = e instanceof Error ? e : new Error(String(e));
                            logger.error({ error: err.message }, 'Fixture discovery failed');
                        }
                    }

                    if (pastDue.length === 0 && !discoveryNeeded) {
                        const TERMINAL_STATUSES_CHECK: ('played' | 'postponed' | 'cancelled')[] = ['played', 'postponed', 'cancelled'];
                        const futureMatches = await db.select({ count: sql`count(*)` })
                            .from(schema.fixtures)
                            .where(and(
                                eq(schema.fixtures.seasonId, seasonRecord.id),
                                gt(schema.fixtures.scheduledAt, now)
                            ));

                        const nonTerminal = await db.select({ count: sql`count(*)` })
                            .from(schema.fixtures)
                            .where(and(
                                eq(schema.fixtures.seasonId, seasonRecord.id),
                                notInArray(schema.fixtures.status, TERMINAL_STATUSES_CHECK)
                            ));

                        const futureCount = Number(futureMatches[0]?.count || 0);
                        const nonTerminalCount = Number(nonTerminal[0]?.count || 0);

                        if (futureCount === 0 && nonTerminalCount === 0) {
                            logger.info({ seasonId, futureCount, nonTerminalCount }, `Live polling: marking season ${seasonRecord.year} complete`);
                            await db.update(schema.seasons)
                                .set({ isCompleted: true })
                                .where(eq(schema.seasons.id, seasonRecord.id));
                        } else {
                            logger.info({ seasonId, futureCount, nonTerminalCount }, `Live polling: season ${seasonRecord.year} NOT complete`);
                        }
                    }
                }
            } else {
                logger.info({ timeSinceLastSyncMs: timeSinceLastSync }, 'Live polling: skipped — last sync too recent');
            }
        } else {
            logger.info({ seasonId, seasonYear: seasonRecord.year }, 'Live polling: skipped — season is completed');
        }

        // Invalidate cache if polling updated fixtures
        if (pollingDidUpdate) {
            cacheService.invalidate(`fixtures:season:${seasonId}`);
            // Also invalidate legacy cache key if league info available
            if (leagueRecord) {
                cacheService.invalidate(`fixtures:${leagueRecord.sourceId}:${seasonRecord.year}`);
            }
        }

        // Cache check
        if (!since) {
            const cacheKey = `fixtures:season:${seasonId}`;
            const cached = cacheService.get<Array<typeof schema.fixtures.$inferSelect>>(cacheKey);
            if (cached) return cached;
        }

        let query = db.select().from(schema.fixtures).where(eq(schema.fixtures.seasonId, seasonRecord.id));

        if (since) {
            query = db.select().from(schema.fixtures).where(and(
                eq(schema.fixtures.seasonId, seasonRecord.id),
                gt(schema.fixtures.updatedAt, since)
            ));
        }

        const result = await query;
        if (!since) {
            cacheService.set(`fixtures:season:${seasonId}`, result, TTL.ACTIVE);
        }
        return result;
    }

    // Catalog Management
    async syncCatalogCountries(): Promise<SyncResult<typeof schema.catalogCountries.$inferSelect>> {
        if (!db) return { data: [], stats: { processedCount: 0, apiCallsCount: 0 } };
        const ingested = await this.provider.getCountries();

        const toInsert = ingested.map((c) => ({
            name: c.name,
            code: c.code,
            flag: c.flag,
            sourceName: this.provider.name,
            updatedAt: new Date()
        }));

        await db.insert(schema.catalogCountries).values(toInsert).onConflictDoUpdate({
            target: [schema.catalogCountries.sourceName, schema.catalogCountries.name],
            set: {
                flag: sql`excluded.flag`,
                updatedAt: new Date()
            }
        });

        return {
            data: await this.getCatalogCountries(),
            stats: { processedCount: toInsert.length, apiCallsCount: 1 }
        };
    }

    async syncCatalogLeagues(): Promise<SyncResult<typeof schema.catalogLeagues.$inferSelect>> {
        if (!db) return { data: [], stats: { processedCount: 0, apiCallsCount: 0 } };

        // Ensure countries exist first
        await this.syncCatalogCountries();

        const ingested = await this.provider.getLeagues();

        const localCountries = await this.getCatalogCountries();
        const countryMap = new Map<string, string>(localCountries.map(c => [c.name as string, c.id as string]));

        const toInsert = ingested.map((item) => {
            const countryId = countryMap.get(item.country || '');
            if (!countryId) return null;

            return {
                countryId,
                name: item.name,
                type: 'league', // Default or from metadata if we tracked it
                logo: item.logo,
                sourceName: this.provider.name,
                sourceId: item.sourceId,
                metadata: {}, // Will be populated by refreshCatalogSeasons
                updatedAt: new Date()
            };
        }).filter(Boolean);

        for (let i = 0; i < toInsert.length; i += 100) {
            const batch = toInsert.slice(i, i + 100);
            await db.insert(schema.catalogLeagues).values(batch as unknown as typeof schema.catalogLeagues.$inferInsert[]).onConflictDoUpdate({
                target: [schema.catalogLeagues.sourceName, schema.catalogLeagues.sourceId],
                set: {
                    logo: sql`excluded.logo`,
                    metadata: sql`excluded.metadata`,
                    updatedAt: new Date()
                }
            });
        }

        return {
            data: [],
            stats: { processedCount: toInsert.length, apiCallsCount: 2 } // countries + leagues
        };
    }

    async getCatalogCountries(): Promise<Array<typeof schema.catalogCountries.$inferSelect>> {
        if (!db) return [];
        const cached = cacheService.get<Array<typeof schema.catalogCountries.$inferSelect>>('catalog:countries');
        if (cached) return cached;

        const result = await db.select().from(schema.catalogCountries).orderBy(schema.catalogCountries.name);
        cacheService.set('catalog:countries', result, TTL.ACTIVE);
        return result;
    }

    async getCatalogLeagues(countryId?: string, sourceId?: number): Promise<Array<typeof schema.catalogLeagues.$inferSelect>> {
        if (!db) return [];
        const cacheKey = `catalog:leagues:${countryId || 'all'}:${sourceId || 'all'}`;
        const cached = cacheService.get<Array<typeof schema.catalogLeagues.$inferSelect>>(cacheKey);
        if (cached) return cached;

        const query = db.select().from(schema.catalogLeagues);
        let result: Array<typeof schema.catalogLeagues.$inferSelect>;
        if (countryId) {
            result = await query.where(eq(schema.catalogLeagues.countryId, countryId))
                .orderBy(schema.catalogLeagues.name);
        } else if (sourceId) {
            result = await query.where(eq(schema.catalogLeagues.sourceId, sourceId));
        } else {
            result = await query.orderBy(schema.catalogLeagues.name);
        }
        cacheService.set(cacheKey, result, TTL.ACTIVE);
        return result;
    }

    async refreshCatalogSeasons(catalogLeagueId: string): Promise<typeof schema.catalogLeagues.$inferSelect> {
        if (!db) return null as unknown as typeof schema.catalogLeagues.$inferSelect;

        const [catLeague] = await db.select().from(schema.catalogLeagues).where(eq(schema.catalogLeagues.id, catalogLeagueId));
        if (!catLeague) throw new Error('Catalog league not found');

        const seasons = await this.provider.getSeasons(catLeague.sourceId);

        const [updated] = await db.update(schema.catalogLeagues)
            .set({
                metadata: { ...((catLeague.metadata as Record<string, unknown>) || {}), seasons },
                updatedAt: new Date()
            })
            .where(eq(schema.catalogLeagues.id, catalogLeagueId))
            .returning();

        return updated;
    }

    async promoteLeague(catalogLeagueId: string): Promise<typeof schema.leagues.$inferSelect> {
        if (!db) return null as unknown as typeof schema.leagues.$inferSelect;

        const [catLeague] = await db.select().from(schema.catalogLeagues).where(eq(schema.catalogLeagues.id, catalogLeagueId));
        if (!catLeague) throw new Error('Catalog league not found');

        const [catCountry] = await db.select().from(schema.catalogCountries).where(eq(schema.catalogCountries.id, catLeague.countryId));

        // 1. Sideload Logo (In a real app we'd fetch and upload to Supabase Storage)
        // For now, we'll just use the external URL but we've planned for storage

        // 2. Insert into managed leagues
        const [managed] = await db.insert(schema.leagues).values({
            name: catLeague.name,
            slug: catLeague.name.toLowerCase().replace(/ /g, '-'),
            country: catCountry?.name,
            logo: catLeague.logo,
            sourceName: catLeague.sourceName,
            sourceId: catLeague.sourceId,
            metadata: catLeague.metadata
        }).onConflictDoUpdate({
            target: [schema.leagues.sourceName, schema.leagues.sourceId],
            set: { updatedAt: new Date() }
        }).returning();

        // 3. Sideload Logo (CAS)
        if (managed.logo) {
            graphicsService.registerFromUrl(managed.id, 'league', managed.logo).catch(e =>
                logger.warn({ error: e.message }, `Soft-fail on sideload for league ${managed.id}`)
            );
        }

        return managed;
    }

    async importSeason(leagueId: string, year: number): Promise<typeof schema.seasons.$inferSelect> {
        if (!db) return null as unknown as typeof schema.seasons.$inferSelect;

        // Ensure managed league exists (by UUID)
        const [managedLeague] = await db.select().from(schema.leagues).where(eq(schema.leagues.id, leagueId));
        if (!managedLeague) throw new Error('Managed league not found');

        const [season] = await db.insert(schema.seasons).values({
            leagueId: managedLeague.id,
            year,
            updatedAt: new Date()
        }).onConflictDoUpdate({
            target: [schema.seasons.leagueId, schema.seasons.year],
            set: { updatedAt: new Date() }
        }).returning();

        return season;
    }

    async updateSeasonConfig(seasonId: string, config: Record<string, unknown>): Promise<typeof schema.seasons.$inferSelect> {
        if (!db) return null as unknown as typeof schema.seasons.$inferSelect;
        const [updated] = await db.update(schema.seasons)
            .set({ metadata: config, updatedAt: new Date() })
            .where(eq(schema.seasons.id, seasonId))
            .returning();
        return updated;
    }

    async removeSeason(seasonId: string): Promise<boolean> {
        if (!db) return false;
        // Delete dependent data
        await db.delete(schema.standingsRows).where(eq(schema.standingsRows.seasonId, seasonId));
        await db.delete(schema.fixtures).where(eq(schema.fixtures.seasonId, seasonId));
        // Delete the season itself
        const result = await db.delete(schema.seasons).where(eq(schema.seasons.id, seasonId)).returning();
        return result.length > 0;
    }


    async saveRankingFormula(formula: Record<string, unknown>): Promise<typeof schema.rankingFormulas.$inferSelect> {
        if (!db) return null as unknown as typeof schema.rankingFormulas.$inferSelect;
        const [upserted] = await db.insert(schema.rankingFormulas)
            .values({ ...formula, updatedAt: new Date() } as unknown as typeof schema.rankingFormulas.$inferInsert)
            .onConflictDoUpdate({
                target: [schema.rankingFormulas.id],
                set: {
                    name: sql`excluded.name`,
                    description: sql`excluded.description`,
                    logicType: sql`excluded.logic_type`,
                    updatedAt: new Date()
                }
            })
            .returning();
        return upserted;
    }

    // Graphics
    async getGraphics(entityType: string, entityId: string): Promise<Array<typeof schema.graphics.$inferSelect>> {
        if (!db) return [];
        return db.select().from(schema.graphics)
            .where(sql`${schema.graphics.entityType} = ${entityType} AND ${schema.graphics.entityId} = ${entityId}`);
    }

    async saveGraphic(graphic: Record<string, unknown>): Promise<typeof schema.graphics.$inferSelect> {
        if (!db) return null as unknown as typeof schema.graphics.$inferSelect;
        const [upserted] = await db.insert(schema.graphics)
            .values({ ...graphic, updatedAt: new Date() } as unknown as typeof schema.graphics.$inferInsert)
            .onConflictDoUpdate({
                target: [schema.graphics.entityType, schema.graphics.entityId],
                set: {
                    blobPath: sql`excluded.blob_path`,
                    mimeType: sql`excluded.mime_type`,
                    metadata: sql`excluded.metadata`,
                    updatedAt: new Date()
                }
            })
            .returning();
        return upserted;
    }

    async getMatchEvents(fixtureId: number): Promise<import('../integrations/types').IngestedEvent[]> {
        const cacheKey = `events:${fixtureId}`;
        const cached = cacheService.get<import('../integrations/types').IngestedEvent[]>(cacheKey);
        if (cached) return cached;

        const events = await this.provider.getMatchEvents(fixtureId);

        // Enrich events with internal player UUIDs if players exist in our DB
        const sourceIds = events
            .map((e) => e.playerSourceId)
            .filter((id: number | null) => id != null);

        if (sourceIds.length > 0) {
            // Batch 1: Check players table (primary source)
            const existingPlayers = await db.select({ id: schema.players.id, sourceId: schema.players.sourceId })
                .from(schema.players)
                .where(and(
                    eq(schema.players.sourceName, this.provider.name),
                    inArray(schema.players.sourceId, sourceIds)
                ));
            const playerMap = new Map<number, string>(existingPlayers.map((p: { sourceId: number; id: string }) => [p.sourceId, p.id]));

            // Batch 2: Check playerSourceMappings for any unresolved sourceIds
            const unresolvedIds = sourceIds.filter((id: number) => !playerMap.has(id));
            if (unresolvedIds.length > 0) {
                const mappings = await db.select({ playerId: schema.playerSourceMappings.playerId, sourceId: schema.playerSourceMappings.sourceId })
                    .from(schema.playerSourceMappings)
                    .where(and(
                        eq(schema.playerSourceMappings.sourceName, this.provider.name),
                        inArray(schema.playerSourceMappings.sourceId, unresolvedIds)
                    ));
                for (const m of mappings) {
                    playerMap.set(m.sourceId, m.playerId);
                }
            }

            for (const event of events) {
                if (event.playerSourceId) {
                    event.playerId = playerMap.get(event.playerSourceId) || null;
                }
            }
        }

        // State-aware TTL: FT fixtures get FROZEN, live get ACTIVE
        // We don't have status here, so use ACTIVE as default — the fixture detail
        // queries that know the status will set a more appropriate TTL
        cacheService.set(cacheKey, events, TTL.ACTIVE);
        return events;
    }

    async getLineups(fixtureId: number): Promise<import('../integrations/types').IngestedLineup[]> {
        const lineups = await this.provider.getLineups(fixtureId);

        // Collect all players from all lineups
        const allPlayers: { sourceId: number; name: string; photo: string | null }[] = [];
        for (const lineup of lineups) {
            for (const p of [...lineup.startXI, ...lineup.substitutes]) {
                allPlayers.push({ sourceId: p.sourceId, name: p.name, photo: p.photo });
            }
        }

        if (allPlayers.length === 0) return lineups;

        // Deduplicate by sourceId
        const uniquePlayers = Array.from(
            new Map(allPlayers.map(p => [p.sourceId, p])).values()
        );
        const sourceIds = uniquePlayers.map(p => p.sourceId);

        // 1. Check which players already exist — avoids writes on subsequent loads
        const existingPlayers = await db.select({ id: schema.players.id, sourceId: schema.players.sourceId })
            .from(schema.players)
            .where(and(
                eq(schema.players.sourceName, this.provider.name),
                inArray(schema.players.sourceId, sourceIds)
            ));
        const existingMap = new Map<number, string>(existingPlayers.map((p: { sourceId: number; id: string }) => [p.sourceId, p.id]));

        // 2. Only upsert players we haven't seen before
        const newPlayers = uniquePlayers.filter(p => !existingMap.has(p.sourceId));

        if (newPlayers.length > 0) {
            await db.insert(schema.players)
                .values(newPlayers.map(p => ({
                    name: p.name,
                    metadata: { photo: p.photo },
                    sourceName: this.provider.name,
                    sourceId: p.sourceId,
                })))
                .onConflictDoUpdate({
                    target: [schema.players.sourceName, schema.players.sourceId],
                    set: {
                        name: sql`EXCLUDED.name`,
                        updatedAt: NOW_MS,
                    }
                });

            // Fetch the newly created UUIDs
            const newDbPlayers = await db.select({ id: schema.players.id, sourceId: schema.players.sourceId })
                .from(schema.players)
                .where(and(
                    eq(schema.players.sourceName, this.provider.name),
                    inArray(schema.players.sourceId, newPlayers.map(p => p.sourceId))
                ));
            for (const p of newDbPlayers) {
                existingMap.set(p.sourceId, p.id);
            }
        }

        // 3. Attach internal UUIDs to all players in lineups; sideload only new photos
        for (const lineup of lineups) {
            for (const p of [...lineup.startXI, ...lineup.substitutes]) {
                const internalId = existingMap.get(p.sourceId);
                if (internalId) {
                    Object.assign(p, { id: internalId });
                    // Only sideload for newly created players
                    if (p.photo && newPlayers.some(np => np.sourceId === p.sourceId)) {
                        graphicsService.registerFromUrl(internalId, 'player', p.photo).catch((e: Error) =>
                            logger.warn({ error: e.message }, `Soft-fail on sideload for player ${internalId}`)
                        );
                    }
                }
            }
        }

        return lineups;
    }

    async getPlayerData(playerId: number, season: number): Promise<(typeof schema.players.$inferSelect & { sourceId: number; name: string; metadata: Record<string, unknown>; statistics?: unknown }) | null> {
        const cacheKey = `player:${playerId}:${season}`;
        type PlayerResult = typeof schema.players.$inferSelect & { sourceId: number; name: string; metadata: Record<string, unknown>; statistics?: unknown };
        const cached = cacheService.get<PlayerResult>(cacheKey);
        if (cached) return cached;

        const data = await this.provider.getPlayerData(playerId, season);
        if (!data) return null;

        const playerMetadata = {
            firstname: data.firstname || null,
            lastname: data.lastname || null,
            age: data.age || null,
            nationality: data.nationality || null,
            photo: data.photo || null,
            injured: data.injured || false,
            height: data.height || null,
            weight: data.weight || null,
        };

        // Upsert into local players table to assign a native UUID
        const [upserted] = await db.insert(schema.players)
            .values({
                name: data.name,
                sourceName: this.provider.name,
                sourceId: playerId,
                metadata: playerMetadata,
            })
            .onConflictDoUpdate({
                target: [schema.players.sourceName, schema.players.sourceId],
                set: {
                    name: data.name,
                    metadata: playerMetadata,
                    updatedAt: new Date(),
                }
            })
            .returning();

        // Sideload player photo into graphics registry
        if (data.photo && upserted) {
            graphicsService.registerFromUrl(upserted.id, 'player', data.photo).catch((e: Error) =>
                logger.warn({ error: e.message }, `Soft-fail on sideload for player ${upserted.id}`)
            );
        }

        const result: PlayerResult = {
            ...upserted,
            sourceId: playerId,
            metadata: playerMetadata,
            statistics: data.statistics,
        };
        cacheService.set(cacheKey, result, TTL.ACTIVE);
        return result;
    }

    /**
     * Fetches the squad for a team from the external provider and creates:
     * 1. Player records (upserted)
     * 2. Player source mappings (for multi-source resolution)
     * 3. Team roster entries (with metadata for display data)
     */
    async importSquad(teamId: string, teamSourceId: number, seasonId: string): Promise<(typeof schema.teamRosters.$inferSelect)[]> {
        const squad = await this.provider.getSquad(teamSourceId);
        if (!squad.length) return [];

        const rosterEntries: (typeof schema.teamRosters.$inferSelect)[] = [];

        for (const member of squad) {
            // Upsert player record
            const playerMetadata = {
                age: member.age,
                photo: member.photo,
            };

            const [player] = await db.insert(schema.players)
                .values({
                    name: member.name,
                    sourceName: this.provider.name,
                    sourceId: member.sourceId,
                    metadata: playerMetadata,
                })
                .onConflictDoUpdate({
                    target: [schema.players.sourceName, schema.players.sourceId],
                    set: {
                        name: member.name,
                        metadata: playerMetadata,
                        updatedAt: NOW_MS,
                    }
                })
                .returning();

            // Upsert source mapping
            await db.insert(schema.playerSourceMappings)
                .values({
                    playerId: player.id,
                    sourceName: this.provider.name,
                    sourceId: member.sourceId,
                })
                .onConflictDoUpdate({
                    target: [schema.playerSourceMappings.sourceName, schema.playerSourceMappings.sourceId],
                    set: {
                        playerId: player.id,
                        updatedAt: NOW_MS,
                    }
                });

            // Upsert roster entry with display data in metadata
            const rosterMetadata = {
                squadNumber: member.number,
                position: member.position,
            };

            const [rosterEntry] = await db.insert(schema.teamRosters)
                .values({
                    teamId,
                    playerId: player.id,
                    seasonId,
                    metadata: rosterMetadata,
                })
                .onConflictDoUpdate({
                    target: [schema.teamRosters.teamId, schema.teamRosters.playerId, schema.teamRosters.seasonId],
                    set: {
                        metadata: rosterMetadata,
                        updatedAt: NOW_MS,
                    }
                })
                .returning();

            rosterEntries.push(rosterEntry);

            // Sideload player photo
            if (member.photo && player.id) {
                graphicsService.registerFromUrl(player.id, 'player', member.photo).catch((e: Error) =>
                    logger.warn({ error: e.message }, `Soft-fail on squad photo sideload for player ${player.id}`)
                );
            }
        }

        logger.info({ teamId, seasonId, playerCount: rosterEntries.length }, 'Squad imported');
        return rosterEntries;
    }

    /**
     * Returns the roster for a team in a given season, joined with player data.
     */
    async getTeamRoster(teamId: string, seasonId: string): Promise<(typeof schema.teamRosters.$inferSelect & { player: typeof schema.players.$inferSelect })[]> {
        const rows = await db.select()
            .from(schema.teamRosters)
            .innerJoin(schema.players, eq(schema.teamRosters.playerId, schema.players.id))
            .where(and(
                eq(schema.teamRosters.teamId, teamId),
                eq(schema.teamRosters.seasonId, seasonId),
            ));

        return rows.map(row => ({
            ...row.team_rosters,
            player: row.players,
        }));
    }

    /**
     * Resolves an external source ID to an internal player UUID.
     * Checks player_source_mappings first, falls back to players table.
     */
    async resolvePlayerBySourceId(sourceName: string, sourceId: number): Promise<string | null> {
        // Check source mappings first (supports multi-source)
        const [mapping] = await db.select({ playerId: schema.playerSourceMappings.playerId })
            .from(schema.playerSourceMappings)
            .where(and(
                eq(schema.playerSourceMappings.sourceName, sourceName),
                eq(schema.playerSourceMappings.sourceId, sourceId),
            ));
        if (mapping) return mapping.playerId;

        // Fall back to players table primary source
        const [player] = await db.select({ id: schema.players.id })
            .from(schema.players)
            .where(and(
                eq(schema.players.sourceName, sourceName),
                eq(schema.players.sourceId, sourceId),
            ));
        return player?.id || null;
    }
}

export const repository: IRepository = {
    config: new SupabaseConfigRepository(),
    football: new SupabaseFootballRepository(),
};
