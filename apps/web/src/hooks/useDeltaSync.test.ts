import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { renderHook, act } from '@testing-library/react';
import { useDeltaSync } from './useDeltaSync';
import { db } from '../db';
import { useClient } from 'urql';
import type { Fixture } from '../db';

vi.mock('urql', async (importActual) => {
    const actual = await importActual<typeof import('urql')>();
    return {
        ...actual,
        useClient: vi.fn(),
    };
});

function makeFixture(overrides: Partial<Fixture> & { id: string }): Fixture {
    return {
        seasonId: 'season-1',
        homeTeamId: 'team-a',
        awayTeamId: 'team-b',
        scheduledAt: '2024-01-01T12:00:00Z',
        status: 'played',
        goalsHome: 1,
        goalsAway: 0,
        updatedAt: '2026-02-23T10:00:00Z',
        ...overrides
    };
}

describe('useDeltaSync', () => {
    const mockClient = {
        query: vi.fn()
    };

    beforeEach(async () => {
        vi.clearAllMocks();
        await db.syncState.clear();
        await db.teams.clear();
        await db.fixtures.clear();
        await db.leagues.clear();
        await db.seasons.clear();
        vi.mocked(useClient).mockReturnValue(mockClient as unknown as ReturnType<typeof useClient>);
    });

    it('should fetch and store new teams', async () => {
        const mockTeams = [
            { id: 'team-1', name: 'Team One', updatedAt: '2026-02-23T11:00:00Z' }
        ];

        mockClient.query.mockReturnValue({
            toPromise: () => Promise.resolve({
                data: { teams: mockTeams, fixtures: [] }
            })
        });

        const { result } = renderHook(() => useDeltaSync());

        await act(async () => {
            await result.current.sync(39, 2024);
        });

        const team = await db.teams.get('team-1');
        expect(team?.name).toBe('Team One');

        const state = await db.syncState.get('sync:39:2024');
        expect(state?.lastUpdatedAt).toBe('2026-02-23T11:00:00Z');
    });

    it('should use "since" parameter from local sync state', async () => {
        await db.syncState.put({
            key: 'sync:39:2024',
            lastUpdatedAt: '2026-02-23T10:00:00Z'
        });

        mockClient.query.mockReturnValue({
            toPromise: () => Promise.resolve({
                data: { teams: [], fixtures: [] }
            })
        });

        const { result } = renderHook(() => useDeltaSync());

        await act(async () => {
            await result.current.sync(39, 2024);
        });

        expect(mockClient.query).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                leagueSourceId: 39,
                seasonYear: 2024,
                since: '2026-02-23T10:00:00Z'
            }),
            {} // no stale remediation → default request policy
        );
    });

    // -----------------------------------------------------------------------
    // Stale fixture detection tests
    // -----------------------------------------------------------------------
    describe('stale fixture detection', () => {
        const PAST_DATE = '2024-01-01T12:00:00Z'; // well in the past
        const FUTURE_DATE = '2099-12-31T23:59:59Z'; // well in the future

        it('clears watermark when past-due non-terminal fixtures exist in Dexie', async () => {
            // Seed Dexie with a watermark and a stale fixture
            await db.syncState.put({ key: 'sync:39:2024', lastUpdatedAt: '2026-02-23T10:00:00Z', metadata: { seasonId: 'season-1' } });
            await db.fixtures.put(makeFixture({
                id: 'stale-fix-1',
                status: 'scheduled',
                scheduledAt: PAST_DATE, // past-due
                goalsHome: null,
                goalsAway: null,
            }));

            mockClient.query.mockReturnValue({
                toPromise: () => Promise.resolve({
                    data: { teams: [], fixtures: [], venues: [] }
                })
            });

            const { result } = renderHook(() => useDeltaSync());
            await act(async () => { await result.current.sync(39, 2024); });

            // Watermark should have been cleared → query sent with since=null
            expect(mockClient.query).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ since: null }),
                expect.objectContaining({ requestPolicy: 'network-only' })
            );

            // syncState should be deleted
            const state = await db.syncState.get('sync:39:2024');
            expect(state).toBeUndefined();
        });

        it('keeps watermark when all fixtures are in terminal state', async () => {
            await db.syncState.put({ key: 'sync:39:2024', lastUpdatedAt: '2026-02-23T10:00:00Z', metadata: { seasonId: 'season-1' } });
            await db.fixtures.bulkPut([
                makeFixture({ id: 'played-1', status: 'played', scheduledAt: PAST_DATE }),
                makeFixture({ id: 'postponed-1', status: 'postponed', scheduledAt: PAST_DATE }),
                makeFixture({ id: 'cancelled-1', status: 'cancelled', scheduledAt: PAST_DATE }),
            ]);

            mockClient.query.mockReturnValue({
                toPromise: () => Promise.resolve({
                    data: { teams: [], fixtures: [], venues: [] }
                })
            });

            const { result } = renderHook(() => useDeltaSync());
            await act(async () => { await result.current.sync(39, 2024); });

            // Watermark should be preserved → query sent with since value
            expect(mockClient.query).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ since: '2026-02-23T10:00:00Z' }),
                {} // no stale fixtures → default request policy
            );
        });

        it('clears watermark when mix of terminal and stale fixtures exist', async () => {
            await db.syncState.put({ key: 'sync:39:2024', lastUpdatedAt: '2026-02-23T10:00:00Z', metadata: { seasonId: 'season-1' } });
            await db.fixtures.bulkPut([
                makeFixture({ id: 'played-1', status: 'played', scheduledAt: PAST_DATE }),
                makeFixture({ id: 'stale-1', status: 'scheduled', scheduledAt: PAST_DATE, goalsHome: null, goalsAway: null }),
                makeFixture({ id: 'future-1', status: 'scheduled', scheduledAt: FUTURE_DATE, goalsHome: null, goalsAway: null }),
            ]);

            mockClient.query.mockReturnValue({
                toPromise: () => Promise.resolve({
                    data: { teams: [], fixtures: [], venues: [] }
                })
            });

            const { result } = renderHook(() => useDeltaSync());
            await act(async () => { await result.current.sync(39, 2024); });

            // One stale fixture exists → watermark cleared
            expect(mockClient.query).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ since: null }),
                expect.objectContaining({ requestPolicy: 'network-only' })
            );
        });

        it('detects stale fixtures without leagues/seasons in Dexie (original bug)', async () => {
            // This is the exact scenario that caused Hull City / Ipswich lag:
            // - Fixtures exist in Dexie
            // - But leagues and seasons tables are empty
            // - The old code chained through leagues → seasons → fixtures and got nothing
            await db.syncState.put({ key: 'sync:40:2025', lastUpdatedAt: '2026-02-26T21:00:00Z', metadata: { seasonId: 'season-1' } });
            // leagues and seasons are intentionally left EMPTY
            await db.fixtures.bulkPut([
                makeFixture({ id: 'hull-fix', status: 'scheduled', scheduledAt: PAST_DATE, homeTeamId: 'hull', awayTeamId: 'ipswich', goalsHome: null, goalsAway: null }),
                makeFixture({ id: 'other-fix', status: 'played', scheduledAt: PAST_DATE }),
            ]);

            mockClient.query.mockReturnValue({
                toPromise: () => Promise.resolve({
                    data: { teams: [], fixtures: [], venues: [] }
                })
            });

            const { result } = renderHook(() => useDeltaSync());
            await act(async () => { await result.current.sync(40, 2025); });

            // With the fix, stale detection works even without leagues/seasons in Dexie
            expect(mockClient.query).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ since: null }),
                expect.objectContaining({ requestPolicy: 'network-only' })
            );
        });
    });
});

