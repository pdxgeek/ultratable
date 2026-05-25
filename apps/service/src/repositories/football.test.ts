import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '../db';
import { ApiFootballProvider } from '../integrations/api-football';
import { cacheService } from '../services/cache.service';
import { PostgresLeaguesRepository } from './postgres/leagues.repository';
import { PostgresTeamsRepository } from './postgres/teams.repository';

const mockGet = vi.fn();
vi.mock('axios', () => ({
    default: {
        create: vi.fn().mockReturnValue({
            get: (...args: unknown[]) => mockGet(...args),
            interceptors: { response: { use: vi.fn() } },
        }),
    },
}));

// Stub the rate limiter so scheduled requests run inline. The real
// limiter is exercised in integration tests.
vi.mock('bottleneck', () => {
    class MockBottleneck {
        schedule<T>(fn: () => Promise<T>): Promise<T> {
            return fn();
        }
        on(): void {}
        updateSettings(): void {}
    }
    return { default: MockBottleneck };
});

vi.mock('../db', () => ({
    db: {
        select: vi.fn(),
        insert: vi.fn(),
    },
}));

describe('PostgresLeaguesRepository', () => {
    let repo: PostgresLeaguesRepository;

    beforeEach(() => {
        repo = new PostgresLeaguesRepository(new ApiFootballProvider());
        vi.clearAllMocks();
        cacheService.clear();
        process.env.API_FOOTBALL_KEY = 'test-key';
    });

    describe('getLeagues', () => {
        it('should return existing leagues from database if available', async () => {
            const mockLeagues = [{ id: 'league-uuid', name: 'Premier League', sourceId: 1 }];
            const selectMock = vi.fn().mockReturnValue({
                from: vi.fn().mockResolvedValue(mockLeagues),
            });
            vi.mocked(db.select).mockImplementation(selectMock as unknown as typeof db.select);

            const result = await repo.getLeagues();

            expect(result).toEqual(mockLeagues);
        });

        it('should return empty array when database is empty', async () => {
            const emptySelectMock = vi.fn().mockReturnValue({
                from: vi.fn().mockResolvedValue([]),
            });
            vi.mocked(db.select).mockImplementation(emptySelectMock as unknown as typeof db.select);

            const result = await repo.getLeagues();

            expect(result).toEqual([]);
        });
    });
});

