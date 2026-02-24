import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from './index';

describe('UltraWebDB', () => {
    beforeEach(async () => {
        await db.syncState.clear();
        await db.leagues.clear();
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
});
