/**
 * Cache Service Unit Tests
 *
 * Tests for the three-tier LRU cache with state-aware TTLs,
 * prefix-based invalidation, and stats tracking.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { cacheService, fixtureTTL, seasonTTL, TTL } from './cache.service';

describe('CacheService', () => {
    beforeEach(() => {
        cacheService.clear();
    });

    // -----------------------------------------------------------------------
    // Basic get/set
    // -----------------------------------------------------------------------
    describe('get/set', () => {
        it('should return undefined for cache miss', () => {
            expect(cacheService.get('nonexistent')).toBeUndefined();
        });

        it('should store and retrieve a value', () => {
            cacheService.set('key1', { name: 'test' }, TTL.ACTIVE);
            expect(cacheService.get('key1')).toEqual({ name: 'test' });
        });

        it('should store and retrieve arrays', () => {
            const leagues = [
                { id: '1', name: 'Premier League' },
                { id: '2', name: 'La Liga' },
            ];
            cacheService.set('leagues', leagues, TTL.STABLE);
            expect(cacheService.get<typeof leagues>('leagues')).toHaveLength(2);
        });

        it('should overwrite existing values', () => {
            cacheService.set('key1', 'old', TTL.ACTIVE);
            cacheService.set('key1', 'new', TTL.ACTIVE);
            expect(cacheService.get('key1')).toBe('new');
        });

        it('should not cache when TTL is 0', () => {
            cacheService.set('key1', 'value', 0);
            expect(cacheService.get('key1')).toBeUndefined();
        });

        it('should not cache when TTL is negative', () => {
            cacheService.set('key1', 'value', -1);
            expect(cacheService.get('key1')).toBeUndefined();
        });
    });

    // -----------------------------------------------------------------------
    // setWithTier
    // -----------------------------------------------------------------------
    describe('setWithTier', () => {
        it('should set value with FROZEN tier', () => {
            cacheService.setWithTier('formulas', [1, 2, 3], 'FROZEN');
            expect(cacheService.get('formulas')).toEqual([1, 2, 3]);
        });

        it('should set value with STABLE tier', () => {
            cacheService.setWithTier('leagues', ['EPL'], 'STABLE');
            expect(cacheService.get('leagues')).toEqual(['EPL']);
        });

        it('should set value with ACTIVE tier', () => {
            cacheService.setWithTier('player:42:2024', { name: 'Saka' }, 'ACTIVE');
            expect(cacheService.get('player:42:2024')).toEqual({ name: 'Saka' });
        });
    });

    // -----------------------------------------------------------------------
    // Invalidation
    // -----------------------------------------------------------------------
    describe('invalidate', () => {
        it('should remove entries matching prefix', () => {
            cacheService.set('seasons:league1', ['s1'], TTL.STABLE);
            cacheService.set('seasons:league2', ['s2'], TTL.STABLE);
            cacheService.set('seasons:all', ['s1', 's2'], TTL.ACTIVE);
            cacheService.set('leagues', ['l1'], TTL.STABLE);

            cacheService.invalidate('seasons');

            expect(cacheService.get('seasons:league1')).toBeUndefined();
            expect(cacheService.get('seasons:league2')).toBeUndefined();
            expect(cacheService.get('seasons:all')).toBeUndefined();
            expect(cacheService.get('leagues')).toEqual(['l1']); // not affected
        });

        it('should remove exact key match', () => {
            cacheService.set('leagues', ['l1'], TTL.STABLE);
            cacheService.invalidate('leagues');
            expect(cacheService.get('leagues')).toBeUndefined();
        });

        it('should handle no matches gracefully', () => {
            cacheService.set('leagues', ['l1'], TTL.STABLE);
            cacheService.invalidate('nonexistent');
            expect(cacheService.get('leagues')).toEqual(['l1']);
        });

        it('should invalidate fixture-specific keys', () => {
            cacheService.set('fixtures:39:2024', [{ id: 'f1' }], TTL.ACTIVE);
            cacheService.set('fixtures:39:2023', [{ id: 'f2' }], TTL.ACTIVE);
            cacheService.set('fixtures:140:2024', [{ id: 'f3' }], TTL.ACTIVE);

            cacheService.invalidate('fixtures:39');

            expect(cacheService.get('fixtures:39:2024')).toBeUndefined();
            expect(cacheService.get('fixtures:39:2023')).toBeUndefined();
            expect(cacheService.get('fixtures:140:2024')).toEqual([{ id: 'f3' }]); // different league
        });

        it('should invalidate catalog entries', () => {
            cacheService.set('catalog:countries', ['c1'], TTL.ACTIVE);
            cacheService.set('catalog:leagues:eng:all', ['l1'], TTL.ACTIVE);

            cacheService.invalidate('catalog:');

            expect(cacheService.get('catalog:countries')).toBeUndefined();
            expect(cacheService.get('catalog:leagues:eng:all')).toBeUndefined();
        });
    });

    // -----------------------------------------------------------------------
    // Clear
    // -----------------------------------------------------------------------
    describe('clear', () => {
        it('should remove all entries', () => {
            cacheService.set('a', 1, TTL.ACTIVE);
            cacheService.set('b', 2, TTL.STABLE);
            cacheService.set('c', 3, TTL.FROZEN);

            cacheService.clear();

            expect(cacheService.get('a')).toBeUndefined();
            expect(cacheService.get('b')).toBeUndefined();
            expect(cacheService.get('c')).toBeUndefined();
        });

        it('should reset stats', () => {
            cacheService.set('key', 'val', TTL.ACTIVE);
            cacheService.get('key'); // hit
            cacheService.get('miss'); // miss

            cacheService.clear();
            const stats = cacheService.stats();
            expect(stats.hits).toBe(0);
            expect(stats.misses).toBe(0);
            expect(stats.size).toBe(0);
        });
    });

    // -----------------------------------------------------------------------
    // Stats
    // -----------------------------------------------------------------------
    describe('stats', () => {
        it('should track hits and misses', () => {
            cacheService.set('key1', 'val', TTL.ACTIVE);

            cacheService.get('key1'); // hit
            cacheService.get('key1'); // hit
            cacheService.get('key2'); // miss

            const stats = cacheService.stats();
            expect(stats.hits).toBe(2);
            expect(stats.misses).toBe(1);
            expect(stats.hitRate).toBe('66.7%');
        });

        it('should report size correctly', () => {
            cacheService.set('a', 1, TTL.ACTIVE);
            cacheService.set('b', 2, TTL.STABLE);
            expect(cacheService.stats().size).toBe(2);
        });

        it('should report maxSize', () => {
            expect(cacheService.stats().maxSize).toBe(2000);
        });

        it('should report 0% hit rate with no requests', () => {
            expect(cacheService.stats().hitRate).toBe('0%');
        });
    });
});

// ---------------------------------------------------------------------------
// TTL Resolution Helpers
// ---------------------------------------------------------------------------
describe('fixtureTTL', () => {
    // Normalized statuses — these are what the DB stores after normalizer.ts
    it('should return FROZEN for played fixtures', () => {
        expect(fixtureTTL('played')).toBe(TTL.FROZEN);
    });

    it('should return ACTIVE for live fixtures', () => {
        expect(fixtureTTL('live')).toBe(TTL.ACTIVE);
    });

    it('should return STABLE for scheduled fixtures', () => {
        expect(fixtureTTL('scheduled')).toBe(TTL.STABLE);
    });

    it('should return STABLE for postponed fixtures', () => {
        expect(fixtureTTL('postponed')).toBe(TTL.STABLE);
    });

    it('should return STABLE for cancelled fixtures', () => {
        expect(fixtureTTL('cancelled')).toBe(TTL.STABLE);
    });

    it('should return STABLE for unknown statuses', () => {
        expect(fixtureTTL('unknown_status')).toBe(TTL.STABLE);
    });

    // Guard against raw API statuses leaking through — these should NOT match
    it('should NOT match raw API status FT (use "played" instead)', () => {
        expect(fixtureTTL('FT')).toBe(TTL.STABLE); // not FROZEN
    });

    it('should NOT match raw API status 1H (use "live" instead)', () => {
        expect(fixtureTTL('1H')).toBe(TTL.STABLE); // not ACTIVE
    });
});

describe('seasonTTL', () => {
    it('should return FROZEN for past season', () => {
        const pastDate = new Date('2023-06-01');
        expect(seasonTTL(pastDate)).toBe(TTL.FROZEN);
    });

    it('should return STABLE for future season', () => {
        const futureDate = new Date('2030-06-01');
        expect(seasonTTL(futureDate)).toBe(TTL.STABLE);
    });

    it('should return STABLE for null endDate', () => {
        expect(seasonTTL(null)).toBe(TTL.STABLE);
    });
});

// ---------------------------------------------------------------------------
// TTL Constants
// ---------------------------------------------------------------------------
describe('TTL constants', () => {
    it('FROZEN should be 2 hours', () => {
        expect(TTL.FROZEN).toBe(2 * 60 * 60 * 1000);
    });

    it('STABLE should be 30 minutes', () => {
        expect(TTL.STABLE).toBe(30 * 60 * 1000);
    });

    it('ACTIVE should be 5 minutes', () => {
        expect(TTL.ACTIVE).toBe(5 * 60 * 1000);
    });
});

// ---------------------------------------------------------------------------
// Raw API cache vs Domain cache isolation (AI_README_FIRST.MD §3)
//
// Raw API cache keys:   [endpoint]_[remoteId]_[season]    e.g. fixtures_40_2025
// Domain cache keys:    domain_[type]_[internalId]        e.g. domain_fixtures_<uuid>
//
// These conventions must never overlap. A league deletion (new UUID on re-add)
// must wipe the domain cache slice but leave the raw API cache intact — we
// still want to skip the upstream call for the same provider+season.
// ---------------------------------------------------------------------------
describe('raw vs domain cache key isolation', () => {
    beforeEach(() => cacheService.clear());

    it('prefix invalidation of domain entries leaves raw API entries alone', () => {
        cacheService.set('fixtures_40_2025', ['raw1'], TTL.FROZEN);
        cacheService.set('domain_fixtures_uuid-A', ['mapped1'], TTL.STABLE);
        cacheService.set('domain_fixtures_uuid-B', ['mapped2'], TTL.STABLE);

        cacheService.invalidate('domain_fixtures');

        expect(cacheService.get('domain_fixtures_uuid-A')).toBeUndefined();
        expect(cacheService.get('domain_fixtures_uuid-B')).toBeUndefined();
        expect(cacheService.get('fixtures_40_2025')).toEqual(['raw1']);
    });

    it('simulated league delete + recreate: raw cache survives, domain cache is fresh per UUID', () => {
        // Initial state: league had UUID-OLD; both raw and domain caches populated.
        cacheService.set('fixtures_40_2025', [{ sourceId: 1 }], TTL.FROZEN); // raw — keyed by provider
        cacheService.set('domain_fixtures_UUID-OLD', [{ id: 'a' }], TTL.STABLE);

        // League is deleted — only the domain slice for that UUID is invalidated.
        cacheService.invalidate('domain_fixtures_UUID-OLD');

        // League is re-added — gets UUID-NEW. Domain cache for UUID-NEW is naturally empty.
        expect(cacheService.get('domain_fixtures_UUID-NEW')).toBeUndefined();
        // Raw cache for the upstream provider data is still warm — no extra API call.
        expect(cacheService.get('fixtures_40_2025')).toEqual([{ sourceId: 1 }]);
    });
});

// ---------------------------------------------------------------------------
// LRU eviction under pressure
//
// The LRU cache has max=2000. Writing more than that should evict
// least-recently-used entries, not block writes or grow unbounded.
// ---------------------------------------------------------------------------
describe('LRU eviction under pressure', () => {
    beforeEach(() => cacheService.clear());

    it('caps size at maxSize (2000) when more entries are written', () => {
        for (let i = 0; i < 2500; i++) {
            cacheService.set(`k${i}`, i, TTL.STABLE);
        }
        const stats = cacheService.stats();
        expect(stats.size).toBeLessThanOrEqual(2000);
        expect(stats.size).toBeGreaterThan(0);
    });

    it('evicts the oldest entries first when capacity is exceeded', () => {
        for (let i = 0; i < 2500; i++) {
            cacheService.set(`k${i}`, i, TTL.STABLE);
        }
        // The first 500 keys should have been evicted; the most recent must remain.
        expect(cacheService.get('k0')).toBeUndefined();
        expect(cacheService.get('k2499')).toBe(2499);
    });
});
