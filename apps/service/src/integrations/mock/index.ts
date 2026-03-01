import fs from 'node:fs/promises';
import path from 'node:path';
import {
    IFootballProvider,
    IngestedLeague,
    IngestedSeason,
    IngestedTeam,
    IngestedVenue,
    IngestedFixture,
    IngestedEvent,
    IngestedPlayer,
    IngestedCountry
} from '../types';
import { Normalizer, RawLeagueItem, RawSeasonItem, RawTeamItem, RawVenueItem, RawFixtureItem, RawEventItem, RawPlayerItem } from '../api-football/normalizer';

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
        const raw = await this.loadData<{ country: { name: string; code: string; flag: string } }>('leagues.json');
        return raw.map((item) => ({
            name: item.country.name,
            code: item.country.code,
            flag: item.country.flag
        }));
    }

    async getLeagues(): Promise<IngestedLeague[]> {
        const raw = await this.loadData<RawLeagueItem>('leagues.json');
        return raw.map((item) => Normalizer.normalizeLeague(item, this.name));
    }

    async getSeasons(leagueId: number): Promise<IngestedSeason[]> {
        const raw = await this.loadData<RawLeagueItem & { seasons: RawSeasonItem[] }>('leagues.json');
        const league = raw.find((item) => item.league.id === leagueId);
        if (!league) return [];

        return league.seasons.map((s) => Normalizer.normalizeSeason(league, s, this.name));
    }

    async getTeams(): Promise<{ teams: IngestedTeam[], venues: IngestedVenue[] }> {
        const raw = await this.loadData<RawTeamItem & RawVenueItem>('teams.json');
        const teams = raw.map((item) => Normalizer.normalizeTeam(item, this.name));
        const venues = raw.map((item) => Normalizer.normalizeVenue(item, this.name));
        return { teams, venues };
    }

    async getFixtures(): Promise<{ fixtures: IngestedFixture[], venues: IngestedVenue[] }> {
        const raw = await this.loadData<RawFixtureItem>('fixtures.json');
        const fixtures = raw.map((item) => Normalizer.normalizeFixture(item, this.name));
        const venues = raw
            .filter((item) => item.fixture?.venue?.id)
            .map((item) => Normalizer.normalizeVenue(item.fixture.venue as RawVenueItem, this.name));
        return { fixtures, venues };
    }

    async getFixturesByIds(): Promise<{ fixtures: IngestedFixture[], venues: IngestedVenue[] }> { return { fixtures: [], venues: [] }; }

    async getMatchEvents(fixtureId: number): Promise<IngestedEvent[]> {
        const raw = await this.loadData<RawEventItem>('events.json');
        return raw
            .filter((e) => e.fixtureId === fixtureId)
            .map((item) => Normalizer.normalizeEvent(item, fixtureId));
    }

    async getLineups(): Promise<import('../types').IngestedLineup[]> {
        return [];
    }

    async getPlayerData(playerId: number): Promise<IngestedPlayer | null> {
        const raw = await this.loadData<RawPlayerItem>('players.json');
        const player = raw.find((p) => p.player.id === playerId);
        if (!player) return null;
        return Normalizer.normalizePlayer(player);
    }
}
