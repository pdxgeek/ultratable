export interface IngestedLeague {
    name: string;
    slug: string;
    country: string | null;
    logo: string | null;
    sourceId: number;
    sourceName: string;
}

export interface IngestedTeam {
    name: string;
    shortName: string | null;
    tla: string | null;
    logo: string | null;
    venue: string | null;
    sourceId: number;
    sourceName: string;
}

export interface IngestedSeason {
    year: number;
    startDate: string | null;
    endDate: string | null;
    sourceId: number; // For API-Football, this is often the league ID since sequels are nested
    sourceName: string;
}

export interface IngestedFixture {
    sourceId: number;
    sourceName: string;
    scheduledAt: string;
    status: 'scheduled' | 'played' | 'postponed' | 'cancelled' | 'live';
    homeTeamSourceId: number;
    awayTeamSourceId: number;
    homeGoals: number | null;
    awayGoals: number | null;
}

export class Normalizer {
    static normalizeLeague(item: any, sourceName: string = 'api-football'): IngestedLeague {
        // Handle API-Football format or Mock format
        const league = item.league || item;
        const country = item.country?.name || item.country || null;

        return {
            name: league.name,
            slug: league.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
            country: country,
            logo: league.logo,
            sourceId: league.id,
            sourceName: sourceName
        };
    }

    static normalizeTeam(item: any, sourceName: string = 'api-football'): IngestedTeam {
        const team = item.team || item;
        const venue = item.venue?.name || item.venue || null;

        return {
            name: team.name,
            shortName: team.name, // API-Football doesn't always provide shortName in the teams response
            tla: team.code,
            logo: team.logo,
            venue: venue,
            sourceId: team.id,
            sourceName: sourceName
        };
    }

    static normalizeSeason(leagueItem: any, seasonItem: any, sourceName: string = 'api-football'): IngestedSeason {
        return {
            year: seasonItem.year,
            startDate: seasonItem.start,
            endDate: seasonItem.end,
            sourceId: leagueItem.league.id,
            sourceName: sourceName
        };
    }

    static normalizeFixture(item: any, sourceName: string = 'api-football'): IngestedFixture {
        const fixture = item.fixture;
        const goals = item.goals;
        const teams = item.teams;

        // Map API-Football status to our enum
        let status: IngestedFixture['status'] = 'scheduled';
        const shortStatus = fixture.status.short;
        if (['FT', 'AET', 'PEN'].includes(shortStatus)) status = 'played';
        else if (['1H', 'HT', '2H', 'ET', 'P'].includes(shortStatus)) status = 'live';
        else if (['PST', 'CANC', 'ABD'].includes(shortStatus)) status = 'postponed';

        return {
            sourceId: fixture.id,
            sourceName: sourceName,
            scheduledAt: fixture.date,
            status,
            homeTeamSourceId: teams.home.id,
            awayTeamSourceId: teams.away.id,
            homeGoals: goals.home,
            awayGoals: goals.away
        };
    }
}
