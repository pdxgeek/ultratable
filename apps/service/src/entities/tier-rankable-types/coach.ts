/**
 * Coach recipe — projects a `Coach` row from the first-class coaches
 * table into the tier-rankable-item display contract.
 *
 * Coaches are populated by `/coachs?team=<sourceId>` per team in a
 * season (see [[../../repositories/coaches.ts]]). At item add time the
 * recipe just snapshots `name`, `photo`, and the current team — no
 * upstream calls happen inside the recipe.
 *
 * Identity rule: `<teamId>|<lowercased name>`. Keeping the team in the
 * natural key matches the umbrella #110 design — "Pep at City" and
 * "Pep at Bayern" are intentionally distinct identities, so a manager
 * change doesn't silently mutate every user's tier-list ranking of the
 * outgoing coach.
 */
import type {
    TierRankableTypeProjection,
    TierRankableTypeRecipe,
} from './recipe';

/**
 * Source row consumed by the recipe. Built either from a `coaches`
 * table row (production path) or a test fixture (unit tests). The
 * shape deliberately omits provider-side fields the recipe doesn't
 * use; if a future flag needs them, widen the interface here.
 */
export interface CoachSourceRow {
    /** Internal `coaches.id` UUID. Becomes the item's `sourceId`. */
    coachId: string;
    /** Internal `teams.id` UUID. Already resolved by the caller. */
    teamId: string;
    /** Display name. */
    name: string;
    /** Headshot URL or null. */
    photo: string | null;
}

export const coachRecipe: TierRankableTypeRecipe<CoachSourceRow> = {
    id: 'coach',
    name: 'Coach',
    sourceType: 'coach',

    async project(src): Promise<TierRankableTypeProjection> {
        const trimmedName = src.name.trim();
        if (trimmedName.length === 0) {
            throw new Error(`Coach recipe: coach ${src.coachId} has no name`);
        }
        return {
            name: trimmedName,
            imageUrl: src.photo,
            teamId: src.teamId,
            naturalKey: `${src.teamId}|${trimmedName.toLowerCase()}`,
            sourceType: 'coach',
            sourceId: src.coachId,
            sourcePath: null,
        };
    },
};
