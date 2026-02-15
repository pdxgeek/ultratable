import { LEAGUES, API_KEY, BASE_URL } from '../config';
import type { Team, Fixture, StandingsRow, MatchLineup, ApiEvent, ApiFixture } from '../types';

import { ApiFootballProvider } from './integrations/apiFootball';
import { MockProvider } from './integrations/mock';
import type { DataProvider } from './integrations/types';
import { getApiKey } from './api/client';

export { hasApiKey, getApiKey, setApiKey } from './api/client';

// ─── Provider Registry ─────────────────────────────────────────────────

const apiProvider = new ApiFootballProvider();
const mockProvider = new MockProvider();

function getProvider(leagueId: number, capability: keyof typeof LEAGUES[number]['integrations']): DataProvider {
    const config = LEAGUES[leagueId];
    if (!config) return apiProvider; // Default

    const type = config.integrations?.[capability] || 'api-football';
    if (type.startsWith('mock')) return mockProvider;
    return apiProvider;
}

// ─── Data Service Methods ──────────────────────────────────────────────

export async function fetchTeams(
    leagueId: number,
    season: number
): Promise<Team[]> {
    const provider = getProvider(leagueId, 'basicTeamInfo');
    return provider.getTeams(leagueId, season);
}

export async function fetchStandings(
    leagueId: number,
    season: number
): Promise<StandingsRow[]> {
    const provider = getProvider(leagueId, 'standings');
    return provider.getStandings(leagueId, season);
}

export async function fetchFixtures(
    leagueId: number,
    season: number
): Promise<Fixture[]> {
    const provider = getProvider(leagueId, 'fixtures');
    return provider.getFixtures(leagueId, season);
}

export async function fetchEvents(
    fixtureId: string | number
): Promise<ApiEvent[]> {
    const idStr = fixtureId.toString();
    const isMock = idStr.startsWith('mock') || (typeof fixtureId === 'number' && fixtureId > 80000000);
    const provider = isMock ? mockProvider : apiProvider;

    let numericId: number;
    if (typeof fixtureId === 'number') {
        numericId = fixtureId;
    } else {
        const parts = fixtureId.split(':');
        numericId = parseInt(parts.length > 1 ? parts.pop()! : fixtureId, 10);
    }

    return provider.getEvents(numericId);
}

export async function fetchLineups(
    fixtureId: string
): Promise<MatchLineup[]> {
    const isMock = fixtureId.startsWith('mock') || (parseInt(fixtureId.split(':').pop() || '0') > 80000000);
    const provider = isMock ? mockProvider : apiProvider;
    return provider.getLineups(fixtureId);
}

export async function fetchFixtureDetails(
    fixtureId: string
): Promise<Fixture> {
    const isMock = fixtureId.startsWith('mock') || (parseInt(fixtureId.split(':').pop() || '0') > 80000000);
    const provider = isMock ? mockProvider : apiProvider;
    return provider.getFixtureDetails(fixtureId);
}

// ─── Legacy / Utility ──────────────────────────────────────────────────

export async function checkQuota(): Promise<{
    current: number;
    limit: number;
} | null> {
    const { checkQuota } = await import('./api/client');
    return checkQuota();
}
