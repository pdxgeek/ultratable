/**
 * Predictions repository contract.
 *
 * Snapshots are immutable once created — there is no update path; new
 * predictions create new snapshots. Deletion is soft: `deletedAt` is set,
 * the row stays. The per-user/season cap counts every row including soft-
 * deleted ones so create/delete loops can't bypass the limit (this is the
 * whole point of going soft).
 *
 * `includeDeleted` is an explicit flag at the contract level rather than a
 * hardcoded `WHERE deleted_at IS NULL` clause. Today every non-admin path
 * passes `includeDeleted: false`; future admin tooling will toggle it on
 * without a backend refactor.
 *
 * See issue #105 for the full spec.
 */

/** Discriminator surfaced to GraphQL as the `PredictionType` enum. */
export type PredictionType = 'projected_finish';

export interface PredictionSnapshotEntryRow {
    teamId: string;
    position: number;
}

export interface PredictionSnapshotRow {
    id: string;
    userId: string;
    seasonId: string;
    type: PredictionType;
    /**
     * Non-null for `projected_finish` (immutable; set at create and never
     * cleared). Nullable for `gameweek` — null while unlocked, set on each
     * `lock`/`relock`. See #144 for the lifecycle.
     */
    lockedAt: Date | null;
    deletedAt: Date | null;
}

export interface CreatePredictionSnapshotInput {
    userId: string;
    seasonId: string;
    type: PredictionType;
    entries: PredictionSnapshotEntryRow[];
}

export interface PredictionsRepository {
    /**
     * Insert a new snapshot + its entries in a single transaction. The
     * caller is responsible for validating the entries (every team in the
     * season exactly once) and enforcing the per-scope cap before calling.
     */
    createSnapshot(input: CreatePredictionSnapshotInput): Promise<PredictionSnapshotRow>;

    /**
     * Newest-first listing for `(userId, seasonId, type)`. Defaults to live
     * rows only; pass `includeDeleted: true` for admin tooling.
     */
    listSnapshots(args: {
        userId: string;
        seasonId: string;
        type: PredictionType;
        includeDeleted?: boolean;
    }): Promise<PredictionSnapshotRow[]>;

    /**
     * Fetch a snapshot by id. Returns null when the row doesn't exist or is
     * soft-deleted (unless `includeDeleted: true`). Ownership is enforced
     * by the resolver via CASL, not by this method.
     */
    getSnapshotById(args: {
        id: string;
        includeDeleted?: boolean;
    }): Promise<PredictionSnapshotRow | null>;

    /** Entries for a snapshot, ordered by `position` ascending. */
    listSnapshotEntries(snapshotId: string): Promise<PredictionSnapshotEntryRow[]>;

    /**
     * Batched variant for DataLoader. Returns one entry list per requested
     * snapshot id, in the same order, so the loader can map them back.
     */
    listSnapshotEntriesByIds(
        snapshotIds: readonly string[],
    ): Promise<Map<string, PredictionSnapshotEntryRow[]>>;

    /**
     * Soft-delete: set `deletedAt = now()` if the row is live, otherwise no-op.
     * Idempotent — caller can re-issue without an error. Returns the snapshot
     * id when the row exists (live or already deleted), null when it doesn't.
     */
    softDeleteSnapshot(id: string): Promise<string | null>;

    /**
     * Count every snapshot in scope (including soft-deleted rows). Used to
     * enforce the per-user/season cap. The `deletedAt IS NULL` filter is
     * intentionally absent.
     */
    countSnapshotsInScope(args: {
        userId: string;
        seasonId: string;
        type: PredictionType;
    }): Promise<number>;

    /**
     * Number of distinct gameweeks in a season. Drives the dynamic ceiling
     * `max(50, gameweekCountForSeason)`. Returns 0 when fixtures haven't
     * been imported yet (callers fall back to the floor).
     */
    countGameweeksInSeason(seasonId: string): Promise<number>;
}
