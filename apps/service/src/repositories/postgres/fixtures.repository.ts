import { and, count, eq, gt, inArray, lte, notInArray, sql } from 'drizzle-orm';

import { db } from '../../db';
import * as schema from '../../db/schema';
import { IFootballProvider, IngestedFixture } from '../../integrations/types';
import { cacheService, TTL } from '../../services/cache.service';
import { graphicsService } from '../../services/graphics.service';
import { globalLogger } from '../../services/log.service';
import { JobReporter } from '../../workers/runner';
import { FixturesRepository } from '../fixtures';
import { SyncResult } from '../shared';
import { TeamsRepository } from '../teams';
import { FIXTURE_UPSERT_SET, FixtureLookups, NOW_MS } from './shared';

const logger = globalLogger.child({ module: 'PostgresFixturesRepository' });

export class PostgresFixturesRepository implements FixturesRepository {
    constructor(
        private provider: IFootballProvider,
        private teams: TeamsRepository,
    ) {}

    private async loadFixtureLookups(): Promise<FixtureLookups> {
        // venues first then teams — preserves call ordering for tests that
        // distinguish select() calls by index.
        const [currentVenues, teams] = await Promise.all([
            db.select().from(schema.venues).where(eq(schema.venues.sourceName, this.provider.name)),
            db.select().from(schema.teams).where(eq(schema.teams.sourceName, this.provider.name)),
        ]);
        return {
            teamMap: new Map<number, string>(teams.map((t) => [t.sourceId, t.id])),
            teamVenueMap: new Map<string, string>(
                teams.filter((t) => t.venueId).map((t) => [t.id, t.venueId!]),
            ),
            venueMap: new Map<number, string>(currentVenues.map((v) => [v.sourceId, v.id])),
        };
    }

    /**
     * Maps a provider-normalised fixture to a DB row. Returns null when team
     * mapping is missing (so the caller can drop it). Venue falls back to the
     * home team's home venue when the provider omits `fixture.venue.id`, which
     * API-Football routinely does for league play.
     */
    private buildFixtureRow(
        normalized: IngestedFixture,
        leagueId: string,
        seasonId: string,
        lookups: FixtureLookups,
    ): typeof schema.fixtures.$inferInsert | null {
        const homeId = lookups.teamMap.get(normalized.homeTeamSourceId);
        const awayId = lookups.teamMap.get(normalized.awayTeamSourceId);
        if (!homeId || !awayId) return null;

        const fixtureVenueId = normalized.venueSourceId
            ? lookups.venueMap.get(normalized.venueSourceId)
            : undefined;

        return {
            sourceName: normalized.sourceName,
            sourceId: normalized.sourceId,
            leagueId,
            seasonId,
            homeTeamId: homeId,
            awayTeamId: awayId,
            venueId: fixtureVenueId ?? lookups.teamVenueMap.get(homeId) ?? null,
            scheduledAt: new Date(normalized.scheduledAt),
            status: normalized.status,
            homeGoals: normalized.homeGoals,
            awayGoals: normalized.awayGoals,
            gameweek: normalized.gameweek,
            metadata: {},
            updatedAt: NOW_MS as unknown as Date,
        };
    }

