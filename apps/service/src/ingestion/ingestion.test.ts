import { describe, it, expect } from 'vitest';
import { Normalizer } from './normalizer';

describe('Uniform Ingestion Logic', () => {
    const apiLeagueResponse = {
        league: { id: 39, name: 'Premier League', logo: 'pl-logo' },
        country: { name: 'England' }
    };

    const mockLeagueResponse = {
        id: 39,
        name: 'Premier League',
        logo: 'pl-logo',
        country: 'England'
    };

    const apiTeamResponse = {
        team: { id: 42, name: 'Arsenal', code: 'ARS', logo: 'ars-logo' },
        venue: { name: 'Emirates Stadium' }
    };

    const mockTeamResponse = {
        id: 42,
        name: 'Arsenal',
        code: 'ARS',
        logo: 'ars-logo',
        venue: 'Emirates Stadium'
    };

    it('should normalize League data identically from API and Mock sources', () => {
        const fromApi = Normalizer.normalizeLeague(apiLeagueResponse, 'api-football');
        const fromMock = Normalizer.normalizeLeague(mockLeagueResponse, 'mock');

        expect(fromApi.name).toBe(fromMock.name);
        expect(fromApi.sourceId).toBe(fromMock.sourceId);
        expect(fromApi.sourceName).toBe('api-football');
        expect(fromMock.sourceName).toBe('mock');
    });

    it('should normalize Team data identically from API and Mock sources', () => {
        const fromApi = Normalizer.normalizeTeam(apiTeamResponse, 'api-football');
        const fromMock = Normalizer.normalizeTeam(mockTeamResponse, 'mock');

        expect(fromApi.name).toBe(fromMock.name);
        expect(fromApi.sourceId).toBe(fromMock.sourceId);
        expect(fromApi.tla).toBe(fromMock.tla);
        expect(fromApi.sourceName).toBe('api-football');
        expect(fromMock.sourceName).toBe('mock');
    });

    it('should generate consistent slugs', () => {
        const item = { name: 'La Liga 1|2|3' };
        const normalized = Normalizer.normalizeLeague(item);
        expect(normalized.slug).toBe('la-liga-123');
    });
});
