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
import { Plus } from 'lucide-react';
import { useMutation, useQuery } from 'urql';

import { useAbility } from '../../../auth/abilities';
import {
    clearGameweekDraft,
    gameweekDraftKey,
    loadGameweekDraftsForSlip,
    saveGameweekDraft,
} from '../../../db/gameweekPredictionDrafts';
import { useViewer } from '../../../hooks/useViewer';
import { Button } from '../../ui/button';
import GameweekBoard from './GameweekBoard';
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
}

const GameweekSection: React.FC<GameweekSectionProps> = ({ seasonId, teamsMap }) => {
    const { viewer } = useViewer();
    const ability = useAbility<AppAbility>();
    // The editor is empty until the user explicitly picks a gameweek via the
    // Add-gameweek dialog (or clicks an existing slip in the history panel).
    // We intentionally do NOT default to the server's `activeGameweek` —
    // see #144 review thread for the rationale (MLS straggler gameweeks).
    const [gameweek, setGameweek] = useState<number | null>(null);
    const [addGameweekDialogOpen, setAddGameweekDialogOpen] = useState(false);
    const [addFixtureDialogOpen, setAddFixtureDialogOpen] = useState(false);
    // Per-row UI state — keyed by fixtureId. Mutation in-flight + last error.
    const [rowMeta, setRowMeta] = useState<
        Record<string, { isLocking: boolean; error: string | null }>
    >({});
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
            .map((f) => buildRowState(f, currentByFixture, historyByFixture, draftByFixture, rowMeta));
    }, [fixturesPayload, currentByFixture, historyByFixture, draftByFixture, rowMeta]);

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
            .map((f) => buildRowState(f, currentByFixture, historyByFixture, draftByFixture, rowMeta));
    }, [fixturesPayload, slip, drafts, currentByFixture, historyByFixture, draftByFixture, rowMeta]);

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

    const handleLockRow = async (fixtureId: string) => {
        if (gameweek == null) return;
        const row = [...defaultRows, ...manualRows].find((r) => r.fixture.id === fixtureId);
        if (!row || !row.draft) return;

        setRowMeta((prev) => ({
            ...prev,
            [fixtureId]: { isLocking: true, error: null },
        }));

        const result = await submitPick({
            input: {
                seasonId,
                gameweek,
                fixtureId,
                homeGoals: row.draft.homeGoals,
                awayGoals: row.draft.awayGoals,
                note: row.draft.note,
                manuallyAdded: row.draft.manuallyAdded,
            },
        });

        if (result.error) {
            const msg = result.error.graphQLErrors[0]?.message ?? result.error.message;
            setRowMeta((prev) => ({
                ...prev,
                [fixtureId]: { isLocking: false, error: msg },
            }));
            return;
        }

        // Success: clear the draft, refresh server state, drop the row meta.
        handleClearDraft(fixtureId);
        setRowMeta((prev) => {
            const next = { ...prev };
            delete next[fixtureId];
            return next;
        });
        refetchSlip({ requestPolicy: 'network-only' });
        refetchMyPredictions({ requestPolicy: 'network-only' });
    };

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
    const existingSlipGameweeks = useMemo(
        () =>
            new Set(
                (myPredictionsResult.data?.myGameweekPredictions ?? []).map(
                    (s) => s.gameweek,
                ),
            ),
        [myPredictionsResult.data?.myGameweekPredictions],
    );
    const existingSlips = myPredictionsResult.data?.myGameweekPredictions ?? [];

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
                <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-glass-bg/20 p-10 text-center">
                    <p className="text-sm text-text-muted">
                        Pick a gameweek to start predicting, or open an existing slip from the
                        list on the right.
                    </p>
                    <Button
                        type="button"
                        onClick={() => setAddGameweekDialogOpen(true)}
                        className="bg-accent-purple text-white hover:brightness-110"
                    >
                        <Plus className="w-4 h-4 mr-1" aria-hidden="true" />
                        Add a gameweek
                    </Button>
                </div>
            ) : (
                <GameweekBoard
                    gameweek={gameweek}
                    rows={defaultRows}
                    manualRows={manualRows}
                    teamsMap={teamsMap}
                    onOpenAddDialog={
                        isCurrentSelectable ? () => setAddFixtureDialogOpen(true) : null
                    }
                    onDraftChange={handleDraftChange}
                    onLockRow={(id) => void handleLockRow(id)}
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
                existingSlipGameweeks={existingSlipGameweeks}
                onSelect={(gw) => setGameweek(gw)}
            />

            <GameweekHistoryPanel
                slips={existingSlips}
                activeGameweek={gameweek}
                onSelectGameweek={(gw) => setGameweek(gw)}
                onOpenAddGameweekDialog={() => setAddGameweekDialogOpen(true)}
                canDeleteCurrent={canDeleteCurrent}
                isDeleting={deleteState.fetching}
                deleteError={deleteError}
                onConfirmDelete={handleConfirmDelete}
                activeSlipId={slip?.id ?? null}
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
    rowMeta: Record<string, { isLocking: boolean; error: string | null }>,
): RowState {
    const meta = rowMeta[fixture.id];
    return {
        fixture,
        currentPick: currentByFixture.get(fixture.id) ?? null,
        history: historyByFixture.get(fixture.id) ?? [],
        draft: draftByFixture.get(fixture.id) ?? null,
        isLocking: meta?.isLocking ?? false,
        error: meta?.error ?? null,
    };
}

export default GameweekSection;
