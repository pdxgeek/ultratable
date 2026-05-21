/**
 * getFixtures Live Polling Tests
 *
 * Verifies that the poll-then-cache ordering in getFixtures correctly detects
 * and updates past-due "out of state" fixtures before serving cached data.
 */
import type { IFootballProvider, IngestedFixture } from '../integrations/types';
import type { TeamsRepository } from './teams';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cacheService } from '../services/cache.service';
import { PostgresFixturesRepository } from './postgres/fixtures.repository';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock('../db', () => ({
    db: {
        select: (...args: unknown[]) => mockSelect(...args),
        insert: (...args: unknown[]) => mockInsert(...args),
        update: (...args: unknown[]) => mockUpdate(...args),
        delete: (...args: unknown[]) => mockDelete(...args),
    },
}));

vi.mock('../services/log.service', () => ({
    globalLogger: {
        child: () => ({
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
        }),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

vi.mock('../services/graphics.service', () => ({
    graphicsService: {
        registerFromUrl: vi.fn().mockResolvedValue('mock-path'),
        autoSideloadGraphic: vi.fn().mockResolvedValue('mock-path'),
        resolveUrl: vi.fn().mockResolvedValue(null),
    },
}));

vi.mock('../providers/storage', () => ({
    storageProvider: {
        getPublicUrl: vi.fn().mockReturnValue('https://mock.storage/path'),
    },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEN_MINUTES_AGO = new Date(Date.now() - 10 * 60 * 1000);
const ONE_MINUTE_AGO = new Date(Date.now() - 1 * 60 * 1000);

const SEASON_RECORD = {
    id: 'season-uuid',
    leagueId: 'league-uuid',
    year: 2025,
    isCompleted: false,
    lastLiveSyncAt: TEN_MINUTES_AGO, // >5 min ago → eligible for polling
    startDate: null,
    endDate: null,
    metadata: {},
    rankingCriteria: null,
    createdAt: new Date(),
    updatedAt: new Date(),
};

const LEAGUE_RECORD = {
    id: 'league-uuid',
    name: 'Championship',
    slug: 'championship',
    country: 'England',
    logo: null,
    sourceName: 'api-football',
    sourceId: 40,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
};

const PAST_DUE_FIXTURE = {
    id: 'fix-uuid-1',
    sourceId: 12345,
    sourceName: 'api-football',
    leagueId: 'league-uuid',
    seasonId: 'season-uuid',
    homeTeamId: 'hull-uuid',
    awayTeamId: 'ipswich-uuid',
    scheduledAt: TEN_MINUTES_AGO,
    status: 'scheduled' as const,
    homeGoals: null,
    awayGoals: null,
    gameweek: 35,
    rawResponse: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
};

const PLAYED_FIXTURE = {
    ...PAST_DUE_FIXTURE,
    status: 'played' as const,
    homeGoals: 2,
    awayGoals: 1,
};

function makeUpdatedApiFixture(overrides: Partial<IngestedFixture> = {}): IngestedFixture {
    return {
        sourceId: 12345,
        sourceName: 'api-football',
        scheduledAt: TEN_MINUTES_AGO.toISOString(),
        status: 'played',
        homeTeamSourceId: 100,
        awayTeamSourceId: 200,
        venueSourceId: null,
        homeGoals: 2,
        awayGoals: 1,
        gameweek: 35,
        ...overrides,
    };
}

/** Creates a mock provider with configurable getFixturesByIds */
function createMockProvider(overrides: Partial<IFootballProvider> = {}): IFootballProvider {
    return {
        name: 'api-football',
        getCountries: vi.fn().mockResolvedValue([]),
        getLeagues: vi.fn().mockResolvedValue([]),
        getSeasons: vi.fn().mockResolvedValue([]),
        getTeams: vi.fn().mockResolvedValue({ teams: [], venues: [] }),
        getFixtures: vi.fn().mockResolvedValue({ fixtures: [], venues: [] }),
        getFixturesByIds: vi.fn().mockResolvedValue({ fixtures: [], venues: [] }),
        getMatchEvents: vi.fn().mockResolvedValue([]),
        getLineups: vi.fn().mockResolvedValue([]),
        getPlayerData: vi.fn().mockResolvedValue(null),
        ...overrides,
    };
}

/**
 * Sets up the standard mock chain for a getFixtures call.
 * The DB mock must handle these sequential calls:
 *   1. Season+League join select (season lookup)
 *   2. Season update (atomic lock claim)
 *   3. Past-due fixtures select
 *   ... then depending on path, more calls
 *   N. Final fixtures select (main query)
 */
function setupSeasonLookup(seasonOverrides: Record<string, unknown> = {}) {
    const seasonData = { ...SEASON_RECORD, ...seasonOverrides };
    // Return { seasons: ..., leagues: ... } shape from the innerJoin
    return [{ seasons: seasonData, leagues: LEAGUE_RECORD }];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
// getFixtures (the read path) never calls into the teams sub-repo — only
// syncFixtures does. A no-op stub satisfies the constructor signature without
// the test having to wire up a real TeamsRepository.
const stubTeams = {} as TeamsRepository;

describe('getFixtures — Live Polling', () => {
    let repo: PostgresFixturesRepository;

    beforeEach(() => {
        vi.clearAllMocks();
        cacheService.clear();
    });

    // -----------------------------------------------------------------------
    // 1. Happy path: past-due fixtures trigger polling and get updated
    // -----------------------------------------------------------------------
    it('polls and updates past-due fixtures before returning data', async () => {
        const provider = createMockProvider({
            getFixturesByIds: vi.fn().mockResolvedValue({
                fixtures: [makeUpdatedApiFixture()],
                venues: [],
            }),
        });
        repo = new PostgresFixturesRepository(provider, stubTeams);

        // Call sequence:
        // 1. Season lookup (select + innerJoin)
        // 2. Atomic lock (update seasons)
        // 3. Past-due fixtures (select)
        // 4. Venues lookup (select)
        // 5. Teams lookup (select)
        // 6. Fixture upsert (insert)
        // 7. Final fixtures query (select)

        let selectCallCount = 0;
        mockSelect.mockImplementation(() => {
            selectCallCount++;
            switch (selectCallCount) {
                case 1: // Season+League join
                    return {
                        from: vi.fn().mockReturnValue({
                            innerJoin: vi.fn().mockReturnValue({
                                where: vi.fn().mockResolvedValue(setupSeasonLookup()),
                            }),
                        }),
                    };
                case 2: // Past-due fixtures
                    return {
                        from: vi.fn().mockReturnValue({
                            where: vi.fn().mockResolvedValue([PAST_DUE_FIXTURE]),
                        }),
                    };
                case 3: // Venues for mapping
                    return {
                        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
                    };
                case 4: // Teams for mapping
                    return {
                        from: vi.fn().mockReturnValue({
                            where: vi.fn().mockResolvedValue([
                                { id: 'hull-uuid', sourceId: 100, sourceName: 'api-football' },
                                { id: 'ipswich-uuid', sourceId: 200, sourceName: 'api-football' },
                            ]),
                        }),
                    };
                case 5: // Final fixtures query
                    return {
                        from: vi.fn().mockReturnValue({
                            where: vi.fn().mockResolvedValue([PLAYED_FIXTURE]),
                        }),
                    };
                default:
                    return {
                        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
                    };
            }
        });

        // Atomic lock claim — returns 1 row (success)
        mockUpdate.mockReturnValue({
            set: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    returning: vi.fn().mockResolvedValue([{ id: 'season-uuid' }]),
                }),
            }),
        });

        // Fixture upsert
        mockInsert.mockReturnValue({
            values: vi.fn().mockReturnValue({
                onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
            }),
        });

        const result = await repo.getFixtures(40, 2025);

        // Provider was called with the past-due fixture's source ID
        expect(provider.getFixturesByIds).toHaveBeenCalledWith([12345]);
        // Fixture upsert was called
        expect(mockInsert).toHaveBeenCalled();
        // Result contains the (now updated) fixture
        expect(result).toHaveLength(1);
        expect(result[0].status).toBe('played');
    });

    // -----------------------------------------------------------------------
    // 2. Cache invalidation: polling clears stale cache
    // -----------------------------------------------------------------------
    it('invalidates cache after polling updates fixtures', async () => {
        const provider = createMockProvider({
            getFixturesByIds: vi.fn().mockResolvedValue({
                fixtures: [makeUpdatedApiFixture()],
                venues: [],
            }),
        });
        repo = new PostgresFixturesRepository(provider, stubTeams);

        // Pre-populate cache with stale data
        cacheService.set('fixtures:40:2025', [PAST_DUE_FIXTURE], 300_000);
        expect(cacheService.get('fixtures:40:2025')).toBeDefined();

        let selectCallCount = 0;
        mockSelect.mockImplementation(() => {
            selectCallCount++;
            switch (selectCallCount) {
                case 1:
                    return {
                        from: vi.fn().mockReturnValue({
                            innerJoin: vi.fn().mockReturnValue({
                                where: vi.fn().mockResolvedValue(setupSeasonLookup()),
                            }),
                        }),
                    };
                case 2:
                    return {
                        from: vi.fn().mockReturnValue({
                            where: vi.fn().mockResolvedValue([PAST_DUE_FIXTURE]),
                        }),
                    };
                case 3:
                    return {
                        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
                    };
                case 4:
                    return {
                        from: vi.fn().mockReturnValue({
                            where: vi.fn().mockResolvedValue([
                                { id: 'hull-uuid', sourceId: 100, sourceName: 'api-football' },
                                { id: 'ipswich-uuid', sourceId: 200, sourceName: 'api-football' },
                            ]),
                        }),
                    };
                case 5:
                    return {
                        from: vi.fn().mockReturnValue({
                            where: vi.fn().mockResolvedValue([PLAYED_FIXTURE]),
                        }),
                    };
                default:
                    return {
                        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
                    };
            }
        });

        mockUpdate.mockReturnValue({
            set: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    returning: vi.fn().mockResolvedValue([{ id: 'season-uuid' }]),
                }),
            }),
        });

        mockInsert.mockReturnValue({
            values: vi.fn().mockReturnValue({
                onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
            }),
        });

        const result = await repo.getFixtures(40, 2025);

        // Should NOT return the stale cached data — should return fresh DB query result
        expect(result[0].status).toBe('played');
        expect(result[0].homeGoals).toBe(2);
    });

    // -----------------------------------------------------------------------
    // 3. Atomic lock: concurrent calls — only one polls
    // -----------------------------------------------------------------------
    it('skips polling when another request claimed the lock', async () => {
        const provider = createMockProvider();
        repo = new PostgresFixturesRepository(provider, stubTeams);

        let selectCallCount = 0;
        mockSelect.mockImplementation(() => {
            selectCallCount++;
            switch (selectCallCount) {
                case 1:
                    return {
                        from: vi.fn().mockReturnValue({
                            innerJoin: vi.fn().mockReturnValue({
                                where: vi.fn().mockResolvedValue(setupSeasonLookup()),
                            }),
                        }),
                    };
                // Jump straight to final query — pastDue select is never reached
                case 2:
                    return {
                        from: vi.fn().mockReturnValue({
                            where: vi.fn().mockResolvedValue([PLAYED_FIXTURE]),
                        }),
                    };
                default:
                    return {
                        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
                    };
            }
        });

        // Atomic lock returns 0 rows — another process already claimed it
        mockUpdate.mockReturnValue({
            set: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    returning: vi.fn().mockResolvedValue([]), // 0 rows = lock not claimed
                }),
            }),
        });

        const result = await repo.getFixtures(40, 2025);

        // Provider was NOT called — lock was not acquired
        expect(provider.getFixturesByIds).not.toHaveBeenCalled();
        expect(result).toHaveLength(1);
    });

    // -----------------------------------------------------------------------
    // 4. No past-due fixtures: no polling, cached data served
    // -----------------------------------------------------------------------
    it('serves cached data when no past-due fixtures exist', async () => {
        const provider = createMockProvider();
        repo = new PostgresFixturesRepository(provider, stubTeams);

        // Pre-populate cache with valid data (all played)
        cacheService.set('fixtures:40:2025', [PLAYED_FIXTURE], 300_000);

        let selectCallCount = 0;
        mockSelect.mockImplementation(() => {
            selectCallCount++;
            switch (selectCallCount) {
                case 1:
                    return {
                        from: vi.fn().mockReturnValue({
                            innerJoin: vi.fn().mockReturnValue({
                                where: vi.fn().mockResolvedValue(
                                    // Season with recent lastLiveSyncAt (< 5 min ago) → polling skipped
                                    setupSeasonLookup({ lastLiveSyncAt: ONE_MINUTE_AGO }),
                                ),
                            }),
                        }),
                    };
                default:
                    return {
                        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
                    };
            }
        });

        const result = await repo.getFixtures(40, 2025);

        // Returns cached data, no polling
        expect(provider.getFixturesByIds).not.toHaveBeenCalled();
        expect(result).toEqual([PLAYED_FIXTURE]);
    });

    // -----------------------------------------------------------------------
    // 5. Season completed: polling skipped entirely
    // -----------------------------------------------------------------------
    it('skips polling entirely when season is completed', async () => {
        const provider = createMockProvider();
        repo = new PostgresFixturesRepository(provider, stubTeams);

        let selectCallCount = 0;
        mockSelect.mockImplementation(() => {
            selectCallCount++;
            switch (selectCallCount) {
                case 1:
                    return {
                        from: vi.fn().mockReturnValue({
                            innerJoin: vi.fn().mockReturnValue({
                                where: vi
                                    .fn()
                                    .mockResolvedValue(setupSeasonLookup({ isCompleted: true })),
                            }),
                        }),
                    };
                case 2:
                    return {
                        from: vi.fn().mockReturnValue({
                            where: vi.fn().mockResolvedValue([PLAYED_FIXTURE]),
                        }),
                    };
                default:
                    return {
                        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
                    };
            }
        });

        const result = await repo.getFixtures(40, 2025);

        // No polling — season is done
        expect(provider.getFixturesByIds).not.toHaveBeenCalled();
        expect(mockUpdate).not.toHaveBeenCalled();
        expect(result).toHaveLength(1);
    });

    // -----------------------------------------------------------------------
    // 6. API failure: existing data returned without corruption
    // -----------------------------------------------------------------------
    it('returns existing data when provider API call fails', async () => {
        const provider = createMockProvider({
            getFixturesByIds: vi.fn().mockRejectedValue(new Error('API rate limit exceeded')),
        });
        repo = new PostgresFixturesRepository(provider, stubTeams);

        let selectCallCount = 0;
        mockSelect.mockImplementation(() => {
            selectCallCount++;
            switch (selectCallCount) {
                case 1:
                    return {
                        from: vi.fn().mockReturnValue({
                            innerJoin: vi.fn().mockReturnValue({
                                where: vi.fn().mockResolvedValue(setupSeasonLookup()),
                            }),
                        }),
                    };
                case 2:
                    return {
                        from: vi.fn().mockReturnValue({
                            where: vi.fn().mockResolvedValue([PAST_DUE_FIXTURE]),
                        }),
                    };
                // Final query: returns the original stale fixture (no corruption)
                case 3:
                    return {
                        from: vi.fn().mockReturnValue({
                            where: vi.fn().mockResolvedValue([PAST_DUE_FIXTURE]),
                        }),
                    };
                default:
                    return {
                        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
                    };
            }
        });

        mockUpdate.mockReturnValue({
            set: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    returning: vi.fn().mockResolvedValue([{ id: 'season-uuid' }]),
                }),
            }),
        });

        // Should NOT throw — error is caught internally
        const result = await repo.getFixtures(40, 2025);

        // Provider was called but failed
        expect(provider.getFixturesByIds).toHaveBeenCalled();
        // Insert was NOT called — error was caught before upsert
        expect(mockInsert).not.toHaveBeenCalled();
        // Original data is returned unchanged
        expect(result).toHaveLength(1);
        expect(result[0].status).toBe('scheduled');
    });

    // -----------------------------------------------------------------------
    // 7. Season completion detection: marks season complete when all done
    // -----------------------------------------------------------------------
    it('marks season complete when no past-due, no future, and no non-terminal fixtures remain', async () => {
        const provider = createMockProvider();
        repo = new PostgresFixturesRepository(provider, stubTeams);

        let selectCallCount = 0;
        mockSelect.mockImplementation(() => {
            selectCallCount++;
            switch (selectCallCount) {
                case 1:
                    return {
                        from: vi.fn().mockReturnValue({
                            innerJoin: vi.fn().mockReturnValue({
                                where: vi.fn().mockResolvedValue(setupSeasonLookup()),
                            }),
                        }),
                    };
                case 2: // Past-due: none
                    return {
                        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
                    };
                case 3: // Future matches count: 0
                    return {
                        from: vi
                            .fn()
                            .mockReturnValue({ where: vi.fn().mockResolvedValue([{ count: 0 }]) }),
                    };
                case 4: // Non-terminal fixtures count: 0
                    return {
                        from: vi
                            .fn()
                            .mockReturnValue({ where: vi.fn().mockResolvedValue([{ count: 0 }]) }),
                    };
                case 5: // Final fixtures query
                    return {
                        from: vi.fn().mockReturnValue({
                            where: vi.fn().mockResolvedValue([PLAYED_FIXTURE]),
                        }),
                    };
                default:
                    return {
                        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
                    };
            }
        });

        // First call: atomic lock claim (success)
        // Second call: mark season complete
        let updateCallCount = 0;
        mockUpdate.mockImplementation(() => {
            updateCallCount++;
            if (updateCallCount === 1) {
                // Atomic lock claim
                return {
                    set: vi.fn().mockReturnValue({
                        where: vi.fn().mockReturnValue({
                            returning: vi.fn().mockResolvedValue([{ id: 'season-uuid' }]),
                        }),
                    }),
                };
            }
            // Mark season complete
            return {
                set: vi.fn().mockReturnValue({
                    where: vi.fn().mockResolvedValue(undefined),
                }),
            };
        });

        await repo.getFixtures(40, 2025);

        // Should have called update twice: lock claim + season completion
        expect(mockUpdate).toHaveBeenCalledTimes(2);
        // Provider was never called — no past-due fixtures to fetch
        expect(provider.getFixturesByIds).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // 8. FALSE POSITIVE PREVENTION: non-terminal fixtures block completion
    // -----------------------------------------------------------------------
    it('does NOT mark season complete when non-terminal fixtures still exist (false positive bug)', async () => {
        const provider = createMockProvider();
        repo = new PostgresFixturesRepository(provider, stubTeams);

        let selectCallCount = 0;
        mockSelect.mockImplementation(() => {
            selectCallCount++;
            switch (selectCallCount) {
                case 1:
                    return {
                        from: vi.fn().mockReturnValue({
                            innerJoin: vi.fn().mockReturnValue({
                                where: vi.fn().mockResolvedValue(setupSeasonLookup()),
                            }),
                        }),
                    };
                case 2: // Past-due: none (previous poll just resolved them)
                    return {
                        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
                    };
                case 3: // Future matches count: 0 (none scheduled after 'now')
                    return {
                        from: vi
                            .fn()
                            .mockReturnValue({ where: vi.fn().mockResolvedValue([{ count: 0 }]) }),
                    };
                case 4: // Non-terminal count: 13 (scheduled fixtures that just haven't become past-due yet)
                    return {
                        from: vi
                            .fn()
                            .mockReturnValue({ where: vi.fn().mockResolvedValue([{ count: 13 }]) }),
                    };
                case 5: // Final fixtures query
                    return {
                        from: vi.fn().mockReturnValue({
                            where: vi.fn().mockResolvedValue([PLAYED_FIXTURE]),
                        }),
                    };
                default:
                    return {
                        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
                    };
            }
        });

        // Only the atomic lock claim should happen — no season completion update
        mockUpdate.mockReturnValue({
            set: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    returning: vi.fn().mockResolvedValue([{ id: 'season-uuid' }]),
                }),
            }),
        });

        await repo.getFixtures(40, 2025);

        // Should have called update only ONCE: lock claim (no season completion)
        expect(mockUpdate).toHaveBeenCalledTimes(1);
        expect(provider.getFixturesByIds).not.toHaveBeenCalled();
    });
});
