import { ConfigRepository, FootballRepository, IRepository, SyncResult } from './interfaces';
import { db, supabase } from '../db';
import * as schema from '../db/schema';
import { eq, sql, and, gt, inArray, lte } from 'drizzle-orm';
import { IFootballProvider } from '../integrations/types';
import { JobReporter } from '../workers/runner';
import { ApiFootballProvider } from '../integrations/api-football';
import { MockFootballProvider } from '../integrations/mock';
import { graphicsService } from '../services/graphics.service';
import { globalLogger } from '../services/log.service';
import fs from 'node:fs/promises';
import path from 'node:path';

export class SupabaseConfigRepository implements ConfigRepository {
    private async updateEnvs(updates: Record<string, string>) {
        const envPath = path.resolve(process.cwd(), '.env');
        let content = '';
        try {
            content = await fs.readFile(envPath, 'utf-8');
        } catch { }

        let lines = content.split('\n');
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

    async getLeagues(): Promise<any[]> {
        if (!db) return [];
        const existing = await db.select().from(schema.leagues);
        if (existing.length > 0) return existing;

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
        return db.select().from(schema.leagues);
    }

    async getInternalSeasons(leagueSourceId: number, internalLeagueId?: string): Promise<any[]> {
        if (!db) return [];
        let leagueId = internalLeagueId;
        if (!leagueId) {
            const [league] = await db.select().from(schema.leagues).where(eq(schema.leagues.sourceId, leagueSourceId));
            if (!league) return [];
            leagueId = league.id;
        }
        return db.select().from(schema.seasons).where(eq(schema.seasons.leagueId, leagueId as string));
    }

    async getAllInternalSeasons(): Promise<any[]> {
        if (!db) return [];
        return db.select().from(schema.seasons);
    }

    private formulasCache: any[] | null = null;
    async getRankingFormulas(): Promise<any[]> {
        if (!db) return [];
        if (this.formulasCache) return this.formulasCache;
        this.formulasCache = await db.select().from(schema.rankingFormulas).orderBy(schema.rankingFormulas.id);
        return this.formulasCache!;
    }

    async getTeams(leagueId: number, seasonYear: number, since?: Date): Promise<any[]> {
        if (!db) return [];

        // 0. Ensure internal IDs exist
        const [localLeague] = await db.select().from(schema.leagues).where(eq(schema.leagues.sourceId, leagueId));
        if (!localLeague) throw new Error(`League ${leagueId} not found`);

        const [localSeason] = await db.select().from(schema.seasons)
            .where(sql`${schema.seasons.leagueId} = ${localLeague.id} AND ${schema.seasons.year} = ${seasonYear}`);
        if (!localSeason) throw new Error(`Season ${seasonYear} not found for league ${leagueId}`);

        // 1. Fetch from provider
        const { teams, venues } = await this.provider.getTeams(leagueId, seasonYear);

        // 2. Upsert venues
        await this.upsertVenues(venues);

        // Map venues for easy ID lookup
        const currentVenues = await db.select().from(schema.venues).where(eq(schema.venues.sourceName, this.provider.name));
        const venueMap = new Map<number, string>(currentVenues.map((v: any) => [v.sourceId, v.id]));

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
            updatedAt: sql`now()`
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
                    updatedAt: sql`now()`
                }
            });

        // 4. Populate seasons_to_teams linkage
        const teamList = await db.select().from(schema.teams).where(eq(schema.teams.sourceName, this.provider.name));
        const teamMap = new Map<number, string>(teamList.map((t: any) => [t.sourceId, t.id]));

        // 3.1 Sideload Graphics (CAS)
        for (const t of teams) {
            if (t.logo) {
                const teamId = teamMap.get(t.sourceId);
                if (teamId) {
                    graphicsService.registerFromUrl(teamId, 'team', t.logo).catch((e: any) =>
                        logger.warn(`Soft-fail on sideload for team ${teamId}`, { error: e.message })
                    );
                }
            }
        }

        for (const v of venues) {
            if (v.image) {
                const venueId = venueMap.get(v.sourceId);
                if (venueId) {
                    graphicsService.registerFromUrl(venueId, 'venue', v.image).catch((e: any) =>
                        logger.warn(`Soft-fail on sideload for venue ${venueId}`, { error: e.message })
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
                updatedAt: sql`now()`
            };
        }).filter(Boolean);

        if (linkages.length > 0) {
            await db.insert(schema.seasonsToTeams)
                .values(linkages as any)
                .onConflictDoUpdate({
                    target: [schema.seasonsToTeams.seasonId, schema.seasonsToTeams.teamId],
                    set: { updatedAt: sql`now()` }
                });
        }

        // 5. Return teams for THIS season
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
        return res.map((r: { team: any }) => r.team);
    }

    private async upsertVenues(venues: any[]) {
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
                    updatedAt: sql`now()`
                }
            });
    }

    async syncSeasons(leagueId: number): Promise<SyncResult> {
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

    async syncFixtures(leagueId: number, seasonYear: number, reporter?: JobReporter): Promise<SyncResult> {
        if (!db) return { data: [], stats: { processedCount: 0, apiCallsCount: 0 } };
        let apiCallsCount = 0;

        // 1. Ensure season exists
        const [localLeague] = await db.select().from(schema.leagues).where(eq(schema.leagues.sourceId, leagueId));
        if (!localLeague) throw new Error(`League ${leagueId} not found`);

        let [localSeason] = await db.select().from(schema.seasons)
            .where(sql`${schema.seasons.leagueId} = ${localLeague.id} AND ${schema.seasons.year} = ${seasonYear}`);

        if (!localSeason) {
            const syncRes = await this.syncSeasons(leagueId);
            apiCallsCount += syncRes.stats.apiCallsCount;
            [localSeason] = await db.select().from(schema.seasons)
                .where(sql`${schema.seasons.leagueId} = ${localLeague.id} AND ${schema.seasons.year} = ${seasonYear}`);
        }

        if (!localSeason) throw new Error(`Season ${seasonYear} not found for league ${leagueId}`);

        // 2. Ensure teams exist for this league/season
        await this.getTeams(leagueId, seasonYear);
        apiCallsCount++;

        // 3. Fetch fixtures and venues from provider
        const { fixtures, venues } = await this.provider.getFixtures(leagueId, seasonYear);
        apiCallsCount++;

        // 3.1 Upsert any venues from fixtures (neutral grounds)
        await this.upsertVenues(venues);

        const currentVenues = await db.select().from(schema.venues).where(eq(schema.venues.sourceName, this.provider.name));
        const venueMap = new Map<number, string>(currentVenues.map((v: any) => [v.sourceId, v.id]));

        // Fetch all teams for this provider to get IDs
        const teams = await db.select().from(schema.teams).where(eq(schema.teams.sourceName, this.provider.name));
        const teamMap = new Map<number, string>(teams.map((t: any) => [t.sourceId, t.id]));

        const fixturesToInsert = fixtures.map((normalized) => {
            const homeId = teamMap.get(normalized.homeTeamSourceId);
            const awayId = teamMap.get(normalized.awayTeamSourceId);

            if (!homeId || !awayId) return null;

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
                updatedAt: sql`now()`
            };
        }).filter(Boolean);

        // 4. Batch upsert with progress reporting
        const totalCount = fixturesToInsert.length;
        let processedCount = 0;

        for (const fix of fixturesToInsert as any[]) {
            await db.insert(schema.fixtures)
                .values(fix)
                .onConflictDoUpdate({
                    target: [schema.fixtures.sourceName, schema.fixtures.sourceId],
                    set: {
                        status: fix.status,
                        homeGoals: fix.homeGoals,
                        awayGoals: fix.awayGoals,
                        gameweek: fix.gameweek,
                        updatedAt: sql`now()`
                    }
                });

            processedCount++;
            if (reporter && processedCount % 10 === 0) {
                await reporter.updateProgress({ processedCount, totalCount });
            }
        }

        // Final report
        if (reporter) {
            await reporter.updateProgress({ processedCount, totalCount });
        }

        const data = await this.getFixtures(leagueId, seasonYear);
        return {
            data,
            stats: {
                processedCount,
                totalCount,
                apiCallsCount
            }
        };
    }

    async getFixtures(leagueId: number, seasonYear: number, since?: Date): Promise<any[]> {
        if (!db) return [];

        const [season] = await db.select()
            .from(schema.seasons)
            .innerJoin(schema.leagues, eq(schema.seasons.leagueId, schema.leagues.id))
            .where(and(
                eq(schema.leagues.sourceId, leagueId),
                eq(schema.seasons.year, seasonYear)
            ));

        if (!season) return [];

        // --- LIVE FIXTURE POLLING LOGIC ---
        const now = new Date();
        const FIVE_MINUTES_MS = 5 * 60 * 1000;

        const seasonRecord = season.seasons;

        if (!seasonRecord.isCompleted) {
            const timeSinceLastSync = seasonRecord.lastLiveSyncAt
                ? now.getTime() - seasonRecord.lastLiveSyncAt.getTime()
                : Infinity;

            if (timeSinceLastSync > FIVE_MINUTES_MS) {
                // 1. Set concurrency lock immediately
                await db.update(schema.seasons)
                    .set({ lastLiveSyncAt: now })
                    .where(eq(schema.seasons.id, seasonRecord.id));

                // 2. Find target fixtures: scheduled in the past but not played/postponed/cancelled
                const pastDue = await db.select({ id: schema.fixtures.id, sourceId: schema.fixtures.sourceId })
                    .from(schema.fixtures)
                    .where(and(
                        eq(schema.fixtures.seasonId, seasonRecord.id),
                        lte(schema.fixtures.scheduledAt, now),
                        inArray(schema.fixtures.status, ['scheduled', 'live'])
                    ));

                if (pastDue.length > 0) {
                    try {
                        const sourceIdsToFetch = pastDue.map((f: { sourceId: number }) => f.sourceId);
                        logger.info(`Live polling: fetching ${sourceIdsToFetch.length} past-due fixtures`, { leagueId, seasonYear });

                        // Fetch latest status from upstream
                        const { fixtures: updatedFixtures } = await this.provider.getFixturesByIds(sourceIdsToFetch);

                        if (updatedFixtures.length > 0) {
                            const currentVenues = await db.select().from(schema.venues).where(eq(schema.venues.sourceName, this.provider.name));
                            const venueMap = new Map<number, string>(currentVenues.map((v: any) => [v.sourceId, v.id]));

                            const teams = await db.select().from(schema.teams).where(eq(schema.teams.sourceName, this.provider.name));
                            const teamMap = new Map<number, string>(teams.map((t: any) => [t.sourceId, t.id]));

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
                                    updatedAt: sql`now()`
                                };
                            }).filter(Boolean);

                            if (fixturesToUpdate.length > 0) {
                                await db.insert(schema.fixtures)
                                    .values(fixturesToUpdate as any)
                                    .onConflictDoUpdate({
                                        target: [schema.fixtures.sourceName, schema.fixtures.sourceId],
                                        set: {
                                            status: sql`EXCLUDED.status`,
                                            homeGoals: sql`EXCLUDED.home_goals`,
                                            awayGoals: sql`EXCLUDED.away_goals`,
                                            gameweek: sql`EXCLUDED.gameweek`,
                                            updatedAt: sql`EXCLUDED.updated_at`
                                        }
                                    });
                            }
                        }
                    } catch (e: any) {
                        logger.error('Live polling failed', { error: e.message });
                    }
                } else {
                    // Check if there are any remaining matches that *will* happen in the future
                    const futureMatches = await db.select({ count: sql`count(*)` })
                        .from(schema.fixtures)
                        .where(and(
                            eq(schema.fixtures.seasonId, seasonRecord.id),
                            gt(schema.fixtures.scheduledAt, now)
                        ));

                    if (Number(futureMatches[0]?.count || 0) === 0) {
                        // All matches in this season have passed and have no remaining 'scheduled' block
                        // Mark season as completed to prevent future polling
                        logger.info(`Live polling: marking season ${seasonYear} complete`, { leagueId });
                        await db.update(schema.seasons)
                            .set({ isCompleted: true })
                            .where(eq(schema.seasons.id, seasonRecord.id));
                    }
                }
            }
        }
        // --- END LIVE FIXTURE POLLING LOGIC ---

        let query = db.select().from(schema.fixtures).where(eq(schema.fixtures.seasonId, seasonRecord.id));

        if (since) {
            query = db.select().from(schema.fixtures).where(and(
                eq(schema.fixtures.seasonId, seasonRecord.id),
                gt(schema.fixtures.updatedAt, since)
            ));
        }

        return query;
    }

    // Catalog Management
    async syncCatalogCountries(): Promise<SyncResult> {
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

    async syncCatalogLeagues(): Promise<SyncResult> {
        if (!db) return { data: [], stats: { processedCount: 0, apiCallsCount: 0 } };

        // Ensure countries exist first
        await this.syncCatalogCountries();

        const ingested = await this.provider.getLeagues();

        const localCountries = await this.getCatalogCountries();
        const countryMap = new Map<string, string>(localCountries.map(c => [c.name, c.id]));

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

        // Batch upsert catalog leagues
        for (let i = 0; i < toInsert.length; i += 100) {
            const batch = toInsert.slice(i, i + 100);
            await db.insert(schema.catalogLeagues).values(batch as any).onConflictDoUpdate({
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

    async getCatalogCountries(): Promise<any[]> {
        if (!db) return [];
        return db.select().from(schema.catalogCountries).orderBy(schema.catalogCountries.name);
    }

    async getCatalogLeagues(countryId?: string, sourceId?: number): Promise<any[]> {
        if (!db) return [];
        let query = db.select().from(schema.catalogLeagues);
        if (countryId) {
            return query.where(eq(schema.catalogLeagues.countryId, countryId))
                .orderBy(schema.catalogLeagues.name);
        }
        if (sourceId) {
            return query.where(eq(schema.catalogLeagues.sourceId, sourceId));
        }
        return query.orderBy(schema.catalogLeagues.name);
    }

    async refreshCatalogSeasons(catalogLeagueId: string): Promise<any> {
        if (!db) return null;

        const [catLeague] = await db.select().from(schema.catalogLeagues).where(eq(schema.catalogLeagues.id, catalogLeagueId));
        if (!catLeague) throw new Error('Catalog league not found');

        const seasons = await this.provider.getSeasons(catLeague.sourceId);

        const [updated] = await db.update(schema.catalogLeagues)
            .set({
                metadata: { ...((catLeague.metadata as any) || {}), seasons },
                updatedAt: new Date()
            })
            .where(eq(schema.catalogLeagues.id, catalogLeagueId))
            .returning();

        return updated;
    }

    async promoteLeague(catalogLeagueId: string): Promise<any> {
        if (!db) return null;

        const [catLeague] = await db.select().from(schema.catalogLeagues).where(eq(schema.catalogLeagues.id, catalogLeagueId));
        if (!catLeague) throw new Error('Catalog league not found');

        const [catCountry] = await db.select().from(schema.catalogCountries).where(eq(schema.catalogCountries.id, catLeague.countryId));

        // 1. Sideload Logo (In a real app we'd fetch and upload to Supabase Storage)
        // For now, we'll just use the external URL but we've planned for storage
        const logoUrl = catLeague.logo;

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
                logger.warn(`Soft-fail on sideload for league ${managed.id}`, { error: e.message })
            );
        }

        return managed;
    }

    async importSeason(leagueId: string, year: number): Promise<any> {
        if (!db) return null;

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

    async updateSeasonConfig(seasonId: string, config: any): Promise<any> {
        if (!db) return null;
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


    async saveRankingFormula(formula: any): Promise<any> {
        if (!db) return null;
        const [upserted] = await db.insert(schema.rankingFormulas)
            .values({ ...formula, updatedAt: new Date() })
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
    async getGraphics(entityType: string, entityId: string): Promise<any[]> {
        if (!db) return [];
        return db.select().from(schema.graphics)
            .where(sql`${schema.graphics.entityType} = ${entityType} AND ${schema.graphics.entityId} = ${entityId}`);
    }

    async saveGraphic(graphic: any): Promise<any> {
        if (!db) return null;
        const [upserted] = await db.insert(schema.graphics)
            .values({ ...graphic, updatedAt: new Date() })
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

    async getMatchEvents(fixtureId: number): Promise<any[]> {
        return this.provider.getMatchEvents(fixtureId);
    }

    async getPlayerData(playerId: number, season: number): Promise<any | null> {
        return this.provider.getPlayerData(playerId, season);
    }
}

export const repository: IRepository = {
    config: new SupabaseConfigRepository(),
    football: new SupabaseFootballRepository(),
};
