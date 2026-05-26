/**
 * Gameweek-predictions repository contract.
 *
 * Two-entity slice: a thin `gameweek_predictions` container per
 * (user, season, gameweek) and an append-only `gameweek_prediction_picks`
 * ledger. The container is lazily created on first pick. Pick rows are
 * immutable — committing == locking; the latest row per (prediction,
 * fixture) is the "current" pick and the chain is the audit trail. See
 * issue #144 for the full design rationale.
 *
 * Resolver-layer concerns (CASL gating, GAMEWEEK_CLOSED, fixture-status
 * validation, INVALID_MANUAL_ADD rescheduled-window check) live in
 * `apps/service/src/schema/gameweek-predictions.ts` — this repository
 * only owns the storage shape.
 */

export interface GameweekPredictionRow {
    id: string;
    userId: string;
    seasonId: string;
    gameweek: number;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
}

export interface GameweekPredictionPickRow {
    id: string;
    predictionId: string;
    fixtureId: string;
    homeGoals: number | null;
    awayGoals: number | null;
    note: string | null;
    manuallyAdded: boolean;
    /** Commit time. Doubles as `lockedAt` — there is no separate lock column. */
    createdAt: Date;
}

export interface SubmitGameweekPickInput {
    userId: string;
    seasonId: string;
    gameweek: number;
    fixtureId: string;
    homeGoals: number | null;
    awayGoals: number | null;
    note: string | null;
    manuallyAdded: boolean;
}

export interface SubmitGameweekPickResult {
    prediction: GameweekPredictionRow;
    pick: GameweekPredictionPickRow;
    /**
     * True when an identical pick already existed and we skipped the insert.
     * The returned `pick` is the existing latest row in that case; the
     * container's `updatedAt` is NOT bumped.
     */
    deduped: boolean;
}

export interface GameweekPredictionsRepository {
    /**
     * Lazy container upsert + dedup-aware pick insertion in one transaction.
     *
     *   1. Find-or-create the live container for (user, season, gameweek).
     *   2. Read the latest pick for (predictionId, fixtureId).
     *   3. If scores+note+manuallyAdded all match → return existing pick,
     *      `deduped: true`, no insert, no `updatedAt` bump.
     *   4. Otherwise insert a new pick row and bump container `updatedAt`.
     *
     * The caller is responsible for all upstream validation (fixture status,
     * gameweek closed, manual-add rescheduled-window). This method assumes
     * the payload is well-formed by the time it arrives.
     */
    submitPick(input: SubmitGameweekPickInput): Promise<SubmitGameweekPickResult>;

    /**
     * The viewer's live slips for a season, newest activity first.
     * `includeDeleted` exists for admin tooling (no caller today).
     */
    listPredictionsForUser(args: {
        userId: string;
        seasonId: string;
        includeDeleted?: boolean;
    }): Promise<GameweekPredictionRow[]>;

    /**
     * The viewer's live slip for `(season, gameweek)`, or null when none
     * exists. Used by the "what's my current slip" editor lookup.
     */
    getPredictionForWeek(args: {
        userId: string;
        seasonId: string;
        gameweek: number;
    }): Promise<GameweekPredictionRow | null>;

    /**
     * Fetch by id. Returns null when not found or soft-deleted (unless
     * `includeDeleted: true`). Ownership is enforced by the resolver via
     * CASL, not by this method.
     */
    getPredictionById(args: {
        id: string;
        includeDeleted?: boolean;
    }): Promise<GameweekPredictionRow | null>;

    /**
     * Soft-delete: set `deletedAt = now()` if live, otherwise no-op.
     * Idempotent — caller can re-issue. Returns the id when the row
     * exists (live or already deleted), null when it doesn't. Pick rows
     * are intentionally NOT cascade-cleared.
     */
    softDeletePrediction(id: string): Promise<string | null>;

    /**
     * Current picks for a slip — one row per fixture, the latest. Order
     * is unspecified; the resolver re-sorts by fixture `scheduledAt`.
     */
    listCurrentPicks(predictionId: string): Promise<GameweekPredictionPickRow[]>;

    /**
     * Full pick chain for a slip, newest first. Powers the per-fixture
     * history popover and any audit views.
     */
    listPickHistory(predictionId: string): Promise<GameweekPredictionPickRow[]>;

    /**
     * Batched current-picks lookup for DataLoader. Returns one bucket per
     * requested id, with `[]` when the id isn't represented in the picks
     * table.
     */
    listCurrentPicksByPredictionIds(
        predictionIds: readonly string[],
    ): Promise<Map<string, GameweekPredictionPickRow[]>>;

    /**
     * Batched full-history lookup for DataLoader. Each bucket is newest
     * first.
     */
    listPickHistoryByPredictionIds(
        predictionIds: readonly string[],
    ): Promise<Map<string, GameweekPredictionPickRow[]>>;
}
