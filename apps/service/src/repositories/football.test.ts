import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseFootballRepository } from './supabase.repository';
import { db } from '../db';
import { cacheService } from '../services/cache.service.js';

const mockGet = vi.fn();
vi.mock('axios', () => ({
    default: {
        create: vi.fn().mockReturnValue({
            get: (...args: unknown[]) => mockGet(...args)
        })
    }
}));

vi.mock('../db', () => ({
    db: {
        select: vi.fn(),
        insert: vi.fn(),
    }
}));

describe('SupabaseFootballRepository', () => {
    let repo: SupabaseFootballRepository;

    beforeEach(() => {
        repo = new SupabaseFootballRepository();
        vi.clearAllMocks();
        cacheService.clear();
        process.env.API_FOOTBALL_KEY = 'test-key';
    });

    describe('getLeagues', () => {
        it('should return existing leagues from database if available', async () => {
            const mockLeagues = [{ id: 'league-uuid', name: 'Premier League', sourceId: 1 }];
            const selectMock = vi.fn().mockReturnValue({
                from: vi.fn().mockResolvedValue(mockLeagues)
            });
            vi.mocked(db.select).mockImplementation(selectMock as unknown as typeof db.select);

            const result = await repo.getLeagues();

            expect(result).toEqual(mockLeagues);
        });

        it('should fetch from provider and ingest if database is empty', async () => {
            // 1. Mock empty DB
            const emptySelectMock = vi.fn()
                .mockReturnValueOnce({ from: vi.fn().mockResolvedValue([]) }) // Initial check
                .mockReturnValueOnce({ from: vi.fn().mockResolvedValue([{ id: 'new-uuid', name: 'Premier League' }]) }); // Final fetch

            vi.mocked(db.select).mockImplementation(emptySelectMock as unknown as typeof db.select);

            // 2. Mock provider response
            const mockResponse = {
                data: {
                    response: [
                        {
                            league: { id: 39, name: 'Premier League', logo: 'logo-url' },
                            country: { name: 'England' }
                        }
                    ]
                }
            };
            mockGet.mockResolvedValue(mockResponse);

            // 3. Mock insert
            const insertMock = vi.fn().mockReturnValue({
                values: vi.fn().mockReturnValue({
                    onConflictDoNothing: vi.fn().mockResolvedValue(undefined)
                })
            });
            vi.mocked(db.insert).mockImplementation(insertMock as unknown as typeof db.insert);

            const result = await repo.getLeagues();

            expect(mockGet).toHaveBeenCalledWith('/leagues');
            expect(db.insert).toHaveBeenCalled();
            expect(result).toHaveLength(1);
        });
    });

    describe('getTeams', () => {
        it('should fetch teams from provider and insert into database', async () => {
            const leagueMock = [{ id: 'league-uuid', sourceId: 39 }];
            const seasonMock = [{ id: 'season-uuid' }];
            const venueMock = [{ id: 'venue-uuid', sourceId: 505 }];
            const teamMock = [{ id: 'team-uuid', sourceId: 42, name: 'Arsenal' }];

            // Sequential calls for getTeams
            const m = vi.fn()
                .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(leagueMock) }) }) // league
                .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(seasonMock) }) }) // season
                .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(venueMock) }) })  // venues
                .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(teamMock) }) })   // teams
                .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }) // existing graphics
                .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ innerJoin: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ team: teamMock[0] }]) }) }) }); // result

            vi.mocked(db.select).mockImplementation(m as unknown as typeof db.select);

            const mockResponse = {
                data: {
                    response: [
                        {
                            team: { id: 42, name: 'Arsenal', code: 'ARS', logo: 'logo-url' },
                            venue: { id: 505, name: 'Emirates Stadium' }
                        }
                    ]
                }
            };
            mockGet.mockResolvedValue(mockResponse);

            // Mock insert with cascade structure
            const insertMock = vi.fn().mockReturnValue({
                values: vi.fn().mockReturnValue({
                    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
                    onConflictDoNothing: vi.fn().mockResolvedValue(undefined)
                })
            });
            vi.mocked(db.insert).mockImplementation(insertMock as unknown as typeof db.insert);

            const result = await repo.getTeams(39, 2024);

            expect(result[0].name).toBe('Arsenal');
            expect(mockGet).toHaveBeenCalledWith('/teams', expect.anything());
        });
    });
});
