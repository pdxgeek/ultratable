import type { DataStore } from './interface';
import { dexieStore } from './dexie';

// ─── DAO Registry ──────────────────────────────────────────────────────────

type StorageBackend = 'dexie' | 'localStorage' | 'memory';

const stores: Record<StorageBackend, DataStore> = {
    dexie: dexieStore,
    localStorage: dexieStore, // TODO: Implement localStorage fallback
    memory: dexieStore,       // TODO: Implement in-memory store for testing
};

let activeBackend: StorageBackend = 'dexie';

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Get the current data store instance
 */
export function getStore(): DataStore {
    return stores[activeBackend];
}

/**
 * Switch storage backend (useful for testing or fallbacks)
 */
export function setBackend(backend: StorageBackend): void {
    if (!stores[backend]) {
        throw new Error(`Unknown storage backend: ${backend}`);
    }
    activeBackend = backend;
}

/**
 * Get the current backend name
 */
export function getBackend(): StorageBackend {
    return activeBackend;
}

// ─── Convenience Exports ───────────────────────────────────────────────────

export const store = getStore();

// Export types
export type { DataStore, StorageBackend };
export * from './interface';
