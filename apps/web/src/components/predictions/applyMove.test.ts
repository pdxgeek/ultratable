import { describe, expect, it } from 'vitest';

import { applyMove } from './applyMove';

describe('applyMove', () => {
    it('places a team from the pool into an empty slot', () => {
        const slots = [null, null, null];
        const next = applyMove(slots, 't-1', { kind: 'slot', position: 2 });
        expect(next).toEqual([null, 't-1', null]);
    });

    it('moves a team between empty slots (no swap)', () => {
        const slots: (string | null)[] = ['t-1', null, null];
        const next = applyMove(slots, 't-1', { kind: 'slot', position: 3 });
        expect(next).toEqual([null, null, 't-1']);
    });

    it('swaps two placed teams when the destination is occupied and source was a slot', () => {
        const slots: (string | null)[] = ['t-1', 't-2', 't-3'];
        // Move t-1 (at position 1) onto t-3 (at position 3) → swap.
        const next = applyMove(slots, 't-1', { kind: 'slot', position: 3 });
        expect(next).toEqual(['t-3', 't-2', 't-1']);
    });

    it('displaces the existing team to the pool when source is the pool and dest is occupied', () => {
        // t-1 is in the pool (not in slots). t-2 sits in position 1.
        const slots: (string | null)[] = ['t-2', null, null];
        const next = applyMove(slots, 't-1', { kind: 'slot', position: 1 });
        // t-2 falls back to the pool (absent from slots).
        expect(next).toEqual(['t-1', null, null]);
    });

    it('unplaces a team when dropped on the pool', () => {
        const slots: (string | null)[] = ['t-1', 't-2', 't-3'];
        const next = applyMove(slots, 't-2', { kind: 'pool' });
        expect(next).toEqual(['t-1', null, 't-3']);
    });

    it('is a no-op when target slot index is out of range', () => {
        const slots: (string | null)[] = ['t-1', null];
        const next = applyMove(slots, 't-1', { kind: 'slot', position: 99 });
        // Returns a fresh copy of the original (no mutation, no change).
        expect(next).toEqual(slots);
        expect(next).not.toBe(slots);
    });
});
