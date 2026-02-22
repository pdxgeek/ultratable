export interface ConfigRepository {
    getDatabaseUrlMasked(): Promise<string | null>;
    getApiFootballKeyMasked(): Promise<string | null>;
    getSupabaseUrl(): Promise<string | null>;
    getSupabaseAnonKeyMasked(): Promise<string | null>;

    updateDatabaseUrl(url: string): Promise<boolean>;
    updateApiFootballKey(key: string): Promise<boolean>;
    updateSupabaseConfig(url: string, anonKey: string): Promise<boolean>;
}

export interface FootballRepository {
    getLeagues(): Promise<any[]>;
    getTeams(leagueId: number, season: number): Promise<any[]>;
    // ... more methods as we build ingestion
}

export interface IRepository {
    config: ConfigRepository;
    football: FootballRepository;
}
