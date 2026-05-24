/**
 * Coaches repository — first-class entity backed by API-Football's
 * `/coachs?team=<sourceId>` endpoint.
 *
 * The discovery resolver for the tier-list coach drawer reads from
 * this table directly. Cold-cache reads trigger a per-team upstream
 * fetch via [[getOrSyncCoachForTeam]], which dedup-upserts and bounds
 * the upstream call count to one per team in a season.
 */
import * as schema from '../db/schema';
import type { IngestedCoach } from '../integrations/types';

export type CoachRow = typeof schema.coaches.$inferSelect;

export interface CoachesRepository {
    /** All coaches currently assigned to a team that participates in the season. */
    getCoachesBySeasonId(seasonId: string): Promise<CoachRow[]>;

    /** Single lookup by our internal team UUID. */
    getCoachByTeamId(teamId: string): Promise<CoachRow | null>;

    /** Insert/refresh from an upstream projection; idempotent on `(sourceName, sourceId)`. */
    upsertCoach(input: IngestedCoach): Promise<CoachRow>;

    /**
     * Return the cached coach for `teamId`, or — if none stored — fetch
     * from the upstream provider, upsert, and return. Errors propagate so
     * the caller can decide whether to fall back (the discovery resolver
     * swallows them; an explicit admin sync surfaces them).
     */
    getOrSyncCoachForTeam(teamId: string, teamSourceId: number): Promise<CoachRow | null>;
}
