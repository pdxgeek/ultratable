import type { MoveTarget } from './ProjectedFinishBoard';

/**
 * Apply a drag-and-drop move to the slot array.
 *
 * - Any → pool: unplace the team (its source slot, if any, goes null).
 * - Any → slot: place the team at the destination. If that slot is
 *   occupied, the displaced team bumps to the next slot. If THAT slot is
 *   also occupied, the bump cascades — each occupant pushes the next one
 *   down by one position until the cascade lands on an empty slot or runs
 *   off the end. A team pushed off the end falls back into the pool (i.e.
 *   simply absent from the new slots array).
 *
 *   When the source was itself a slot (slot→slot move), it's cleared FIRST,
 *   so a downward bump naturally terminates when it reaches the now-empty
 *   source position — meaning slot→slot reorders never push anyone to the
 *   pool. Only pool→slot moves can do that, and only when the destination
 *   and every slot below it are already full.
 *
 * Returns the original array (a copy) when the move is a no-op or invalid
 * so React can short-circuit re-renders.
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

    let toPlace: string | null = teamId;
    let i = destIdx;
    while (i < next.length && toPlace !== null) {
        const displaced = next[i];
        next[i] = toPlace;
        toPlace = displaced;
        i += 1;
    }
    return next;
}
