import { describe, it, expect, vi, beforeEach } from 'vitest';
import { smartRefresh } from './smartRefresh';
import { db } from './dao/schema';
import { database } from './db';

describe('SmartRefreshService', () => {
    beforeEach(async () => {
        await database.clearAllCache();
    });

    it('should calculate exponential backoff correctly', () => {
        // 30m, 60m, 120m, 240m...
        expect(smartRefresh.calculateBackoff(0)).toBe(30 * 60 * 1000);
        expect(smartRefresh.calculateBackoff(1)).toBe(30 * 60 * 1000);
        expect(smartRefresh.calculateBackoff(2)).toBe(60 * 60 * 1000);
        expect(smartRefresh.calculateBackoff(3)).toBe(120 * 60 * 1000);
    });

    it('should identify overdue fixtures correctly', () => {
        const now = Date.now() / 1000;

        const scheduledFixture = {
            id: 'f1',
            status: 'scheduled',
            timestamp: now - (120 * 60) // 2 hours ago
        } as any;

        const futureFixture = {
            id: 'f2',
            status: 'scheduled',
            timestamp: now + (3600) // 1 hour in future
        } as any;

        const finishedFixture = {
            id: 'f3',
            status: 'finished',
            timestamp: now - (120 * 60)
        } as any;

        expect(smartRefresh.isFixtureOverdue(scheduledFixture)).toBe(true);
        expect(smartRefresh.isFixtureOverdue(futureFixture)).toBe(false);
        expect(smartRefresh.isFixtureOverdue(finishedFixture)).toBe(false);
    });

    it('should apply backoff to database records', async () => {
        const fixtureId = 'test_fixture_backoff';
        await db.fixtures.put({
            id: fixtureId,
            referenceKeys: [],
            data: { id: fixtureId, status: 'scheduled' } as any,
            updatedAt: Date.now(),
            refreshAttempts: 1
        });

        await smartRefresh.applyBackoff('fixtures', fixtureId);

        const record = await db.fixtures.get(fixtureId);
        expect(record?.refreshAttempts).toBe(2);
        expect(record?.dataExpiration).toBeGreaterThan(Date.now());
    });

    it('should clear refresh metadata on success', async () => {
        const fixtureId = 'test_fixture_clear';
        await db.fixtures.put({
            id: fixtureId,
            referenceKeys: [],
            data: { id: fixtureId, status: 'finished' } as any,
            updatedAt: Date.now(),
            refreshAttempts: 5,
            dataExpiration: Date.now() - 1000
        });

        await smartRefresh.clearRefreshMetadata('fixtures', fixtureId);

        const record = await db.fixtures.get(fixtureId);
        expect(record?.refreshAttempts).toBeNull();
        expect(record?.dataExpiration).toBeNull();
    });
});
