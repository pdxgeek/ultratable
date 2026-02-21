import { getProvider, providerRegistry } from './integrations';
import type { LeagueConfig, Team, Fixture, StandingsRow, ApiEvent, MatchLineup } from '../types';
import { database } from './db';
import { db } from './dao/schema';
import { scheduleManager } from './scheduleManager';

// ─── API Key Utilities ──────────────────────────────────────────────────────

export function hasApiKey(): boolean {
    return !!localStorage.getItem('ultratable_api_key');
}

export async function setApiKey(key: string): Promise<void> {
    localStorage.setItem('ultratable_api_key', key);
}

// ─── Domain Store Persistence Helpers ────────────────────────────────────────

// Replaced with calls to database service in db.ts to handle metadata consistency

// ─── Internal Helper ────────────────────────────────────────────────────────

async function resolveToRemoteId(type: 'team' | 'fixture' | 'player' | 'league' | 'league_season', id: string, providerName: string): Promise<string> {
    if (id.includes(':')) {
        return id.split(':').pop() || id;
    }

    const resolved = await database.getExternalId(type, id, providerName);
    if (resolved) return resolved;

    return id;
}

// ─── Public Facade (Context Bound) ──────────────────────────────────────────

async function resolveLeagueId(league: { id: string | number, integrations: any, externalReferences?: any[] }): Promise<string | number> {
    let leagueId = league.id;
    const providerName = league.integrations?.basicTeamInfo;

    if (typeof leagueId === 'string' && providerName === 'api-football') {
        const ref = league.externalReferences?.find(r => r.integrationName === 'api-football');
        if (ref) return parseInt(ref.remoteId, 10);

        const mappedId = await resolveToRemoteId('league', leagueId, 'api-football');
        if (mappedId && mappedId !== leagueId) return parseInt(mappedId, 10);

        const seasonId = await resolveToRemoteId('league_season', leagueId, 'api-football');
        if (seasonId && seasonId !== leagueId) return parseInt(seasonId, 10);
    }

    return leagueId;
}

export async function fetchTeams(league: { id: string | number, season: number, integrations: any, externalReferences?: any[] }, options?: { forceRefresh?: boolean }): Promise<Team[]> {
    const provider = getProvider(league as any, 'basicTeamInfo');
    const apiLeagueId = await resolveLeagueId(league);
    const internalSeasonId = await database.getInternalSeasonId(String(league.id), league.season);

    const teams = await provider.getTeams(apiLeagueId as any, league.season, options);
    if (!teams) return [];

    if (internalSeasonId) {
        await database.saveTeams(internalSeasonId, teams);
        await database.updateSeasonTeams(internalSeasonId, teams.map(t => t.id));

        // Ensure schedule skeleton exists for this season
        const seasonRecord = await database.getLeagueSeasonById(internalSeasonId);
        if (seasonRecord) {
            await scheduleManager.ensureScheduleSkeleton(
                internalSeasonId,
                teams.map(t => t.id),
                seasonRecord.matchesPerSeason || 38 // Fallback to 38 if mission
            );
        }
    }

    return teams;
}

export async function fetchFixtures(league: { id: string | number, season: number, integrations: any, externalReferences?: any[] }, options?: { forceRefresh?: boolean }): Promise<Fixture[]> {
    const provider = getProvider(league as any, 'fixtures');
    const leagueId = await resolveLeagueId(league);

    const fixtures = await provider.getFixtures(leagueId as any, league.season, options);

    if (!fixtures || fixtures.length === 0) {
        return [];
    }

    const internalSeasonId = await database.getInternalSeasonId(String(league.id), league.season);
    if (internalSeasonId) {
        await database.saveFixtures(internalSeasonId, fixtures);
        // Ensure associations are synced
        await scheduleManager.syncScheduleFromFixtures(internalSeasonId, fixtures);
    }

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
    if (!options?.forceRefresh) {
        const local = await db.fixtures.get(fixtureId);
        if (local && local.data) return local.data;
    }

    const remoteId = await resolveToRemoteId('fixture', fixtureId, 'api-football');
    const provider = getProvider(league, 'fixtures');
    const fixture = await provider.getFixtureDetails(remoteId, options);
    if (fixture) {
        const internalSeasonId = await database.getInternalSeasonId(String(league.id), league.season);
        if (internalSeasonId) {
            await database.saveFixtures(internalSeasonId, [fixture]);
        }
    }
    return fixture as Fixture;
}

export async function fetchEvents(league: LeagueConfig, fixtureId: string, options?: { forceRefresh?: boolean }): Promise<ApiEvent[]> {
    if (!league || !fixtureId) return [];

    const remoteIdStr = await resolveToRemoteId('fixture', fixtureId, 'api-football');
    const remoteId = parseInt(remoteIdStr, 10);

    if (isNaN(remoteId) && !league.integrations.fixtures.startsWith('mock-')) {
        return [];
    }

    const provider = getProvider(league, 'fixtures');
    return provider.getEvents(remoteId, options);
}

export async function fetchLineups(league: LeagueConfig, fixtureId: string, options?: { forceRefresh?: boolean }): Promise<MatchLineup[]> {
    if (!league || !fixtureId) return [];

    const remoteId = await resolveToRemoteId('fixture', fixtureId, 'api-football');
    const provider = getProvider(league, 'roster');
    const lineups = await provider.getLineups(remoteId, options);

    for (const l of lineups) {
        const squad = [...l.startXI, ...l.substitutes];
        for (const item of squad) {
            const p = item.player;
            const extRef = p.externalReferences?.find(r => r.integrationName === 'api-football');
            if (extRef) {
                const extId = parseInt(extRef.remoteId, 10);
                // Mappings should be created before photo registration
                await database.saveInternalId('api-football', 'player', extId, p.id);
                await database.savePlayer('api-football', extId, p);

                if (p.photo) {
                    const { registerPlayerPhoto } = await import('./playerData');
                    registerPlayerPhoto(extId, p.commonName, p.photo).catch(() => { });
                }
            }
        }
    }

    return lineups;
}

export async function fetchTeamDetails(league: LeagueConfig, teamId: string, options?: { forceRefresh?: boolean }): Promise<{ team: Team; coach: any; squad: any[] }> {
    const provider = getProvider(league, 'basicTeamInfo');
    const remoteId = await resolveToRemoteId('team', teamId, 'api-football');

    const details = await provider.getTeamDetails(remoteId, options);

    await database.saveTeams(teamId, [details.team]);

    if (details.coach) {
        await database.saveCoaches([details.coach]);
        if (details.coach.photo) {
            const { registerPlayerPhoto } = await import('./playerData');
            const coachExtId = details.coach.externalReferences?.[0]?.remoteId;
            if (coachExtId) {
                registerPlayerPhoto(parseInt(coachExtId, 10), details.coach.name, details.coach.photo).catch(() => { });
            }
        }
    }

    for (const p of details.squad) {
        const extRef = p.externalReferences?.find((r: any) => r.integrationName === 'api-football');
        if (extRef) {
            const extId = parseInt(extRef.remoteId, 10);
            await database.savePlayer('api-football', extId, p);

            if (p.photo) {
                const { registerPlayerPhoto } = await import('./playerData');
                registerPlayerPhoto(extId, p.commonName, p.photo).catch(() => { });
            }
        }
    }

    return details;
}

export async function checkQuota() {
    const apiProvider = providerRegistry['api-football'];
    return (apiProvider as any).getQuota ? (apiProvider as any).getQuota() : null;
}
