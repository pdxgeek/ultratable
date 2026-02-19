import { db } from './dao/schema';
import { ApiFootballProvider } from './integrations/apiFootball';
import { MockProvider } from './integrations/mock';
import type { DataProvider } from './integrations/types';
import type { LeagueConfig, Team, Fixture, StandingsRow, ApiEvent, MatchLineup, IntegrationName } from '../types';
import { database } from './db';

// Integration Registry
const apiProvider = new ApiFootballProvider();
const mockProvider = new MockProvider();

const providerRegistry: Record<IntegrationName, DataProvider> = {
    'api-football': apiProvider,
    'mock-scifi': mockProvider,
    'mock-fantasy': mockProvider,
};

// ─── API Key Utilities ──────────────────────────────────────────────────────

export function hasApiKey(): boolean {
    // This is synchronous for the UI, but ideally would check if a key exists in localStorage/DB
    // For now, check localStorage as a proxy or just return true if it exists there
    return !!localStorage.getItem('ultratable_api_key');
}

export async function setApiKey(key: string): Promise<void> {
    localStorage.setItem('ultratable_api_key', key);
}

function getProvider(league: Partial<LeagueConfig>, type: keyof LeagueConfig['integrations']): DataProvider {
    const providerName = league.integrations?.[type];
    return (providerName && providerRegistry[providerName]) || apiProvider;
}

// ─── Domain Store Persistence Helpers ────────────────────────────────────────

// ─── Domain Store Persistence Helpers ────────────────────────────────────────

// Replaced with calls to database service in db.ts to handle metadata consistency

// ─── Internal Helper ────────────────────────────────────────────────────────

async function resolveToRemoteId(type: 'team' | 'fixture' | 'player' | 'league' | 'league_season', id: string, providerName: string): Promise<string> {
    // 1. If it's a prefixed legacy ID, extract the terminal part
    if (id.includes(':')) {
        return id.split(':').pop() || id;
    }

    // 2. Try to resolve as NanoID via Domain Store (database)
    const resolved = await database.getExternalId(type, id, providerName);
    if (resolved) return resolved;

    // 3. Fallback: assume it's already a raw remote ID
    return id;
}

// ─── Public Facade (Context Bound) ──────────────────────────────────────────

// Helper to resolve league ID from various sources
async function resolveLeagueId(league: { id: string | number, integrations: any, externalReferences?: any[] }): Promise<string | number> {
    let leagueId = league.id;
    const providerName = league.integrations?.basicTeamInfo;

    if (typeof leagueId === 'string' && providerName === 'api-football') {
        const ref = league.externalReferences?.find(r => r.integrationName === 'api-football');
        console.log(`[apiFootball] Resolving leagueId: ${leagueId}. Found ref:`, ref);
        if (ref) return parseInt(ref.remoteId, 10);

        const mappedId = await resolveToRemoteId('league', leagueId, 'api-football');
        console.log(`[apiFootball] resolveToRemoteId 'league' returned: ${mappedId}`);
        if (mappedId && mappedId !== leagueId) return parseInt(mappedId, 10);

        const seasonId = await resolveToRemoteId('league_season', leagueId, 'api-football');
        console.log(`[apiFootball] resolveToRemoteId 'league_season' returned: ${seasonId}`);
        if (seasonId && seasonId !== leagueId) return parseInt(seasonId, 10);
    }

    console.log(`[apiFootball] resolveLeagueId returning final: ${leagueId}`);
    return leagueId;
}

export async function fetchTeams(league: { id: string | number, season: number, integrations: any, externalReferences?: any[] }, options?: { forceRefresh?: boolean }): Promise<Team[]> {
    const provider = getProvider(league as any, 'basicTeamInfo');

    // 1. Resolve to the numeric ID required by the API provider
    const apiLeagueId = await resolveLeagueId(league);

    // 2. Resolve the Internal Season NanoID for domain caching
    const internalSeasonId = await database.getInternalSeasonId(String(league.id), league.season);
    console.log(`[apiFootball] Fetching teams for API League ID: ${apiLeagueId}, Season: ${league.season} (Internal: ${internalSeasonId})`);

    // 3. Fetch and map to internal Team entities
    const teams = await provider.getTeams(apiLeagueId as any, league.season, options);
    if (!teams) return [];

    if (internalSeasonId) {
        await database.saveTeams(internalSeasonId, teams);
        console.log(`[apiFootball] Linking ${teams.length} teams to Season NanoID: ${internalSeasonId}`);
        await database.updateSeasonTeams(internalSeasonId, teams.map(t => t.id));
    } else {
        console.warn(`[apiFootball] Could not resolve internal season ID for team storage: ${league.id} / ${league.season}`);
    }

    return teams;
}

