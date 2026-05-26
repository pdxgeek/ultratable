import * as schema from '../db/schema';
import { JobReporter } from '../workers/runner';
import { SyncResult } from './shared';

// Dual-ID contract (AI_README_FIRST.MD §1): parameters that carry an external
// provider ID MUST end in `SourceId`. `fixtureId` is reserved for the internal
// Postgres UUID.
export interface FixturesRepository {
    getFixtures(
        leagueSourceId: number,
        season: number,
        since?: Date,
    ): Promise<Array<typeof schema.fixtures.$inferSelect>>;
    getFixtureById(fixtureId: string): Promise<typeof schema.fixtures.$inferSelect | null>;
    getFixturesBySeasonId(
        seasonId: string,
        since?: Date,
        forceRefresh?: boolean,
    ): Promise<Array<typeof schema.fixtures.$inferSelect>>;
    countFixturesInSeason(seasonId: string): Promise<number>;

    /**
     * Every fixture in a (season, gameweek), any status. Powers the Gameweek
     * editor — the UI greys out non-`scheduled` rows but needs the full set
     * so users can see what's already played.
     */
    getFixturesByGameweek(
        seasonId: string,
        gameweek: number,
    ): Promise<Array<typeof schema.fixtures.$inferSelect>>;

    /**
     * Rescheduled-window fixtures around a gameweek: `status='scheduled'`
     * fixtures whose `scheduledAt` sits **after the latest fixture of the
     * previous gameweek** and **before the earliest fixture of the next
     * gameweek**, excluding the gameweek's own fixtures. Returns `[]` for
     * the first/last gameweek (no neighbouring window exists).
     */
    getRecommendedRescheduledFixtures(
        seasonId: string,
        gameweek: number,
    ): Promise<Array<typeof schema.fixtures.$inferSelect>>;

    /**
     * Gameweeks in the season with at least one `status='scheduled'` fixture
     * remaining. Sorted by gameweek number ascending.
     *
     * Used server-side by the `submitGameweekPick` GAMEWEEK_CLOSED guard.
     * The frontend Add-gameweek dialog uses
     * `listSelectableGameweeksByNextKickoff` instead so MLS-style
     * straggler-gameweeks (mostly played, one rescheduled match months in
     * the future) sort to the bottom of the picker.
     */
    listSelectableGameweeks(seasonId: string): Promise<number[]>;

    /**
     * Selectable gameweeks paired with their next scheduled kickoff
     * (`min(scheduledAt) WHERE status='scheduled'`). Sorted by that kickoff
     * ascending so the soonest fixture is on top — the natural order for a
     * "what's playing soon?" picker (#144). A gameweek with all played
     * fixtures except one rescheduled stray sorts to wherever that stray
     * sits in the calendar, rather than near the top by gameweek number.
     */
    listSelectableGameweeksByNextKickoff(seasonId: string): Promise<
        Array<{ gameweek: number; nextKickoff: Date }>
    >;

    /**
     * Default landing gameweek for the editor: the earliest selectable
     * gameweek. Returns `null` once the season is fully played.
     */
    getActiveGameweek(seasonId: string): Promise<number | null>;
    syncFixtures(
        leagueSourceId: number,
        season: number,
        reporter?: JobReporter,
    ): Promise<SyncResult<typeof schema.fixtures.$inferSelect>>;

    getMatchEvents(fixtureId: number): Promise<import('../integrations/types').IngestedEvent[]>;
    getLineups(fixtureId: number): Promise<import('../integrations/types').IngestedLineup[]>;
}
