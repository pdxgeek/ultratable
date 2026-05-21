import {
    IngestedEvent,
    IngestedFixture,
    IngestedLeague,
    IngestedSeason,
    IngestedTeam,
    IngestedVenue,
} from '../types';

export interface RawLeagueItem {
    league: { id: number; name: string; logo: string };
    country?: { name: string } | string;
}
export interface RawTeamItem {
    team: { id: number; name: string; code: string; logo: string };
    venue?: {
        id: number;
        name: string;
        city: string;
        capacity: number;
        surface: string;
        image: string;
    };
}
export interface RawVenueItem {
    venue?: {
        id: number;
        name: string;
        city: string;
        capacity: number;
        surface: string;
        image: string;
    };
    id?: number;
    name?: string;
    city?: string;
    capacity?: number;
    surface?: string;
    image?: string;
}
export interface RawSeasonItem {
    year: number;
    start: string;
    end: string;
}
export interface RawFixtureItem {
    fixture: { id: number; date: string; status: { short: string }; venue?: { id: number } };
    goals: { home: number | null; away: number | null };
    teams: { home: { id: number }; away: { id: number } };
    league?: { round?: string };
}
export interface RawEventItem {
    team: { id: number };
    player: { id: number; name: string };
    assist?: { id: number; name: string };
    type: string;
    detail: string;
    comments: string;
    time: { elapsed: number; extra: number | null };
    fixtureId?: number;
}
export interface RawPlayerItem {
    player: {
        id: number;
        name: string;
        firstname: string;
        lastname: string;
        age: number;
        nationality: string;
        height: string;
        weight: string;
        injured: boolean;
        photo: string;
    };
    statistics: Record<string, unknown>[];
}
export interface RawLineupItem {
    team: { id: number; name: string; logo: string };
    coach?: { name: string; photo: string };
    formation: string;
    startXI?: { player: { id: number; name: string; number?: number; pos?: string } }[];
    substitutes?: { player: { id: number; name: string; number?: number; pos?: string } }[];
}

export class Normalizer {
    static normalizeLeague(
        item: RawLeagueItem | Record<string, unknown>,
        sourceName: string = 'api-football',
    ): IngestedLeague {
        const raw = item as RawLeagueItem;
        const league = raw.league || (raw as unknown as NonNullable<RawLeagueItem['league']>);
        const country =
            typeof raw.country === 'object' && raw.country !== null
                ? raw.country.name
                : (raw.country as string | undefined) || null;

        return {
            name: league.name,
            slug: league.name
                .toLowerCase()
                .replace(/\s+/g, '-')
                .replace(/[^a-z0-9-]/g, ''),
            country: country,
            logo: league.logo,
            sourceId: league.id,
            sourceName: sourceName,
        };
    }

    static normalizeTeam(
        item: RawTeamItem | Record<string, unknown>,
        sourceName: string = 'api-football',
    ): IngestedTeam {
        const raw = item as RawTeamItem;
        const team = raw.team || (raw as unknown as NonNullable<RawTeamItem['team']>);
        const venue = raw.venue || ({} as NonNullable<RawTeamItem['venue']>);

        return {
            name: team.name,
            shortName: team.name,
            tla: team.code,
            logo: team.logo,
            venueSourceId: venue.id || null,
            sourceId: team.id,
            sourceName: sourceName,
        };
    }

    static normalizeVenue(
        item: RawVenueItem | Record<string, unknown>,
        sourceName: string = 'api-football',
    ): IngestedVenue {
        const raw = item as RawVenueItem;
        const venue = raw.venue || (raw as unknown as NonNullable<RawVenueItem['venue']>);
        return {
            name: venue.name,
            city: venue.city || null,
            capacity: venue.capacity || null,
            surface: venue.surface || null,
            image: venue.image || null,
            sourceId: venue.id,
            sourceName: sourceName,
        };
    }