export async function fetchFixtures(league: { id: string | number, season: number, integrations: any, externalReferences?: any[] }, options?: { forceRefresh?: boolean }): Promise<Fixture[]> {
    const provider = getProvider(league as any, 'fixtures');
    const leagueId = await resolveLeagueId(league);
    console.log(`[apiFootball] fetchFixtures: Resolved leagueId=${leagueId}, season=${league.season}`);

    const fixtures = await provider.getFixtures(leagueId as any, league.season, options);
    console.log(`[apiFootball] Provider returned ${fixtures?.length || 0} fixtures`);

    if (!fixtures || fixtures.length === 0) {
        console.warn(`[apiFootball] NO FIXTURES RETURNED for leagueId=${leagueId}, season=${league.season}`);
        return [];
    }

    const internalSeasonId = await database.getInternalSeasonId(String(league.id), league.season);
    if (internalSeasonId) {
        await database.saveFixtures(internalSeasonId, fixtures);
    }

    // Trigger smart refresh check for overdue fixtures
    import('./smartRefresh').then(({ smartRefresh }) => {
        smartRefresh.checkLeague(league as any, league.season);
    }).catch(console.warn);

    return fixtures;
}

export async function fetchStandings(league: { id: string | number, season: number, integrations: any, externalReferences?: any[] }, options?: { forceRefresh?: boolean }): Promise<StandingsRow[]> {
    const provider = getProvider(league as any, 'standings');
    const leagueId = await resolveLeagueId(league);

    return provider.getStandings(leagueId as any, league.season, options);
}

export async function fetchFixtureDetails(league: LeagueConfig, fixtureId: string, options?: { forceRefresh?: boolean }): Promise<Fixture> {
    // 1. Check Domain Store first (for NanoID stability & offline support)
    if (!options?.forceRefresh) {
        const local = await db.fixtures.get(fixtureId);
        if (local && local.data) return local.data;
    }

    // 2. Resolve to raw remote ID
    const remoteId = await resolveToRemoteId('fixture', fixtureId, 'api-football');

    // 3. Fetch from provider
    const provider = getProvider(league, 'fixtures');
    const fixture = await provider.getFixtureDetails(remoteId, options);
    if (fixture) {
        const internalSeasonId = await database.getInternalSeasonId(String(league.id), league.season);
        if (internalSeasonId) {
            await database.saveFixtures(internalSeasonId, [fixture]);
        }
    }
    return fixture as Fixture; // We know it's Fixture or caller will handle null if we changed type, but for now cast to match signature if we must, or better: change signature to return null.
}

export async function fetchEvents(league: LeagueConfig, fixtureId: string, options?: { forceRefresh?: boolean }): Promise<ApiEvent[]> {
    if (!league || !fixtureId) return [];

    // 1. Resolve to raw remote ID
    const remoteIdStr = await resolveToRemoteId('fixture', fixtureId, 'api-football');
    const remoteId = parseInt(remoteIdStr, 10);

    if (isNaN(remoteId) && !league.integrations.fixtures.startsWith('mock-')) {
        console.warn('Invalid fixtureId for real provider in fetchEvents:', fixtureId, 'resolved to:', remoteIdStr);
        return [];
    }

    const provider = getProvider(league, 'fixtures');
    return provider.getEvents(remoteId, options);
}

export async function fetchLineups(league: LeagueConfig, fixtureId: string, options?: { forceRefresh?: boolean }): Promise<MatchLineup[]> {
    if (!league || !fixtureId) return [];

    // 1. Resolve to raw remote ID
    const remoteId = await resolveToRemoteId('fixture', fixtureId, 'api-football');

    const provider = getProvider(league, 'roster');
    const lineups = await provider.getLineups(remoteId, options);

    // Extract players for persistence
    const players: any[] = [];
    lineups.forEach(l => {
        l.startXI.forEach(p => players.push(p.player));
        l.substitutes.forEach(p => players.push(p.player));
    });
    if (players.length > 0) await database.savePlayerData(0, players[0]); // Placeholder for bulk player save

    return lineups;
}

export async function checkQuota() {
    // Check if the current provider has a quota check method
    // For api-football, we can implement it in the provider
    return (apiProvider as any).getQuota ? { current: 0, limit: 100 } : null;
}
