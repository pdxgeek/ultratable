/**
 * Per-fixture draft helpers for the Gameweek-predictions editor (#144).
 *
 * Each row is the unsaved state of one fixture's pick — homeGoals, awayGoals,
 * note, manuallyAdded flag. The user's per-row "Lock" button is what commits
 * the draft to the server via `submitGameweekPick`; on success the row's
 * draft is cleared. Drafts are scoped to (user, season, gameweek, fixture)
 * so cross-week navigation doesn't lose state and signing in/out keeps a
 * clean slate.
 */
import { db, type GameweekPredictionDraft } from './index';

export interface GameweekDraftKeyArgs {
    userId: string;
    seasonId: string;
    gameweek: number;
    fixtureId: string;
}

export const gameweekDraftKey = ({
    userId,
    seasonId,
    gameweek,
    fixtureId,
}: GameweekDraftKeyArgs): string =>
    `${userId}__${seasonId}__${gameweek}__${fixtureId}`;

/**
 * Returns `null` (not `undefined`) when no row exists so `useLiveQuery`
 * callers can distinguish "loading" (returns `undefined`) from "loaded, no
 * saved draft" (returns `null`). Mirrors the predictionDrafts convention.
 */
export const loadGameweekDraft = async (
    key: string,
): Promise<GameweekPredictionDraft | null> => {
    const row = await db.gameweekPredictionDrafts.get(key);
    return row ?? null;
};

/**
 * Returns every draft for a single (user, season, gameweek) — the editor's
 * one-shot hydration call. Indexed by the compound `[userId+seasonId+gameweek]`
 * so the query is cheap.
 */
export const loadGameweekDraftsForSlip = async (args: {
    userId: string;
    seasonId: string;
    gameweek: number;
}): Promise<GameweekPredictionDraft[]> => {
    return db.gameweekPredictionDrafts
        .where('[userId+seasonId+gameweek]')
        .equals([args.userId, args.seasonId, args.gameweek])
        .toArray();
};

export const saveGameweekDraft = async (args: {
    keyArgs: GameweekDraftKeyArgs;
    homeGoals: number | null;
    awayGoals: number | null;
    note: string | null;
    manuallyAdded: boolean;
}): Promise<void> => {
    await db.gameweekPredictionDrafts.put({
        id: gameweekDraftKey(args.keyArgs),
        userId: args.keyArgs.userId,
        seasonId: args.keyArgs.seasonId,
        gameweek: args.keyArgs.gameweek,
        fixtureId: args.keyArgs.fixtureId,
        homeGoals: args.homeGoals,
        awayGoals: args.awayGoals,
        note: args.note,
        manuallyAdded: args.manuallyAdded,
        updatedAt: new Date().toISOString(),
    });
};

export const clearGameweekDraft = async (key: string): Promise<void> => {
    await db.gameweekPredictionDrafts.delete(key);
};
