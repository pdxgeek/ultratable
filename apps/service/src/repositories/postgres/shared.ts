import { sql } from 'drizzle-orm';

/**
 * Postgres now() returns microsecond precision, but the GraphQL DateTime scalar
 * truncates to milliseconds. Using raw now() causes phantom deltas: the client
 * watermark (ms) is always less than the stored value (µs), so rows re-appear
 * in every delta sync. Truncating to milliseconds keeps them in sync.
 */
export const NOW_MS = sql`date_trunc('milliseconds', now())`;

/**
 * Default sort order for a newly-promoted league, copied onto each season at import time.
 * Mirrors the EFL tiebreaker hierarchy: Points → GD → Goals For → Head-to-Head → Wins → Away Goals.
 * (Disciplinary record is part of the EFL spec too but isn't implemented yet — card data isn't synced.)
 */
export const DEFAULT_RANKING_CRITERIA = ['standard_pts', 'goal_diff', 'goals_for', 'head_to_head', 'wins', 'away_goals'];

/**
 * Shared SET clause for fixture upserts. Centralised because four code paths
 * (initial sync, live polling, stale polling, daily discovery) all upsert
 * fixtures and must stay aligned on which columns get overwritten.
 */
export const FIXTURE_UPSERT_SET = {
    scheduledAt: sql`EXCLUDED.scheduled_at`,
    status: sql`EXCLUDED.status`,
    homeGoals: sql`EXCLUDED.home_goals`,
    awayGoals: sql`EXCLUDED.away_goals`,
    venueId: sql`EXCLUDED.venue_id`,
    gameweek: sql`EXCLUDED.gameweek`,
    updatedAt: NOW_MS
};

export interface FixtureLookups {
    teamMap: Map<number, string>;
    teamVenueMap: Map<string, string>;
    venueMap: Map<number, string>;
}