describe('PostgresTeamsRepository', () => {
    let repo: PostgresTeamsRepository;

    beforeEach(() => {
        repo = new PostgresTeamsRepository(new ApiFootballProvider());
        vi.clearAllMocks();
        cacheService.clear();
        process.env.API_FOOTBALL_KEY = 'test-key';
    });

    describe('syncTeams', () => {
        it('should fetch teams from provider and insert into database', async () => {
            const leagueMock = [{ id: 'league-uuid', sourceId: 39 }];
            const seasonMock = [{ id: 'season-uuid' }];
            const venueMock = [{ id: 'venue-uuid', sourceId: 505 }];
            const teamMock = [{ id: 'team-uuid', sourceId: 42, name: 'Arsenal' }];

            // Sequential calls for syncTeams + getTeams (read-only at end)
            const m = vi
                .fn()
                .mockReturnValueOnce({
                    from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(leagueMock) }),
                }) // league lookup in syncTeams
                .mockReturnValueOnce({
                    from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(seasonMock) }),
                }) // season lookup in syncTeams
                .mockReturnValueOnce({
                    from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(venueMock) }),
                }) // venues
                .mockReturnValueOnce({
                    from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(teamMock) }),
                }) // teams
                .mockReturnValueOnce({
                    from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
                }) // existing graphics
                // getTeams (read-only) calls at end of syncTeams:
                .mockReturnValueOnce({
                    from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(leagueMock) }),
                }) // league lookup in getTeams
                .mockReturnValueOnce({
                    from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(seasonMock) }),
                }) // season lookup in getTeams
                .mockReturnValueOnce({
                    from: vi.fn().mockReturnValue({
                        innerJoin: vi.fn().mockReturnValue({
                            where: vi.fn().mockResolvedValue([{ team: teamMock[0] }]),
                        }),
                    }),
                }); // result

            vi.mocked(db.select).mockImplementation(m as unknown as typeof db.select);

            const mockResponse = {
                data: {
                    response: [
                        {
                            team: { id: 42, name: 'Arsenal', code: 'ARS', logo: 'logo-url' },
                            venue: { id: 505, name: 'Emirates Stadium' },
                        },
                    ],
                },
            };
            mockGet.mockResolvedValue(mockResponse);

            const insertMock = vi.fn().mockReturnValue({
                values: vi.fn().mockReturnValue({
                    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
                    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
                }),
            });
            vi.mocked(db.insert).mockImplementation(insertMock as unknown as typeof db.insert);

            const result = await repo.syncTeams(39, 2024);

            expect(result[0].name).toBe('Arsenal');
            expect(mockGet).toHaveBeenCalledWith('/teams', expect.anything());
        });

        it('should auto-import squads for each team during syncTeams', async () => {
            const leagueMock = [{ id: 'league-uuid', sourceId: 39 }];
            const seasonMock = [{ id: 'season-uuid' }];
            const venueMock = [{ id: 'venue-uuid', sourceId: 505, sourceName: 'api-football' }];
            const teamMock = [
                { id: 'team-uuid-1', sourceId: 42, sourceName: 'api-football', name: 'Arsenal' },
                { id: 'team-uuid-2', sourceId: 33, sourceName: 'api-football', name: 'Man Utd' },
            ];

            const m = vi
                .fn()
                .mockReturnValueOnce({
                    from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(leagueMock) }),
                })
                .mockReturnValueOnce({
                    from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(seasonMock) }),
                })
                .mockReturnValueOnce({
                    from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(venueMock) }),
                })
                .mockReturnValueOnce({
                    from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(teamMock) }),
                })
                .mockReturnValueOnce({
                    from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
                }) // existing graphics
                // getTeams calls:
                .mockReturnValueOnce({
                    from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(leagueMock) }),
                })
                .mockReturnValueOnce({
                    from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(seasonMock) }),
                })
                .mockReturnValueOnce({
                    from: vi.fn().mockReturnValue({
                        innerJoin: vi.fn().mockReturnValue({
                            where: vi.fn().mockResolvedValue(teamMock.map((t) => ({ team: t }))),
                        }),
                    }),
                });

            vi.mocked(db.select).mockImplementation(m as unknown as typeof db.select);

            // Mock provider: getTeams returns 2 teams, getSquad returns squad for each
            mockGet
                .mockResolvedValueOnce({
                    data: {
                        response: [
                            {
                                team: { id: 42, name: 'Arsenal', code: 'ARS', logo: 'logo-url' },
                                venue: { id: 505, name: 'Emirates' },
                            },
                            {
                                team: { id: 33, name: 'Man Utd', code: 'MUN', logo: 'logo-url' },
                                venue: { id: 505, name: 'Emirates' },
                            },
                        ],
                    },
                })
                .mockResolvedValueOnce({
                    data: {
                        response: [
                            {
                                players: [
                                    {
                                        id: 1,
                                        name: 'Saka',
                                        age: 22,
                                        number: 7,
                                        position: 'Attacker',
                                        photo: null,
                                    },
                                ],
                            },
                        ],
                    },
                })
                .mockResolvedValueOnce({
                    data: {
                        response: [
                            {
                                players: [
                                    {
                                        id: 2,
                                        name: 'Rashford',
                                        age: 27,
                                        number: 10,
                                        position: 'Attacker',
                                        photo: null,
                                    },
                                ],
                            },
                        ],
                    },
                });

            const insertMock = vi.fn().mockReturnValue({
                values: vi.fn().mockReturnValue({
                    onConflictDoUpdate: vi.fn().mockReturnValue({
                        returning: vi.fn().mockResolvedValue([{ id: 'player-uuid' }]),
                    }),
                    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
                }),
            });
            vi.mocked(db.insert).mockImplementation(insertMock as unknown as typeof db.insert);

            await repo.syncTeams(39, 2024);

            expect(mockGet).toHaveBeenCalledWith('/players/squads', { params: { team: 42 } });
            expect(mockGet).toHaveBeenCalledWith('/players/squads', { params: { team: 33 } });
        });

        it('should soft-fail squad import if provider errors', async () => {
            const leagueMock = [{ id: 'league-uuid', sourceId: 39 }];
            const seasonMock = [{ id: 'season-uuid' }];
            const venueMock = [{ id: 'venue-uuid', sourceId: 505, sourceName: 'api-football' }];
            const teamMock = [
                { id: 'team-uuid', sourceId: 42, sourceName: 'api-football', name: 'Arsenal' },
            ];

            const m = vi
                .fn()
                .mockReturnValueOnce({
                    from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(leagueMock) }),
                })
                .mockReturnValueOnce({
                    from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(seasonMock) }),
                })
                .mockReturnValueOnce({
                    from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(venueMock) }),
                })
                .mockReturnValueOnce({
                    from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(teamMock) }),
                })
                .mockReturnValueOnce({
                    from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
                })
                .mockReturnValueOnce({
                    from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(leagueMock) }),
                })
                .mockReturnValueOnce({
                    from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(seasonMock) }),
                })
                .mockReturnValueOnce({
                    from: vi.fn().mockReturnValue({
                        innerJoin: vi.fn().mockReturnValue({
                            where: vi.fn().mockResolvedValue([{ team: teamMock[0] }]),
                        }),
                    }),
                });

            vi.mocked(db.select).mockImplementation(m as unknown as typeof db.select);

            mockGet
                .mockResolvedValueOnce({
                    data: {
                        response: [
                            {
                                team: { id: 42, name: 'Arsenal', code: 'ARS', logo: 'logo-url' },
                                venue: { id: 505, name: 'Emirates' },
                            },
                        ],
                    },
                })
                .mockRejectedValueOnce(new Error('API rate limit'));

            const insertMock = vi.fn().mockReturnValue({
                values: vi.fn().mockReturnValue({
                    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
                    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
                }),
            });
            vi.mocked(db.insert).mockImplementation(insertMock as unknown as typeof db.insert);

            // Should NOT throw despite squad import failure
            const result = await repo.syncTeams(39, 2024);
            expect(result).toBeDefined();
        });
    });
});
