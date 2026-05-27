import type { Team } from '../../../db';
import type { GameweekFixture, GameweekPrediction, GameweekPredictionPick } from './queries';
import type { ZoneArrays } from '../../../lib/zones';
import type { Mock } from 'vitest';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { MemoryRouter } from 'react-router-dom';
import { useMutation, useQuery } from 'urql';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as gwDrafts from '../../../db/gameweekPredictionDrafts';
import { AbilityProvider } from '../../../auth/AbilityContext';
import { useViewer, type Viewer } from '../../../hooks/useViewer';
import GameweekSection from './GameweekSection';

vi.mock('../../../hooks/useViewer', () => ({ useViewer: vi.fn() }));
vi.mock('dexie-react-hooks', () => ({ useLiveQuery: vi.fn() }));
vi.mock('../../../db/gameweekPredictionDrafts', async (importActual) => {
    const actual = await importActual<typeof import('../../../db/gameweekPredictionDrafts')>();
    return {
        ...actual,
        saveGameweekDraft: vi.fn().mockResolvedValue(undefined),
        clearGameweekDraft: vi.fn().mockResolvedValue(undefined),
        loadGameweekDraftsForSlip: vi.fn().mockResolvedValue([]),
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
    { id: 't-1', name: 'Liverpool', logo: '' } as Team,
    { id: 't-2', name: 'Brentford', logo: '' } as Team,
    { id: 't-3', name: 'Arsenal', logo: '' } as Team,
    { id: 't-4', name: 'Spurs', logo: '' } as Team,
];
const teamsMap = new Map(teams.map((t) => [t.id, t]));

const zones: ZoneArrays = { promotion: [1], playoffs: [], relegation: [18, 19, 20] };

const buildFixture = (overrides: Partial<GameweekFixture> = {}): GameweekFixture => ({
    id: 'f-1',
    seasonId: 's-1',
    homeTeamId: 't-1',
    awayTeamId: 't-2',
    scheduledAt: '2026-08-15T15:00:00.000Z',
    status: 'scheduled',
    gameweek: 1,
    ...overrides,
});

type Draft = {
    id: string;
    userId: string;
    seasonId: string;
    gameweek: number;
    fixtureId: string;
    homeGoals: number | null;
    awayGoals: number | null;
    note: string | null;
    manuallyAdded: boolean;
    updatedAt: string;
};

const buildDraft = (overrides: Partial<Draft> = {}): Draft => ({
    id: 'u-1__s-1__1__f-1',
    userId: 'u-1',
    seasonId: 's-1',
    gameweek: 1,
    fixtureId: 'f-1',
    homeGoals: 2,
    awayGoals: 1,
    note: null,
    manuallyAdded: false,
    updatedAt: '2026-08-14T10:00:00.000Z',
    ...overrides,
});

interface SetupOpts {
    gameweek?: number | null;
    fixtures?: GameweekFixture[];
    recommended?: GameweekFixture[];
    drafts?: Draft[];
    slip?: GameweekPrediction | null;
    myPredictions?: GameweekPrediction[];
    selectable?: Array<{ gameweek: number; nextKickoff: string }>;
    submitResults?: Array<{
        error?: { graphQLErrors: Array<{ message: string }>; message: string };
        data?: { submitGameweekPick: GameweekPredictionPick };
    }>;
    viewerOverride?: Viewer | null;
}

function setupHooks(opts: SetupOpts = {}) {
    const {
        gameweek = 1,
        fixtures = [],
        recommended = [],
        drafts = [],
        slip = null,
        myPredictions = [],
        selectable = [{ gameweek: 1, nextKickoff: '2026-08-15T15:00:00.000Z' }],
        submitResults = [],
        viewerOverride = viewer,
    } = opts;

    (useViewer as unknown as Mock).mockReturnValue({
        viewer: viewerOverride,
        loading: false,
        refetch: vi.fn(),
    });
    (useLiveQuery as unknown as Mock).mockReturnValue(drafts);

    (useQuery as unknown as Mock).mockImplementation((args: { query: string }) => {
        const q = typeof args.query === 'string' ? args.query : '';
        if (q.includes('SelectableGameweeksByKickoff')) {
            return [
                { data: { selectableGameweeksByKickoff: selectable }, fetching: false },
                vi.fn(),
            ];
        }
        if (q.includes('MyGameweekPredictions')) {
            return [
                { data: { myGameweekPredictions: myPredictions }, fetching: false },
                vi.fn(),
            ];
        }
        if (q.includes('GameweekFixturesForPredictions')) {
            return [
                {
                    data: {
                        gameweekFixturesForPredictions: {
                            gameweek: gameweek ?? 0,
                            fixtures,
                            recommended,
                        },
                    },
                    fetching: false,
                },
                vi.fn(),
            ];
        }
        if (q.includes('GameweekPredictionForWeek')) {
            return [
                { data: { gameweekPredictionForWeek: slip }, fetching: false },
                vi.fn(),
            ];
        }
        return [{ data: undefined, fetching: false }, vi.fn()];
    });

    // Sequential mutation responses for submit; one shared deleteFn handle.
    const submitFn = vi.fn();
    for (const r of submitResults.length > 0
        ? submitResults
        : [{ data: { submitGameweekPick: {} as GameweekPredictionPick }, error: undefined }]) {
        submitFn.mockResolvedValueOnce(r);
    }
    // Default the rest of the sequence to success so over-call doesn't blow up.
    submitFn.mockResolvedValue({
        data: { submitGameweekPick: {} as GameweekPredictionPick },
        error: undefined,
    });
    const deleteFn = vi.fn().mockResolvedValue({ data: undefined, error: undefined });

    let mutationCalls = 0;
    (useMutation as unknown as Mock).mockImplementation(() => {
        mutationCalls += 1;
        if (mutationCalls % 2 === 1) {
            return [{ fetching: false, stale: false, error: undefined }, submitFn];
        }
        return [{ fetching: false, stale: false, error: undefined }, deleteFn];
    });

    return { submitFn, deleteFn };
}

function renderSection(initialEntry = '/predictions?gw=1') {
    return render(
        <MemoryRouter initialEntries={[initialEntry]}>
            <AbilityProvider>
                <GameweekSection
                    seasonId="s-1"
                    teamsMap={teamsMap}
                    currentPositions={
                        new Map([
                            ['t-1', 1],
                            ['t-2', 17],
                            ['t-3', 4],
                            ['t-4', 18],
                        ])
                    }
                    zones={zones}
                />
            </AbilityProvider>
        </MemoryRouter>,
    );
}

describe('GameweekSection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows the empty-state when no gameweek is selected and saved/selectable exist', () => {
        setupHooks({
            selectable: [{ gameweek: 1, nextKickoff: '2026-08-15T15:00:00.000Z' }],
        });
        renderSection('/predictions');
        expect(
            screen.getByText(/Pick a gameweek to start predicting/i),
        ).toBeTruthy();
    });

    it('shows the "season\'s done" empty-state when nothing is selectable or saved', () => {
        setupHooks({ selectable: [], myPredictions: [] });
        renderSection('/predictions');
        expect(
            screen.getByText(/Season's done — nothing left to predict here\./i),
        ).toBeTruthy();
    });

    it("locks in every ready row on Lock In, clears their drafts, and reports nothing else", async () => {
        const fixtures = [
            buildFixture({ id: 'f-1' }),
            buildFixture({ id: 'f-2', homeTeamId: 't-3', awayTeamId: 't-4' }),
            buildFixture({ id: 'f-3', homeTeamId: 't-2', awayTeamId: 't-3' }),
        ];
        const drafts = [
            buildDraft({ id: 'u-1__s-1__1__f-1', fixtureId: 'f-1', homeGoals: 2, awayGoals: 1 }),
            buildDraft({ id: 'u-1__s-1__1__f-2', fixtureId: 'f-2', homeGoals: 0, awayGoals: 0 }),
            buildDraft({ id: 'u-1__s-1__1__f-3', fixtureId: 'f-3', homeGoals: 3, awayGoals: 2 }),
        ];
        const { submitFn } = setupHooks({ fixtures, drafts });

        renderSection();

        const lockIn = await screen.findByRole('button', { name: /^Lock In$/i });
        expect(lockIn.hasAttribute('disabled')).toBe(false);
        expect(screen.getByText(/3 picks ready to lock in/)).toBeTruthy();

        fireEvent.click(lockIn);

        await waitFor(() => expect(submitFn).toHaveBeenCalledTimes(3));
        // Each successful submit should clear its draft.
        await waitFor(() => {
            expect(gwDrafts.clearGameweekDraft).toHaveBeenCalledWith('u-1__s-1__1__f-1');
            expect(gwDrafts.clearGameweekDraft).toHaveBeenCalledWith('u-1__s-1__1__f-2');
            expect(gwDrafts.clearGameweekDraft).toHaveBeenCalledWith('u-1__s-1__1__f-3');
        });
        // No error surfaced.
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('on partial failure: clears successful drafts, retains the failed one, lists the failed fixture by name', async () => {
        const fixtures = [
            buildFixture({ id: 'f-1', homeTeamId: 't-1', awayTeamId: 't-2' }),
            buildFixture({ id: 'f-2', homeTeamId: 't-3', awayTeamId: 't-4' }),
        ];
        const drafts = [
            buildDraft({ id: 'u-1__s-1__1__f-1', fixtureId: 'f-1' }),
            buildDraft({ id: 'u-1__s-1__1__f-2', fixtureId: 'f-2' }),
        ];
        const { submitFn } = setupHooks({
            fixtures,
            drafts,
            submitResults: [
                {
                    data: { submitGameweekPick: {} as GameweekPredictionPick },
                    error: undefined,
                },
                {
                    error: {
                        graphQLErrors: [{ message: 'GAMEWEEK_CLOSED' }],
                        message: 'GAMEWEEK_CLOSED',
                    },
                },
            ],
        });

        renderSection();

        const lockIn = await screen.findByRole('button', { name: /^Lock In$/i });
        fireEvent.click(lockIn);

        await waitFor(() => expect(submitFn).toHaveBeenCalledTimes(2));
        // Successful row's draft is cleared.
        await waitFor(() => {
            expect(gwDrafts.clearGameweekDraft).toHaveBeenCalledWith('u-1__s-1__1__f-1');
        });
        // Failed row's draft is NOT cleared.
        expect(gwDrafts.clearGameweekDraft).not.toHaveBeenCalledWith('u-1__s-1__1__f-2');

        // Error message names the failed fixture by team labels and includes
        // the GraphQL error code.
        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toMatch(/Arsenal vs Spurs/);
        expect(alert.textContent).toMatch(/GAMEWEEK_CLOSED/);
        // And the inline per-row "failed to lock" marker appears.
        expect(screen.getByText(/failed to lock/i)).toBeTruthy();
    });

    it('does not count partial-score rows toward readyCount', async () => {
        const fixtures = [
            buildFixture({ id: 'f-1' }),
            buildFixture({ id: 'f-2', homeTeamId: 't-3', awayTeamId: 't-4' }),
        ];
        const drafts = [
            // Both scores → ready
            buildDraft({ id: 'u-1__s-1__1__f-1', fixtureId: 'f-1', homeGoals: 2, awayGoals: 1 }),
            // Only home score → dirty but not ready
            buildDraft({ id: 'u-1__s-1__1__f-2', fixtureId: 'f-2', homeGoals: 1, awayGoals: null }),
        ];
        setupHooks({ fixtures, drafts });
        renderSection();

        expect(await screen.findByText(/1 pick ready to lock in/)).toBeTruthy();
    });

    it('hides the editor when no viewer is signed in', () => {
        setupHooks({ viewerOverride: null });
        renderSection();
        expect(screen.getByText(/Sign in to make gameweek predictions/i)).toBeTruthy();
    });

    it('reads the active gameweek from ?gw=N in the URL', async () => {
        const fixtures = [buildFixture({ id: 'f-1' })];
        setupHooks({
            fixtures,
            gameweek: 7,
            selectable: [{ gameweek: 7, nextKickoff: '2026-09-15T15:00:00.000Z' }],
        });

        renderSection('/predictions?gw=7');
        expect(await screen.findByText(/Gameweek 7/)).toBeTruthy();
    });
});
