import { apiGet } from './api/client';
import { gfxRegistry } from './gfxRegistry';
import { database } from './db';
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
    }>;
}

// Export quota status for external use
export function getQuotaStatus(): { used: number; limit: number; remaining: number } {
    return playerQuota.getStatus();
}

// Fetch player data with quota and caching
export async function fetchPlayerData(
    playerId: number,
    season: number,
    leagueId?: number
): Promise<ApiPlayerData | null> {
    // Check cache first using the unified database service
    const cached = await database.getPlayerData(playerId);
    if (cached) {
        console.log('Player data cache hit:', playerId);

        // Ensure graphics are registered even when loading from cache
        if (cached.player.photo) {
            await registerPlayerPhoto(cached.player.id, cached.player.name, cached.player.photo);
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

        // Cache the full data in Dexie
        await database.savePlayerData(playerId, playerData);

        // Register photo in graphics registry
        if (playerData.player.photo) {
            await registerPlayerPhoto(playerData.player.id, playerData.player.name, playerData.player.photo);
        }

        return playerData;
    } catch (err) {
        console.error('Failed to fetch player data:', playerId, err);
        return null;
    }
}

/**
 * Register a player photo and ensure stable ID mapping.
 * Handles deduplication and multi-photo collections.
 */
async function registerPlayerPhoto(playerId: number, playerName: string, photoUrl: string): Promise<void> {
    const associationId = `player:api-football:${playerId}`;

    // 1. Get all photos for this player
    const existingIds = await gfxRegistry.getManyByAssociation(associationId, 'player_photo');

    // 2. See if this specific URL is already registered
    let foundId: string | undefined;
    for (const id of existingIds) {
        const g = (gfxRegistry as any).graphics.get(id); // Use memory cache for quick URL check
        if (g && g.sourceUrl === photoUrl) {
            foundId = id;
            break;
        }
    }

    if (foundId) {
        // Just trigger load for existing ID
        gfxRegistry.loadById(foundId).catch(() => { });
    } else {
        // Register as new graphic record (it will be deduplicated at the binary level)
        const graphicId = generateId();
        const graphic: Graphic = {
            id: graphicId,
            type: 'player_photo',
            associationId,
            externalReferences: [{ integrationName: 'api-football', remoteId: playerId.toString() }],
            commonName: `${playerName} Photo`,
            sourceUrl: photoUrl,
            lastRefreshed: new Date().toISOString(),
        };
        await gfxRegistry.register(graphic);
        gfxRegistry.loadById(graphic.id).catch(() => { });
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

    // Fetch in parallel
    const promises = idsToFetch.map(async (id) => {
        const data = await fetchPlayerData(id, season, leagueId);
        if (data) {
            results.set(id, data);
        }
    });

    await Promise.all(promises);
    return results;
}
