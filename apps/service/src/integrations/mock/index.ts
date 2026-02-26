import fs from 'node:fs/promises';
import path from 'node:path';
import {
    IFootballProvider,
    IngestedLeague,
    IngestedSeason,
    IngestedTeam,
    IngestedVenue,
    IngestedFixture,
    IngestedCountry
} from '../types';
import { Normalizer } from '../api-football/normalizer';

export class MockFootballProvider implements IFootballProvider {
    name = 'mock';

    private async loadData<T>(filename: string): Promise<T[]> {
        const filePath = path.join(__dirname, 'data', filename);
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(content);
        } catch (e) {
            console.error(`Failed to load mock data ${filename}:`, e);
            return [];
        }
    }

    async getCountries(): Promise<IngestedCountry[]> {
        const raw = await this.loadData<any>('leagues.json');
        return raw.map((item: any) => ({
            name: item.country.name,
            code: item.country.code,
            flag: item.country.flag
        }));
    }

    async getLeagues(): Promise<IngestedLeague[]> {
        const raw = await this.loadData<any>('leagues.json');
        return raw.map((item: any) => Normalizer.normalizeLeague(item, this.name));
    }

    async getSeasons(leagueId: number): Promise<IngestedSeason[]> {
        const raw = await this.loadData<any>('leagues.json');
        const league = raw.find((item: any) => item.league.id === leagueId);
        if (!league) return [];

        return league.seasons.map((s: any) => Normalizer.normalizeSeason(league, s, this.name));
    }

    async getTeams(leagueId: number, season: number): Promise<{ teams: IngestedTeam[], venues: IngestedVenue[] }> {
        const raw = await this.loadData<any>('teams.json');
        const teams = raw.map((item: any) => Normalizer.normalizeTeam(item, this.name));
        const venues = raw.map((item: any) => Normalizer.normalizeVenue(item, this.name));
        return { teams, venues };
    }

    async getFixtures(leagueId: number, season: number): Promise<{ fixtures: IngestedFixture[], venues: IngestedVenue[] }> {
        const raw = await this.loadData<any>('fixtures.json');
        const fixtures = raw.map((item: any) => Normalizer.normalizeFixture(item, this.name));
        const venues = raw
            .filter((item: any) => item.fixture.venue?.id)
            .map((item: any) => Normalizer.normalizeVenue(item.fixture.venue, this.name));
        return { fixtures, venues };
    }

    async getFixturesByIds(sourceIds: number[]): Promise<{ fixtures: IngestedFixture[], venues: IngestedVenue[] }> { return { fixtures: [], venues: [] }; }

    async getMatchEvents(fixtureId: number): Promise<any[]> {
        const raw = await this.loadData<any>('events.json');
        return raw
            .filter((e: any) => e.fixtureId === fixtureId)
            .map((item: any) => Normalizer.normalizeEvent(item, fixtureId));
    }

    async getPlayerData(playerId: number, season: number): Promise<any> {
        const raw = await this.loadData<any>('players.json');
        const player = raw.find((p: any) => p.player.id === playerId);
        if (!player) return null;
        return Normalizer.normalizePlayer(player);
    }
}
