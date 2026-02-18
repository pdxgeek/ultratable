import type { Team, Fixture, StandingsRow, MatchLineup, ApiEvent } from '../../types';

export interface DataProvider {
    getTeams(leagueId: string | number, season: number): Promise<Team[]>;
    getFixtures(leagueId: string | number, season: number): Promise<Fixture[]>;
    getStandings(leagueId: string | number, season: number): Promise<StandingsRow[]>;
    getFixtureDetails(fixtureId: string): Promise<Fixture>;
    getEvents(fixtureId: number): Promise<ApiEvent[]>;
    getLineups(fixtureId: string): Promise<MatchLineup[]>;
}

export const IntegrationTypes = 'IntegrationTypes';
