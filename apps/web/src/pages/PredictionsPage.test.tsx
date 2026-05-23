import type { Team } from '../db';
import type { Mock } from 'vitest';

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useMutation, useQuery } from 'urql';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AbilityProvider } from '../auth/AbilityContext';
import { useLeague } from '../context/LeagueContext';
import { useStandings } from '../hooks/useStandings';
import { useViewer, type Viewer } from '../hooks/useViewer';
import PredictionsPage from './PredictionsPage';

vi.mock('../hooks/useViewer', () => ({ useViewer: vi.fn() }));
vi.mock('../context/LeagueContext', () => ({ useLeague: vi.fn() }));
vi.mock('../hooks/useStandings', () => ({ useStandings: vi.fn() }));
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
    roles: ['user', 'predictions'],
    createdAt: '2026-01-01T00:00:00.000Z',
    identities: [],
    followedLeagueIds: [],
    myGrants: [],
};

const teams: Team[] = [
    { id: 't-1', name: 'Arsenal', logo: '' } as Team,
    { id: 't-2', name: 'Brentford', logo: '' } as Team,
    { id: 't-3', name: 'Chelsea', logo: '' } as Team,
];
const teamsMap = new Map(teams.map((t) => [t.id, t]));

// Default standings have `played: 0` so season hasn't started — delta arrows
// should not appear unless a test overrides this.
const standingsNotStarted = [
    { teamId: 't-1', position: 1, played: 0, team: { name: 'Arsenal' } },
    { teamId: 't-2', position: 2, played: 0, team: { name: 'Brentford' } },
    { teamId: 't-3', position: 3, played: 0, team: { name: 'Chelsea' } },
];
const standingsStarted = [
    { teamId: 't-1', position: 1, played: 5, team: { name: 'Arsenal' } },
    { teamId: 't-2', position: 2, played: 5, team: { name: 'Brentford' } },
    { teamId: 't-3', position: 3, played: 5, team: { name: 'Chelsea' } },
];

type Snapshot = {
    id: string;
    userId: string;
    seasonId: string;
    type: 'PROJECTED_FINISH';
    lockedAt: string;
    deletedAt: null;
};

type SnapshotWithEntries = Snapshot & {
    entries: Array<{ teamId: string; position: number }>;
};

function setupHooks({
    snapshots = [],
    snapshot = null,
    deleteResult = {},
    viewerOverride = viewer,
    standingsOverride = standingsNotStarted,
}: {
    snapshots?: Snapshot[];
    snapshot?: SnapshotWithEntries | null;
    deleteResult?: {
        data?: unknown;
        error?: { graphQLErrors?: Array<{ message: string }>; message: string };
    };
    viewerOverride?: Viewer;
    standingsOverride?: typeof standingsNotStarted;
} = {}) {
    (useViewer as unknown as Mock).mockReturnValue({
        viewer: viewerOverride,
        loading: false,
        refetch: vi.fn(),
    });
    (useLeague as unknown as Mock).mockReturnValue({
        activeLeague: { id: 'l-1', name: 'Premier League', metadata: {} },
        activeSeason: { id: 's-1', metadata: { promotion: [1], relegation: [3] } },
        availableLeagues: [],
        availableSeasons: [],
        setActiveSeasonId: vi.fn(),
        isLoading: false,
        isSyncing: false,
    });
    (useStandings as unknown as Mock).mockReturnValue({
        standings: standingsOverride,
        fixtures: [],
        teamsMap,
        season: { id: 's-1' },
        isLoading: false,
        lastUpdated: undefined,
    });

    const refetchHistory = vi.fn();
    (useQuery as unknown as Mock).mockImplementation((args: { query: string }) => {
        if (typeof args.query === 'string' && args.query.includes('MyPredictions')) {
            return [{ data: { myPredictions: snapshots }, fetching: false }, refetchHistory];
        }
        return [{ data: { predictionSnapshot: snapshot }, fetching: false }, vi.fn()];
    });

    const lockInExec = vi.fn().mockResolvedValue({ data: undefined, error: undefined });
    const deleteExec = vi
        .fn()
        .mockResolvedValue({ data: deleteResult.data, error: deleteResult.error });
    let mutationCalls = 0;
    (useMutation as unknown as Mock).mockImplementation(() => {
        mutationCalls += 1;
        if (mutationCalls % 2 === 1) {
            return [{ fetching: false, stale: false, error: undefined }, lockInExec];
        }
        return [{ fetching: false, stale: false, error: undefined }, deleteExec];
    });

    return { lockInExec, deleteExec, refetchHistory };
}

