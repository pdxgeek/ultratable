import { gfxRegistry } from './gfxRegistry';
import { database } from './db';
import { providerRegistry } from './integrations';
import type { IntegrationName } from '../types';

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
        goals: {
            total: number | null;
            assists: number | null;
            conceded: number | null;
            saves: number | null;
        };
        cards: {
            yellow: number;
            yellowred: number;
            red: number;
        };
    }>;
}

// Quota tracker is now provider-specific if needed

// Fetch player data with provider and caching
export async function fetchPlayerData(
    playerId: string | number,
    season: number,
    integrationName: IntegrationName = 'api-football'
): Promise<ApiPlayerData | null> {
    const provider = providerRegistry[integrationName];
    if (!provider) return null;
    const cached = await database.getPlayerData(integrationName, playerId, season);
    if (cached) {
        console.log(`[PlayerData] Cache hit for ${integrationName}:${playerId} (Season ${season})`);

        // Ensure graphics are registered even when loading from cache
        if (cached?.player && cached.player.photo) {
            await registerPlayerPhoto(playerId, cached.player.name, cached.player.photo, integrationName);
        }

        return cached;
    }

    // Fetch from Provider
    try {
        const response = await provider.getPlayerData(playerId, season);

        if (!response || response.length === 0) {
            return null;
        }

        const playerData = response[0];

        // Cache the full data in Dexie
        await database.savePlayerData(integrationName, playerId, season, playerData);

        // Register photo in graphics registry
        if (playerData?.player && playerData.player.photo) {
            await registerPlayerPhoto(playerData.player.id, playerData.player.name, playerData.player.photo, integrationName);
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
export async function registerPlayerPhoto(playerId: string | number, playerName: string, photoUrl: string, integrationName: IntegrationName = 'api-football'): Promise<void> {
    const associationId = await database.getInternalId(integrationName, 'player', playerId);
    if (!associationId) {
        console.warn(`[GfxDebug] No internal ID found for player ${playerId} (${playerName}). Cannot register photo.`);
        return;
    }

    // 1. Get all photos for this player
    const existingIds = await gfxRegistry.getManyByAssociation(associationId, 'player_photo');
    console.log(`[GfxDebug] Player ${playerName} (${associationId}) has ${existingIds.length} existing photo records.`);

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
        const graphicId = gfxRegistry.calculateSlotId(associationId, 'player_photo');
        console.log(`[GfxDebug] Registering new photo slot ${graphicId} for ${playerName}`);
        await gfxRegistry.register({
            id: graphicId,
            type: 'player_photo',
            associationId,
            associationType: 'player',
            externalReferences: [{ integrationName, remoteId: playerId.toString() }],
            commonName: `${playerName} Photo`,
            sourceUrl: photoUrl
        });
        gfxRegistry.loadById(graphicId).catch((err) => {
            console.error(`[GfxDebug] Initial load failed for ${playerName}:`, err);
        });
    }
}

// Batch fetch players from lineup (with quota limit)
export async function fetchPlayersFromLineup(
    playerIds: number[],
    season: number,
    integrationName: IntegrationName = 'api-football'
): Promise<Map<number, ApiPlayerData>> {
    const results = new Map<number, ApiPlayerData>();
    const idsToFetch = playerIds;

    // Fetch in parallel
    const promises = idsToFetch.map(async (id) => {
        const data = await fetchPlayerData(id, season, integrationName);
        if (data) {
            results.set(id, data);
        }
    });

    await Promise.all(promises);
    return results;
}
