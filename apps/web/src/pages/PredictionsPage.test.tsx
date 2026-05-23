import type { Team } from '../db';
import type { Mock } from 'vitest';

import React from 'react';
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

const standings = [
    { teamId: 't-1', position: 1, team: { name: 'Arsenal' } },
    { teamId: 't-2', position: 2, team: { name: 'Brentford' } },
    { teamId: 't-3', position: 3, team: { name: 'Chelsea' } },
];

function setupHooks({
    snapshots = [],
    snapshot = null,
    lockInResult = {},
    deleteResult = {},
    viewerOverride = viewer,
}: {
    snapshots?: Array<{
        id: string;
        userId: string;
        seasonId: string;
        type: 'PROJECTED_FINISH';
        lockedAt: string;
        deletedAt: null;
    }>;
    snapshot?: {
        id: string;
        userId: string;
        seasonId: string;
        type: 'PROJECTED_FINISH';
        lockedAt: string;
        deletedAt: null;
        entries: Array<{ teamId: string; position: number }>;
    } | null;
    lockInResult?: {
        data?: unknown;
        error?: { graphQLErrors?: Array<{ message: string }>; message: string };
    };
    deleteResult?: {
        data?: unknown;
        error?: { graphQLErrors?: Array<{ message: string }>; message: string };
    };
    viewerOverride?: Viewer;
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
        standings,
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

    const lockInExec = vi
        .fn()
        .mockResolvedValue({ data: lockInResult.data, error: lockInResult.error });
    const deleteExec = vi
        .fn()
        .mockResolvedValue({ data: deleteResult.data, error: deleteResult.error });
    let useMutationCallCount = 0;
    (useMutation as unknown as Mock).mockImplementation(() => {
        useMutationCallCount += 1;
        // PredictionsPage instantiates lockIn first, then delete — preserve that order.
        if (useMutationCallCount % 2 === 1) {
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

    it('renders teams in current standings order by default', () => {
        setupHooks();
        renderPage();

        const rows = screen.getAllByRole('row').slice(1); // skip header
        expect(rows.map((r) => within(r).getByText(/Arsenal|Brentford|Chelsea/).textContent)).toEqual([
            'Arsenal',
            'Brentford',
            'Chelsea',
        ]);
    });

    it('reorders via the up arrow when a row is selected', () => {
        setupHooks();
        renderPage();

        // Click Brentford row to select it
        fireEvent.click(screen.getByText('Brentford'));
        // Click ↑ to move it above Arsenal
        fireEvent.click(screen.getByLabelText('Move Brentford up'));

        const rows = screen.getAllByRole('row').slice(1);
        expect(rows.map((r) => within(r).getByText(/Arsenal|Brentford|Chelsea/).textContent)).toEqual([
            'Brentford',
            'Arsenal',
            'Chelsea',
        ]);
    });

    it('calls lockInPrediction with the current draft order and refetches history', async () => {
        const { lockInExec, refetchHistory } = setupHooks({
            lockInResult: {
                data: {
                    lockInPrediction: {
                        id: 'p-1',
                        userId: 'u-1',
                        seasonId: 's-1',
                        type: 'PROJECTED_FINISH',
                        lockedAt: '2026-05-23T12:00:00.000Z',
                        deletedAt: null,
                    },
                },
            },
        });
        renderPage();

        fireEvent.click(screen.getByRole('button', { name: /Lock In/i }));

        await waitFor(() =>
            expect(lockInExec).toHaveBeenCalledWith({
                input: {
                    seasonId: 's-1',
                    type: 'PROJECTED_FINISH',
                    orderedTeamIds: ['t-1', 't-2', 't-3'],
                },
            }),
        );
        await waitFor(() => expect(refetchHistory).toHaveBeenCalled());
    });

    it('surfaces a PREDICTION_LIMIT_REACHED error verbatim', async () => {
        setupHooks({
            lockInResult: {
                error: {
                    graphQLErrors: [
                        { message: 'Prediction limit reached for this season (50/50)' },
                    ],
                    message: 'Prediction limit reached for this season (50/50)',
                },
            },
        });
        renderPage();

        fireEvent.click(screen.getByRole('button', { name: /Lock In/i }));

        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toMatch(/Prediction limit reached/);
    });

    it('enters read-only view mode when a snapshot is clicked', async () => {
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

        // The history button shows the formatted timestamp; click it.
        const historyButton = screen
            .getAllByRole('button')
            .find((b) => /2026/.test(b.textContent ?? ''));
        expect(historyButton).toBeDefined();
        fireEvent.click(historyButton!);

        // Lock In is replaced by Make Predictions.
        await waitFor(() =>
            expect(screen.getByRole('button', { name: /Make Predictions/i })).toBeTruthy(),
        );
        expect(screen.queryByRole('button', { name: /^Lock In$/i })).toBeNull();

        // Order matches the snapshot, not current standings.
        const rows = screen.getAllByRole('row').slice(1);
        expect(rows.map((r) => within(r).getByText(/Arsenal|Brentford|Chelsea/).textContent)).toEqual([
            'Chelsea',
            'Arsenal',
            'Brentford',
        ]);
    });

    it('restores the user pre-view order when Make Predictions is clicked', async () => {
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

        // Edit draft: swap Brentford and Arsenal.
        fireEvent.click(screen.getByText('Brentford'));
        fireEvent.click(screen.getByLabelText('Move Brentford up'));

        // Enter view mode.
        const historyButton = screen
            .getAllByRole('button')
            .find((b) => /2026/.test(b.textContent ?? ''));
        fireEvent.click(historyButton!);
        await waitFor(() => screen.getByRole('button', { name: /Make Predictions/i }));

        // Click Make Predictions — should restore the user's edited order.
        fireEvent.click(screen.getByRole('button', { name: /Make Predictions/i }));

        const rows = screen.getAllByRole('row').slice(1);
        expect(rows.map((r) => within(r).getByText(/Arsenal|Brentford|Chelsea/).textContent)).toEqual([
            'Brentford',
            'Arsenal',
            'Chelsea',
        ]);
    });

    it('shows the subtle delete control only when the viewer can delete', async () => {
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
        // Viewer is u-1 but the snapshot belongs to other-user; CASL denies.
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

        // Confirm in the dialog.
        const confirmDelete = await screen.findByRole('button', { name: /^Delete$/i });
        fireEvent.click(confirmDelete);

        await waitFor(() => expect(deleteExec).toHaveBeenCalledWith({ id: 'p-1' }));
        await waitFor(() => expect(refetchHistory).toHaveBeenCalled());
        // Back to draft mode after success.
        await waitFor(() =>
            expect(screen.queryByRole('button', { name: /Make Predictions/i })).toBeNull(),
        );
        expect(screen.getByRole('button', { name: /Lock In/i })).toBeTruthy();
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
        // Dialog stays open on failure (so the user can read the error).
        // Make Predictions sits behind the modal overlay (aria-hidden), so
        // assert the dialog's own Cancel button is still present instead.
        expect(screen.getByRole('button', { name: /Cancel/i })).toBeTruthy();
    });
});
