/**
 * Client-side mirror of the server's TierRankableType recipe projection
 * (apps/service/src/entities/tier-rankable-types/). The editor pool
 * drawer needs to know — for each source row in the recipe's source
 * table — what `AddTierRankableItemInput` shape to submit. Rather than
 * round-trip every candidate through the server, the drawer projects
 * client-side and the server validates / persists on add.
 *
 * If a third recipe lands, add a new candidate-builder here; the
 * AddPoolItemInput shape is recipe-agnostic.
 */

export interface AddPoolItemInput {
    tierRankableTypeId: string;
    naturalKey: string;
    name: string;
    imageUrl: string | null;
    teamId: string | null;
    sourceType: string | null;
    sourceId: string | null;
    sourcePath: unknown | null;
}

/**
 * Coach candidate — projected from one fixture's lineup. Multiple
 * fixtures with the same coach collapse to one entry via natural-key
 * dedup. `sourceId` is the fixture id where the coach was first seen
 * (server preserves it on insert; later fixtures with the same coach
 * are dedup'd by the server's `addTierRankableItem`).
 */
export interface CoachCandidate extends AddPoolItemInput {
    /** Cached display extras for the drawer UI. */
    teamName: string;
    teamLogo: string | null;
    photo: string | null;
}

interface CoachInputFixture {
    id: string;
    lineups: Array<{
        teamSourceId: number;
        coachName: string | null;
        coachPhoto: string | null;
    }>;
}

interface CoachInputTeam {
    id: string;
    name: string;
    logo: string | null;
    sourceId: number;
    metadata: { sourceName: string } | null;
}

/**
 * Walk every fixture's lineups and project unique coaches.
 * Uniqueness mirrors the server's coach recipe natural key
 * (`<teamId>|<lowercased name>`).
 */
export function buildCoachCandidates(
    fixtures: CoachInputFixture[],
    teams: CoachInputTeam[],
): CoachCandidate[] {
    const teamBySource = new Map<string, CoachInputTeam>();
    for (const t of teams) {
        if (t.metadata?.sourceName) {
            teamBySource.set(`${t.metadata.sourceName}|${t.sourceId}`, t);
        }
    }

    const seen = new Map<string, CoachCandidate>();
    for (const fx of fixtures) {
        for (const lu of fx.lineups) {
            const name = lu.coachName?.trim();
            if (!name) continue;
            // Resolve teamSourceId → local team. Walk both teams; first
            // matching source wins because we don't know which provider
            // this lineup came from up front.
            let team: CoachInputTeam | null = null;
            for (const t of teams) {
                if (t.sourceId === lu.teamSourceId) {
                    team = t;
                    break;
                }
            }
            if (!team) continue;
            const naturalKey = `${team.id}|${name.toLowerCase()}`;
            if (seen.has(naturalKey)) continue;
            const sourceName = team.metadata?.sourceName ?? 'unknown';
            seen.set(naturalKey, {
                tierRankableTypeId: 'coach',
                naturalKey,
                name,
                imageUrl: lu.coachPhoto,
                teamId: team.id,
                sourceType: 'fixture',
                sourceId: fx.id,
                sourcePath: { teamSourceId: lu.teamSourceId, sourceName },
                teamName: team.name,
                teamLogo: team.logo,
                photo: lu.coachPhoto,
            });
        }
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export interface VenueCandidate extends AddPoolItemInput {
    city: string | null;
    capacity: number | null;
}

interface VenueInput {
    id: string;
    name: string;
    city: string | null;
    capacity: number | null;
    image: string | null;
}

export function buildVenueCandidates(venues: VenueInput[]): VenueCandidate[] {
    return venues
        .filter((v) => v.name.trim().length > 0)
        .map((v) => ({
            tierRankableTypeId: 'venue',
            naturalKey: v.id,
            name: v.name.trim(),
            imageUrl: v.image,
            teamId: null,
            sourceType: 'venue',
            sourceId: v.id,
            sourcePath: null,
            city: v.city,
            capacity: v.capacity,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}
