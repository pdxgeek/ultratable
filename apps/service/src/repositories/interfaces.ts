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
        apiCallsCount: number;
    };
}

export interface FootballRepository {
    getLeagues(): Promise<any[]>;
    getTeams(leagueId: number, season: number): Promise<any[]>;
    syncSeasons(leagueId: number): Promise<SyncResult>;
    syncFixtures(leagueId: number, season: number): Promise<SyncResult>;
    getFixtures(leagueId: number, season: number, since?: Date): Promise<any[]>;

    // Catalog Management
    syncCatalogCountries(): Promise<SyncResult>;
    syncCatalogLeagues(): Promise<SyncResult>;
    getCatalogCountries(): Promise<any[]>;
    getCatalogLeagues(countryId: string): Promise<any[]>;
    promoteLeague(catalogLeagueId: string): Promise<any>;
}

export interface IRepository {
    config: ConfigRepository;
    football: FootballRepository;
}
