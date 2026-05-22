import { renderHook } from '@testing-library/react';
import { useQuery } from 'urql';
import { describe, expect, it, vi } from 'vitest';

import { useViewer } from './useViewer';

vi.mock('urql', () => ({
    gql: (strings: TemplateStringsArray) => strings.join(''),
    useQuery: vi.fn(),
}));

function mockUrql(data: { viewer: unknown } | null, fetching = false): void {
    vi.mocked(useQuery).mockReturnValue([
        { data, fetching, error: undefined, stale: false },
        vi.fn(),
    ] as unknown as ReturnType<typeof useQuery>);
}

describe('useViewer', () => {
    it('returns viewer:null (not an error) when signed out', () => {
        mockUrql({ viewer: null });
        const { result } = renderHook(() => useViewer());
        expect(result.current.viewer).toBeNull();
        expect(result.current.loading).toBe(false);
    });

    it('returns the viewer when signed in', () => {
        const viewer = {
            id: 'u-1',
            name: 'Ada',
            email: 'ada@example.com',
            image: null,
            emailVerified: true,
            roles: ['user'],
            createdAt: '2026-01-01T00:00:00.000Z',
            identities: [],
            followedLeagueIds: [],
    myGrants: [],
        };
        mockUrql({ viewer });
        const { result } = renderHook(() => useViewer());
        expect(result.current.viewer).toEqual(viewer);
    });

    it('reports loading while the query is fetching', () => {
        mockUrql(null, true);
        const { result } = renderHook(() => useViewer());
        expect(result.current.loading).toBe(true);
        expect(result.current.viewer).toBeNull();
    });
});
