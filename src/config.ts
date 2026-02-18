import type { LeagueConfig } from './types';

// ─── API Config ────────────────────────────────────────────────────────
const getStorageItem = (key: string) => {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
};

export const API_KEY = getStorageItem('ultratable_api_key') || '';
// Use proxy in development to avoid CORS issues
export const BASE_URL = import.meta.env.DEV
    ? '/api/football'
    : 'https://v3.football.api-sports.io';

// ─── League Configuration ──────────────────────────────────────────────

export const LEAGUES: Record<number, LeagueConfig> = {
    // ─── Mock Leagues ────────────────────────────────────────────────────────
    9999: {
        id: 9999,
        name: 'Galactic Premier League',
        season: 2050,
        matchesPerSeason: 38,
        rules: {
            promotionSlots: 4,
            playoffStart: 0,
            playoffEnd: 0,
            relegationStart: 18,
            pointsForWin: 3,
            pointsForDraw: 1,
            pointsForLoss: 0,
        },
        integrations: {
            fixtures: 'mock-scifi',
            standings: 'mock-scifi',
            basicTeamInfo: 'mock-scifi',
            roster: 'mock-scifi',
            playerStats: 'mock-scifi',
            teamStats: 'mock-scifi',
            teamLogos: 'mock-scifi',
            playerPhotos: 'mock-scifi',
        }
    },
    8888: {
        id: 8888,
        name: 'Dungeons & Dragons League',
        season: 1250,
        matchesPerSeason: 24,
        rules: {
            promotionSlots: 1,
            playoffStart: 2,
            playoffEnd: 5,
            relegationStart: 11,
            pointsForWin: 2,
            pointsForDraw: 1,
            pointsForLoss: 0,
        },
        integrations: {
            fixtures: 'mock-fantasy',
            standings: 'mock-fantasy',
            basicTeamInfo: 'mock-fantasy',
            roster: 'mock-fantasy',
            playerStats: 'mock-fantasy',
            teamStats: 'mock-fantasy',
            teamLogos: 'mock-fantasy',
            playerPhotos: 'mock-fantasy',
        }
    },
};
