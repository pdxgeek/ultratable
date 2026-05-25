/**
 * TierRankableType recipe registry — central index for every recipe
 * registered in code. Paired 1:1 with rows in `tier_rankable_type`; the
 * boot-time validator below asserts both sides line up so a recipe
 * can't exist without its DB registration (or vice versa).
 *
 * Adding a new recipe: write the recipe object (see [[./coach.ts]]),
 * register it here, write a migration inserting the row into
 * `tier_rankable_type`. The boot check catches missed steps.
 */
import { repository } from '../../repositories';
import { coachRecipe } from './coach';
import type { TierRankableTypeRecipe } from './recipe';
import { teamRecipe } from './team';
import { venueRecipe } from './venue';

/**
 * Every registered recipe. Indexed by id for resolver dispatch.
 *
 * The unknown source-row parameter is intentional — recipes are
 * called by per-source-kind code paths (editor add-drawers, bulk
 * helpers) that know the concrete `SourceRow` type. The registry
 * just hands the recipe object back; the caller narrows.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const recipes: Record<string, TierRankableTypeRecipe<any>> = {
    [coachRecipe.id]: coachRecipe,
    [venueRecipe.id]: venueRecipe,
    [teamRecipe.id]: teamRecipe,
};

export function getRecipe(id: string): TierRankableTypeRecipe<unknown> | undefined {
    return recipes[id];
}

export function listRecipeIds(): string[] {
    return Object.keys(recipes);
}

export function listAllRecipes(): TierRankableTypeRecipe<unknown>[] {
    return Object.values(recipes);
}

/**
 * Boot-time validator. Called from the service's preflight check; logs
 * and exits if the registry drifts from the DB.
 *
 * Two failure modes:
 *   - A `tier_rankable_type` row has no matching TS recipe
 *     (`addTierRankableItem` for that recipe would throw at runtime).
 *   - A TS recipe has no matching `tier_rankable_type` row (the FK on
 *     `tier_list.tier_rankable_type_id` would reject lists referencing it).
 *
 * Both are loud failures rather than silent runtime errors because the
 * cost of a wrong split here is annoying production bugs.
 */
export async function assertRecipeRegistryMatchesDb(): Promise<void> {
    const dbRows = await repository.tierLists.listTierRankableTypes();
    const dbIds = new Set(dbRows.map((r) => r.id));
    const codeIds = new Set(listRecipeIds());

    const missingInCode: string[] = [];
    const missingInDb: string[] = [];
    for (const id of dbIds) if (!codeIds.has(id)) missingInCode.push(id);
    for (const id of codeIds) if (!dbIds.has(id)) missingInDb.push(id);

    if (missingInCode.length || missingInDb.length) {
        const parts: string[] = [];
        if (missingInCode.length) {
            parts.push(
                `tier_rankable_type rows have no TS recipe: ${missingInCode.join(', ')}`,
            );
        }
        if (missingInDb.length) {
            parts.push(
                `TS recipes have no tier_rankable_type row: ${missingInDb.join(', ')}`,
            );
        }
        throw new Error(
            `TierRankableType registry mismatch — ${parts.join('; ')}. ` +
                'Add the missing row in a migration or register the recipe in ' +
                'apps/service/src/entities/tier-rankable-types/registry.ts.',
        );
    }
}

export { coachRecipe, venueRecipe, teamRecipe };