function renderPage() {
    return render(
        <MemoryRouter>
            <AbilityProvider>
                <PredictionsPage />
            </AbilityProvider>
        </MemoryRouter>,
    );
}

describe('PredictionsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders all teams in the pool and empty slots by default', () => {
        setupHooks();
        renderPage();

        const pool = screen.getByTestId('pool');
        expect(within(pool).getByText('Arsenal')).toBeTruthy();
        expect(within(pool).getByText('Brentford')).toBeTruthy();
        expect(within(pool).getByText('Chelsea')).toBeTruthy();

        // Each slot starts with the "Drop a team here" placeholder.
        const slot1 = screen.getByTestId('slot-1');
        const slot2 = screen.getByTestId('slot-2');
        const slot3 = screen.getByTestId('slot-3');
        expect(within(slot1).getByText(/Drop a team here/i)).toBeTruthy();
        expect(within(slot2).getByText(/Drop a team here/i)).toBeTruthy();
        expect(within(slot3).getByText(/Drop a team here/i)).toBeTruthy();
    });

    it('disables the Lock In button until every slot is filled', () => {
        setupHooks();
        renderPage();

        const lockIn = screen.getByRole('button', { name: /Lock In/i });
        expect(lockIn.hasAttribute('disabled')).toBe(true);
        // Status hint reflects 0/3 placed.
        expect(screen.getByText(/0\/3 placed/)).toBeTruthy();
    });

    it('renders the snapshot order in slots and hides the pool in view mode', async () => {
        setupHooks({
            snapshots: [
                {
                    id: 'p-1',
                    userId: 'u-1',
                    seasonId: 's-1',
                    type: 'PROJECTED_FINISH',
                    lockedAt: '2026-05-23T12:00:00.000Z',
                    deletedAt: null,
                },
            ],
            snapshot: {
                id: 'p-1',
                userId: 'u-1',
                seasonId: 's-1',
                type: 'PROJECTED_FINISH',
                lockedAt: '2026-05-23T12:00:00.000Z',
                deletedAt: null,
                entries: [
                    { teamId: 't-3', position: 1 },
                    { teamId: 't-1', position: 2 },
                    { teamId: 't-2', position: 3 },
                ],
            },
        });
        renderPage();

        const historyButton = screen
            .getAllByRole('button')
            .find((b) => /2026/.test(b.textContent ?? ''));
        fireEvent.click(historyButton!);

        await waitFor(() => screen.getByRole('button', { name: /Make Predictions/i }));

        // Pool is gone in view mode.
        expect(screen.queryByTestId('pool')).toBeNull();

        // Slots show the snapshot's order: Chelsea, Arsenal, Brentford.
        expect(within(screen.getByTestId('slot-1')).getByText('Chelsea')).toBeTruthy();
        expect(within(screen.getByTestId('slot-2')).getByText('Arsenal')).toBeTruthy();
        expect(within(screen.getByTestId('slot-3')).getByText('Brentford')).toBeTruthy();
    });

    it('shows up/down/neutral delta arrows in view mode when the season has started', async () => {
        // Current positions: t-1=1, t-2=2, t-3=3. Snapshot reorders to
        // t-3=1, t-1=2, t-2=3 → t-3 moves up 2, t-1 down 1, t-2 down 1.
        setupHooks({
            snapshots: [
                {
                    id: 'p-1',
                    userId: 'u-1',
                    seasonId: 's-1',
                    type: 'PROJECTED_FINISH',
                    lockedAt: '2026-05-23T12:00:00.000Z',
                    deletedAt: null,
                },
            ],
            snapshot: {
                id: 'p-1',
                userId: 'u-1',
                seasonId: 's-1',
                type: 'PROJECTED_FINISH',
                lockedAt: '2026-05-23T12:00:00.000Z',
                deletedAt: null,
                entries: [
                    { teamId: 't-3', position: 1 },
                    { teamId: 't-1', position: 2 },
                    { teamId: 't-2', position: 3 },
                ],
            },
            standingsOverride: standingsStarted,
        });
        renderPage();

        const historyButton = screen
            .getAllByRole('button')
            .find((b) => /2026/.test(b.textContent ?? ''));
        fireEvent.click(historyButton!);

        await waitFor(() => screen.getByRole('button', { name: /Make Predictions/i }));
        expect(
            within(screen.getByTestId('slot-1')).getByText(/2 positions higher/i),
        ).toBeTruthy();
        expect(within(screen.getByTestId('slot-2')).getByText(/1 positions lower/i)).toBeTruthy();
        expect(within(screen.getByTestId('slot-3')).getByText(/1 positions lower/i)).toBeTruthy();
    });

    it('renders the neutral delta when the prediction matches current position', async () => {
        // Snapshot matches current standings exactly: all deltas = 0.
        setupHooks({
            snapshots: [
                {
                    id: 'p-1',
                    userId: 'u-1',
                    seasonId: 's-1',
                    type: 'PROJECTED_FINISH',
                    lockedAt: '2026-05-23T12:00:00.000Z',
                    deletedAt: null,
                },
            ],
            snapshot: {
                id: 'p-1',
                userId: 'u-1',
                seasonId: 's-1',
                type: 'PROJECTED_FINISH',
                lockedAt: '2026-05-23T12:00:00.000Z',
                deletedAt: null,
                entries: [
                    { teamId: 't-1', position: 1 },
                    { teamId: 't-2', position: 2 },
                    { teamId: 't-3', position: 3 },
                ],
            },
            standingsOverride: standingsStarted,
        });
        renderPage();

        const historyButton = screen
            .getAllByRole('button')
            .find((b) => /2026/.test(b.textContent ?? ''));
        fireEvent.click(historyButton!);
        await waitFor(() => screen.getByRole('button', { name: /Make Predictions/i }));

        expect(within(screen.getByTestId('slot-1')).getByText(/Same position/i)).toBeTruthy();
        expect(within(screen.getByTestId('slot-2')).getByText(/Same position/i)).toBeTruthy();
        expect(within(screen.getByTestId('slot-3')).getByText(/Same position/i)).toBeTruthy();
    });

    it('omits delta indicators when the season has not started', async () => {
        setupHooks({
            snapshots: [
                {
                    id: 'p-1',
                    userId: 'u-1',
                    seasonId: 's-1',
                    type: 'PROJECTED_FINISH',
                    lockedAt: '2026-05-23T12:00:00.000Z',
                    deletedAt: null,
                },
            ],
            snapshot: {
                id: 'p-1',
                userId: 'u-1',
                seasonId: 's-1',
                type: 'PROJECTED_FINISH',
                lockedAt: '2026-05-23T12:00:00.000Z',
                deletedAt: null,
                entries: [
                    { teamId: 't-3', position: 1 },
                    { teamId: 't-1', position: 2 },
                    { teamId: 't-2', position: 3 },
                ],
            },
            // standingsNotStarted (default) — every team has played === 0.
        });
        renderPage();

        const historyButton = screen
            .getAllByRole('button')
            .find((b) => /2026/.test(b.textContent ?? ''));
        fireEvent.click(historyButton!);
        await waitFor(() => screen.getByRole('button', { name: /Make Predictions/i }));

        expect(screen.queryByText(/positions higher/i)).toBeNull();
        expect(screen.queryByText(/positions lower/i)).toBeNull();
        expect(screen.queryByText(/Same position/i)).toBeNull();
    });

    it('hides the delete control when CASL denies (non-owner viewer)', async () => {
        setupHooks({
            snapshots: [
                {
                    id: 'p-1',
                    userId: 'other-user',
                    seasonId: 's-1',
                    type: 'PROJECTED_FINISH',
                    lockedAt: '2026-05-23T12:00:00.000Z',
                    deletedAt: null,
                },
            ],
            snapshot: {
                id: 'p-1',
                userId: 'other-user',
                seasonId: 's-1',
                type: 'PROJECTED_FINISH',
                lockedAt: '2026-05-23T12:00:00.000Z',
                deletedAt: null,
                entries: [
                    { teamId: 't-1', position: 1 },
                    { teamId: 't-2', position: 2 },
                    { teamId: 't-3', position: 3 },
                ],
            },
        });
        renderPage();

        const historyButton = screen
            .getAllByRole('button')
            .find((b) => /2026/.test(b.textContent ?? ''));
        fireEvent.click(historyButton!);
        await waitFor(() => screen.getByRole('button', { name: /Make Predictions/i }));

        expect(screen.queryByRole('button', { name: /Delete this prediction/i })).toBeNull();
    });

    it('deletes the snapshot on confirm and exits view mode', async () => {
        const { deleteExec, refetchHistory } = setupHooks({
            snapshots: [
                {
                    id: 'p-1',
                    userId: 'u-1',
                    seasonId: 's-1',
                    type: 'PROJECTED_FINISH',
                    lockedAt: '2026-05-23T12:00:00.000Z',
                    deletedAt: null,
                },
            ],
            snapshot: {
                id: 'p-1',
                userId: 'u-1',
                seasonId: 's-1',
                type: 'PROJECTED_FINISH',
                lockedAt: '2026-05-23T12:00:00.000Z',
                deletedAt: null,
                entries: [
                    { teamId: 't-1', position: 1 },
                    { teamId: 't-2', position: 2 },
                    { teamId: 't-3', position: 3 },
                ],
            },
            deleteResult: { data: { deletePredictionSnapshot: 'p-1' } },
        });
        renderPage();

        const historyButton = screen
            .getAllByRole('button')
            .find((b) => /2026/.test(b.textContent ?? ''));
        fireEvent.click(historyButton!);
        await waitFor(() => screen.getByRole('button', { name: /Make Predictions/i }));
        fireEvent.click(screen.getByRole('button', { name: /Delete this prediction/i }));

        const confirmDelete = await screen.findByRole('button', { name: /^Delete$/i });
        fireEvent.click(confirmDelete);

        await waitFor(() => expect(deleteExec).toHaveBeenCalledWith({ id: 'p-1' }));
        await waitFor(() => expect(refetchHistory).toHaveBeenCalled());
        await waitFor(() =>
            expect(screen.queryByRole('button', { name: /Make Predictions/i })).toBeNull(),
        );
        // Pool is back (draft mode).
        expect(screen.getByTestId('pool')).toBeTruthy();
    });

    it('keeps the delete dialog open and surfaces the error on server failure', async () => {
        setupHooks({
            snapshots: [
                {
                    id: 'p-1',
                    userId: 'u-1',
                    seasonId: 's-1',
                    type: 'PROJECTED_FINISH',
                    lockedAt: '2026-05-23T12:00:00.000Z',
                    deletedAt: null,
                },
            ],
            snapshot: {
                id: 'p-1',
                userId: 'u-1',
                seasonId: 's-1',
                type: 'PROJECTED_FINISH',
                lockedAt: '2026-05-23T12:00:00.000Z',
                deletedAt: null,
                entries: [
                    { teamId: 't-1', position: 1 },
                    { teamId: 't-2', position: 2 },
                    { teamId: 't-3', position: 3 },
                ],
            },
            deleteResult: {
                error: {
                    graphQLErrors: [{ message: 'Forbidden' }],
                    message: 'Forbidden',
                },
            },
        });
        renderPage();

        const historyButton = screen
            .getAllByRole('button')
            .find((b) => /2026/.test(b.textContent ?? ''));
        fireEvent.click(historyButton!);
        await waitFor(() => screen.getByRole('button', { name: /Make Predictions/i }));
        fireEvent.click(screen.getByRole('button', { name: /Delete this prediction/i }));

        const confirmDelete = await screen.findByRole('button', { name: /^Delete$/i });
        fireEvent.click(confirmDelete);

        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toMatch(/Forbidden/);
        // Dialog stays open — its Cancel button is still present.
        expect(screen.getByRole('button', { name: /Cancel/i })).toBeTruthy();
    });
});
