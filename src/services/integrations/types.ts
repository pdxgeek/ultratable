import type { Team, Fixture, StandingsRow, MatchLineup, ApiEvent } from '../../types';

export interface FetchOptions {
    forceRefresh?: boolean;
}

export interface DataProvider {
    getTeams(leagueId: string | number, season: number, options?: FetchOptions): Promise<Team[]>;
    getFixtures(leagueId: string | number, season: number, options?: FetchOptions): Promise<Fixture[]>;
    getStandings(leagueId: string | number, season: number, options?: FetchOptions): Promise<StandingsRow[]>;
    getFixtureDetails(fixtureId: string, options?: FetchOptions): Promise<Fixture | null>;
    getEvents(fixtureId: number, options?: FetchOptions): Promise<ApiEvent[]>;
    getLineups(fixtureId: string, options?: FetchOptions): Promise<MatchLineup[]>;
    getTeamDetails(teamId: string, options?: FetchOptions): Promise<{ team: Team; coach: any; squad: any[] }>;
    getPlayerData(playerId: string | number, season: number, options?: FetchOptions): Promise<any>;
}

export const IntegrationTypes = 'IntegrationTypes';
