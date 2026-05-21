import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db';
import * as schema from '../../db/schema';
import { IFootballProvider } from '../../integrations/types';
import { cacheService, TTL } from '../../services/cache.service';
import { LeaguesRepository } from '../leagues';
import { SyncResult } from '../shared';
import { DEFAULT_RANKING_CRITERIA } from './shared';

export class PostgresLeaguesRepository implements LeaguesRepository {
    constructor(private provider: IFootballProvider) {}

    async getLeagues(): Promise<Array<typeof schema.leagues.$inferSelect>> {
        if (!db) return [];
        const cached = cacheService.get<Array<typeof schema.leagues.$inferSelect>>('leagues');
        if (cached) return cached;

        const existing = await db.select().from(schema.leagues);
        cacheService.set('leagues', existing, TTL.STABLE);
        return existing;
    }

    async getLeagueById(leagueId: string): Promise<typeof schema.leagues.$inferSelect | null> {
        if (!db) return null;
        const [row] = await db.select().from(schema.leagues).where(eq(schema.leagues.id, leagueId));
        return row ?? null;
    }

    async getLeaguesByIds(leagueIds: readonly string[]): Promise<Array<typeof schema.leagues.$inferSelect>> {
        if (!db || leagueIds.length === 0) return [];
        return db.select().from(schema.leagues).where(inArray(schema.leagues.id, [...leagueIds]));
    }

    async updateLeagueConfig(leagueId: string, metadata: Record<string, unknown>): Promise<typeof schema.leagues.$inferSelect> {
        if (!db) return null as unknown as typeof schema.leagues.$inferSelect;
        const [updated] = await db.update(schema.leagues)
            .set({ metadata, updatedAt: new Date() })
            .where(eq(schema.leagues.id, leagueId))
            .returning();
        return updated;
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

    async getSeasonsByIds(seasonIds: readonly string[]): Promise<Array<typeof schema.seasons.$inferSelect>> {
        if (!db || seasonIds.length === 0) return [];
        return db.select().from(schema.seasons).where(inArray(schema.seasons.id, [...seasonIds]));
    }

    async getSeasonIdsWithTeamLinks(seasonIds: readonly string[]): Promise<string[]> {
        if (!db || seasonIds.length === 0) return [];
        const rows = await db.select({ seasonId: schema.seasonsToTeams.seasonId })
            .from(schema.seasonsToTeams)
            .where(inArray(schema.seasonsToTeams.seasonId, [...seasonIds]));
        return Array.from(new Set(rows.map((r) => r.seasonId)));
    }

    async syncSeasons(leagueSourceId: number): Promise<SyncResult<typeof schema.seasons.$inferSelect>> {
        if (!db) return { data: [], stats: { processedCount: 0, apiCallsCount: 0 } };

        const [localLeague] = await db.select().from(schema.leagues).where(eq(schema.leagues.sourceId, leagueSourceId));
        if (!localLeague) throw new Error(`League with sourceId ${leagueSourceId} not found locally.`);

        const ingested = await this.provider.getSeasons(leagueSourceId);

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

    async importSeason(leagueId: string, year: number): Promise<typeof schema.seasons.$inferSelect> {
        if (!db) return null as unknown as typeof schema.seasons.$inferSelect;

        const [managedLeague] = await db.select().from(schema.leagues).where(eq(schema.leagues.id, leagueId));
        if (!managedLeague) throw new Error('Managed league not found');

        // Season inherits its ranking criteria from the league at creation time; later edits on the season are independent.
        const leagueMeta = (managedLeague.metadata as Record<string, unknown> | null) ?? {};
        const seedMetadata = {
            rankingCriteria: (leagueMeta.rankingCriteria as string[]) ?? DEFAULT_RANKING_CRITERIA,
        };

        const [season] = await db.insert(schema.seasons).values({
            leagueId: managedLeague.id,
            year,
            metadata: seedMetadata,
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
        // FK order: tables that reference seasons.id but do NOT have ON DELETE
        // CASCADE must be cleared explicitly. team_rosters cascades; the rest
        // here do not (would fail with `seasons_to_teams_season_id_fk` etc.).
        await db.delete(schema.seasonsToTeams).where(eq(schema.seasonsToTeams.seasonId, seasonId));
        await db.delete(schema.standingsRows).where(eq(schema.standingsRows.seasonId, seasonId));
        await db.delete(schema.fixtures).where(eq(schema.fixtures.seasonId, seasonId));
        const result = await db.delete(schema.seasons).where(eq(schema.seasons.id, seasonId)).returning();
        return result.length > 0;
    }

    async getRankingFormulas(): Promise<Array<typeof schema.rankingFormulas.$inferSelect>> {
        if (!db) return [];
        const cached = cacheService.get<Array<typeof schema.rankingFormulas.$inferSelect>>('formulas');
        if (cached) return cached;

        const result = await db.select().from(schema.rankingFormulas).orderBy(schema.rankingFormulas.id);
        cacheService.set('formulas', result, TTL.FROZEN);
        return result;
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
}