    async syncFixtures(
        leagueSourceId: number,
        seasonYear: number,
        reporter?: JobReporter,
    ): Promise<SyncResult<typeof schema.fixtures.$inferSelect>> {
        if (!db) return { data: [], stats: { processedCount: 0, apiCallsCount: 0 } };
        let apiCallsCount = 0;

        const [localLeague] = await db
            .select()
            .from(schema.leagues)
            .where(eq(schema.leagues.sourceId, leagueSourceId));
        if (!localLeague) throw new Error(`League ${leagueSourceId} not found`);

        let [localSeason] = await db
            .select()
            .from(schema.seasons)
            .where(
                sql`${schema.seasons.leagueId} = ${localLeague.id} AND ${schema.seasons.year} = ${seasonYear}`,
            );

        if (!localSeason) {
            // Only create the specific season we need, NOT all seasons
            const [created] = await db
                .insert(schema.seasons)
                .values({
                    leagueId: localLeague.id,
                    year: seasonYear,
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: [schema.seasons.leagueId, schema.seasons.year],
                    set: { updatedAt: new Date() },
                })
                .returning();
            localSeason = created;
        }

        if (!localSeason)
            throw new Error(`Season ${seasonYear} not found for league ${leagueSourceId}`);

        await this.teams.syncTeams(leagueSourceId, seasonYear);
        apiCallsCount++;

        const { fixtures, venues } = await this.provider.getFixtures(leagueSourceId, seasonYear);
        apiCallsCount++;

        await this.teams.upsertVenues(venues);

        const lookups = await this.loadFixtureLookups();

        const fixturesToInsert = fixtures
            .map((normalized) => {
                const row = this.buildFixtureRow(
                    normalized,
                    localLeague.id,
                    localSeason.id,
                    lookups,
                );
                if (!row) {
                    const homeMapped = lookups.teamMap.has(normalized.homeTeamSourceId);
                    const awayMapped = lookups.teamMap.has(normalized.awayTeamSourceId);
                    logger.warn(
                        {
                            homeSource: normalized.homeTeamSourceId,
                            awaySource: normalized.awayTeamSourceId,
                            fixtureSource: normalized.sourceId,
                        },
                        `Dropping fixture ${normalized.sourceId}: missing team mapping (home=${homeMapped}, away=${awayMapped})`,
                    );
                }
                return row;
            })
            .filter(Boolean);

        const totalCount = fixturesToInsert.length;
        let processedCount = 0;
        const BATCH_SIZE = 50;

        for (let i = 0; i < totalCount; i += BATCH_SIZE) {
            const batch = fixturesToInsert.slice(i, i + BATCH_SIZE);
            await db
                .insert(schema.fixtures)
                .values(batch as unknown as (typeof schema.fixtures.$inferInsert)[])
                .onConflictDoUpdate({
                    target: [schema.fixtures.sourceName, schema.fixtures.sourceId],
                    set: FIXTURE_UPSERT_SET,
                });

            processedCount += batch.length;
            if (reporter) {
                await reporter.updateProgress({ processedCount, totalCount });
            }
        }

        if (reporter) {
            await reporter.updateProgress({ processedCount, totalCount });
        }

        // Invalidate the UUID-keyed cache used by getFixturesBySeasonId, which the BFF reads via the `fixtures(seasonId)` GraphQL query.
        cacheService.invalidate(`fixtures:season:${localSeason.id}`);

        const data = await this.getFixtures(leagueSourceId, seasonYear);
        return {
            data,
            stats: {
                processedCount,
                totalCount,
                apiCallsCount,
            },
        };
    }

