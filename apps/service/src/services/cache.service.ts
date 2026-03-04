/**
 * Service-Side In-Memory Cache
 *
 * Three-tier LRU cache with state-aware TTLs:
 *   - FROZEN (2h): Immutable data — FT fixtures, completed seasons, ranking formulas
 *   - STABLE (30m): Admin-mutable — leagues, teams, upcoming fixtures
 *   - ACTIVE (5m): Frequently changing — live fixtures, player data, config
 */
import { LRUCache } from 'lru-cache';
import { globalLogger } from './log.service';

const logger = globalLogger.child({ module: 'CacheService' });

// TTL constants in milliseconds
export const TTL = {
    FROZEN: 2 * 60 * 60 * 1000,   // 2 hours
    STABLE: 30 * 60 * 1000,        // 30 minutes
    ACTIVE: 5 * 60 * 1000,         // 5 minutes
} as const;

export type CacheTier = keyof typeof TTL;

// Normalized statuses stored in the database after normalizer.ts mapping.
// 'played' = finished (FT, AET, PEN) — fixture data is immutable
const FINISHED_STATUSES = new Set(['played']);

// 'live' = in-progress match (1H, HT, 2H, ET, BT, P, LIVE)
const LIVE_STATUSES = new Set(['live']);

/** Resolve TTL for fixture-related data based on normalized match status */
export function fixtureTTL(status: string): number {
    if (FINISHED_STATUSES.has(status)) return TTL.FROZEN;
    if (LIVE_STATUSES.has(status)) return TTL.ACTIVE;
    return TTL.STABLE; // scheduled, postponed, cancelled, unknown
}

/** Resolve TTL for season-related data based on completion */
export function seasonTTL(endDate: Date | null): number {
    if (endDate && endDate < new Date()) return TTL.FROZEN;
    return TTL.STABLE;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CacheValue = any;

class CacheService {
    private cache: LRUCache<string, CacheValue>;
    private hits = 0;
    private misses = 0;

    constructor() {
        this.cache = new LRUCache<string, CacheValue>({
            max: 2000,              // max entries
            ttl: TTL.ACTIVE,        // default TTL (overridden per-entry)
            allowStale: false,      // don't return expired entries
            updateAgeOnGet: false,  // TTL resets from set() time, not last access
        });

        logger.info(`Cache initialized (max: 2000 entries)`);
    }

    /** Get a cached value. Returns undefined on miss. */
    get<T>(key: string): T | undefined {
        const value = this.cache.get(key) as T | undefined;
        if (value !== undefined) {
            this.hits++;
            logger.debug({ key }, 'Cache HIT');
        } else {
            this.misses++;
            logger.debug({ key }, 'Cache MISS');
        }
        return value;
    }

    /** Set a cached value with a specific TTL (in ms). */
    set<T>(key: string, value: T, ttl: number): void {
        if (ttl <= 0) return; // ttl of 0 means don't cache
        logger.debug({ key, ttlMs: ttl }, 'Cache SET');
        this.cache.set(key, value, { ttl });
    }

    /** Set a cached value using a named tier. */
    setWithTier<T>(key: string, value: T, tier: CacheTier): void {
        this.set(key, value, TTL[tier]);
    }

    /**
     * Invalidate cache entries by prefix pattern.
     * e.g. invalidate('seasons') removes all keys starting with 'seasons'.
     */
    invalidate(prefix: string): void {
        let count = 0;
        for (const key of this.cache.keys()) {
            if (key.startsWith(prefix)) {
                this.cache.delete(key);
                count++;
            }
        }
        if (count > 0) {
            logger.info(`Cache invalidated: ${prefix}* (${count} entries removed)`);
        }
    }

    /** Clear the entire cache. */
    clear(): void {
        const size = this.cache.size;
        this.cache.clear();
        this.hits = 0;
        this.misses = 0;
        logger.info(`Cache cleared (${size} entries removed)`);
    }

    /** Get cache statistics for admin visibility. */
    stats(): { size: number; maxSize: number; hitRate: string; hits: number; misses: number } {
        const total = this.hits + this.misses;
        return {
            size: this.cache.size,
            maxSize: 2000,
            hitRate: total > 0 ? `${((this.hits / total) * 100).toFixed(1)}%` : '0%',
            hits: this.hits,
            misses: this.misses,
        };
    }
}

/** Singleton cache instance */
export const cacheService = new CacheService();
