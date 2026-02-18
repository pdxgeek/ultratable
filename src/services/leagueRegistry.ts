import { LEAGUES } from '../config';
import type { League, LeagueSeason, LeagueConfig } from '../types';
import { database } from './db';

const INITIALIZED_KEY_V2 = 'ultratable_leagues_initialized_v2';

export async function fetchLeaguesHierarchical(): Promise<League[]> {
    // Check if we need to seed data
    const isInitialized = localStorage.getItem(INITIALIZED_KEY_V2);

    if (!isInitialized) {
        await seedInitialData();
        localStorage.setItem(INITIALIZED_KEY_V2, 'true');
    }

    return database.getAllLeaguesV2();
}

async function seedInitialData() {
    // 1. Map old LEAGUES config to new hierarchy
    const configs = Object.values(LEAGUES);

    // Group by common name to identify "Leagues"
    const leagueMap = new Map<string, LeagueConfig[]>();
    for (const c of configs) {
        if (!leagueMap.has(c.name)) leagueMap.set(c.name, []);
        leagueMap.get(c.name)!.push(c);
    }

    for (const [name, seasons] of leagueMap.entries()) {
        const first = seasons[0];
        // Use a stable ID for seeded leagues
        const leagueId = `seeded-${name.toLowerCase().replace(/\s+/g, '-')}`;

        const league: League = {
            id: leagueId,
            commonName: name,
            logo: name.includes('Galactic') ? '/assets/leagues/gpl_logo.png' :
                name.includes('Dungeons') ? '/assets/leagues/dnd_logo.png' : null,
            banner: name.includes('Galactic') ? '/assets/leagues/gpl_banner.png' :
                name.includes('Dungeons') ? '/assets/leagues/dnd_banner.png' : null,
            externalReferences: [{ integrationName: 'api-football', remoteId: String(first.id) }],
            integrations: first.integrations,
            rules: first.rules,
            rankingCriteria: ['points', 'goalDiff', 'wins'], // Default criteria
            lastRefreshed: new Date().toISOString()
        };

        await database.saveLeagueV2(league);

        for (const s of seasons) {
            const leagueSeason: LeagueSeason = {
                id: `${leagueId}-${s.season}`,
                leagueId: leagueId,
                commonName: `${name} ${s.season}`,
                season: s.season,
                matchesPerSeason: s.matchesPerSeason,
                externalReferences: [{ integrationName: 'api-football', remoteId: String(s.id) }],
                lastRefreshed: new Date().toISOString()
            };
            await database.saveLeagueSeason(leagueSeason);
        }
    }
}

export async function addCustomLeague(league: League): Promise<void> {
    await database.saveLeagueV2(league);
}

export async function addCustomSeason(season: LeagueSeason): Promise<void> {
    await database.saveLeagueSeason(season);
}

export async function removeCustomLeague(id: string): Promise<void> {
    await database.deleteLeagueV2(id);
}

export async function removeCustomSeason(id: string): Promise<void> {
    await database.deleteLeagueSeason(id);
}

/**
 * @deprecated Use fetchLeaguesHierarchical() instead.
 */
export async function fetchLeagues(): Promise<Record<string, LeagueConfig>> {
    const leagues = await database.getAllLeaguesV2();
    const result: Record<string, LeagueConfig> = {};

    for (const l of leagues) {
        const seasons = await database.getSeasonsForLeague(l.id);
        for (const s of seasons) {
            // Reconstruct legacy config for compatibility
            const key = `${l.externalReferences[0]?.remoteId || 0}_${s.season}`;
            result[key] = {
                id: parseInt(l.externalReferences[0]?.remoteId || '0'),
                name: l.commonName,
                season: s.season,
                matchesPerSeason: s.matchesPerSeason,
                rules: { ...l.rules, ...(s.rules || {}) },
                integrations: l.integrations
            };
        }
    }
    return result;
}

export async function resetLeaguesToDefault(): Promise<void> {
    // Clear all new tables
    await database.clearAllCache(); // Simplest way to reset for now
    localStorage.removeItem(INITIALIZED_KEY_V2);
    await fetchLeaguesHierarchical();
}