    async getFixtures(
        leagueSourceId: number,
        seasonYear: number,
        since?: Date,
    ): Promise<Array<typeof schema.fixtures.$inferSelect>> {
        if (!db) return [];

        const [season] = await db
            .select()
            .from(schema.seasons)
            .innerJoin(schema.leagues, eq(schema.seasons.leagueId, schema.leagues.id))
            .where(
                and(
                    eq(schema.leagues.sourceId, leagueSourceId),
                    eq(schema.seasons.year, seasonYear),
                ),
            );

        if (!season) return [];

        const seasonRecord = season.seasons;

        // --- LIVE FIXTURE POLLING LOGIC (runs BEFORE cache) ---
        // This must run before the cache check so that past-due fixtures
        // ("out of state" games) are always detected and updated, even when
        // the cache is populated with stale data.
        const now = new Date();
        const FIVE_MINUTES_MS = 5 * 60 * 1000;
        let pollingDidUpdate = false;

        if (!seasonRecord.isCompleted) {
            const timeSinceLastSync = seasonRecord.lastLiveSyncAt
                ? now.getTime() - seasonRecord.lastLiveSyncAt.getTime()
                : Infinity;

            logger.info(
                {
                    leagueSourceId,
                    seasonYear,
                    isCompleted: seasonRecord.isCompleted,
                    lastLiveSyncAt: seasonRecord.lastLiveSyncAt?.toISOString(),
                    timeSinceLastSyncMs: timeSinceLastSync,
                    thresholdMs: FIVE_MINUTES_MS,
                },
                'Live polling: decision check',
            );

            if (timeSinceLastSync > FIVE_MINUTES_MS) {
                const threshold = new Date(now.getTime() - FIVE_MINUTES_MS).toISOString();
                const claimed = await db
                    .update(schema.seasons)
                    .set({ lastLiveSyncAt: now })
                    .where(
                        and(
                            eq(schema.seasons.id, seasonRecord.id),
                            sql`(${schema.seasons.lastLiveSyncAt} IS NULL OR ${schema.seasons.lastLiveSyncAt} <= ${threshold})`,
                        ),
                    )
                    .returning({ id: schema.seasons.id });

                logger.info({ claimed: claimed.length }, 'Live polling: lock claim result');

                if (claimed.length === 0) {
                    logger.info('Live polling: skipped — lock not claimed');
                } else {
                    const TERMINAL_STATUSES: ('played' | 'postponed' | 'cancelled')[] = [
                        'played',
                        'postponed',
                        'cancelled',
                    ];
                    const pastDue = await db
                        .select({ id: schema.fixtures.id, sourceId: schema.fixtures.sourceId })
                        .from(schema.fixtures)
                        .where(
                            and(
                                eq(schema.fixtures.seasonId, seasonRecord.id),
                                lte(schema.fixtures.scheduledAt, now),
                                notInArray(schema.fixtures.status, TERMINAL_STATUSES),
                            ),
                        );

                    if (pastDue.length > 0) {
                        try {
                            const sourceIdsToFetch = pastDue.map(
                                (f: { sourceId: number }) => f.sourceId,
                            );
                            logger.info(
                                { leagueSourceId, seasonYear },
                                `Live polling: fetching ${sourceIdsToFetch.length} past-due fixtures`,
                            );

                            const { fixtures: updatedFixtures } =
                                await this.provider.getFixturesByIds(sourceIdsToFetch);

                            if (updatedFixtures.length > 0) {
                                const lookups = await this.loadFixtureLookups();
                                const fixturesToUpdate = updatedFixtures
                                    .map((n) =>
                                        this.buildFixtureRow(
                                            n,
                                            season.leagues.id,
                                            seasonRecord.id,
                                            lookups,
                                        ),
                                    )
                                    .filter(Boolean);

                                if (fixturesToUpdate.length > 0) {
                                    await db
                                        .insert(schema.fixtures)
                                        .values(
                                            fixturesToUpdate as unknown as (typeof schema.fixtures.$inferInsert)[],
                                        )
                                        .onConflictDoUpdate({
                                            target: [
                                                schema.fixtures.sourceName,
                                                schema.fixtures.sourceId,
                                            ],
                                            set: FIXTURE_UPSERT_SET,
                                        });
                                    pollingDidUpdate = true;
                                }
                            }
                        } catch (e: unknown) {
                            const err = e instanceof Error ? e : new Error(String(e));
                            logger.error({ error: err.message }, 'Live polling failed');
                        }
                    } else {
                        // Both conditions must hold to avoid false positives where
                        // a poll resolves one batch of stale fixtures but other
                        // non-terminal fixtures remain.
                        const futureMatches = await db
                            .select({ count: sql`count(*)` })
                            .from(schema.fixtures)
                            .where(
                                and(
                                    eq(schema.fixtures.seasonId, seasonRecord.id),
                                    gt(schema.fixtures.scheduledAt, now),
                                ),
                            );

                        const nonTerminal = await db
                            .select({ count: sql`count(*)` })
                            .from(schema.fixtures)
                            .where(
                                and(
                                    eq(schema.fixtures.seasonId, seasonRecord.id),
                                    notInArray(schema.fixtures.status, TERMINAL_STATUSES),
                                ),
                            );

                        const futureCount = Number(futureMatches[0]?.count || 0);
                        const nonTerminalCount = Number(nonTerminal[0]?.count || 0);

                        if (futureCount === 0 && nonTerminalCount === 0) {
                            logger.info(
                                { leagueSourceId, futureCount, nonTerminalCount },
                                `Live polling: marking season ${seasonYear} complete`,
                            );
                            await db
                                .update(schema.seasons)
                                .set({ isCompleted: true })
                                .where(eq(schema.seasons.id, seasonRecord.id));
                        } else {
                            logger.info(
                                { leagueSourceId, futureCount, nonTerminalCount },
                                `Live polling: season ${seasonYear} NOT complete`,
                            );
                        }
                    }
                }
            } else {
                logger.info(
                    { timeSinceLastSyncMs: timeSinceLastSync },
                    'Live polling: skipped — last sync too recent',
                );
            }
        } else {
            logger.info(
                { leagueSourceId, seasonYear },
                'Live polling: skipped — season is completed',
            );
        }

        if (pollingDidUpdate) {
            cacheService.invalidate(`fixtures:${leagueSourceId}:${seasonYear}`);
        }

        if (!since) {
            const cacheKey = `fixtures:${leagueSourceId}:${seasonYear}`;
            const cached = cacheService.get<Array<typeof schema.fixtures.$inferSelect>>(cacheKey);
            if (cached) return cached;
        }

        let query = db
            .select()
            .from(schema.fixtures)
            .where(eq(schema.fixtures.seasonId, seasonRecord.id));

        if (since) {
            query = db
                .select()
                .from(schema.fixtures)
                .where(
                    and(
                        eq(schema.fixtures.seasonId, seasonRecord.id),
                        gt(schema.fixtures.updatedAt, since),
                    ),
                );
        }

        const result = await query;
        if (!since) {
            cacheService.set(`fixtures:${leagueSourceId}:${seasonYear}`, result, TTL.ACTIVE);
        }
        return result;
    }

