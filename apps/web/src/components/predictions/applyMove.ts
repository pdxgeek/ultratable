import type { MoveTarget } from './ProjectedFinishBoard';

/**
 * Apply a drag-and-drop move to the slot array.
 *
 * - Pool → empty slot: place the team.
 * - Pool → occupied slot: place the team; the displaced team falls back
 *   into the pool (i.e. it's simply absent from the new slots array).
 * - Slot → empty slot: move (source goes null).
 * - Slot → occupied slot: swap source and destination.
 * - Any → pool: unplace (slot at source position goes null).
 *
 * Returns the original array when the move is a no-op or invalid so React
 * can short-circuit re-renders.
 */
export function applyMove(
    slots: readonly (string | null)[],
    teamId: string,
    target: MoveTarget,
): (string | null)[] {
    const next = [...slots];
    const sourceIdx = next.indexOf(teamId);
    if (sourceIdx >= 0) next[sourceIdx] = null;

    if (target.kind === 'pool') {
        return next;
    }

    const destIdx = target.position - 1;
    if (destIdx < 0 || destIdx >= next.length) return [...slots];

    const displaced = next[destIdx];
    next[destIdx] = teamId;
    if (displaced && sourceIdx >= 0) next[sourceIdx] = displaced;
    return next;
}
