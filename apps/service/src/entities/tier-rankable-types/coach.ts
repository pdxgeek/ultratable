/**
 * Coach recipe — projects a coach tier-rankable-item snapshot out of a
 * fixture lineup. Coaches aren't first-class entities in this codebase;
 * their data lives inside `fixtures.lineups[i]`. This recipe is the
 * only lens that lets the tier-list product rank coaches.
 *
 * Identity rule: `(teamId, lowercased name)`. A new coach for a team is
 * a fresh natural key (tier lists ranking the old coach keep their
 * reference). Two users picking the same coach for the same team share
 * the same `(tier_rankable_type_id, natural_key)`, which is what powers
 * cross-user aggregates like "most-ranked Pep".
 */
import type {
    TierRankableTypeProjection,
    TierRankableTypeRecipe,
} from './recipe';

/**
 * One lineup entry within a fixture, sufficient to project a coach
 * snapshot. The editor / bulk helpers extract this shape from the
 * existing GraphQL `Lineup` type before calling the recipe.
 */
export interface CoachSourceRow {
    /** Fixture id — recorded in `sourcePath` so refresh-from-source can find it. */
    fixtureId: string;
    /** Provider id for the team this lineup belongs to. */
    teamSourceId: number;
    /** Which provider this `teamSourceId` is scoped to (e.g. 'api-football'). */
    sourceName: string;
    /** From `lineup.coachName`. May be null if the provider didn't report it. */
    coachName: string | null;
    /** From `lineup.coachPhoto`. */
    coachPhoto: string | null;
}

export const coachRecipe: TierRankableTypeRecipe<CoachSourceRow> = {
    id: 'coach',
    name: 'Coach',
    sourceType: 'fixture',

    async project(src, ctx): Promise<TierRankableTypeProjection> {
        if (!src.coachName || src.coachName.trim().length === 0) {
            throw new Error(
                `Coach recipe: lineup for fixture ${src.fixtureId} has no coachName`,
            );
        }

        const teamMap = await ctx.resolveTeamIdsBySource(src.sourceName, [src.teamSourceId]);
        const teamId = teamMap.get(src.teamSourceId) ?? null;
        if (!teamId) {
            throw new Error(
                `Coach recipe: no local team for source ${src.sourceName}:${src.teamSourceId}`,
            );
        }

        const trimmedName = src.coachName.trim();
        const normalisedName = trimmedName.toLowerCase();

        return {
            name: trimmedName,
            imageUrl: src.coachPhoto,
            teamId,
            naturalKey: `${teamId}|${normalisedName}`,
            sourceType: 'fixture',
            sourceId: src.fixtureId,
            sourcePath: { teamSourceId: src.teamSourceId, sourceName: src.sourceName },
        };
    },
};