    /**
     * Read-only: returns fixtures for a given season UUID.
     * Queries directly by seasonId — no league/source ID resolution needed.
     * Includes the same live polling logic as getFixtures().
     */
    async getFixturesBySeasonId(
        seasonId: string,
        since?: Date,
        forceRefresh?: boolean,
    ): Promise<Array<typeof schema.fixtures.$inferSelect>> {
        if (!db) return [];

        const [seasonRecord] = await db
            .select()
            .from(schema.seasons)
            .where(eq(schema.seasons.id, seasonId));
        if (!seasonRecord) return [];

        const [leagueRecord] = await db
            .select()
            .from(schema.leagues)
            .where(eq(schema.leagues.id, seasonRecord.leagueId));

        const now = new Date();
        const FIVE_MINUTES_MS = 5 * 60 * 1000;
        let pollingDidUpdate = false;

        if (!seasonRecord.isCompleted) {
            const timeSinceLastSync = seasonRecord.lastLiveSyncAt
                ? now.getTime() - seasonRecord.lastLiveSyncAt.getTime()
                : Infinity;

            logger.info(
                {
                    seasonId,
                    seasonYear: seasonRecord.year,
                    isCompleted: seasonRecord.isCompleted,
                    lastLiveSyncAt: seasonRecord.lastLiveSyncAt?.toISOString(),
                    timeSinceLastSyncMs: timeSinceLastSync,
                    thresholdMs: FIVE_MINUTES_MS,
                    forceRefresh: !!forceRefresh,
                },
                'Live polling: decision check',
            );

            if (forceRefresh || timeSinceLastSync > FIVE_MINUTES_MS) {
                // When forceRefresh is true, use current time as threshold so the lock
                // claim succeeds even if the last sync was recent. The CAS pattern
                // still prevents truly concurrent polls.
                const threshold = forceRefresh
                    ? now.toISOString()
                    : new Date(now.getTime() - FIVE_MINUTES_MS).toISOString();
                const claimed = await db
                    .update(schema.seasons)
                    .set({ lastLiveSyncAt: now })
                    .where(
                        and(
                            eq(schema.seasons.id, seasonRecord.id),
                            sql`(${schema.seasons.lastLiveSyncAt} IS NULL OR ${schema.seasons.lastLiveSyncAt} <= ${threshold})`,
                        ),
                    )
                    .returning({ id: schema.seasons.id });

                logger.info({ claimed: claimed.length }, 'Live polling: lock claim result');

                if (claimed.length === 0) {
                    logger.info('Live polling: skipped — lock not claimed');
                } else {
                    const TERMINAL_STATUSES: ('played' | 'postponed' | 'cancelled')[] = [
                        'played',
                        'postponed',
                        'cancelled',
                    ];
                    const pastDue = await db
                        .select({ id: schema.fixtures.id, sourceId: schema.fixtures.sourceId })
                        .from(schema.fixtures)
                        .where(
                            and(
                                eq(schema.fixtures.seasonId, seasonRecord.id),
                                lte(schema.fixtures.scheduledAt, now),
                                notInArray(schema.fixtures.status, TERMINAL_STATUSES),
                            ),
                        );

                    // --- STALE FIXTURE POLLING (runs every 5 min when past-due exist) ---
                    if (pastDue.length > 0) {
                        try {
                            const sourceIdsToFetch = pastDue.map(
                                (f: { sourceId: number }) => f.sourceId,
                            );
                            logger.info(
                                {
                                    seasonId,
                                    seasonYear: seasonRecord.year,
                                    count: sourceIdsToFetch.length,
                                },
                                'Stale polling: fetching past-due fixtures by ID',
                            );

                            const { fixtures: updatedFixtures } =
                                await this.provider.getFixturesByIds(sourceIdsToFetch);

                            if (updatedFixtures.length > 0) {
                                const lookups = await this.loadFixtureLookups();
                                const fixturesToUpdate = updatedFixtures
                                    .map((n) =>
                                        this.buildFixtureRow(
                                            n,
                                            seasonRecord.leagueId,
                                            seasonRecord.id,
                                            lookups,
                                        ),
                                    )
                                    .filter(Boolean);

                                if (fixturesToUpdate.length > 0) {
                                    await db
                                        .insert(schema.fixtures)
                                        .values(
                                            fixturesToUpdate as unknown as (typeof schema.fixtures.$inferInsert)[],
                                        )
                                        .onConflictDoUpdate({
                                            target: [
                                                schema.fixtures.sourceName,
                                                schema.fixtures.sourceId,
                                            ],
                                            set: FIXTURE_UPSERT_SET,
                                        });
                                    pollingDidUpdate = true;
                                    logger.info(
                                        { updated: fixturesToUpdate.length },
                                        'Stale polling: upsert complete',
                                    );
                                }
                            } else {
                                logger.info(
                                    { requested: sourceIdsToFetch.length },
                                    'Stale polling: API returned 0 fixtures (ids param may not be available — daily discovery will catch them)',
                                );
                            }
                        } catch (e: unknown) {
                            const err = e instanceof Error ? e : new Error(String(e));
                            logger.error({ error: err.message }, 'Stale polling failed');
                        }
                    }

                    // --- DAILY FIXTURE DISCOVERY (catches new/rescheduled matches) ---
                    // Runs once per day per season, or immediately on forceRefresh.
                    // Uses in-memory cache as gate — runs on first access after restart.
                    const discoveryKey = `fixture-discovery:${seasonId}`;
                    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
                    const lastDiscovery = cacheService.get<number>(discoveryKey);
                    const discoveryNeeded = forceRefresh || !lastDiscovery;

                    if (discoveryNeeded && leagueRecord) {
                        try {
                            logger.info(
                                {
                                    seasonId,
                                    seasonYear: seasonRecord.year,
                                    leagueSourceId: leagueRecord.sourceId,
                                    forceRefresh: !!forceRefresh,
                                },
                                'Fixture discovery: fetching full season to find new/rescheduled matches',
                            );

                            const { fixtures: allFixtures } = await this.provider.getFixtures(
                                leagueRecord.sourceId,
                                seasonRecord.year,
                            );

                            if (allFixtures.length > 0) {
                                const lookups = await this.loadFixtureLookups();
                                const fixturesToUpsert = allFixtures
                                    .map((n) =>
                                        this.buildFixtureRow(
                                            n,
                                            seasonRecord.leagueId,
                                            seasonRecord.id,
                                            lookups,
                                        ),
                                    )
                                    .filter(Boolean);

                                if (fixturesToUpsert.length > 0) {
                                    // Only update (and bump updatedAt) when data actually changed.
                                    // IS DISTINCT FROM handles NULLs correctly.
                                    await db
                                        .insert(schema.fixtures)
                                        .values(
                                            fixturesToUpsert as unknown as (typeof schema.fixtures.$inferInsert)[],
                                        )
                                        .onConflictDoUpdate({
                                            target: [
                                                schema.fixtures.sourceName,
                                                schema.fixtures.sourceId,
                                            ],
                                            set: FIXTURE_UPSERT_SET,
                                            where: sql`
                                                ${schema.fixtures.scheduledAt} IS DISTINCT FROM EXCLUDED.scheduled_at
                                                OR ${schema.fixtures.status} IS DISTINCT FROM EXCLUDED.status
                                                OR ${schema.fixtures.homeGoals} IS DISTINCT FROM EXCLUDED.home_goals
                                                OR ${schema.fixtures.awayGoals} IS DISTINCT FROM EXCLUDED.away_goals
                                                OR ${schema.fixtures.venueId} IS DISTINCT FROM EXCLUDED.venue_id
                                                OR ${schema.fixtures.gameweek} IS DISTINCT FROM EXCLUDED.gameweek
                                            `,
                                        });
                                    pollingDidUpdate = true;
                                    logger.info(
                                        { total: fixturesToUpsert.length },
                                        'Fixture discovery: upsert complete (only changed/new rows affected)',
                                    );
                                }
                            }

                            cacheService.set(discoveryKey, Date.now(), ONE_DAY_MS);
                        } catch (e: unknown) {
                            const err = e instanceof Error ? e : new Error(String(e));
                            logger.error({ error: err.message }, 'Fixture discovery failed');
                        }
                    }

                    if (pastDue.length === 0 && !discoveryNeeded) {
                        const TERMINAL_STATUSES_CHECK: ('played' | 'postponed' | 'cancelled')[] = [
                            'played',
                            'postponed',
                            'cancelled',
                        ];
                        const futureMatches = await db
                            .select({ count: sql`count(*)` })
                            .from(schema.fixtures)
                            .where(
                                and(
                                    eq(schema.fixtures.seasonId, seasonRecord.id),
                                    gt(schema.fixtures.scheduledAt, now),
                                ),
                            );

                        const nonTerminal = await db
                            .select({ count: sql`count(*)` })
                            .from(schema.fixtures)
                            .where(
                                and(
                                    eq(schema.fixtures.seasonId, seasonRecord.id),
                                    notInArray(schema.fixtures.status, TERMINAL_STATUSES_CHECK),
                                ),
                            );

                        const futureCount = Number(futureMatches[0]?.count || 0);
                        const nonTerminalCount = Number(nonTerminal[0]?.count || 0);

                        if (futureCount === 0 && nonTerminalCount === 0) {
                            logger.info(
                                { seasonId, futureCount, nonTerminalCount },
                                `Live polling: marking season ${seasonRecord.year} complete`,
                            );
                            await db
                                .update(schema.seasons)
                                .set({ isCompleted: true })
                                .where(eq(schema.seasons.id, seasonRecord.id));
                        } else {
                            logger.info(
                                { seasonId, futureCount, nonTerminalCount },
                                `Live polling: season ${seasonRecord.year} NOT complete`,
                            );
                        }
                    }
                }
            } else {
                logger.info(
                    { timeSinceLastSyncMs: timeSinceLastSync },
                    'Live polling: skipped — last sync too recent',
                );
            }
        } else {
            logger.info(
                { seasonId, seasonYear: seasonRecord.year },
                'Live polling: skipped — season is completed',
            );
        }

        if (pollingDidUpdate) {
            cacheService.invalidate(`fixtures:season:${seasonId}`);
            if (leagueRecord) {
                cacheService.invalidate(`fixtures:${leagueRecord.sourceId}:${seasonRecord.year}`);
            }
        }

        if (!since) {
            const cacheKey = `fixtures:season:${seasonId}`;
            const cached = cacheService.get<Array<typeof schema.fixtures.$inferSelect>>(cacheKey);
            if (cached) return cached;
        }

        let query = db
            .select()
            .from(schema.fixtures)
            .where(eq(schema.fixtures.seasonId, seasonRecord.id));

        if (since) {
            query = db
                .select()
                .from(schema.fixtures)
                .where(
                    and(
                        eq(schema.fixtures.seasonId, seasonRecord.id),
                        gt(schema.fixtures.updatedAt, since),
                    ),
                );
        }

        const result = await query;
        if (!since) {
            cacheService.set(`fixtures:season:${seasonId}`, result, TTL.ACTIVE);
        }
        return result;
    }

