import { db } from './dao/schema';
import { generateId } from './idUtils';

// Memory cache for session speed
const memoryCache = new Map<string, string>();

/**
 * Get or create an internal ID for a given external ID from a provider.
 * Now queries the domain store for stability.
 */
export async function getInternalId(
    provider: string,
    type: 'team' | 'fixture' | 'player' | 'league',
    externalId: string | number
): Promise<string> {
    const extIdStr = String(externalId);
    const referenceKey = `${provider}:${type}:${extIdStr}`;
    const memoryKey = `ref:${referenceKey}`;

    // 1. Check memory cache
    if (memoryCache.has(memoryKey)) {
        return memoryCache.get(memoryKey)!;
    }

    // 2. Query Domain Store by reference key
    let id: string | undefined;

    if (type === 'team') {
        const record = await db.teams.where('referenceKeys').equals(referenceKey).first();
        if (record) id = record.id;
    } else if (type === 'fixture') {
        const record = await db.fixtures.where('referenceKeys').equals(referenceKey).first();
        if (record) id = record.id;
    } else if (type === 'player') {
        const record = await db.players.where('referenceKeys').equals(referenceKey).first();
        if (record) id = record.id;
    }

    // 3. Fallback to legacy mappings table while transitioning (optional, but good for safety)
    if (!id) {
        const legacyRecord = await db.mappings.get(referenceKey);
        if (legacyRecord) id = legacyRecord.internalId;
    }

    // 4. Create new NanoID if none found
    if (!id) {
        id = generateId();
        // Note: We don't persist a "placeholder" here. 
        // Persistence happens when the full entity is mapped and saved in apiFootball.ts
    }

    memoryCache.set(memoryKey, id);
    return id;
}

/**
 * Resolves an internal NanoID to an external ID for a specific provider.
 * Queries the Domain Store for the entity record.
 */
export async function getExternalId(
    type: 'team' | 'fixture' | 'player',
    internalId: string,
    providerName: string
): Promise<string | null> {
    // 1. Get the record from the appropriate table
    let record: any;
    if (type === 'team') {
        record = await db.teams.get(internalId);
    } else if (type === 'fixture') {
        record = await db.fixtures.get(internalId);
    } else if (type === 'player') {
        record = await db.players.get(internalId);
    }

    if (!record || !record.referenceKeys) return null;

    // 2. Find the reference key for the specified provider
    const prefix = `${providerName}:${type}:`;
    const refKey = record.referenceKeys.find((k: string) => k.startsWith(prefix));

    if (refKey) {
        return refKey.split(':').pop() || null;
    }

    return null;
}

/**
 * Direct lookup for an internal NanoID to find its data.
 * Useful for deep-linking (MatchPage).
 */
export async function getEntityById<T>(type: 'team' | 'fixture' | 'player', id: string): Promise<T | null> {
    if (type === 'team') {
        const r = await db.teams.get(id);
        return r ? r.data as T : null;
    }
    if (type === 'fixture') {
        const r = await db.fixtures.get(id);
        return r ? r.data as T : null;
    }
    if (type === 'player') {
        const r = await db.players.get(id);
        return r ? r.data as T : null;
    }
    return null;
}
