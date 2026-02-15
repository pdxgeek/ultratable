import { LEAGUES } from '../config';
import type { LeagueConfig } from '../types';

const STORAGE_KEY = 'ultratable_custom_leagues_v2';

export function getLeagues(): Record<string, LeagueConfig> {
    const custom = loadCustomLeagues();
    // Convert hardcoded LEAGUES to string keys
    const hardcoded: Record<string, LeagueConfig> = {};
    Object.values(LEAGUES).forEach(l => {
        hardcoded[`${l.id}_${l.season}`] = l;
    });
    return { ...hardcoded, ...custom };
}

export function addCustomLeague(config: LeagueConfig): void {
    const custom = loadCustomLeagues();
    const key = `${config.id}_${config.season}`;
    custom[key] = config;
    saveCustomLeagues(custom);
}

export function removeCustomLeague(key: string): void {
    const custom = loadCustomLeagues();
    delete custom[key];
    saveCustomLeagues(custom);
}

function loadCustomLeagues(): Record<string, LeagueConfig> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        return JSON.parse(raw);
    } catch (e) {
        console.error('Failed to load custom leagues', e);
        return {};
    }
}

function saveCustomLeagues(leagues: Record<string, LeagueConfig>): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(leagues));
    } catch (e) {
        console.error('Failed to save custom leagues', e);
    }
}
