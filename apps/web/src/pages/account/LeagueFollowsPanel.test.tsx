import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useMutation, useQuery } from 'urql';
import { describe, expect, it, vi } from 'vitest';

import { useViewer, type Viewer } from '../../hooks/useViewer';
import LeagueFollowsPanel from './LeagueFollowsPanel';

vi.mock('../../hooks/useViewer', () => ({ useViewer: vi.fn() }));
vi.mock('urql', () => ({
    gql: (strings: TemplateStringsArray) => strings.join(''),
    useQuery: vi.fn(),
    useMutation: vi.fn(),
}));

const viewer: Viewer = {
    id: 'u-1',
    name: 'Ada',
    email: 'ada@example.com',
    image: null,
    emailVerified: true,
    roles: ['user'],
    createdAt: '2026-01-01T00:00:00.000Z',
    identities: [],
    followedLeagueIds: ['league-1'],
    myGrants: [],
};

function mockViewer(v: Viewer | null = viewer, refetch = vi.fn()): ReturnType<typeof vi.fn> {
    vi.mocked(useViewer).mockReturnValue({ viewer: v, loading: false, refetch });
    return refetch;
}

function mockLeagues(leagues: Array<{ id: string; name: string; country: string | null; logo: string | null }>): void {
    vi.mocked(useQuery).mockReturnValue([
        { data: { leagues }, fetching: false, error: undefined, stale: false },
        vi.fn(),
    ] as unknown as ReturnType<typeof useQuery>);
}

function mockMutation(): ReturnType<typeof vi.fn> {
    const exec = vi.fn().mockResolvedValue({ data: { setMyLeagueFollows: ['league-1'] }, error: undefined });
    vi.mocked(useMutation).mockReturnValue([
        { fetching: false, stale: false, error: undefined },
        exec,
    ] as unknown as ReturnType<typeof useMutation>);
    return exec;
}

describe('LeagueFollowsPanel', () => {
    it('reflects the viewer.followedLeagueIds set on initial render', () => {
        mockViewer();
        mockLeagues([
            { id: 'league-1', name: 'Premier League', country: 'England', logo: null },
            { id: 'league-2', name: 'La Liga', country: 'Spain', logo: null },
        ]);
        mockMutation();

        render(<LeagueFollowsPanel />);
        const premier = screen.getByRole('switch', { name: /Follow Premier League/i });
        const laLiga = screen.getByRole('switch', { name: /Follow La Liga/i });
        expect(premier.getAttribute('aria-checked')).toBe('true');
        expect(laLiga.getAttribute('aria-checked')).toBe('false');
    });

    it('toggling on adds the league id to the next set sent to the mutation', async () => {
        mockViewer();
        mockLeagues([
            { id: 'league-1', name: 'Premier League', country: null, logo: null },
            { id: 'league-2', name: 'La Liga', country: null, logo: null },
        ]);
        const exec = mockMutation();

        render(<LeagueFollowsPanel />);
        fireEvent.click(screen.getByRole('switch', { name: /Follow La Liga/i }));
        await waitFor(() =>
            expect(exec).toHaveBeenCalledWith({ leagueIds: ['league-1', 'league-2'] }),
        );
    });

    it('toggling off removes the league id from the next set', async () => {
        mockViewer();
        mockLeagues([
            { id: 'league-1', name: 'Premier League', country: null, logo: null },
        ]);
        const exec = mockMutation();

        render(<LeagueFollowsPanel />);
        fireEvent.click(screen.getByRole('switch', { name: /Follow Premier League/i }));
        await waitFor(() => expect(exec).toHaveBeenCalledWith({ leagueIds: [] }));
    });
});
