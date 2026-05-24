import axios, { AxiosInstance } from 'axios';

import { globalLogger } from '../../services/log.service';
import {
    IFootballProvider,
    IngestedCountry,
    IngestedEvent,
    IngestedFixture,
    IngestedLeague,
    IngestedPlayer,
    IngestedSeason,
    IngestedTeam,
    IngestedVenue,
} from '../types';
import {
    Normalizer,
    RawEventItem,
    RawFixtureItem,
    RawLeagueItem,
    RawLineupItem,
    RawSeasonItem,
    RawTeamItem,
    RawVenueItem,
} from './normalizer';

export class ApiFootballProvider implements IFootballProvider {
    name = 'api-football';
    private client: AxiosInstance;
    private logger = globalLogger.child({ module: 'ApiFootballProvider' });

    constructor() {
        const apiKey = process.env.API_FOOTBALL_KEY;
        if (!apiKey) {
            globalLogger.warn('API_FOOTBALL_KEY not found in environment');
        }

        this.client = axios.create({
            baseURL: 'https://v3.football.api-sports.io',
            timeout: 15_000, // 15-second timeout per request
            headers: {
                'x-rapidapi-key': apiKey || '',
                'x-rapidapi-host': 'v3.football.api-sports.io',
            },
        });
    }

    async getCountries(): Promise<IngestedCountry[]> {
        const resp = await this.client.get('/countries');
        return resp.data.response.map((c: { name: string; code: string; flag: string }) => ({
            name: c.name,
            code: c.code,
            flag: c.flag,
        }));
    }

    async getLeagues(country?: string): Promise<IngestedLeague[]> {
        const resp = await this.client.get(
            '/leagues',
            country ? { params: { country } } : undefined,
        );
        return resp.data.response.map((item: RawLeagueItem) =>
            Normalizer.normalizeLeague(item, this.name),
        );
    }

    async getSeasons(leagueSourceId: number): Promise<IngestedSeason[]> {
        const resp = await this.client.get('/leagues', { params: { id: leagueSourceId } });
        const leagueData = resp.data.response[0];
        if (!leagueData) return [];
        return leagueData.seasons.map((s: RawSeasonItem) =>
            Normalizer.normalizeSeason(leagueData, s, this.name),
        );
    }

    async getTeams(
        leagueSourceId: number,
        season: number,
    ): Promise<{ teams: IngestedTeam[]; venues: IngestedVenue[] }> {
        const resp = await this.client.get('/teams', {
            params: { league: leagueSourceId, season },
        });
        const response = resp.data.response;

        const teams = response.map((item: RawTeamItem) =>
            Normalizer.normalizeTeam(item, this.name),
        );
        const venues = response.map((item: RawVenueItem) =>
            Normalizer.normalizeVenue(item, this.name),
        );

        return { teams, venues };
    }

    async getFixtures(
        leagueSourceId: number,
        season: number,
    ): Promise<{ fixtures: IngestedFixture[]; venues: IngestedVenue[] }> {
        this.logger.debug({ leagueSourceId, season }, 'API: fetching fixtures');
        const resp = await this.client.get('/fixtures', {
            params: { league: leagueSourceId, season },
        });
        const response = resp.data.response;

        const fixtures = response.map((item: RawFixtureItem) =>
            Normalizer.normalizeFixture(item, this.name),
        );
        const venues = response
            .filter((item: RawFixtureItem) => item.fixture.venue?.id)
            .map((item: RawFixtureItem) =>
                Normalizer.normalizeVenue(item.fixture.venue as RawVenueItem, this.name),
            );

        this.logger.debug(
            { leagueSourceId, season, fixtureCount: fixtures.length, venueCount: venues.length },
            'API: fixtures fetched',
        );
        return { fixtures, venues };
    }

