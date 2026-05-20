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

// Dual-ID contract (AI_README_FIRST.MD §1): parameters that carry an external
// provider ID MUST end in `SourceId`. `leagueId` is reserved for the internal
// Postgres UUID. Do not reintroduce a bare `leagueId: number` here.
export interface FootballRepository {
    getLeagues(): Promise<Array<typeof schema.leagues.$inferSelect>>;
    getLeagueById(leagueId: string): Promise<typeof schema.leagues.$inferSelect | null>;
    getLeaguesByIds(leagueIds: readonly string[]): Promise<Array<typeof schema.leagues.$inferSelect>>;
    getInternalSeasons(leagueSourceId: number, internalLeagueId?: string): Promise<Array<typeof schema.seasons.$inferSelect>>;
    getAllInternalSeasons(): Promise<Array<typeof schema.seasons.$inferSelect>>;
    getSeasonsByIds(seasonIds: readonly string[]): Promise<Array<typeof schema.seasons.$inferSelect>>;
    getSeasonIdsWithTeamLinks(seasonIds: readonly string[]): Promise<string[]>;
    getTeams(leagueSourceId: number, season: number, since?: Date): Promise<Array<typeof schema.teams.$inferSelect>>;
    getAllTeams(): Promise<Array<typeof schema.teams.$inferSelect>>;
    getTeamById(teamId: string): Promise<typeof schema.teams.$inferSelect | null>;
    getTeamsByIds(teamIds: readonly string[]): Promise<Array<typeof schema.teams.$inferSelect>>;
    getTeamsBySeasonId(seasonId: string, since?: Date): Promise<Array<typeof schema.teams.$inferSelect>>;
    countTeamsInSeason(seasonId: string): Promise<number>;
    getVenueById(venueId: string): Promise<typeof schema.venues.$inferSelect | null>;
    getVenuesByIds(venueIds: readonly string[]): Promise<Array<typeof schema.venues.$inferSelect>>;
    getVenuesBySeasonId(seasonId: string, since?: Date): Promise<Array<typeof schema.venues.$inferSelect>>;
    syncSeasons(leagueSourceId: number): Promise<SyncResult<typeof schema.seasons.$inferSelect>>;
    syncFixtures(leagueSourceId: number, season: number, reporter?: JobReporter): Promise<SyncResult<typeof schema.fixtures.$inferSelect>>;
    getFixtures(leagueSourceId: number, season: number, since?: Date): Promise<Array<typeof schema.fixtures.$inferSelect>>;
    getFixtureById(fixtureId: string): Promise<typeof schema.fixtures.$inferSelect | null>;
    getFixturesBySeasonId(seasonId: string, since?: Date, forceRefresh?: boolean): Promise<Array<typeof schema.fixtures.$inferSelect>>;
    countFixturesInSeason(seasonId: string): Promise<number>;
    updateLeagueConfig(leagueId: string, metadata: Record<string, unknown>): Promise<typeof schema.leagues.$inferSelect>;

    // Catalog Management
    syncCatalogCountries(): Promise<SyncResult<typeof schema.catalogCountries.$inferSelect>>;
    syncCatalogLeagues(countryId?: string): Promise<SyncResult<typeof schema.catalogLeagues.$inferSelect>>;
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
    getGraphics(entityType: string, entityId?: string): Promise<Array<typeof schema.graphics.$inferSelect>>;
    saveGraphic(graphic: { entityType: string, entityId: string, variantName?: string, blobPath: string, mimeType?: string, metadata?: Record<string, unknown> }): Promise<typeof schema.graphics.$inferSelect>;

    // Real-time / Lazy-load data
    getMatchEvents(fixtureId: number): Promise<import('../integrations/types').IngestedEvent[]>;
    getLineups(fixtureId: number): Promise<import('../integrations/types').IngestedLineup[]>;
    getPlayerData(playerId: number, season: number): Promise<(typeof schema.players.$inferSelect & { sourceId: number; name: string; metadata: Record<string, unknown>; statistics?: unknown }) | null>;

    // Roster & Source Mappings
    importSquad(teamId: string, teamSourceId: number, seasonId: string): Promise<(typeof schema.teamRosters.$inferSelect)[]>;
    getTeamRoster(teamId: string, seasonId: string): Promise<(typeof schema.teamRosters.$inferSelect & { player: typeof schema.players.$inferSelect })[]>;
    getPlayerById(playerId: string): Promise<typeof schema.players.$inferSelect | null>;
    resolvePlayerBySourceId(sourceName: string, sourceId: number): Promise<string | null>;
}

export interface WorkersRepository {
    listJobs(): Promise<Array<typeof schema.jobs.$inferSelect>>;
    getJobByName(name: string): Promise<typeof schema.jobs.$inferSelect | null>;
    listJobExecutions(jobId: string | null, limit: number): Promise<Array<typeof schema.jobExecutions.$inferSelect>>;
    getLatestJobExecution(jobId: string): Promise<typeof schema.jobExecutions.$inferSelect | null>;
    listSystemLogs(limit: number): Promise<Array<typeof schema.systemLogs.$inferSelect>>;
}

export interface IRepository {
    config: ConfigRepository;
    football: FootballRepository;
    workers: WorkersRepository;
}
