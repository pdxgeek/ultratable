import axios, { AxiosInstance } from 'axios';
import { IFootballProvider, IngestedLeague, IngestedSeason, IngestedTeam, IngestedVenue, IngestedFixture, IngestedCountry } from '../types';
import { Normalizer } from './normalizer';

export class ApiFootballProvider implements IFootballProvider {
    name = 'api-football';
    private client: AxiosInstance;

    constructor() {
        const apiKey = process.env.API_FOOTBALL_KEY;
        if (!apiKey) {
            console.warn('API_FOOTBALL_KEY not found in environment');
        }

        this.client = axios.create({
            baseURL: 'https://v3.football.api-sports.io',
            headers: {
                'x-rapidapi-key': apiKey || '',
                'x-rapidapi-host': 'v3.football.api-sports.io'
            }
        });
    }

    async getCountries(): Promise<IngestedCountry[]> {
        const resp = await this.client.get('/countries');
        return resp.data.response.map((c: any) => ({
            name: c.name,
            code: c.code,
            flag: c.flag
        }));
    }

    async getLeagues(): Promise<IngestedLeague[]> {
        const resp = await this.client.get('/leagues');
        return resp.data.response.map((item: any) => Normalizer.normalizeLeague(item, this.name));
    }

    async getSeasons(leagueId: number): Promise<IngestedSeason[]> {
        const resp = await this.client.get('/leagues', { params: { id: leagueId } });
        const leagueData = resp.data.response[0];
        if (!leagueData) return [];
        return leagueData.seasons.map((s: any) => Normalizer.normalizeSeason(leagueData, s, this.name));
    }

    async getTeams(leagueId: number, season: number): Promise<{ teams: IngestedTeam[], venues: IngestedVenue[] }> {
        const resp = await this.client.get('/teams', { params: { league: leagueId, season } });
        const response = resp.data.response;

        const teams = response.map((item: any) => Normalizer.normalizeTeam(item, this.name));
        const venues = response.map((item: any) => Normalizer.normalizeVenue(item, this.name));

        return { teams, venues };
    }

    async getFixtures(leagueId: number, season: number): Promise<{ fixtures: IngestedFixture[], venues: IngestedVenue[] }> {
        const resp = await this.client.get('/fixtures', { params: { league: leagueId, season } });
        const response = resp.data.response;

        const fixtures = response.map((item: any) => Normalizer.normalizeFixture(item, this.name));
        const venues = response
            .filter((item: any) => item.fixture.venue?.id)
            .map((item: any) => Normalizer.normalizeVenue(item.fixture.venue, this.name));

        return { fixtures, venues };
    }

    async getFixturesByIds(sourceIds: number[]): Promise<{ fixtures: IngestedFixture[], venues: IngestedVenue[] }> {
        const fixtures: IngestedFixture[] = [];
        const venues: IngestedVenue[] = [];

        // API-Football allows max 20 ids per request via the `ids` parameter
        const CHUNK_SIZE = 20;

        for (let i = 0; i < sourceIds.length; i += CHUNK_SIZE) {
            const chunk = sourceIds.slice(i, i + CHUNK_SIZE);
            const idsList = chunk.join('-');

            try {
                const resp = await this.client.get('/fixtures', { params: { ids: idsList } });
                const response = resp.data.response || [];

                const chunkFixtures = response.map((item: any) => Normalizer.normalizeFixture(item, this.name));
                const chunkVenues = response
                    .filter((item: any) => item.fixture.venue?.id)
                    .map((item: any) => Normalizer.normalizeVenue(item.fixture.venue, this.name));

                fixtures.push(...chunkFixtures);
                venues.push(...chunkVenues);
            } catch (err) {
                console.error(`Error fetching proxy fixtures for ids ${idsList}:`, err);
            }
        }

        return { fixtures, venues };
    }

    async getMatchEvents(fixtureId: number): Promise<any[]> {
        const resp = await this.client.get('/fixtures/events', { params: { fixture: fixtureId } });
        return resp.data.response.map((item: any) => Normalizer.normalizeEvent(item, fixtureId));
    }

    async getPlayerData(playerId: number, season: number): Promise<any> {
        const resp = await this.client.get('/players', { params: { id: playerId, season } });
        const player = resp.data.response[0];
        if (!player) return null;
        return Normalizer.normalizePlayer(player);
    }
}
