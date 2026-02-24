import { IngestedLeague, IngestedTeam, IngestedVenue, IngestedSeason, IngestedFixture } from '../types';

export class Normalizer {
    static normalizeLeague(item: any, sourceName: string = 'api-football'): IngestedLeague {
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
        const venue = item.venue || {};

        return {
            name: team.name,
            shortName: team.name,
            tla: team.code,
            logo: team.logo,
            venueSourceId: venue.id || null,
            sourceId: team.id,
            sourceName: sourceName
        };
    }

    static normalizeVenue(item: any, sourceName: string = 'api-football'): IngestedVenue {
        const venue = item.venue || item;
        return {
            name: venue.name,
            city: venue.city || null,
            capacity: venue.capacity || null,
            surface: venue.surface || null,
            image: venue.image || null,
            sourceId: venue.id,
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
            venueSourceId: fixture.venue?.id || null,
            homeGoals: goals.home,
            awayGoals: goals.away
        };
    }

    static normalizeEvent(item: any, fixtureId: number): any {
        return {
            fixtureId,
            teamId: item.team.id,
            playerName: item.player.name,
            playerSourceId: item.player.id,
            type: item.type,
            detail: item.detail,
            comments: item.comments,
            minute: item.time.elapsed,
            extraMinute: item.time.extra
        };
    }

    static normalizePlayer(item: any): any {
        const p = item.player;
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
            statistics: item.statistics
        };
    }
}
