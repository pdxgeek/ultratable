import type { ApiTeam, ApiFixture, ApiStanding, Team, Fixture, StandingsRow, FormEntry, MatchLineup } from '../../types';
import { getInternalId } from '../idMap';

export function mapTeam(provider: string, apiTeam: ApiTeam): Team {
    const externalId = apiTeam.team.id;
    const internalId = getInternalId(provider, 'team', externalId);

    return {
        id: internalId,
        integrationId: `${provider}:${externalId}`,
        commonName: apiTeam.team.name,
        shortCode: apiTeam.team.code,
        venue: apiTeam.venue.name,
        venueImage: apiTeam.venue.image,
        city: apiTeam.venue.city,
        logo: apiTeam.team.logo,
        founded: apiTeam.team.founded || undefined,
        colors: [], // API-Football doesn't provide colors in this endpoint usually
    };
}


function mapStatus(short: string): 'played' | 'scheduled' | 'live' | 'cancelled' | 'unknown' {
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

export function mapFixture(provider: string, apiFixture: ApiFixture): Fixture {
    const externalId = apiFixture.fixture.id;
    const internalId = getInternalId(provider, 'fixture', externalId);

    const homeTeamId = getInternalId(provider, 'team', apiFixture.teams.home.id);
    const awayTeamId = getInternalId(provider, 'team', apiFixture.teams.away.id);

    return {
        id: internalId,
        integrationId: `${provider}:${externalId}`,
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
        venue: apiFixture.fixture.venue.name,
        venueImage: (apiFixture.fixture.venue as any).image ?? null,
        city: apiFixture.fixture.venue.city,
        round: apiFixture.league.round,
        gameweek: parseInt(apiFixture.league.round.match(/\d+/)?.pop() || '0', 10), // Heuristic
        status: mapStatus(apiFixture.fixture.status.short),
        statusShort: apiFixture.fixture.status.short,
        statusLong: apiFixture.fixture.status.long,
        homeGoals: apiFixture.goals.home,
        awayGoals: apiFixture.goals.away,
        eventsLoaded: false,
        lineups: apiFixture.lineups,
    };
}

export function mapStanding(provider: string, apiStanding: ApiStanding): StandingsRow {
    const teamId = getInternalId(provider, 'team', apiStanding.team.id);

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
            result: char as any, // W, D, L
            fixtureId: '', // We don't have fixture IDs in form string
        })),
        recentFixtures: [],
        nextFixture: null,
        description: apiStanding.description,
    };
}
