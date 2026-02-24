import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { renderHook, act } from '@testing-library/react';
import { useDeltaSync } from './useDeltaSync';
import { db } from '../db';
import { useClient } from 'urql';

vi.mock('urql', async (importActual) => {
    const actual = await importActual<typeof import('urql')>();
    return {
        ...actual,
        useClient: vi.fn(),
    };
});

describe('useDeltaSync', () => {
    const mockClient = {
        query: vi.fn()
    };

    beforeEach(async () => {
        vi.clearAllMocks();
        await db.syncState.clear();
        await db.teams.clear();
        (useClient as any).mockReturnValue(mockClient);
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
            expect.anything(), // Assuming the query document itself is not being strictly tested here
            expect.objectContaining({
                leagueId: 39,
                season: 2024,
                since: '2026-02-23T10:00:00Z'
            })
        );
    });
});
