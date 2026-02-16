import type { DataProvider } from './types';
import type { ApiTeam, ApiFixture, ApiStanding, ApiEvent, MatchLineup, Team, Fixture, StandingsRow, Player } from '../../types';
import { apiGet } from '../../services/api/client';
import { mapTeam, mapFixture, mapStanding } from './mappers';
import { getInternalId } from '../idMap';

// API-Football lineup response structure
interface ApiLineupPlayer {
    player: {
        id: number;
        name: string;
        number: number;
        pos: string;
        grid?: string;
        photo?: string;
    };
}

interface ApiLineupResponse {
    team: { id: number; name: string; logo: string; colors?: any };
    coach: { id: number; name: string; photo?: string };
    formation: string;
    startXI: ApiLineupPlayer[];
    substitutes: ApiLineupPlayer[];
}

export class ApiFootballProvider implements DataProvider {
    async getTeams(leagueId: number, season: number): Promise<Team[]> {
        const raw = await apiGet<ApiTeam[]>(
            'teams',
            { league: leagueId, season },
            `teams_${leagueId}_${season}`
        );
        return raw.map(t => mapTeam('api-football', t));
    }

    async getFixtures(leagueId: number, season: number): Promise<Fixture[]> {
        const raw = await apiGet<ApiFixture[]>(
            'fixtures',
            { league: leagueId, season },
            `fixtures_${leagueId}_${season}`
        );
        return raw.map(f => mapFixture('api-football', f));
    }

    async getStandings(leagueId: number, season: number): Promise<StandingsRow[]> {
        const raw = await apiGet<Array<{ league: { standings: ApiStanding[][] } }>>(
            'standings',
            { league: leagueId, season },
            `standings_${leagueId}_${season}`
        );

        let standings: ApiStanding[] = [];
        if (Array.isArray(raw) && raw.length > 0) {
            const first = raw[0];
            if ('league' in first && first.league?.standings) {
                standings = first.league.standings[0];
            } else if ('rank' in first) {
                standings = raw as unknown as ApiStanding[];
            }
        }
        return standings.map(s => mapStanding('api-football', s));
    }

    async getFixtureDetails(fixtureId: string): Promise<Fixture> {
        const externalId = parseInt(fixtureId.split(':').pop() || fixtureId, 10);
        const response = await apiGet<ApiFixture[]>(
            'fixtures',
            { id: externalId },
            `fixture_${externalId}`
        );
        if (!response || response.length === 0) {
            throw new Error('Fixture not found');
        }
        return mapFixture('api-football', response[0]);
    }

    async getEvents(fixtureId: number): Promise<ApiEvent[]> {
        // Events are still raw for now
        return apiGet<ApiEvent[]>(
            'fixtures/events',
            { fixture: fixtureId },
            `events_${fixtureId}`
        );
    }

    async getLineups(fixtureId: string): Promise<MatchLineup[]> {
        const externalId = parseInt(fixtureId.split(':').pop() || fixtureId, 10);
        const raw = await apiGet<ApiLineupResponse[]>(
            'fixtures/lineups',
            { fixture: externalId },
            `lineups_${externalId}`
        );

        // Map API response to our internal structure
        return raw.map(lineup => {
            const mapPlayer = (apiPlayer: ApiLineupPlayer): { player: Player } => {
                const playerId = getInternalId('api-football', 'player', apiPlayer.player.id);
                return {
                    player: {
                        id: playerId,
                        integrationId: `api-football:${apiPlayer.player.id}`,
                        commonName: apiPlayer.player.name,
                        number: apiPlayer.player.number,
                        pos: apiPlayer.player.pos as 'GK' | 'DF' | 'MF' | 'FW',
                        grid: apiPlayer.player.grid,
                        photo: apiPlayer.player.photo,
                    }
                };
            };

            return {
                team: lineup.team,
                coach: lineup.coach,
                formation: lineup.formation,
                startXI: lineup.startXI.map(mapPlayer),
                substitutes: lineup.substitutes.map(mapPlayer),
            };
        });
    }
}
