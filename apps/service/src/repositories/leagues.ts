import * as schema from '../db/schema';
import { SyncResult } from './shared';

// Dual-ID contract (AI_README_FIRST.MD §1): parameters that carry an external
// provider ID MUST end in `SourceId`. `leagueId` is reserved for the internal
// Postgres UUID. Do not reintroduce a bare `leagueId: number` here.
export interface LeaguesRepository {
    getLeagues(): Promise<Array<typeof schema.leagues.$inferSelect>>;
    getLeagueById(leagueId: string): Promise<typeof schema.leagues.$inferSelect | null>;
    getLeaguesByIds(
        leagueIds: readonly string[],
    ): Promise<Array<typeof schema.leagues.$inferSelect>>;
    updateLeagueConfig(
        leagueId: string,
        metadata: Record<string, unknown>,
    ): Promise<typeof schema.leagues.$inferSelect>;

    getInternalSeasons(
        leagueSourceId: number,
        internalLeagueId?: string,
    ): Promise<Array<typeof schema.seasons.$inferSelect>>;
    getAllInternalSeasons(): Promise<Array<typeof schema.seasons.$inferSelect>>;
    getSeasonsByIds(
        seasonIds: readonly string[],
    ): Promise<Array<typeof schema.seasons.$inferSelect>>;
    getSeasonIdsWithTeamLinks(seasonIds: readonly string[]): Promise<string[]>;
    syncSeasons(leagueSourceId: number): Promise<SyncResult<typeof schema.seasons.$inferSelect>>;
    importSeason(leagueId: string, year: number): Promise<typeof schema.seasons.$inferSelect>;
    updateSeasonConfig(
        seasonId: string,
        config: Record<string, unknown>,
    ): Promise<typeof schema.seasons.$inferSelect>;
    removeSeason(seasonId: string): Promise<boolean>;

    getRankingFormulas(): Promise<Array<typeof schema.rankingFormulas.$inferSelect>>;
    saveRankingFormula(formula: {
        id: string;
        name: string;
        description?: string;
        logicType: string;
    }): Promise<typeof schema.rankingFormulas.$inferSelect>;
}
