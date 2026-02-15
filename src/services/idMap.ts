// Simple in-memory map for now. 
// In a real app, this would persist to a database or localStorage.

const externalToInternal = new Map<string, string>();
const internalToExternal = new Map<string, string>();

/**
 * Get or create an internal ID for a given external ID from a provider.
 * @param provider - The provider namespace (e.g. 'api-football')
 * @param type - The entity type (e.g. 'team', 'fixture')
 * @param externalId - The ID from the provider
 */
export function getInternalId(provider: string, type: 'team' | 'fixture' | 'league' | 'player', externalId: string | number): string {
    const key = `${provider}:${type}:${externalId}`;
    if (externalToInternal.has(key)) {
        return externalToInternal.get(key)!;
    }

    // Lazy load logic could go here if checking a DB
    return key; // Fallback: return the compound key as the internal ID for now until we fully switch to NanoID db
}

/**
 * Register a mapping (e.g. when importing a league)
 */
export function registerMapping(provider: string, type: string, externalId: string | number, internalId: string) {
    const key = `${provider}:${type}:${externalId}`;
    externalToInternal.set(key, internalId);
    internalToExternal.set(internalId, key);
}
