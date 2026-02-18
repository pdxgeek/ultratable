import { db } from './dao/schema';
import type { TeamRecord, FixtureRecord, PlayerRecord } from './dao/schema';
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

async function saveTeams(teams: Team[]) {
    const records: TeamRecord[] = teams.map(t => ({
        id: t.id,
        referenceKeys: t.externalReferences.map(r => `${r.integrationName}:team:${r.remoteId}`),
        data: t,
        updatedAt: Date.now()
    }));
    await db.teams.bulkPut(records);
}

async function saveFixtures(fixtures: Fixture[]) {
    const records: FixtureRecord[] = fixtures.map(f => ({
        id: f.id,
        referenceKeys: f.externalReferences.map(r => `${r.integrationName}:fixture:${r.remoteId}`),
        data: f,
        updatedAt: Date.now()
    }));
    await db.fixtures.bulkPut(records);
}

async function savePlayers(players: any[]) {
    // players can be from lineups, etc.
    const records: PlayerRecord[] = players.map(p => ({
        id: p.id,
        referenceKeys: p.externalReferences.map((r: any) => `${r.integrationName}:player:${r.remoteId}`),
        data: p,
        updatedAt: Date.now()
    }));
    await db.players.bulkPut(records);
}

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
        // 1. Try passed externalReferences (most direct)
        const ref = league.externalReferences?.find(r => r.integrationName === 'api-football');
        if (ref) return parseInt(ref.remoteId, 10);

        // 2. Try idMap fallback for "robust mapping" consistency
        const mappedId = await resolveToRemoteId('league', leagueId, 'api-football');
        if (mappedId && mappedId !== leagueId) return parseInt(mappedId, 10);

        // 3. If ID is likely a season ID disguised as a league ID (common in hierarchical model)
        const seasonId = await resolveToRemoteId('league_season', leagueId, 'api-football');
        if (seasonId && seasonId !== leagueId) return parseInt(seasonId, 10);
    }

    return leagueId;
}

export async function fetchTeams(league: { id: string | number, season: number, integrations: any, externalReferences?: any[] }): Promise<Team[]> {
    const provider = getProvider(league as any, 'basicTeamInfo');

    // 1. Resolve to the numeric ID required by the API provider
    const apiLeagueId = await resolveLeagueId(league);
    console.log(`[apiFootball] Fetching teams for API League ID: ${apiLeagueId}, Season: ${league.season}`);

    // 2. Fetch and map to internal Team entities (which get NanoIDs)
    const teams = await provider.getTeams(apiLeagueId as any, league.season);
    await saveTeams(teams);

    // 3. Link teams to the internal LeagueSeason record
    // We try to find the season record using the ID passed in (which might be a League NanoID or Season NanoID)
    const leagueIdStr = String(league.id);
    let targetSeasonNanoId: string | null = null;

    // Try finding by (League NanoID + Season Number)
    const seasonRecord = await database.getLeagueSeason(leagueIdStr, league.season);
    if (seasonRecord) {
        targetSeasonNanoId = seasonRecord.id;
    } else {
        // If not found, check if league.id was already the Season NanoID
        const directSeason = await database.getLeagueSeasonById(leagueIdStr);
        if (directSeason) targetSeasonNanoId = directSeason.id;
    }

    if (targetSeasonNanoId) {
        console.log(`[apiFootball] Linking ${teams.length} teams to Season NanoID: ${targetSeasonNanoId}`);
        await database.updateSeasonTeams(targetSeasonNanoId, teams.map(t => t.id));
    } else {
        console.warn(`[apiFootball] Could not find internal season record to link teams for: ${leagueIdStr} / ${league.season}`);
    }

    return teams;
}

export async function fetchFixtures(league: { id: string | number, season: number, integrations: any, externalReferences?: any[] }): Promise<Fixture[]> {
    const provider = getProvider(league as any, 'fixtures');
    const leagueId = await resolveLeagueId(league);

    const fixtures = await provider.getFixtures(leagueId as any, league.season);
    await saveFixtures(fixtures);
    return fixtures;
}

export async function fetchStandings(league: { id: string | number, season: number, integrations: any, externalReferences?: any[] }): Promise<StandingsRow[]> {
    const provider = getProvider(league as any, 'standings');
    const leagueId = await resolveLeagueId(league);

    return provider.getStandings(leagueId as any, league.season);
}

export async function fetchFixtureDetails(league: LeagueConfig, fixtureId: string): Promise<Fixture> {
    // 1. Check Domain Store first (for NanoID stability & offline support)
    const local = await db.fixtures.get(fixtureId);
    if (local && local.data) return local.data;

    // 2. Resolve to raw remote ID
    const remoteId = await resolveToRemoteId('fixture', fixtureId, 'api-football');

    // 3. Fetch from provider
    const provider = getProvider(league, 'fixtures');
    const fixture = await provider.getFixtureDetails(remoteId);
    await saveFixtures([fixture]);
    return fixture;
}

export async function fetchEvents(league: LeagueConfig, fixtureId: string): Promise<ApiEvent[]> {
    if (!league || !fixtureId) return [];

    // 1. Resolve to raw remote ID
    const remoteIdStr = await resolveToRemoteId('fixture', fixtureId, 'api-football');
    const remoteId = parseInt(remoteIdStr, 10);

    if (isNaN(remoteId) && !league.integrations.fixtures.startsWith('mock-')) {
        console.warn('Invalid fixtureId for real provider in fetchEvents:', fixtureId, 'resolved to:', remoteIdStr);
        return [];
    }

    const provider = getProvider(league, 'fixtures');
    return provider.getEvents(remoteId);
}

export async function fetchLineups(league: LeagueConfig, fixtureId: string): Promise<MatchLineup[]> {
    if (!league || !fixtureId) return [];

    // 1. Resolve to raw remote ID
    const remoteId = await resolveToRemoteId('fixture', fixtureId, 'api-football');

    const provider = getProvider(league, 'roster');
    const lineups = await provider.getLineups(remoteId);

    // Extract players for persistence
    const players: any[] = [];
    lineups.forEach(l => {
        l.startXI.forEach(p => players.push(p.player));
        l.substitutes.forEach(p => players.push(p.player));
    });
    if (players.length > 0) await savePlayers(players);

    return lineups;
}

export async function checkQuota() {
    // Check if the current provider has a quota check method
    // For api-football, we can implement it in the provider
    return (apiProvider as any).getQuota ? { current: 0, limit: 100 } : null;
}
