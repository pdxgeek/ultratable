import type { ApiTeam, ApiFixture, ApiStanding, Team, Fixture, StandingsRow, IntegrationName, Player } from '../../types';
import { database } from '../db';

export async function mapTeam(provider: IntegrationName, apiTeam: ApiTeam): Promise<Team> {
    const externalId = String(apiTeam.team.id);
    const internalId = await database.getInternalId(provider, 'team', externalId);

    return {
        id: internalId,
        externalReferences: [{ integrationName: provider, remoteId: externalId }],
        commonName: apiTeam.team.name,
        shortCode: apiTeam.team.code,
        venue: apiTeam.venue.name,
        venueImage: apiTeam.venue.image,
        city: apiTeam.venue.city,
        logo: apiTeam.team.logo,
        founded: apiTeam.team.founded || undefined,
        colors: [],
        lastRefreshed: new Date().toISOString(),
    };
}


function mapStatus(short: string): 'played' | 'scheduled' | 'live' | 'postponed' | 'cancelled' | 'unknown' {
    switch (short) {
        case 'FT':
        case 'AET':
        case 'PEN':
            return 'played';
        case 'NS':
            return 'scheduled';
        case 'TBD':
            return 'unknown';
        case 'PST':
            return 'postponed';
        case 'CANC':
        case 'ABD':
        case 'AWD':
        case 'WO':
            return 'cancelled';
        case '1H':
        case '2H':
        case 'HT':
        case 'ET':
        case 'BT':
        case 'P':
        case 'LIVE':
            return 'live';
        default:
            return 'unknown';
    }
}

export async function mapFixture(provider: IntegrationName, apiFixture: ApiFixture): Promise<Fixture | null> {
    if (!apiFixture || !apiFixture.fixture) {
        console.warn(`[Mapper] Invalid apiFixture data:`, apiFixture);
        return null;
    }

    try {
        const externalId = String(apiFixture.fixture.id);
        const internalId = await database.getInternalId(provider, 'fixture', externalId);

        if (!apiFixture.teams?.home || !apiFixture.teams?.away) {
            console.warn(`[Mapper] Missing team data for fixture ${apiFixture.fixture.id}`);
            return null;
        }

        const homeTeamId = await database.getInternalId(provider, 'team', apiFixture.teams.home.id);
        const awayTeamId = await database.getInternalId(provider, 'team', apiFixture.teams.away.id);

        return {
            id: internalId,
            externalReferences: [{ integrationName: provider, remoteId: externalId }],
            commonName: `${apiFixture.teams.home.name} vs ${apiFixture.teams.away.name}`,
            homeTeamId,
            awayTeamId,
            homeTeam: {
                name: apiFixture.teams.home.name,
                logo: apiFixture.teams.home.logo,
                winner: apiFixture.teams.home.winner
            },
            awayTeam: {
                name: apiFixture.teams.away.name,
                logo: apiFixture.teams.away.logo,
                winner: apiFixture.teams.away.winner
            },
            date: apiFixture.fixture.date,
            timestamp: apiFixture.fixture.timestamp,
            venue: apiFixture.fixture.venue?.name || 'Unknown Venue',
            venueImage: (apiFixture.fixture.venue as any)?.image ?? null,
            city: apiFixture.fixture.venue?.city || null,
            round: apiFixture.league?.round || 'Unknown Round',
            gameweek: parseInt(apiFixture.league?.round?.match(/\d+/)?.pop() || '0', 10),
            status: mapStatus(apiFixture.fixture.status?.short || 'NS'),
            statusShort: apiFixture.fixture.status?.short || 'NS',
            statusLong: apiFixture.fixture.status?.long || 'Not Started',
            homeGoals: apiFixture.goals?.home ?? null,
            awayGoals: apiFixture.goals?.away ?? null,
            eventsLoaded: false,
            lineups: apiFixture.lineups,
            lastRefreshed: new Date().toISOString(),
        };
    } catch (e) {
        console.error(`[Mapper] Critical error mapping fixture:`, e, apiFixture);
        return null;
    }
}

export async function mapStanding(provider: IntegrationName, apiStanding: ApiStanding): Promise<StandingsRow | null> {
    if (!apiStanding || !apiStanding.team) return null;
    const teamId = await database.getInternalId(provider, 'team', apiStanding.team.id);

    return {
        position: apiStanding.rank,
        teamId,
        team: {
            name: apiStanding.team.name,
            logo: apiStanding.team.logo
        },
        played: apiStanding.all.played,
        won: apiStanding.all.win,
        drawn: apiStanding.all.draw,
        lost: apiStanding.all.lose,
        goalsFor: apiStanding.all.goals.for,
        goalsAgainst: apiStanding.all.goals.against,
        goalDifference: apiStanding.goalsDiff,
        points: apiStanding.points,
        form: (apiStanding.form || '').split('').map(char => ({
            result: char as any,
            fixtureId: '',
        })),
        recentFixtures: [],
        nextFixture: null,
        description: apiStanding.description,
        lastRefreshed: new Date().toISOString(),
    };
}

export async function mapPlayer(provider: IntegrationName, apiPlayer: any): Promise<Player> {
    const externalId = String(apiPlayer.player.id);
    const internalId = await database.getInternalId(provider, 'player', externalId);

    return {
        id: internalId,
        externalReferences: [{ integrationName: provider, remoteId: externalId }],
        commonName: apiPlayer.player.name,
        number: apiPlayer.player.number,
        pos: apiPlayer.player.pos as any,
        grid: apiPlayer.player.grid,
        photo: apiPlayer.player.photo,
        lastRefreshed: new Date().toISOString(),
    };
}
