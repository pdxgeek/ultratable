import { describe, it, expect } from 'vitest';
import { getMockFixtures, getMockTeams } from '../services/mockData';

describe('Mock Data Generator', () => {
    it('generates 20 mock teams', async () => {
        const teams = await getMockTeams();
        expect(teams).toHaveLength(20);
    });

    it('generates fixtures for a full season (380 matches)', async () => {
        const fixtures = await getMockFixtures();
        // 20 teams * 38 rounds / 2 games per match = 380
        expect(fixtures).toHaveLength(380);
    });

    it('fixtures have valid ISO dates', async () => {
        const fixtures = await getMockFixtures();
        const first = fixtures[0];
        expect(first.fixture.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });
});
