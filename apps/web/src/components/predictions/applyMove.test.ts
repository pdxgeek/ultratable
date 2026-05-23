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

    it('cascades occupants down by one when dropping on an occupied slot (slot→slot, moving up)', () => {
        // Move t-3 from position 3 to position 1. t-1 and t-2 bump down by
        // one. Source position 3 was the cascade's natural terminator.
        const slots: (string | null)[] = ['t-1', 't-2', 't-3'];
        const next = applyMove(slots, 't-3', { kind: 'slot', position: 1 });
        expect(next).toEqual(['t-3', 't-1', 't-2']);
    });

    it('cascade terminates at the source-emptied slot on slot→slot moves', () => {
        // Move t-5 from position 5 to position 2. Cascade insert at 2, bump
        // t-2→3, t-3→4, t-4→5 (lands in the now-empty source slot). No one
        // falls off the end.
        const slots: (string | null)[] = ['t-1', 't-2', 't-3', 't-4', 't-5'];
        const next = applyMove(slots, 't-5', { kind: 'slot', position: 2 });
        expect(next).toEqual(['t-1', 't-5', 't-2', 't-3', 't-4']);
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
