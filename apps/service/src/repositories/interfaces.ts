import { JobReporter } from '../workers/runner';

export interface ConfigRepository {
    getDatabaseUrlMasked(): Promise<string | null>;
    getApiFootballKeyMasked(): Promise<string | null>;
    getSupabaseUrl(): Promise<string | null>;
    getSupabaseAnonKeyMasked(): Promise<string | null>;

    updateDatabaseUrl(url: string): Promise<boolean>;
    updateApiFootballKey(key: string): Promise<boolean>;
    updateSupabaseConfig(url: string, anonKey: string): Promise<boolean>;
}

import * as schema from '../db/schema';

export interface SyncResult<T = Record<string, unknown>> {
    data: T[];
    stats: {
        processedCount: number;
        totalCount?: number;
        apiCallsCount: number;
    };
}

export interface FootballRepository {
    getLeagues(): Promise<Array<typeof schema.leagues.$inferSelect>>;
    getInternalSeasons(leagueSourceId: number, internalLeagueId?: string): Promise<Array<typeof schema.seasons.$inferSelect>>;
    getAllInternalSeasons(): Promise<Array<typeof schema.seasons.$inferSelect>>;
    getTeams(leagueId: number, season: number, since?: Date): Promise<Array<typeof schema.teams.$inferSelect>>;
    syncSeasons(leagueId: number): Promise<SyncResult<typeof schema.seasons.$inferSelect>>;
    syncFixtures(leagueId: number, season: number, reporter?: JobReporter): Promise<SyncResult<typeof schema.fixtures.$inferSelect>>;
    getFixtures(leagueId: number, season: number, since?: Date): Promise<Array<typeof schema.fixtures.$inferSelect>>;

    // Catalog Management
    syncCatalogCountries(): Promise<SyncResult<typeof schema.catalogCountries.$inferSelect>>;
    syncCatalogLeagues(): Promise<SyncResult<typeof schema.catalogLeagues.$inferSelect>>;
    getCatalogCountries(): Promise<Array<typeof schema.catalogCountries.$inferSelect>>;
    getCatalogLeagues(countryId?: string, sourceId?: number): Promise<Array<typeof schema.catalogLeagues.$inferSelect>>;
    refreshCatalogSeasons(catalogLeagueId: string): Promise<typeof schema.catalogLeagues.$inferSelect>;
    promoteLeague(catalogLeagueId: string): Promise<typeof schema.leagues.$inferSelect>;
    importSeason(leagueId: string, year: number): Promise<typeof schema.seasons.$inferSelect>;
    updateSeasonConfig(seasonId: string, config: Record<string, unknown>): Promise<typeof schema.seasons.$inferSelect>;
    removeSeason(seasonId: string): Promise<boolean>;

    // Ranking Formulas
    getRankingFormulas(): Promise<Array<typeof schema.rankingFormulas.$inferSelect>>;
    saveRankingFormula(formula: { id: string, name: string, description?: string, logicType: string }): Promise<typeof schema.rankingFormulas.$inferSelect>;

    // Graphics
    getGraphics(entityType: string, entityId: string): Promise<Array<typeof schema.graphics.$inferSelect>>;
    saveGraphic(graphic: { entityType: string, entityId: string, variantName?: string, blobPath: string, mimeType?: string, metadata?: Record<string, unknown> }): Promise<typeof schema.graphics.$inferSelect>;

    // Real-time / Lazy-load data
    getMatchEvents(fixtureId: number): Promise<import('../integrations/types').IngestedEvent[]>;
    getLineups(fixtureId: number): Promise<import('../integrations/types').IngestedLineup[]>;
    getPlayerData(playerId: number, season: number): Promise<(typeof schema.players.$inferSelect & { sourceId: number; name: string; injured: boolean; statistics?: unknown; height?: string | null; weight?: string | null }) | null>;
}

export interface IRepository {
    config: ConfigRepository;
    football: FootballRepository;
}
