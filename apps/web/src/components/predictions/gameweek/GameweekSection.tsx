/**
 * GameweekSection — orchestrator for the Gameweek-predictions editor (#144).
 *
 * Owns:
 *   - Active gameweek state (defaults to server's `activeGameweek`)
 *   - GraphQL queries: predictions list, slip-for-week, fixtures+recommended,
 *     selectable gameweeks
 *   - Per-fixture Dexie draft hydration + write-through
 *   - submitGameweekPick (per-row lock) + deleteGameweekPrediction
 *   - Add-fixture dialog open/close
 *
 * The board / popover / dialog / history panel are pure presentational
 * components below; this file does all the data wrangling.
 */
import type { AppAbility } from '../../../auth/abilities';
import type { Team } from '../../../db';
import type { RowDraft, RowState } from './GameweekBoard';
import type {
    GameweekFixture,
    GameweekFixturesPayload,
    GameweekPrediction,
    GameweekPredictionPick,
    SelectableGameweek,
} from './queries';

import React, { useMemo, useState } from 'react';
import { subject } from '@casl/ability';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMutation, useQuery } from 'urql';

import { useAbility } from '../../../auth/abilities';
import {
    clearGameweekDraft,
    gameweekDraftKey,
    loadGameweekDraftsForSlip,
    saveGameweekDraft,
} from '../../../db/gameweekPredictionDrafts';
import { useViewer } from '../../../hooks/useViewer';
import GameweekBoard from './GameweekBoard';
import { isReadyToLockIn } from './rowState';
import AddFixtureDialog from './AddFixtureDialog';
import AddGameweekDialog from './AddGameweekDialog';
import GameweekHistoryPanel from './GameweekHistoryPanel';
import {
    DELETE_GAMEWEEK_PREDICTION_MUTATION,
    GAMEWEEK_FIXTURES_FOR_PREDICTIONS_QUERY,
    GAMEWEEK_PREDICTION_FOR_WEEK_QUERY,
    MY_GAMEWEEK_PREDICTIONS_QUERY,
    SELECTABLE_GAMEWEEKS_BY_KICKOFF_QUERY,
    SUBMIT_GAMEWEEK_PICK_MUTATION,
    type SubmitGameweekPickInput,
} from './queries';

interface GameweekSectionProps {
    seasonId: string;
    teamsMap: Map<string, Team>;
    /**
     * `teamId → current standings position` from `useStandings(seasonId)`,
     * computed by the parent page. Forwarded to the board so each row can
     * show "8th plays 14th" context next to the team names. Optional and
     * tolerant of misses (manually-added cup fixtures might involve teams
     * not in this season's standings).
     */
    currentPositions: Map<string, number>;
}

