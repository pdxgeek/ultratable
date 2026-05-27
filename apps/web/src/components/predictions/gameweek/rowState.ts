import type { RowState } from './GameweekBoard';

/**
 * True when the row's Dexie draft differs from the latest committed pick.
 * Lives in its own module rather than alongside the component because the
 * parent section also needs it (for `dirtyCount` and the lock-all walk) and
 * Vite's Fast-Refresh rule forbids non-component exports from component
 * files.
 *
 * Edge cases:
 *   - No draft → not dirty (nothing to commit).
 *   - Draft exists but no committed pick yet → dirty iff at least one of
 *     scores or note is set. A blank "added manually" row that the user
 *     never touched stays clean; lock-in skips it.
 *   - Draft differs from current pick on scores or note → dirty.
 *     `manuallyAdded` is intentionally NOT in the diff: it's set once when
 *     the row enters the slip and shouldn't trigger a re-commit just
 *     because the bookkeeping flag changed.
 */
export function isDirty(row: RowState): boolean {
    if (!row.draft) return false;
    const c = row.currentPick;
    if (!c) {
        return (
            row.draft.homeGoals != null ||
            row.draft.awayGoals != null ||
            (row.draft.note ?? '').length > 0
        );
    }
    return (
        row.draft.homeGoals !== c.homeGoals ||
        row.draft.awayGoals !== c.awayGoals ||
        (row.draft.note ?? null) !== (c.note ?? null)
    );
}
