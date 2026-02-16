import { LEAGUES } from '../config';
import type { LeagueConfig } from '../types';
import { database } from './db';

const INITIALIZED_KEY = 'ultratable_leagues_initialized_v1';

export async function fetchLeagues(): Promise<Record<string, LeagueConfig>> {
    // Check if we need to seed data
    const isInitialized = localStorage.getItem(INITIALIZED_KEY);

    if (!isInitialized) {
        // Seed defaults
        const defaults = Object.values(LEAGUES);
        for (const l of defaults) {
            await database.saveLeague(l);
        }
        localStorage.setItem(INITIALIZED_KEY, 'true');
    }

    return database.getAllLeagues();
}

/**
 * @deprecated Use fetchLeagues() instead. Kept for temporary compatibility if needed, but should be removed.
 */
export function getLeagues(): Record<string, LeagueConfig> {
    console.warn('getLeagues() is deprecated. Use fetchLeagues()');
    return {};
}

export async function addCustomLeague(config: LeagueConfig): Promise<void> {
    await database.saveLeague(config);
}

export async function removeCustomLeague(config: LeagueConfig): Promise<void> {
    await database.deleteLeague(config.id, config.season);
}

// Helper to reset to defaults (useful for debugging/recovery)
export async function resetLeaguesToDefault(): Promise<void> {
    // Clear all leagues
    const current = await database.getAllLeagues();
    for (const key of Object.keys(current)) {
        const l = current[key];
        await database.deleteLeague(l.id, l.season);
    }

    localStorage.removeItem(INITIALIZED_KEY);
    // Fetch will re-seed
    await fetchLeagues();
}
