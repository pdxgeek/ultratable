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
    syncFixtures(
        leagueSourceId: number,
        season: number,
        reporter?: JobReporter,
    ): Promise<SyncResult<typeof schema.fixtures.$inferSelect>>;

    getMatchEvents(fixtureId: number): Promise<import('../integrations/types').IngestedEvent[]>;
    getLineups(fixtureId: number): Promise<import('../integrations/types').IngestedLineup[]>;
}
