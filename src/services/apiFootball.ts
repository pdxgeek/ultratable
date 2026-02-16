import { LEAGUES, API_KEY, BASE_URL } from '../config';
import type { Team, Fixture, StandingsRow, MatchLineup, ApiEvent, ApiFixture, LeagueConfig } from '../types';


import { ApiFootballProvider } from './integrations/apiFootball';
import { MockProvider } from './integrations/mock';
import type { DataProvider } from './integrations/types';
import { getApiKey } from './api/client';

export { hasApiKey, getApiKey, setApiKey } from './api/client';

// ─── Provider Registry ─────────────────────────────────────────────────

const apiProvider = new ApiFootballProvider();
const mockProvider = new MockProvider();

const providerRegistry: Record<string, DataProvider> = {
    'api-football': apiProvider,
    'mock-scifi': mockProvider,
    'mock-fantasy': mockProvider,
    'mock': mockProvider,
};

function getProvider(leagueOrId: number | LeagueConfig, capability: keyof typeof LEAGUES[number]['integrations']): DataProvider {
    let config: LeagueConfig | undefined;

    if (typeof leagueOrId === 'number') {
        config = LEAGUES[leagueOrId];
    } else {
        config = leagueOrId;
    }

    if (!config) return apiProvider; // Default

    const type = config.integrations?.[capability] || 'api-football';
    return providerRegistry[type] || apiProvider;
}


// Get provider from integrationId (format: "provider:id")
function getProviderFromIntegrationId(integrationId: string): DataProvider {
    const provider = integrationId.split(':')[0];
    return providerRegistry[provider] || apiProvider;
}

// ─── Data Service Methods ──────────────────────────────────────────────

export async function fetchTeams(
    league: LeagueConfig | { id: number; season: number }
): Promise<Team[]> {
    const config = 'integrations' in league ? (league as LeagueConfig) : LEAGUES[league.id];
    // Fallback if looking up by ID fails (though it shouldn't for defaults)
    const provider = getProvider(config || league.id, 'basicTeamInfo');
    return provider.getTeams(league.id, league.season);
}


export async function fetchStandings(
    league: LeagueConfig | { id: number; season: number }
): Promise<StandingsRow[]> {
    const config = 'integrations' in league ? (league as LeagueConfig) : LEAGUES[league.id];
    const provider = getProvider(config || league.id, 'standings');
    return provider.getStandings(league.id, league.season);
}


export async function fetchFixtures(
    league: LeagueConfig | { id: number; season: number }
): Promise<Fixture[]> {
    const config = 'integrations' in league ? (league as LeagueConfig) : LEAGUES[league.id];
    const provider = getProvider(config || league.id, 'fixtures');
    return provider.getFixtures(league.id, league.season);
}


export async function fetchEvents(
    fixtureId: string | number
): Promise<ApiEvent[]> {
    // If integrationId format (provider:id), use it to get provider
    const idStr = fixtureId.toString();
    const provider = idStr.includes(':')
        ? getProviderFromIntegrationId(idStr)
        : apiProvider; // Fallback for legacy numeric IDs

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
    // Determine provider from integrationId
    const provider = fixtureId.includes(':')
        ? getProviderFromIntegrationId(fixtureId)
        : apiProvider;
    return provider.getLineups(fixtureId);
}

export async function fetchFixtureDetails(
    fixtureId: string
): Promise<Fixture> {
    // Determine provider from integrationId
    const provider = fixtureId.includes(':')
        ? getProviderFromIntegrationId(fixtureId)
        : apiProvider;
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