    async getFixtureById(fixtureId: string): Promise<typeof schema.fixtures.$inferSelect | null> {
        if (!db) return null;
        const [row] = await db
            .select()
            .from(schema.fixtures)
            .where(eq(schema.fixtures.id, fixtureId));
        return row ?? null;
    }

    async countFixturesInSeason(seasonId: string): Promise<number> {
        if (!db) return 0;
        const [res] = await db
            .select({ val: count() })
            .from(schema.fixtures)
            .where(eq(schema.fixtures.seasonId, seasonId));
        return Number(res?.val ?? 0);
    }

    async getMatchEvents(
        fixtureId: number,
    ): Promise<import('../../integrations/types').IngestedEvent[]> {
        const cacheKey = `events:${fixtureId}`;
        const cached =
            cacheService.get<import('../../integrations/types').IngestedEvent[]>(cacheKey);
        if (cached) return cached;

        const events = await this.provider.getMatchEvents(fixtureId);

        const sourceIds = events
            .map((e) => e.playerSourceId)
            .filter((id: number | null) => id != null);

        if (sourceIds.length > 0) {
            const existingPlayers = await db
                .select({ id: schema.players.id, sourceId: schema.players.sourceId })
                .from(schema.players)
                .where(
                    and(
                        eq(schema.players.sourceName, this.provider.name),
                        inArray(schema.players.sourceId, sourceIds),
                    ),
                );
            const playerMap = new Map<number, string>(
                existingPlayers.map((p: { sourceId: number; id: string }) => [p.sourceId, p.id]),
            );

            const unresolvedIds = sourceIds.filter((id: number) => !playerMap.has(id));
            if (unresolvedIds.length > 0) {
                const mappings = await db
                    .select({
                        playerId: schema.playerSourceMappings.playerId,
                        sourceId: schema.playerSourceMappings.sourceId,
                    })
                    .from(schema.playerSourceMappings)
                    .where(
                        and(
                            eq(schema.playerSourceMappings.sourceName, this.provider.name),
                            inArray(schema.playerSourceMappings.sourceId, unresolvedIds),
                        ),
                    );
                for (const m of mappings) {
                    playerMap.set(m.sourceId, m.playerId);
                }
            }

            for (const event of events) {
                if (event.playerSourceId) {
                    event.playerId = playerMap.get(event.playerSourceId) || null;
                }
            }
        }

        // State-aware TTL: FT fixtures get FROZEN, live get ACTIVE.
        // We don't have status here, so use ACTIVE as default — the fixture detail
        // queries that know the status will set a more appropriate TTL.
        cacheService.set(cacheKey, events, TTL.ACTIVE);
        return events;
    }

