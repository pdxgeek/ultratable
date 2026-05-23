import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it } from 'vitest';

import { db } from './index';
import {
    clearDraft,
    draftKey,
    loadDraft,
    sanitizeDraftSlots,
    saveDraft,
} from './predictionDrafts';

describe('predictionDrafts module', () => {
    beforeEach(async () => {
        await db.predictionDrafts.clear();
    });

    it('builds a stable composite key from (userId, seasonId, type)', () => {
        expect(draftKey({ userId: 'u-1', seasonId: 's-1', type: 'PROJECTED_FINISH' })).toBe(
            'u-1__s-1__PROJECTED_FINISH',
        );
    });

    it('round-trips a draft through Dexie', async () => {
        const key = draftKey({ userId: 'u-1', seasonId: 's-1', type: 'PROJECTED_FINISH' });
        const slots = ['t-3', null, 't-1'];

        await saveDraft(key, slots);
        const loaded = await loadDraft(key);

        expect(loaded?.slots).toEqual(slots);
        expect(loaded?.updatedAt).toBeTypeOf('string');
    });

    it('overwrites the row on subsequent saves (no growth, fresh updatedAt)', async () => {
        const key = draftKey({ userId: 'u-1', seasonId: 's-1', type: 'PROJECTED_FINISH' });

        await saveDraft(key, [null, null, null]);
        const first = await loadDraft(key);
        await new Promise((r) => setTimeout(r, 5));
        await saveDraft(key, ['t-1', null, null]);
        const second = await loadDraft(key);

        expect(second?.slots).toEqual(['t-1', null, null]);
        expect(second?.updatedAt).not.toBe(first?.updatedAt);
        expect(await db.predictionDrafts.count()).toBe(1);
    });

    it('clearDraft removes the row', async () => {
        const key = draftKey({ userId: 'u-1', seasonId: 's-1', type: 'PROJECTED_FINISH' });
        await saveDraft(key, ['t-1', null, null]);
        await clearDraft(key);
        expect(await loadDraft(key)).toBeNull();
    });

    it('loadDraft returns null (not undefined) when no row exists', async () => {
        expect(await loadDraft('missing-key')).toBeNull();
    });

    describe('sanitizeDraftSlots', () => {
        const valid = new Set(['t-1', 't-2', 't-3']);

        it('passes a fully-valid draft through unchanged', () => {
            const slots = ['t-1', null, 't-2'];
            expect(sanitizeDraftSlots(slots, valid, 3)).toEqual(['t-1', null, 't-2']);
        });

        it('returns null when the saved length does not match the team count', () => {
            const slots = ['t-1', null];
            expect(sanitizeDraftSlots(slots, valid, 3)).toBeNull();
        });

        it('drops unknown teamIds to null while keeping the rest in place', () => {
            const slots = ['t-1', 'ghost', 't-3'];
            expect(sanitizeDraftSlots(slots, valid, 3)).toEqual(['t-1', null, 't-3']);
        });
    });
});
