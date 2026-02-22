import { FootballRepository, SyncResult } from './interfaces';
import { Normalizer } from '../ingestion/normalizer';
import fs from 'node:fs/promises';
import path from 'node:path';

export class MockFootballRepository implements FootballRepository {
    private async loadMock<T>(filename: string): Promise<T[]> {
        const filePath = path.join(__dirname, '../ingestion/mocks', filename);
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(content);
        } catch (e) {
            console.error(`Failed to load mock ${filename}:`, e);
            return [];
        }
    }

    async getLeagues(): Promise<any[]> {
        const raw = await this.loadMock<any>('leagues.json');
        return raw.map(item => {
            const normalized = Normalizer.normalizeLeague(item, 'mock');
            return {
                id: crypto.randomUUID(),
                name: normalized.name,
                slug: normalized.slug,
                country: normalized.country,
                logo: normalized.logo,
                sourceName: normalized.sourceName,
                sourceId: normalized.sourceId,
                metadata: {}
            };
        });
    }

    async getTeams(leagueId: number, season: number): Promise<any[]> {
        const raw = await this.loadMock<any>('teams.json');
        return raw.map(item => {
            const normalized = Normalizer.normalizeTeam(item, 'mock');
            return {
                id: crypto.randomUUID(),
                name: normalized.name,
                shortName: normalized.shortName,
                tla: normalized.tla,
                logo: normalized.logo,
                venue: normalized.venue,
                sourceName: normalized.sourceName,
                sourceId: normalized.sourceId,
                metadata: {}
            };
        });
    }

    async syncSeasons(leagueId: number): Promise<SyncResult> {
        // Mock season sync
        return { data: [], stats: { processedCount: 0, apiCallsCount: 0 } };
    }

    async syncFixtures(leagueId: number, season: number): Promise<SyncResult> {
        // Mock fixture sync
        return { data: [], stats: { processedCount: 0, apiCallsCount: 0 } };
    }

    async getFixtures(leagueId: number, season: number, since?: Date): Promise<any[]> {
        // Mock fixture get
        return [];
    }

    // Catalog Management
    async syncCatalogCountries(): Promise<SyncResult> {
        return { data: [], stats: { processedCount: 0, apiCallsCount: 0 } };
    }
    async syncCatalogLeagues(): Promise<SyncResult> {
        return { data: [], stats: { processedCount: 0, apiCallsCount: 0 } };
    }
    async getCatalogCountries(): Promise<any[]> {
        return [];
    }
    async getCatalogLeagues(countryId: string): Promise<any[]> {
        return [];
    }
    async promoteLeague(catalogLeagueId: string): Promise<any> {
        return null;
    }
}
