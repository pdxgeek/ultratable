import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseFootballRepository } from './supabase.repository';
import axios from 'axios';
import { db } from '../db';
import * as schema from '../db/schema';

vi.mock('axios');
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
        process.env.API_FOOTBALL_KEY = 'test-key';
    });

    describe('getLeagues', () => {
        it('should return existing leagues from database if available', async () => {
            const mockLeagues = [{ id: 1, name: 'Premier League' }];
            const selectMock = vi.fn().mockReturnValue({
                from: vi.fn().mockResolvedValue(mockLeagues)
            });
            vi.mocked(db.select).mockImplementation(selectMock as any);

            const result = await repo.getLeagues();

            expect(result).toEqual(mockLeagues);
            expect(db.insert).not.toHaveBeenCalled();
        });

        it('should fetch from API-Football and ingest if database is empty', async () => {
            // 1. Mock empty DB
            const emptySelectMock = vi.fn()
                .mockReturnValueOnce({ from: vi.fn().mockResolvedValue([]) }) // Initial check
                .mockReturnValueOnce({ from: vi.fn().mockResolvedValue([{ id: 1, name: 'Premier League' }]) }); // Final fetch

            vi.mocked(db.select).mockImplementation(emptySelectMock as any);

            // 2. Mock axios
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
            vi.mocked(axios.create).mockReturnValue({
                get: vi.fn().mockResolvedValue(mockResponse)
            } as any);

            // 3. Mock insert
            const insertMock = vi.fn().mockReturnValue({
                values: vi.fn().mockReturnValue({
                    onConflictDoNothing: vi.fn().mockResolvedValue(undefined)
                })
            });
            vi.mocked(db.insert).mockImplementation(insertMock as any);

            const result = await repo.getLeagues();

            expect(result[0].name).toBe('Premier League');
            expect(db.insert).toHaveBeenCalled();
            expect(axios.create).toHaveBeenCalled();
        });
    });

    describe('getTeams', () => {
        it('should fetch teams from API-Football and insert into database', async () => {
            const teamSelectMock = vi.fn()
                .mockReturnValue({ from: vi.fn().mockResolvedValue([{ id: 1, name: 'Arsenal' }]) });
            vi.mocked(db.select).mockImplementation(teamSelectMock as any);

            const mockResponse = {
                data: {
                    response: [
                        {
                            team: { id: 42, name: 'Arsenal', code: 'ARS', logo: 'logo-url' },
                            venue: { name: 'Emirates Stadium' }
                        }
                    ]
                }
            };

            const mockGet = vi.fn().mockResolvedValue(mockResponse);
            vi.mocked(axios.create).mockReturnValue({
                get: mockGet
            } as any);

            const insertMock = vi.fn().mockReturnValue({
                values: vi.fn().mockReturnValue({
                    onConflictDoNothing: vi.fn().mockResolvedValue(undefined)
                })
            });
            vi.mocked(db.insert).mockImplementation(insertMock as any);

            const result = await repo.getTeams(39, 2024);

            expect(result[0].name).toBe('Arsenal');
            expect(db.insert).toHaveBeenCalled();
            expect(axios.create).toHaveBeenCalledWith(expect.objectContaining({
                baseURL: 'https://v3.football.api-sports.io'
            }));
            expect(mockGet).toHaveBeenCalledWith('/teams', expect.objectContaining({
                params: { league: 39, season: 2024 }
            }));
        });
    });
});
