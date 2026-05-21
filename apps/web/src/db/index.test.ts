import { beforeEach, describe, expect, it } from 'vitest';

import 'fake-indexeddb/auto';

import { db } from './index';

describe('UltraWebDB', () => {
    beforeEach(async () => {
        await db.syncState.clear();
        await db.leagues.clear();
        await db.seasons.clear();
        await db.teams.clear();
        await db.fixtures.clear();
        await db.venues.clear();
    });

    it('should save and retrieve sync state', async () => {
        await db.syncState.put({
            key: 'test:sync',
            lastUpdatedAt: '2026-02-23T10:00:00Z',
        });

        const state = await db.syncState.get('test:sync');
        expect(state?.lastUpdatedAt).toBe('2026-02-23T10:00:00Z');
    });

    it('should store and query leagues by slug', async () => {
        await db.leagues.add({
            id: 'uuid-1',
            sourceId: 39,
            name: 'Premier League',
            slug: 'premier-league',
            updatedAt: '2026-02-23T10:00:00Z',
        });

        const league = await db.leagues.where('slug').equals('premier-league').first();
        expect(league?.id).toBe('uuid-1');
    });

    describe('watermark corner cases (issue #52)', () => {
        // The watermark is the canonical signal that a delta sync ran. The
        // corner cases below are how the rest of the app trusts it:
        //   - A watermark can be overwritten with an older value (it's an
        //     identity store, not max-merge).
        //   - A watermark is fully scoped by its key — clearing one season
        //     never clears another.
        //   - delete() of a missing key is a silent no-op.
        it('lets a watermark be overwritten with an older value (caller is responsible for max-merge)', async () => {
            await db.syncState.put({
                key: 'sync:season:s1',
                lastUpdatedAt: '2026-03-01T00:00:00Z',
            });
            await db.syncState.put({
                key: 'sync:season:s1',
                lastUpdatedAt: '2026-01-01T00:00:00Z',
            });
            const state = await db.syncState.get('sync:season:s1');
            expect(state?.lastUpdatedAt).toBe('2026-01-01T00:00:00Z');
        });

        it('scopes watermarks by key — clearing one does not touch another', async () => {
            await db.syncState.bulkPut([
                { key: 'sync:season:s1', lastUpdatedAt: '2026-03-01T00:00:00Z' },
                { key: 'sync:season:s2', lastUpdatedAt: '2026-03-02T00:00:00Z' },
            ]);
            await db.syncState.delete('sync:season:s1');
            const s1 = await db.syncState.get('sync:season:s1');
            const s2 = await db.syncState.get('sync:season:s2');
            expect(s1).toBeUndefined();
            expect(s2?.lastUpdatedAt).toBe('2026-03-02T00:00:00Z');
        });

        it('delete() on a missing key is a silent no-op', async () => {
            await expect(db.syncState.delete('never-existed')).resolves.toBeUndefined();
        });
    });

    describe('delta merge corner cases', () => {
        // What the delta-sync path relies on:
        //   - bulkPut overwrites existing rows by primary key.
        //   - Indexed fields (e.g. seasonId on fixtures) are query-able
        //     immediately after the put — no manual refresh needed.
        it('bulkPut overwrites a fixture by id (delta replace, not append)', async () => {
            const base = {
                id: 'f1',
                seasonId: 's1',
                homeTeamId: 'a',
                awayTeamId: 'b',
                scheduledAt: '2026-03-01T15:00:00Z',
                status: 'scheduled',
                goalsHome: null,
                goalsAway: null,
                updatedAt: '2026-02-23T10:00:00Z',
            };
            await db.fixtures.put(base);
            await db.fixtures.put({
                ...base,
                status: 'played',
                goalsHome: 2,
                goalsAway: 1,
                updatedAt: '2026-03-01T17:00:00Z',
            });
            const f = await db.fixtures.get('f1');
            expect(f?.status).toBe('played');
            expect(f?.goalsHome).toBe(2);
            // We must have exactly one row for that id, not two.
            const count = await db.fixtures.where('id').equals('f1').count();
            expect(count).toBe(1);
        });

        it('seasonId index returns only matching fixtures', async () => {
            await db.fixtures.bulkPut([
                {
                    id: 'a',
                    seasonId: 's1',
                    homeTeamId: 'h',
                    awayTeamId: 'a',
                    scheduledAt: '2026-03-01T15:00:00Z',
                    status: 'scheduled',
                    goalsHome: null,
                    goalsAway: null,
                    updatedAt: '2026-02-23T10:00:00Z',
                },
                {
                    id: 'b',
                    seasonId: 's2',
                    homeTeamId: 'h',
                    awayTeamId: 'a',
                    scheduledAt: '2026-03-01T15:00:00Z',
                    status: 'scheduled',
                    goalsHome: null,
                    goalsAway: null,
                    updatedAt: '2026-02-23T10:00:00Z',
                },
            ]);

            const s1 = await db.fixtures.where('seasonId').equals('s1').toArray();
            expect(s1.map((f) => f.id)).toEqual(['a']);
        });

        it('venues table (v2 migration) round-trips with city + image', async () => {
            await db.venues.put({
                id: 'v1',
                name: 'Emirates',
                city: 'London',
                image: 'https://x/y.png',
                updatedAt: '2026-02-23T10:00:00Z',
            });
            const v = await db.venues.get('v1');
            expect(v?.city).toBe('London');
            expect(v?.image).toBe('https://x/y.png');
        });
    });
});
