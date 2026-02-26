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

export interface SyncResult {
    data: any[];
    stats: {
        processedCount: number;
        totalCount?: number;
        apiCallsCount: number;
    };
}

export interface FootballRepository {
    getLeagues(): Promise<any[]>;
    getInternalSeasons(leagueSourceId: number, internalLeagueId?: string): Promise<any[]>;
    getAllInternalSeasons(): Promise<any[]>;
    getTeams(leagueId: number, season: number, since?: Date): Promise<any[]>;
    syncSeasons(leagueId: number): Promise<SyncResult>;
    syncFixtures(leagueId: number, season: number, reporter?: JobReporter): Promise<SyncResult>;
    getFixtures(leagueId: number, season: number, since?: Date): Promise<any[]>;

    // Catalog Management
    syncCatalogCountries(): Promise<SyncResult>;
    syncCatalogLeagues(): Promise<SyncResult>;
    getCatalogCountries(): Promise<any[]>;
    getCatalogLeagues(countryId?: string, sourceId?: number): Promise<any[]>;
    refreshCatalogSeasons(catalogLeagueId: string): Promise<any>;
    promoteLeague(catalogLeagueId: string): Promise<any>;
    importSeason(leagueId: string, year: number): Promise<any>;
    updateSeasonConfig(seasonId: string, config: any): Promise<any>;
    removeSeason(seasonId: string): Promise<boolean>;

    // Ranking Formulas
    getRankingFormulas(): Promise<any[]>;
    saveRankingFormula(formula: { id: string, name: string, description?: string, logicType: string }): Promise<any>;

    // Graphics
    getGraphics(entityType: string, entityId: string): Promise<any[]>;
    saveGraphic(graphic: { entityType: string, entityId: string, variantName?: string, blobPath: string, mimeType?: string, metadata?: any }): Promise<any>;

    // Real-time / Lazy-load data
    getMatchEvents(fixtureId: number): Promise<any[]>;
    getLineups(fixtureId: number): Promise<import('../integrations/types').IngestedLineup[]>;
    getPlayerData(playerId: number, season: number): Promise<any | null>;
}

export interface IRepository {
    config: ConfigRepository;
    football: FootballRepository;
}
