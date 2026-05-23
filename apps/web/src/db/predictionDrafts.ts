import type { PredictionType } from '../components/predictions/queries';

import { db, type PredictionDraft } from './index';

export interface DraftKeyArgs {
    userId: string;
    seasonId: string;
    type: PredictionType;
}

export const draftKey = ({ userId, seasonId, type }: DraftKeyArgs): string =>
    `${userId}__${seasonId}__${type}`;

// Returns `null` (not `undefined`) when no row exists so callers using
// `useLiveQuery` can distinguish "loading" (returns `undefined`) from
// "loaded, no saved draft" (returns `null`). If both paths returned
// `undefined`, the hydration gate in the page would never open for a
// brand-new user and nothing would ever get persisted.
export const loadDraft = async (key: string): Promise<PredictionDraft | null> => {
    const row = await db.predictionDrafts.get(key);
    return row ?? null;
};

export const saveDraft = async (key: string, slots: (string | null)[]): Promise<void> => {
    await db.predictionDrafts.put({
        id: key,
        slots,
        updatedAt: new Date().toISOString(),
    });
};

export const clearDraft = async (key: string): Promise<void> => {
    await db.predictionDrafts.delete(key);
};

/**
 * Sanitize a draft loaded from Dexie against the season's current team set.
 *
 * - Length mismatch (team count changed since the draft was saved) → discard
 *   entirely, return null.
 * - Unknown teamId in a slot → set that slot to null. The slot becomes empty;
 *   any other valid teamIds stay placed.
 *
 * This keeps stale drafts from poisoning the page (e.g. a teamId that was
 * removed mid-season can't end up rendered as undefined).
 */
export const sanitizeDraftSlots = (
    saved: (string | null)[],
    validTeamIds: ReadonlySet<string>,
    expectedLength: number,
): (string | null)[] | null => {
    if (saved.length !== expectedLength) return null;
    return saved.map((id) => (id && validTeamIds.has(id) ? id : null));
};