const GameweekSection: React.FC<GameweekSectionProps> = ({
    seasonId,
    teamsMap,
    currentPositions,
}) => {
    const { viewer } = useViewer();
    const ability = useAbility<AppAbility>();
    // The editor is empty until the user explicitly picks a gameweek via the
    // Add-gameweek dialog (or clicks an existing slip in the history panel).
    // We intentionally do NOT default to the server's `activeGameweek` —
    // see #144 review thread for the rationale (MLS straggler gameweeks).
    const [gameweek, setGameweek] = useState<number | null>(null);
    const [addGameweekDialogOpen, setAddGameweekDialogOpen] = useState(false);
    const [addFixtureDialogOpen, setAddFixtureDialogOpen] = useState(false);
    // Aggregate Lock-In state. One state object for the whole slip rather
    // than per-row meta — the footer button drives one orchestrated commit
    // pass, so a single in-flight flag + summary error covers it.
    const [lockState, setLockState] = useState<{ isLocking: boolean; error: string | null }>(
        { isLocking: false, error: null },
    );
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // -----------------------------------------------------------------------
    // Server data
    // -----------------------------------------------------------------------

    const [selectableByKickoffResult, refetchSelectable] = useQuery<{
        selectableGameweeksByKickoff: SelectableGameweek[];
    }>({
        query: SELECTABLE_GAMEWEEKS_BY_KICKOFF_QUERY,
        variables: { seasonId },
        pause: !seasonId,
    });

    const [myPredictionsResult, refetchMyPredictions] = useQuery<{
        myGameweekPredictions: GameweekPrediction[];
    }>({
        query: MY_GAMEWEEK_PREDICTIONS_QUERY,
        variables: { seasonId },
        pause: !seasonId || !viewer,
        requestPolicy: 'cache-and-network',
    });

    const [fixturesResult] = useQuery<{
        gameweekFixturesForPredictions: GameweekFixturesPayload;
    }>({
        query: GAMEWEEK_FIXTURES_FOR_PREDICTIONS_QUERY,
        variables: { seasonId, gameweek: gameweek ?? 0 },
        pause: !seasonId || gameweek == null,
    });

    const [slipResult, refetchSlip] = useQuery<{
        gameweekPredictionForWeek: GameweekPrediction | null;
    }>({
        query: GAMEWEEK_PREDICTION_FOR_WEEK_QUERY,
        variables: { seasonId, gameweek: gameweek ?? 0 },
        pause: !seasonId || gameweek == null || !viewer,
        requestPolicy: 'cache-and-network',
    });

    // -----------------------------------------------------------------------
    // Drafts (Dexie)
    // -----------------------------------------------------------------------

    const drafts = useLiveQuery(
        async () => {
            if (!viewer || gameweek == null || !seasonId) return [];
            return loadGameweekDraftsForSlip({
                userId: viewer.id,
                seasonId,
                gameweek,
            });
        },
        [viewer?.id, seasonId, gameweek],
        [],
    );

    const draftByFixture = useMemo(() => {
        const map = new Map<string, RowDraft>();
        for (const d of drafts ?? []) {
            map.set(d.fixtureId, {
                homeGoals: d.homeGoals,
                awayGoals: d.awayGoals,
                note: d.note,
                manuallyAdded: d.manuallyAdded,
            });
        }
        return map;
    }, [drafts]);

    // -----------------------------------------------------------------------
    // Mutations
    // -----------------------------------------------------------------------

    const [, submitPick] = useMutation<
        { submitGameweekPick: GameweekPredictionPick },
        { input: SubmitGameweekPickInput }
    >(SUBMIT_GAMEWEEK_PICK_MUTATION);

    const [deleteState, deleteSlip] = useMutation<
        { deleteGameweekPrediction: string },
        { id: string }
    >(DELETE_GAMEWEEK_PREDICTION_MUTATION);

    // -----------------------------------------------------------------------
    // Row state assembly
    // -----------------------------------------------------------------------

    const slip = slipResult.data?.gameweekPredictionForWeek ?? null;
    const fixturesPayload = fixturesResult.data?.gameweekFixturesForPredictions ?? null;

    // Map fixtureId → current pick (latest committed)
    const currentByFixture = useMemo(() => {
        const map = new Map<string, GameweekPredictionPick>();
        for (const pick of slip?.picks ?? []) {
            map.set(pick.fixtureId, pick);
        }
        return map;
    }, [slip]);

    // Map fixtureId → full chain newest-first (for the per-row history popover)
    const historyByFixture = useMemo(() => {
        const map = new Map<string, GameweekPredictionPick[]>();
        for (const pick of slip?.pickHistory ?? []) {
            const bucket = map.get(pick.fixtureId);
            if (bucket) bucket.push(pick);
            else map.set(pick.fixtureId, [pick]);
        }
        return map;
    }, [slip]);

    /**
     * Default-gameweek rows. Anchored to `fixturesPayload.fixtures`, but we
     * splice in any "current pick" rows whose `manuallyAdded` is false but
     * whose fixture isn't in the gameweek's own list (shouldn't happen, but
     * the union is the safe play).
     */
    const defaultRows: RowState[] = useMemo(() => {
        if (!fixturesPayload) return [];
        return fixturesPayload.fixtures
            .slice()
            .sort(
                (a, b) =>
                    new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
            )
            .map((f) => buildRowState(f, currentByFixture, historyByFixture, draftByFixture));
    }, [fixturesPayload, currentByFixture, historyByFixture, draftByFixture]);

    /**
     * Manually-added rows: union of (a) committed manual picks from the slip
     * and (b) drafts flagged `manuallyAdded`. We need both because a manual
     * draft hasn't committed yet — the slip doesn't know about it — and a
     * committed manual pick has a server fixture id we need to render.
     */
    const manualRows: RowState[] = useMemo(() => {
        if (!fixturesPayload) return [];
        const defaultFixtureIds = new Set(fixturesPayload.fixtures.map((f) => f.id));
        const manualFixtures = new Map<string, GameweekFixture>();
        // Committed manual picks — pull the fixture from any of {fixtures, recommended}
        // since the server returns the same shape from either source.
        const lookup = new Map<string, GameweekFixture>();
        for (const f of fixturesPayload.fixtures) lookup.set(f.id, f);
        for (const f of fixturesPayload.recommended) lookup.set(f.id, f);
        for (const pick of slip?.picks ?? []) {
            if (pick.manuallyAdded && !defaultFixtureIds.has(pick.fixtureId)) {
                const f = lookup.get(pick.fixtureId);
                if (f) manualFixtures.set(pick.fixtureId, f);
            }
        }
        // Manual drafts — same dedupe-against-default rule.
        for (const draft of drafts ?? []) {
            if (draft.manuallyAdded && !defaultFixtureIds.has(draft.fixtureId)) {
                const f = lookup.get(draft.fixtureId);
                if (f && !manualFixtures.has(draft.fixtureId)) {
                    manualFixtures.set(draft.fixtureId, f);
                }
            }
        }
        return Array.from(manualFixtures.values())
            .sort(
                (a, b) =>
                    new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
            )
            .map((f) => buildRowState(f, currentByFixture, historyByFixture, draftByFixture));
    }, [fixturesPayload, slip, drafts, currentByFixture, historyByFixture, draftByFixture]);

    // Filter the recommended list down to "not already in the slip" for the dialog.
    const dialogCandidates = useMemo(() => {
        if (!fixturesPayload) return [];
        const seen = new Set<string>([
            ...defaultRows.map((r) => r.fixture.id),
            ...manualRows.map((r) => r.fixture.id),
        ]);
        return fixturesPayload.recommended.filter((f) => !seen.has(f.id));
    }, [fixturesPayload, defaultRows, manualRows]);

    // -----------------------------------------------------------------------
    // Handlers
    // -----------------------------------------------------------------------

    const handleDraftChange = (fixtureId: string, draft: RowDraft) => {
        if (!viewer || gameweek == null) return;
        void saveGameweekDraft({
            keyArgs: { userId: viewer.id, seasonId, gameweek, fixtureId },
            homeGoals: draft.homeGoals,
            awayGoals: draft.awayGoals,
            note: draft.note,
            manuallyAdded: draft.manuallyAdded,
        });
    };

    const handleClearDraft = (fixtureId: string) => {
        if (!viewer || gameweek == null) return;
        void clearGameweekDraft(
            gameweekDraftKey({ userId: viewer.id, seasonId, gameweek, fixtureId }),
        );
    };

    /**
     * One commit pass for every dirty row in the slip. The server still
     * gets one mutation per fixture — the per-pick immutable chain is
     * unchanged, and the server-side dedup that returns the existing pick
     * for an identical re-submit still protects the chain from no-op
     * inserts. Rows with no scores AND no note ("empty drafts" — typically
     * a manually-added fixture the user added but never scored) fail the
     * `isDirty` check and are skipped, so the DB only sees rows the user
     * meaningfully filled in.
     *
     * Serial rather than parallel: the first call lazily creates the slip
     * container, and serializing avoids the partial-unique race the
     * repository code already handles but is still cheaper to side-step.
     * At typical scale (5-15 dirty rows per slip) latency is negligible.
     */
    const handleLockAll = async () => {
        if (gameweek == null) return;
        // Only commit rows that have BOTH scores set — a partial draft
        // stays in Dexie as a visible "unsaved" row until the user finishes
        // it, but doesn't get submitted.
        const readyRows = [...defaultRows, ...manualRows].filter(isReadyToLockIn);
        if (readyRows.length === 0) return;

        setLockState({ isLocking: true, error: null });
        let failureCount = 0;
        let firstError: string | null = null;

        for (const row of readyRows) {
            if (!row.draft) continue; // narrows TS; the filter already excludes null drafts
            const result = await submitPick({
                input: {
                    seasonId,
                    gameweek,
                    fixtureId: row.fixture.id,
                    homeGoals: row.draft.homeGoals,
                    awayGoals: row.draft.awayGoals,
                    note: row.draft.note,
                    manuallyAdded: row.draft.manuallyAdded,
                },
            });
            if (result.error) {
                failureCount += 1;
                if (firstError == null) {
                    firstError =
                        result.error.graphQLErrors[0]?.message ?? result.error.message;
                }
            } else {
                handleClearDraft(row.fixture.id);
            }
        }

        refetchSlip({ requestPolicy: 'network-only' });
        refetchMyPredictions({ requestPolicy: 'network-only' });

        if (failureCount > 0) {
            setLockState({
                isLocking: false,
                // Surface the first error message verbatim — usually it's a
                // typed code like GAMEWEEK_CLOSED that's specific enough to
                // act on. Successful rows already had their drafts cleared,
                // so retrying Lock In only re-submits the still-failing ones.
                error:
                    failureCount === readyRows.length
                        ? `Lock in failed: ${firstError}`
                        : `Locked in ${readyRows.length - failureCount} of ${readyRows.length} picks. First failure: ${firstError}`,
            });
        } else {
            setLockState({ isLocking: false, error: null });
        }
    };

    const readyCount = [...defaultRows, ...manualRows].filter(isReadyToLockIn).length;

    const handleAddManualFixture = (fixture: GameweekFixture) => {
        if (!viewer || gameweek == null) return;
        // Seed an empty manual draft for this fixture. Lock happens when the
        // user fills in scores and clicks the row's Lock button.
        void saveGameweekDraft({
            keyArgs: { userId: viewer.id, seasonId, gameweek, fixtureId: fixture.id },
            homeGoals: null,
            awayGoals: null,
            note: null,
            manuallyAdded: true,
        });
    };

    const handleRemoveManualRow = (fixtureId: string) => {
        handleClearDraft(fixtureId);
    };

    const handleConfirmDelete = async (): Promise<boolean> => {
        if (!slip) return false;
        setDeleteError(null);
        const result = await deleteSlip({ id: slip.id });
        if (result.error) {
            setDeleteError(result.error.graphQLErrors[0]?.message ?? result.error.message);
            return false;
        }
        refetchSlip({ requestPolicy: 'network-only' });
        refetchMyPredictions({ requestPolicy: 'network-only' });
        refetchSelectable({ requestPolicy: 'network-only' });
        return true;
    };

    const canDeleteCurrent = !!(
        slip && ability.can('delete', subject('GameweekPrediction', { userId: slip.userId }))
    );

    const selectableCandidates = selectableByKickoffResult.data?.selectableGameweeksByKickoff ?? [];
    // Derive the plain-number list from the kickoff-sorted query so we don't
    // need a second round-trip just for the gating check below.
    const selectableGameweekNumbers = new Set(selectableCandidates.map((c) => c.gameweek));
    const isCurrentSelectable = gameweek != null && selectableGameweekNumbers.has(gameweek);

    // Memo against the raw query result rather than the `?? []` fallback, so
    // the empty-array identity doesn't change on every render and re-trigger
    // downstream Sets.
    const existingSavedGameweeks = useMemo(
        () =>
            new Set(
                (myPredictionsResult.data?.myGameweekPredictions ?? []).map(
                    (s) => s.gameweek,
                ),
            ),
        [myPredictionsResult.data?.myGameweekPredictions],
    );
    const savedGameweeks = myPredictionsResult.data?.myGameweekPredictions ?? [];

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    if (!viewer) {
        return (
            <p className="text-sm text-text-muted">Sign in to make gameweek predictions.</p>
        );
    }

    return (
        <>
            {gameweek == null ? (
                <div className="flex items-center justify-center rounded-lg border border-dashed border-border bg-glass-bg/20 p-10 text-center">
                    <p className="text-sm text-text-muted">
                        Pick a gameweek to start predicting, or open a saved gameweek from the
                        list on the right.
                    </p>
                </div>
            ) : (
                <GameweekBoard
                    gameweek={gameweek}
                    rows={defaultRows}
                    manualRows={manualRows}
                    teamsMap={teamsMap}
                    currentPositions={currentPositions}
                    onOpenAddDialog={
                        isCurrentSelectable ? () => setAddFixtureDialogOpen(true) : null
                    }
                    onDraftChange={handleDraftChange}
                    onClearDraft={handleClearDraft}
                    onRemoveManualRow={handleRemoveManualRow}
                />
            )}

            <AddFixtureDialog
                open={addFixtureDialogOpen}
                onClose={() => setAddFixtureDialogOpen(false)}
                candidates={dialogCandidates}
                teamsMap={teamsMap}
                gameweek={gameweek ?? 0}
                onAdd={handleAddManualFixture}
            />

            <AddGameweekDialog
                open={addGameweekDialogOpen}
                onClose={() => setAddGameweekDialogOpen(false)}
                candidates={selectableCandidates}
                existingSavedGameweeks={existingSavedGameweeks}
                onSelect={(gw) => setGameweek(gw)}
            />

            <GameweekHistoryPanel
                savedGameweeks={savedGameweeks}
                activeGameweek={gameweek}
                onSelectGameweek={(gw) => setGameweek(gw)}
                onOpenAddGameweekDialog={() => setAddGameweekDialogOpen(true)}
                canDeleteCurrent={canDeleteCurrent}
                isDeleting={deleteState.fetching}
                deleteError={deleteError}
                onConfirmDelete={handleConfirmDelete}
                activeSavedGameweekId={slip?.id ?? null}
                onLockAll={() => void handleLockAll()}
                isLocking={lockState.isLocking}
                lockError={lockState.error}
                readyCount={readyCount}
            />
        </>
    );
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRowState(
    fixture: GameweekFixture,
    currentByFixture: Map<string, GameweekPredictionPick>,
    historyByFixture: Map<string, GameweekPredictionPick[]>,
    draftByFixture: Map<string, RowDraft>,
): RowState {
    return {
        fixture,
        currentPick: currentByFixture.get(fixture.id) ?? null,
        history: historyByFixture.get(fixture.id) ?? [],
        draft: draftByFixture.get(fixture.id) ?? null,
    };
}

export default GameweekSection;
