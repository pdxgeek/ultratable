/**
 * Cache Service Unit Tests
 *
 * Tests for the three-tier LRU cache with state-aware TTLs,
 * prefix-based invalidation, and stats tracking.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { cacheService, TTL, fixtureTTL, seasonTTL } from './cache.service.js';

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
            const leagues = [{ id: '1', name: 'Premier League' }, { id: '2', name: 'La Liga' }];
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
            cacheService.get('key');  // hit
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
    it('should return FROZEN for FT fixtures', () => {
        expect(fixtureTTL('FT')).toBe(TTL.FROZEN);
    });

    it('should return FROZEN for AET fixtures', () => {
        expect(fixtureTTL('AET')).toBe(TTL.FROZEN);
    });

    it('should return FROZEN for PEN fixtures', () => {
        expect(fixtureTTL('PEN')).toBe(TTL.FROZEN);
    });

    it('should return ACTIVE for live 1H fixtures', () => {
        expect(fixtureTTL('1H')).toBe(TTL.ACTIVE);
    });

    it('should return ACTIVE for halftime fixtures', () => {
        expect(fixtureTTL('HT')).toBe(TTL.ACTIVE);
    });

    it('should return ACTIVE for 2H fixtures', () => {
        expect(fixtureTTL('2H')).toBe(TTL.ACTIVE);
    });

    it('should return ACTIVE for extra time', () => {
        expect(fixtureTTL('ET')).toBe(TTL.ACTIVE);
    });

    it('should return ACTIVE for LIVE fixtures', () => {
        expect(fixtureTTL('LIVE')).toBe(TTL.ACTIVE);
    });

    it('should return STABLE for scheduled fixtures', () => {
        expect(fixtureTTL('NS')).toBe(TTL.STABLE);
    });

    it('should return STABLE for TBD fixtures', () => {
        expect(fixtureTTL('TBD')).toBe(TTL.STABLE);
    });

    it('should return STABLE for unknown statuses', () => {
        expect(fixtureTTL('PST')).toBe(TTL.STABLE);
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
