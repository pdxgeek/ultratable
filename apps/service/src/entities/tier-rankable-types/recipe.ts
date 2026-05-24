/**
 * TierRankableType recipe registry.
 *
 * Each recipe is a TypeScript object that knows how to project a domain
 * source row (a fixture lineup, a player row, a venue row) onto the
 * tier-rankable-item display contract:
 *
 *   { name, imageUrl, teamId, naturalKey, sourceType, sourceId, sourcePath }
 *
 * Recipes are paired 1:1 with rows in the `tier_rankable_type` DB table —
 * the row is the registration handle (id + name + formula seam), the
 * recipe is the projection code. Boot-time validation asserts both
 * sides line up (see [[./registry.ts]]).
 *
 * The tier-list editor calls into the recipe at add time:
 *
 *   const projection = await recipe.project(sourceRow, ctx);
 *   await repository.tierLists.addTierRankableItem({ tierListId, ...projection });
 *
 * Each recipe also declares its `sourceType` so callers know which kind
 * of row to feed it. Bulk helpers ("discoverGoaliesForSeason") live
 * elsewhere and produce arrays of `TierRankableTypeProjection` for the
 * editor to bulk-insert.
 */

/**
 * The output every recipe is contractually required to produce. These
 * are the fields that get stored on `tier_rankable_item` at add time.
 * Missing this contract is a compile error — recipes can't omit fields.
 */
export interface TierRankableTypeProjection {
    /** Display name (e.g. "Pep Guardiola"). NOT NULL. */
    name: string;
    /** Display image url. May be null when the source has no photo. */
    imageUrl: string | null;
    /** Team association (FK uuid). May be null for entities without one. */
    teamId: string | null;
    /**
     * Per-instance stable id within the recipe (e.g. `<teamId>|pep guardiola`).
     * Together with the recipe id, this is the cross-user identity for the
     * instance — two users adding the same Pep produce items that share
     * `(tier_rankable_type_id, natural_key)`.
     */
    naturalKey: string;
    /** Source back-pointer (where this snapshot came from). */
    sourceType: string | null;
    sourceId: string | null;
    sourcePath: unknown | null;
}

/**
 * Minimal context a recipe needs during projection. Kept tiny on
 * purpose — recipes that need more data (e.g. team reverse-lookup) get
 * it via the helpers passed here, not by reaching into the repository
 * singleton. Keeps unit tests simple.
 */
export interface RecipeContext {
    /**
     * Reverse-lookup helper: maps provider `teamSourceId` (Int) to local
     * `teams.id` (UUID). Used by the coach recipe to resolve the team
     * from a fixture lineup. Batched in the repo.
     */
    resolveTeamIdsBySource(
        sourceName: string,
        sourceIds: readonly number[],
    ): Promise<Map<number, string>>;
}

/**
 * A recipe is parameterised by its source-row type — `SourceRow` is
 * whatever the editor / bulk helper hands the recipe. For the coach
 * recipe, that's a `{ fixture, lineup }` tuple; for player, a player
 * row; for venue, a venue row. The shape is recipe-private.
 */
export interface TierRankableTypeRecipe<SourceRow> {
    /** Matches the `tier_rankable_type.id` row. */
    readonly id: string;
    /** Display label. Matches `tier_rankable_type.name`. */
    readonly name: string;
    /**
     * The kind of source row this recipe consumes. Surfaced in
     * `TierRankableTypeProjection.sourceType` and helps the editor know
     * which add-drawer to wire up.
     */
    readonly sourceType: string;

    /**
     * Produce the item projection for one source row. Every field in
     * `TierRankableTypeProjection` must be populated (or explicitly null
     * where the type allows it).
     */
    project(source: SourceRow, ctx: RecipeContext): Promise<TierRankableTypeProjection>;
}