    async getLineups(
        fixtureId: number,
    ): Promise<import('../../integrations/types').IngestedLineup[]> {
        const lineups = await this.provider.getLineups(fixtureId);

        const allPlayers: { sourceId: number; name: string; photo: string | null }[] = [];
        for (const lineup of lineups) {
            for (const p of [...lineup.startXI, ...lineup.substitutes]) {
                allPlayers.push({ sourceId: p.sourceId, name: p.name, photo: p.photo });
            }
        }

        if (allPlayers.length === 0) return lineups;

        const uniquePlayers = Array.from(new Map(allPlayers.map((p) => [p.sourceId, p])).values());
        const sourceIds = uniquePlayers.map((p) => p.sourceId);

        const existingPlayers = await db
            .select({ id: schema.players.id, sourceId: schema.players.sourceId })
            .from(schema.players)
            .where(
                and(
                    eq(schema.players.sourceName, this.provider.name),
                    inArray(schema.players.sourceId, sourceIds),
                ),
            );
        const existingMap = new Map<number, string>(
            existingPlayers.map((p: { sourceId: number; id: string }) => [p.sourceId, p.id]),
        );

        const newPlayers = uniquePlayers.filter((p) => !existingMap.has(p.sourceId));

        if (newPlayers.length > 0) {
            await db
                .insert(schema.players)
                .values(
                    newPlayers.map((p) => ({
                        name: p.name,
                        metadata: { photo: p.photo },
                        sourceName: this.provider.name,
                        sourceId: p.sourceId,
                    })),
                )
                .onConflictDoUpdate({
                    target: [schema.players.sourceName, schema.players.sourceId],
                    set: {
                        name: sql`EXCLUDED.name`,
                        updatedAt: NOW_MS,
                    },
                });

            const newDbPlayers = await db
                .select({ id: schema.players.id, sourceId: schema.players.sourceId })
                .from(schema.players)
                .where(
                    and(
                        eq(schema.players.sourceName, this.provider.name),
                        inArray(
                            schema.players.sourceId,
                            newPlayers.map((p) => p.sourceId),
                        ),
                    ),
                );
            for (const p of newDbPlayers) {
                existingMap.set(p.sourceId, p.id);
            }
        }

        for (const lineup of lineups) {
            for (const p of [...lineup.startXI, ...lineup.substitutes]) {
                const internalId = existingMap.get(p.sourceId);
                if (internalId) {
                    Object.assign(p, { id: internalId });
                    if (p.photo && newPlayers.some((np) => np.sourceId === p.sourceId)) {
                        graphicsService.sideload(internalId, 'player', p.photo);
                    }
                }
            }
        }

        return lineups;
    }
}