    static normalizeSeason(
        leagueItem: RawLeagueItem | Record<string, unknown>,
        seasonItem: RawSeasonItem | Record<string, unknown>,
        sourceName: string = 'api-football',
    ): IngestedSeason {
        const parsedLeague = leagueItem as RawLeagueItem;
        const parsedSeason = seasonItem as RawSeasonItem;
        return {
            year: parsedSeason.year,
            startDate: parsedSeason.start,
            endDate: parsedSeason.end,
            sourceId:
                parsedLeague.league?.id ||
                (parsedLeague as unknown as NonNullable<RawLeagueItem['league']>).id,
            sourceName: sourceName,
        };
    }

    static normalizeFixture(
        item: RawFixtureItem | Record<string, unknown>,
        sourceName: string = 'api-football',
    ): IngestedFixture {
        const raw = item as RawFixtureItem;
        const fixture = raw.fixture;
        const goals = raw.goals;
        const teams = raw.teams;

        let status: IngestedFixture['status'] = 'scheduled';
        const shortStatus = fixture.status.short;
        if (['FT', 'AET', 'PEN', 'WO', 'AWD'].includes(shortStatus)) status = 'played';
        else if (['1H', 'HT', '2H', 'ET', 'P'].includes(shortStatus)) status = 'live';
        else if (['PST', 'CANC', 'ABD', 'SUSP', 'INT'].includes(shortStatus)) status = 'postponed';

        return {
            sourceId: fixture.id,
            sourceName: sourceName,
            scheduledAt: fixture.date,
            status,
            homeTeamSourceId: teams.home.id,
            awayTeamSourceId: teams.away.id,
            venueSourceId: fixture.venue?.id || null,
            homeGoals: goals.home,
            awayGoals: goals.away,
            gameweek: parseInt(raw.league?.round?.match(/\d+/)?.pop() || '0', 10) || null,
        };
    }

    static normalizeEvent(
        item: RawEventItem | Record<string, unknown>,
        fixtureId: number,
    ): IngestedEvent {
        const raw = item as RawEventItem;
        return {
            fixtureId,
            teamId: raw.team.id,
            playerName: raw.player.name,
            playerSourceId: raw.player.id,
            assistName: raw.assist?.name || null,
            assistSourceId: raw.assist?.id || null,
            type: raw.type,
            detail: raw.detail,
            comments: raw.comments,
            minute: raw.time.elapsed,
            extraMinute: raw.time.extra,
        };
    }

    static normalizePlayer(
        item: RawPlayerItem | Record<string, unknown>,
    ): import('../types').IngestedPlayer {
        const raw = item as RawPlayerItem;
        const p = raw.player;
        return {
            sourceId: p.id,
            name: p.name,
            firstname: p.firstname,
            lastname: p.lastname,
            age: p.age,
            nationality: p.nationality,
            height: p.height,
            weight: p.weight,
            injured: p.injured,
            photo: p.photo,
            statistics: raw.statistics,
        };
    }

    static normalizeLineup(
        item: RawLineupItem | Record<string, unknown>,
    ): import('../types').IngestedLineup {
        const raw = item as RawLineupItem;
        const team = raw.team;
        const coach = raw.coach;
        return {
            teamSourceId: team.id,
            teamName: team.name,
            teamLogo: team.logo,
            formation: raw.formation,
            coachName: coach?.name || null,
            coachPhoto: coach?.photo || null,
            startXI:
                raw.startXI?.map((x) => ({
                    sourceId: x.player.id,
                    firstname: x.player.name, // Mocking first/last names if missing in lineup endpoint
                    lastname: '',
                    age: 0,
                    nationality: '',
                    height: null,
                    weight: null,
                    injured: false,
                    photo: `https://media.api-sports.io/football/players/${x.player.id}.png`,
                    ...x.player, // Additional data like number, pos
                })) || [],
            substitutes:
                raw.substitutes?.map((x) => ({
                    sourceId: x.player.id,
                    firstname: x.player.name,
                    lastname: '',
                    age: 0,
                    nationality: '',
                    height: null,
                    weight: null,
                    injured: false,
                    photo: `https://media.api-sports.io/football/players/${x.player.id}.png`,
                    ...x.player,
                })) || [],
        };
    }
}