    async getFixturesByIds(
        sourceIds: number[],
    ): Promise<{ fixtures: IngestedFixture[]; venues: IngestedVenue[] }> {
        const fixtures: IngestedFixture[] = [];
        const venues: IngestedVenue[] = [];

        // API-Football allows max 20 ids per request via the `ids` parameter
        const CHUNK_SIZE = 20;
        this.logger.debug(
            { count: sourceIds.length, chunks: Math.ceil(sourceIds.length / CHUNK_SIZE) },
            'API: fetching fixtures by IDs',
        );

        for (let i = 0; i < sourceIds.length; i += CHUNK_SIZE) {
            const chunk = sourceIds.slice(i, i + CHUNK_SIZE);
            const idsList = chunk.join('-');

            try {
                const resp = await this.client.get('/fixtures', { params: { ids: idsList } });
                const response = resp.data.response || [];

                const chunkFixtures = response.map((item: RawFixtureItem) =>
                    Normalizer.normalizeFixture(item, this.name),
                );
                const chunkVenues = response
                    .filter((item: RawFixtureItem) => item.fixture.venue?.id)
                    .map((item: RawFixtureItem) =>
                        Normalizer.normalizeVenue(item.fixture.venue as RawVenueItem, this.name),
                    );

                fixtures.push(...chunkFixtures);
                venues.push(...chunkVenues);
            } catch (err) {
                this.logger.error(
                    { ids: idsList, error: (err as Error).message },
                    `Error fetching proxy fixtures for ids ${idsList}`,
                );
            }
        }

        this.logger.debug(
            { fixtureCount: fixtures.length, venueCount: venues.length },
            'API: fixtures by IDs complete',
        );
        return { fixtures, venues };
    }

    async getMatchEvents(fixtureId: number): Promise<IngestedEvent[]> {
        const resp = await this.client.get('/fixtures/events', { params: { fixture: fixtureId } });
        return resp.data.response.map((item: RawEventItem) =>
            Normalizer.normalizeEvent(item, fixtureId),
        );
    }

    async getPlayerData(playerId: number, season: number): Promise<IngestedPlayer | null> {
        const resp = await this.client.get('/players', { params: { id: playerId, season } });
        const player = resp.data.response[0];
        if (!player) return null;
        return Normalizer.normalizePlayer(player);
    }

    async getLineups(fixtureId: number): Promise<import('../types').IngestedLineup[]> {
        const resp = await this.client.get('/fixtures/lineups', { params: { fixture: fixtureId } });
        return resp.data.response.map((item: RawLineupItem) => Normalizer.normalizeLineup(item));
    }

    async getCoachesByTeam(
        teamSourceId: number,
    ): Promise<import('../types').IngestedCoach[]> {
        this.logger.debug({ teamSourceId }, 'API: fetching coaches');
        const resp = await this.client.get('/coachs', { params: { team: teamSourceId } });
        const rows = (resp.data?.response ?? []) as Array<{
            id: number;
            name: string;
            firstname?: string | null;
            lastname?: string | null;
            age?: number | null;
            birth?: {
                date?: string | null;
                place?: string | null;
                country?: string | null;
            } | null;
            nationality?: string | null;
            height?: string | null;
            weight?: string | null;
            photo?: string | null;
            team?: { id?: number | null } | null;
            career?: unknown;
        }>;
        return rows.map((r) => ({
            sourceId: r.id,
            name: r.name,
            firstName: r.firstname ?? null,
            lastName: r.lastname ?? null,
            age: r.age ?? null,
            birthDate: r.birth?.date ?? null,
            birthPlace: r.birth?.place ?? null,
            birthCountry: r.birth?.country ?? null,
            nationality: r.nationality ?? null,
            height: r.height ?? null,
            weight: r.weight ?? null,
            photo: r.photo ?? null,
            teamSourceId: r.team?.id ?? null,
            career: r.career ?? null,
        }));
    }

    async getSquad(teamSourceId: number): Promise<import('../types').IngestedSquadPlayer[]> {
        this.logger.debug({ teamSourceId }, 'API: fetching squad');
        const resp = await this.client.get('/players/squads', { params: { team: teamSourceId } });
        const teamData = resp.data.response[0];
        if (!teamData?.players) return [];
        return teamData.players.map(
            (p: {
                id: number;
                name: string;
                age: number;
                number: number;
                position: string;
                photo: string;
            }) => ({
                sourceId: p.id,
                name: p.name,
                age: p.age || null,
                number: p.number || null,
                position: p.position || null,
                photo: p.photo || null,
            }),
        );
    }
}
