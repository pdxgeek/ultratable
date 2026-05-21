import * as schema from '../../db/schema';

// Dual-ID contract (AI_README_FIRST.MD §1): parameters that carry an external
// provider ID MUST end in `SourceId`. `teamId` is reserved for the internal
// Postgres UUID.
export interface TeamsRepository {
    getTeams(leagueSourceId: number, season: number, since?: Date): Promise<Array<typeof schema.teams.$inferSelect>>;
    getAllTeams(): Promise<Array<typeof schema.teams.$inferSelect>>;
    getTeamById(teamId: string): Promise<typeof schema.teams.$inferSelect | null>;
    getTeamsByIds(teamIds: readonly string[]): Promise<Array<typeof schema.teams.$inferSelect>>;
    getTeamsBySeasonId(seasonId: string, since?: Date): Promise<Array<typeof schema.teams.$inferSelect>>;
    countTeamsInSeason(seasonId: string): Promise<number>;
    syncTeams(leagueSourceId: number, seasonYear: number): Promise<Array<typeof schema.teams.$inferSelect>>;

    getVenueById(venueId: string): Promise<typeof schema.venues.$inferSelect | null>;
    getVenuesByIds(venueIds: readonly string[]): Promise<Array<typeof schema.venues.$inferSelect>>;
    getVenuesBySeasonId(seasonId: string, since?: Date): Promise<Array<typeof schema.venues.$inferSelect>>;
    upsertVenues(venues: import('../../integrations/types').IngestedVenue[]): Promise<void>;

    importSquad(teamId: string, teamSourceId: number, seasonId: string): Promise<(typeof schema.teamRosters.$inferSelect)[]>;
    getTeamRoster(teamId: string, seasonId: string): Promise<(typeof schema.teamRosters.$inferSelect & { player: typeof schema.players.$inferSelect })[]>;
}
