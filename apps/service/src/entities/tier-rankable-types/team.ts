/**
 * Team recipe — projects a `Team` row from the first-class teams table
 * into the tier-rankable-item display contract.
 *
 * The team's UUID is the natural key (cross-user identity is the team
 * itself), the team's name is the display name, and the team's crest
 * is the thumbnail image. Unlike coach/venue items, team items
 * deliberately leave `teamId = null` so the universal renderer doesn't
 * double up — the thumbnail already IS the team logo, and the display
 * name already IS the team name.
 */
import type {
    TierRankableTypeProjection,
    TierRankableTypeRecipe,
} from './recipe';

/**
 * Source row consumed by the recipe. Built from a `teams` row by the
 * discovery resolver (production) or fixtures (unit tests). Only the
 * fields the projection needs.
 */
export interface TeamSourceRow {
    /** Internal `teams.id` UUID. Doubles as the natural key. */
    teamId: string;
    name: string;
    logo: string | null;
}

export const teamRecipe: TierRankableTypeRecipe<TeamSourceRow> = {
    id: 'team',
    name: 'Team',
    sourceType: 'team',

    async project(src): Promise<TierRankableTypeProjection> {
        const trimmedName = src.name.trim();
        if (trimmedName.length === 0) {
            throw new Error(`Team recipe: team ${src.teamId} has no name`);
        }
        return {
            name: trimmedName,
            imageUrl: src.logo,
            // Intentional: the thumbnail IS the team crest and the
            // display name IS the team name, so attaching a teamId
            // here would just duplicate both pieces on every item.
            teamId: null,
            naturalKey: src.teamId,
            sourceType: 'team',
            sourceId: src.teamId,
            sourcePath: null,
        };
    },
};
