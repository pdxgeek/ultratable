import type { DataProvider } from './types';
import type { ApiTeam, ApiFixture, ApiStanding, ApiEvent, MatchLineup, Team, Fixture, StandingsRow, Player } from '../../types';
import { apiGet } from '../../services/api/client';
import { mapTeam, mapFixture, mapStanding } from './mappers';
import { database } from '../db';

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
    async getTeams(leagueId: number, season: number, options?: { forceRefresh?: boolean }): Promise<Team[]> {
        const raw = await apiGet<ApiTeam[]>(
            'teams',
            { league: leagueId, season },
            `teams_${leagueId}_${season}`,
            options?.forceRefresh
        );
        if (!raw) return [];
        return (await Promise.all(raw.filter(Boolean).map(t => mapTeam('api-football', t)))).filter((t): t is Team => !!t);
    }

    async getFixtures(leagueId: number, season: number, options?: { forceRefresh?: boolean }): Promise<Fixture[]> {
        const raw = await apiGet<ApiFixture[]>(
            'fixtures',
            { league: leagueId, season },
            `fixtures_${leagueId}_${season}`,
            options?.forceRefresh
        );
        console.log(`[ApiFootballProvider] Raw fixtures count: ${raw?.length || 0}`);
        if (!raw || raw.length === 0) return [];

        try {
            const mapped = await Promise.all(raw.filter(Boolean).map(async (f, idx) => {
                try {
                    return await mapFixture('api-football', f);
                } catch (e) {
                    console.error(`[ApiFootballProvider] Failed mapping fixture at index ${idx}:`, e);
                    return null;
                }
            }));
            const filtered = mapped.filter((f): f is Fixture => !!f);
            console.log(`[ApiFootballProvider] Mapped fixtures count: ${filtered.length}`);
            return filtered;
        } catch (e) {
            console.error('[ApiFootballProvider] Critical failure in mapFixture loop:', e);
            return [];
        }
    }

    async getStandings(leagueId: number, season: number, options?: { forceRefresh?: boolean }): Promise<StandingsRow[]> {
        const raw = await apiGet<Array<{ league: { standings: ApiStanding[][] } }>>(
            'standings',
            { league: leagueId, season },
            `standings_${leagueId}_${season}`,
            options?.forceRefresh
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
        return (await Promise.all(standings.filter(Boolean).map(s => mapStanding('api-football', s)))).filter((s): s is StandingsRow => !!s);
    }

    async getFixtureDetails(fixtureId: string): Promise<Fixture | null> {
        const externalId = parseInt(fixtureId, 10);
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
        const externalId = parseInt(fixtureId, 10);
        const raw = await apiGet<ApiLineupResponse[]>(
            'fixtures/lineups',
            { fixture: externalId },
            `lineups_${externalId}`
        );

        // Map API response to our internal structure
        return Promise.all(raw.map(async lineup => {
            const mapPlayerItem = async (apiPlayer: ApiLineupPlayer): Promise<{ player: Player }> => {
                const playerId = await database.getInternalId('api-football', 'player', apiPlayer.player.id);
                return {
                    player: {
                        id: playerId,
                        externalReferences: [{ integrationName: 'api-football', remoteId: String(apiPlayer.player.id) }],
                        commonName: apiPlayer.player.name,
                        number: apiPlayer.player.number,
                        pos: apiPlayer.player.pos as 'GK' | 'DF' | 'MF' | 'FW',
                        grid: apiPlayer.player.grid,
                        photo: apiPlayer.player.photo,
                        lastRefreshed: new Date().toISOString(),
                    }
                };
            };

            const [startXI, substitutes] = await Promise.all([
                Promise.all(lineup.startXI.map(mapPlayerItem)),
                Promise.all(lineup.substitutes.map(mapPlayerItem))
            ]);

            return {
                team: lineup.team,
                coach: lineup.coach,
                formation: lineup.formation,
                startXI,
                substitutes,
            };
        }));
    }

    async getTeamDetails(teamId: string, options?: { forceRefresh?: boolean }): Promise<{ team: Team; coach: any; squad: any[] }> {
        const externalId = parseInt(teamId, 10);

        // 1. Fetch Basic Team Info (Logo, Venue)
        const teamRaw = await apiGet<ApiTeam[]>(
            'teams',
            { id: externalId },
            `teams_detail_${externalId}`,
            options?.forceRefresh
        );
        if (!teamRaw || teamRaw.length === 0) throw new Error('Team not found');
        const team = await mapTeam('api-football', teamRaw[0]);

        // 2. Fetch Coach
        const coachRaw = await apiGet<any[]>(
            'coaches',
            { team: externalId },
            `coach_${externalId}`,
            options?.forceRefresh
        );
        const coach = coachRaw && coachRaw.length > 0 ? {
            id: await database.getInternalId('api-football', 'coach', coachRaw[0].id),
            name: coachRaw[0].name,
            photo: coachRaw[0].photo,
            nationality: coachRaw[0].nationality,
            birthDate: coachRaw[0].birth?.date,
            externalReferences: [{ integrationName: 'api-football', remoteId: String(coachRaw[0].id) }]
        } : null;

        // 3. Fetch Squad (simplified from player endpoint)
        const squadRaw = await apiGet<any[]>(
            'players/squads',
            { team: externalId },
            `squad_${externalId}`,
            options?.forceRefresh
        );

        const squad = squadRaw && squadRaw[0]?.players ? await Promise.all(squadRaw[0].players.map(async (p: any) => {
            const playerId = await database.getInternalId('api-football', 'player', p.id);
            return {
                id: playerId,
                commonName: p.name,
                number: p.number,
                position: p.position,
                age: p.age,
                photo: `https://media.api-sports.io/football/players/${p.id}.png`, // Deterministic photo URL
                externalReferences: [{ integrationName: 'api-football', remoteId: String(p.id) }]
            };
        })) : [];

        return { team: team!, coach, squad };
    }

    async getPlayerData(playerId: number, season: number, options?: { forceRefresh?: boolean }): Promise<any> {
        return apiGet<any[]>(
            'players',
            { id: playerId, season },
            `player_detail_${playerId}_${season}`,
            options?.forceRefresh
        );
    }
}
