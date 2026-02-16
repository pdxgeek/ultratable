import { apiGet } from './api/client';
import { gfxRegistry } from './gfxRegistry';
import { quotaTrackers } from './quotaTracker';
import { generateId } from './idUtils';
import type { Graphic } from '../types';

// Quota tracker for API-Football player endpoint
const playerQuota = quotaTrackers['api-football-players'];

// API-Football player response structure
export interface ApiPlayerData {
    player: {
        id: number;
        name: string;
        firstname: string;
        lastname: string;
        age: number;
        birth: {
            date: string;
            place: string;
            country: string;
        };
        nationality: string;
        height: string;
        weight: string;
        injured: boolean;
        photo: string;
    };
    statistics: Array<{
        team: {
            id: number;
            name: string;
            logo: string;
        };
        league: {
            id: number;
            name: string;
            country: string;
            logo: string;
            flag: string;
            season: number;
        };
        games: {
            appearences: number;
            lineups: number;
            minutes: number;
            number: number | null;
            position: string;
            rating: string;
            captain: boolean;
        };
        // ... many more statistics fields
    }>;
}

// Export quota status for external use
export function getQuotaStatus(): { used: number; limit: number; remaining: number } {
    return playerQuota.getStatus();
}

// Player data cache (IndexedDB)
const DB_NAME = 'ultratable';
const PLAYER_STORE = 'players';
const DB_VERSION = 2; // Increment to add new store

async function openPlayerDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('logos')) {
                db.createObjectStore('logos');
            }
            if (!db.objectStoreNames.contains(PLAYER_STORE)) {
                db.createObjectStore(PLAYER_STORE);
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getCachedPlayerData(playerId: number): Promise<ApiPlayerData | null> {
    try {
        const db = await openPlayerDB();
        return new Promise((resolve) => {
            const tx = db.transaction(PLAYER_STORE, 'readonly');
            const store = tx.objectStore(PLAYER_STORE);
            const req = store.get(`player_${playerId}`);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    } catch {
        return null;
    }
}

async function cachePlayerData(playerId: number, data: ApiPlayerData): Promise<void> {
    try {
        const db = await openPlayerDB();
        return new Promise((resolve) => {
            const tx = db.transaction(PLAYER_STORE, 'readwrite');
            const store = tx.objectStore(PLAYER_STORE);
            store.put(data, `player_${playerId}`);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve(); // Silently fail
        });
    } catch {
        // Silently fail
    }
}

// Fetch player data with quota and caching
export async function fetchPlayerData(
    playerId: number,
    season: number,
    leagueId?: number
): Promise<ApiPlayerData | null> {
    // Check cache first
    const cached = await getCachedPlayerData(playerId);
    if (cached) {
        console.log('Player data cache hit:', playerId);

        // Ensure graphics are registered even when loading from cache
        if (cached.player.photo) {
            const associationId = `player:api-football:${playerId}`;
            const existingGraphicId = gfxRegistry.findId(associationId, 'player_photo');

            // Only register if not already in registry
            if (!existingGraphicId) {
                // Use deterministic ID so cache lookup works across sessions
                const graphicId = `player_photo_${playerId}`;
                const graphic: Graphic = {
                    id: graphicId,
                    type: 'player_photo',
                    associationId,
                    integrationId: `api-football:${playerId}`,
                    commonName: `${cached.player.name} Photo`,
                    sourceUrl: cached.player.photo,
                };
                await gfxRegistry.register(graphic);
                // Load from IndexedDB (blob should already be cached)
                gfxRegistry.loadById(graphic.id).catch(() => {});
            }
        }

        return cached;
    }

    // Check quota
    if (!playerQuota.increment()) {
        console.warn('Player photo quota exceeded, skipping fetch for player:', playerId);
        return null;
    }

    // Fetch from API
    try {
        const params: Record<string, any> = {
            id: playerId,
            season,
        };
        if (leagueId) {
            params.league = leagueId;
        }

        const response = await apiGet<ApiPlayerData[]>(
            'players',
            params,
            null, // Don't use general cache, we have our own
            false
        );

        if (!response || response.length === 0) {
            return null;
        }

        const playerData = response[0];

        // Cache the full data
        await cachePlayerData(playerId, playerData);

        // Register photo in graphics registry
        if (playerData.player.photo) {
            // Use deterministic ID so cache lookup works across sessions
            const graphicId = `player_photo_${playerId}`;
            const graphic: Graphic = {
                id: graphicId,
                type: 'player_photo',
                associationId: `player:api-football:${playerId}`,
                integrationId: `api-football:${playerId}`,
                commonName: `${playerData.player.name} Photo`,
                sourceUrl: playerData.player.photo,
            };
            await gfxRegistry.register(graphic);
            // Load it immediately
            await gfxRegistry.loadById(graphic.id);
        }

        return playerData;
    } catch (err) {
        console.error('Failed to fetch player data:', playerId, err);
        return null;
    }
}

// Batch fetch players from lineup (with quota limit)
export async function fetchPlayersFromLineup(
    playerIds: number[],
    season: number,
    leagueId?: number
): Promise<Map<number, ApiPlayerData>> {
    const results = new Map<number, ApiPlayerData>();
    const quota = getQuotaStatus();

    console.log(`Fetching player data. Quota: ${quota.used}/${quota.limit}`);

    // Limit to remaining quota
    const limit = Math.min(playerIds.length, quota.remaining);
    const idsToFetch = playerIds.slice(0, limit);

    // Fetch in parallel (but API will handle rate limiting)
    const promises = idsToFetch.map(async (id) => {
        const data = await fetchPlayerData(id, season, leagueId);
        if (data) {
            results.set(id, data);
        }
    });

    await Promise.all(promises);

    return results;
}
