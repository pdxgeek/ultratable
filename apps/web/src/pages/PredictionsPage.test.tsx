import type { PredictionDraft, Team } from '../db';
import type { Mock } from 'vitest';

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { MemoryRouter } from 'react-router-dom';
import { useMutation, useQuery } from 'urql';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as drafts from '../db/predictionDrafts';
import { AbilityProvider } from '../auth/AbilityContext';
import { useLeague } from '../context/LeagueContext';
import { useStandings } from '../hooks/useStandings';
import { useViewer, type Viewer } from '../hooks/useViewer';
import PredictionsPage from './PredictionsPage';

vi.mock('../hooks/useViewer', () => ({ useViewer: vi.fn() }));
vi.mock('../context/LeagueContext', () => ({ useLeague: vi.fn() }));
vi.mock('../hooks/useStandings', () => ({ useStandings: vi.fn() }));
vi.mock('dexie-react-hooks', () => ({ useLiveQuery: vi.fn() }));
vi.mock('../db/predictionDrafts', async (importActual) => {
    const actual = await importActual<typeof import('../db/predictionDrafts')>();
    return {
        ...actual,
        saveDraft: vi.fn().mockResolvedValue(undefined),
        clearDraft: vi.fn().mockResolvedValue(undefined),
    };
});
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
    savedDraft = null,
}: {
    snapshots?: Snapshot[];
    snapshot?: SnapshotWithEntries | null;
    deleteResult?: {
        data?: unknown;
        error?: { graphQLErrors?: Array<{ message: string }>; message: string };
    };
    viewerOverride?: Viewer | null;
    standingsOverride?: typeof standingsNotStarted;
    savedDraft?: PredictionDraft | null;
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
    // useLiveQuery returns `undefined` while loading, `PredictionDraft | undefined`
    // once Dexie answers (undefined = no row, defined = saved row). We return the
    // resolved value immediately so the hydration condition in the page fires
    // synchronously during render.
    (useLiveQuery as unknown as Mock).mockReturnValue(savedDraft ?? undefined);

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

        expect(within(screen.getByTestId('slot-1')).getByText(/Drop a team here/i)).toBeTruthy();
        expect(within(screen.getByTestId('slot-2')).getByText(/Drop a team here/i)).toBeTruthy();
        expect(within(screen.getByTestId('slot-3')).getByText(/Drop a team here/i)).toBeTruthy();
    });

    it('disables the Lock In button until every slot is filled', () => {
        setupHooks();
        renderPage();

        const lockIn = screen.getByRole('button', { name: /Lock In/i });
        expect(lockIn.hasAttribute('disabled')).toBe(true);
        expect(screen.getByText(/0\/3 placed/)).toBeTruthy();
    });

    it('hydrates the board from a saved Dexie draft', async () => {
        setupHooks({
            savedDraft: {
                id: 'u-1__s-1__PROJECTED_FINISH',
                slots: ['t-3', null, 't-1'],
                updatedAt: '2026-05-23T12:00:00.000Z',
            },
        });
        renderPage();

        // Slot 1 has Chelsea (hydrated), slot 2 is empty, slot 3 has Arsenal.
        await waitFor(() =>
            expect(within(screen.getByTestId('slot-1')).getByText('Chelsea')).toBeTruthy(),
        );
        expect(within(screen.getByTestId('slot-2')).getByText(/Drop a team here/i)).toBeTruthy();
        expect(within(screen.getByTestId('slot-3')).getByText('Arsenal')).toBeTruthy();

        // Pool only contains the unplaced team (Brentford).
        const pool = screen.getByTestId('pool');
        expect(within(pool).getByText('Brentford')).toBeTruthy();
        expect(within(pool).queryByText('Arsenal')).toBeNull();
        expect(within(pool).queryByText('Chelsea')).toBeNull();

        // Status hint shows 2/3 placed.
        expect(screen.getByText(/2\/3 placed/)).toBeTruthy();
    });

    it('Reset clears the saved draft and snaps the board back to empty', async () => {
        setupHooks({
            savedDraft: {
                id: 'u-1__s-1__PROJECTED_FINISH',
                slots: ['t-1', 't-2', 't-3'],
                updatedAt: '2026-05-23T12:00:00.000Z',
            },
        });
        renderPage();

        // Hydrated state: all placed.
        await waitFor(() =>
            expect(within(screen.getByTestId('slot-1')).getByText('Arsenal')).toBeTruthy(),
        );
        fireEvent.click(screen.getByRole('button', { name: /^Reset$/i }));

        const confirm = await screen.findByRole('button', {
            name: /^Reset$/i,
            // Wait until the AlertDialog's Reset button shows up (different from
            // the trigger; both have name "Reset"). Pick the one inside an alert
            // dialog by waiting for the dialog to render.
        });
        // Click the *last* Reset button — the one inside the dialog footer.
        const resets = screen.getAllByRole('button', { name: /^Reset$/i });
        fireEvent.click(resets[resets.length - 1]);

        await waitFor(() =>
            expect(drafts.clearDraft).toHaveBeenCalledWith('u-1__s-1__PROJECTED_FINISH'),
        );
        // Board snaps back to empty.
        await waitFor(() =>
            expect(
                within(screen.getByTestId('slot-1')).getByText(/Drop a team here/i),
            ).toBeTruthy(),
        );
        // Bind `confirm` so TS doesn't warn it's unused.
        expect(confirm).toBeTruthy();
    });

    it('hides the Reset button when no slots are placed', () => {
        setupHooks();
        renderPage();
        expect(screen.queryByRole('button', { name: /^Reset$/i })).toBeNull();
    });

    it('skips Dexie persistence when no viewer is signed in', async () => {
        setupHooks({ viewerOverride: null });
        renderPage();
        // Render is enough — without a persistKey the effect should never call
        // saveDraft or clearDraft. Give microtasks a tick to settle, then
        // assert.
        await waitFor(() => {
            expect(drafts.saveDraft).not.toHaveBeenCalled();
            expect(drafts.clearDraft).not.toHaveBeenCalled();
        });
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

        expect(screen.queryByTestId('pool')).toBeNull();
        expect(within(screen.getByTestId('slot-1')).getByText('Chelsea')).toBeTruthy();
        expect(within(screen.getByTestId('slot-2')).getByText('Arsenal')).toBeTruthy();
        expect(within(screen.getByTestId('slot-3')).getByText('Brentford')).toBeTruthy();
    });

    it('shows up/down/neutral delta arrows in view mode when the season has started', async () => {
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

        expect(within(screen.getByTestId('slot-1')).getByText(/2 positions higher/i)).toBeTruthy();
        expect(within(screen.getByTestId('slot-2')).getByText(/1 positions lower/i)).toBeTruthy();
        expect(within(screen.getByTestId('slot-3')).getByText(/1 positions lower/i)).toBeTruthy();
    });

    it('renders the neutral delta when the prediction matches current position', async () => {
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
        expect(screen.getByRole('button', { name: /Cancel/i })).toBeTruthy();
    });
});
