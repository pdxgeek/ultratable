import { describe, expect, it } from 'vitest';

import { applyMove } from './applyMove';

describe('applyMove', () => {
    it('places a team from the pool into an empty slot', () => {
        const slots = [null, null, null];
        const next = applyMove(slots, 't-1', { kind: 'slot', position: 2 });
        expect(next).toEqual([null, 't-1', null]);
    });

    it('moves a team between empty slots (no cascade)', () => {
        const slots: (string | null)[] = ['t-1', null, null];
        const next = applyMove(slots, 't-1', { kind: 'slot', position: 3 });
        expect(next).toEqual([null, null, 't-1']);
    });

    it('slot→slot moving UP cascades down toward the source', () => {
        // Move t-3 from position 3 to position 1. t-1 bumps to 2, t-2 bumps
        // to 3 (the now-empty source). No pool spillover.
        const slots: (string | null)[] = ['t-1', 't-2', 't-3'];
        const next = applyMove(slots, 't-3', { kind: 'slot', position: 1 });
        expect(next).toEqual(['t-3', 't-1', 't-2']);
    });

    it('slot→slot moving DOWN cascades up toward the source', () => {
        // Move t-1 from position 1 to position 4. t-4 bumps to 3, t-3 to 2,
        // t-2 to 1 (the now-empty source). No pool spillover.
        const slots: (string | null)[] = ['t-1', 't-2', 't-3', 't-4', 't-5'];
        const next = applyMove(slots, 't-1', { kind: 'slot', position: 4 });
        expect(next).toEqual(['t-2', 't-3', 't-4', 't-1', 't-5']);
    });

    it('slot→slot cascade terminates at the source-emptied slot in either direction', () => {
        // Move t-5 (pos 5) → pos 2. Cascade DOWN: t-2→3, t-3→4, t-4→5
        // (now-empty source).
        const slots: (string | null)[] = ['t-1', 't-2', 't-3', 't-4', 't-5'];
        const next = applyMove(slots, 't-5', { kind: 'slot', position: 2 });
        expect(next).toEqual(['t-1', 't-5', 't-2', 't-3', 't-4']);
    });

    it('slot→slot is a no-op when source and destination are the same slot', () => {
        const slots: (string | null)[] = ['t-1', 't-2', 't-3'];
        const next = applyMove(slots, 't-2', { kind: 'slot', position: 2 });
        expect(next).toEqual(slots);
    });

    it('cascade stops at the first empty slot below the destination', () => {
        // t-pool dropped at position 2. Cascade bumps t-2→3, t-3→4. Slot 4
        // is empty, cascade stops.
        const slots: (string | null)[] = [null, 't-2', 't-3', null, null];
        const next = applyMove(slots, 't-pool', { kind: 'slot', position: 2 });
        expect(next).toEqual([null, 't-pool', 't-2', 't-3', null]);
    });

    it('pushes the last team off the end into the pool when cascade runs out (pool→slot, all-below-full)', () => {
        // t-pool dropped at position 3. Slots 3..5 are all occupied. t-3
        // bumps to 4, t-4 bumps to 5, t-5 falls off → pool (absent).
        const slots: (string | null)[] = ['t-1', 't-2', 't-3', 't-4', 't-5'];
        const next = applyMove(slots, 't-pool', { kind: 'slot', position: 3 });
        expect(next).toEqual(['t-1', 't-2', 't-pool', 't-3', 't-4']);
    });

    it('unplaces a team when dropped on the pool', () => {
        const slots: (string | null)[] = ['t-1', 't-2', 't-3'];
        const next = applyMove(slots, 't-2', { kind: 'pool' });
        expect(next).toEqual(['t-1', null, 't-3']);
    });

    it('is a no-op when target slot index is out of range', () => {
        const slots: (string | null)[] = ['t-1', null];
        const next = applyMove(slots, 't-1', { kind: 'slot', position: 99 });
        expect(next).toEqual(slots);
        expect(next).not.toBe(slots);
    });
});
