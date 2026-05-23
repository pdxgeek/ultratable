import type { MoveTarget } from './ProjectedFinishBoard';

/**
 * Apply a drag-and-drop move to the slot array.
 *
 * - Any → pool: unplace the team (its source slot, if any, goes null).
 * - Any → slot: place the team at the destination. If that slot is
 *   occupied, the displaced team bumps one slot toward the source — up
 *   when the user dragged DOWN (source above destination), down when the
 *   user dragged UP (source below destination). The bump cascades
 *   one-at-a-time until it lands on an empty slot.
 *
 *   For slot→slot moves the cascade always terminates at the now-empty
 *   source position (we clear it before cascading), so nobody falls out.
 *
 *   For pool→slot moves we don't have a source position. The cascade
 *   prefers DOWN, but flips to UP when every slot from the destination to
 *   the end of the list is already full (i.e. there's no room below the
 *   drop). This keeps a placed team from getting kicked back to the pool
 *   when there's a perfectly good empty slot somewhere above the drop.
 *   The pool→slot path is the only one that can ever push a team to the
 *   pool — and only when there's no room in either direction, which can
 *   only happen if the slots are saturated (which by construction means
 *   the pool is empty, so this never fires in practice).
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
    if (sourceIdx === destIdx) return [...slots];

    // Cascade direction:
    //   - Slot source above destination (moving down) → cascade UP toward
    //     source so the in-between items shift to fill the source's gap.
    //   - Slot source below destination (moving up) → cascade DOWN toward
    //     source.
    //   - Pool source → prefer DOWN, fall back to UP when the slots below
    //     the destination are all full.
    let step: -1 | 1;
    if (sourceIdx === -1) {
        const hasRoomBelow = next.slice(destIdx + 1).some((s) => s === null);
        step = hasRoomBelow ? 1 : -1;
    } else {
        step = sourceIdx < destIdx ? -1 : 1;
    }

    let toPlace: string | null = teamId;
    let i = destIdx;
    while (i >= 0 && i < next.length && toPlace !== null) {
        const displaced = next[i];
        next[i] = toPlace;
        toPlace = displaced;
        i += step;
    }
    return next;
}
