/**
 * Venue recipe — projects a venue tier-rankable-item snapshot out of a
 * row from the `venues` table. Unlike coaches (which only exist as
 * sub-records on fixture lineups), venues are first-class entities, so
 * the source row IS a venue row.
 *
 * Identity rule: the venue UUID itself is the per-instance stable id.
 * Two users adding the same venue produce items that share
 * `(tier_rankable_type_id, natural_key)` and aggregate cleanly across
 * users (e.g. "most-ranked Old Trafford").
 */
import type {
    TierRankableTypeProjection,
    TierRankableTypeRecipe,
} from './recipe';

/**
 * Minimal source shape needed to project a venue snapshot. The editor
 * add-drawer extracts this from a `Venue` GraphQL row before calling
 * the recipe.
 *
 * `city` and `capacity` are optional metadata — included so the drawer
 * can render an informative subtitle while the user picks ("Old Trafford
 * — Manchester · 74,310 seats") even though only `id` + `name` are
 * structurally required by the projection.
 */
export interface VenueSourceRow {
    /** Local `venues.id` UUID. Both the natural key and the source pointer. */
    venueId: string;
    name: string;
    image: string | null;
    city: string | null;
    capacity: number | null;
}

export const venueRecipe: TierRankableTypeRecipe<VenueSourceRow> = {
    id: 'venue',
    name: 'Venue',
    sourceType: 'venue',

    async project(src): Promise<TierRankableTypeProjection> {
        const trimmedName = src.name.trim();
        if (trimmedName.length === 0) {
            throw new Error(`Venue recipe: venue ${src.venueId} has no name`);
        }
        return {
            name: trimmedName,
            imageUrl: src.image,
            // Venues belong to a venue, not a team. The team-crest overlay
            // simply won't render for venue items — the universal item
            // renderer handles a null team gracefully.
            teamId: null,
            naturalKey: src.venueId,
            sourceType: 'venue',
            sourceId: src.venueId,
            sourcePath: null,
        };
    },
};
