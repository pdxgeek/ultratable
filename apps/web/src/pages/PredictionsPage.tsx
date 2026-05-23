import type { PredictionSnapshot, PredictionType } from '../components/predictions/queries';
import type { AppAbility } from '../auth/abilities';
import type { ZoneArrays } from '../lib/zones';

import React, { useEffect, useMemo, useState } from 'react';
import { subject } from '@casl/ability';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from 'urql';

import PredictionHistoryPanel from '../components/predictions/PredictionHistoryPanel';
import PredictionTypeNav from '../components/predictions/PredictionTypeNav';
import ProjectedFinishBoard, {
    type MoveTarget,
} from '../components/predictions/ProjectedFinishBoard';
import { applyMove } from '../components/predictions/applyMove';
import {
    DELETE_PREDICTION_SNAPSHOT_MUTATION,
    LOCK_IN_PREDICTION_MUTATION,
    MY_PREDICTIONS_QUERY,
    PREDICTION_SNAPSHOT_QUERY,
} from '../components/predictions/queries';
import { useAbility } from '../auth/abilities';
import { useLeague } from '../context/LeagueContext';
import {
    clearDraft,
    draftKey,
    loadDraft,
    sanitizeDraftSlots,
    saveDraft,
} from '../db/predictionDrafts';
import { useStandings } from '../hooks/useStandings';
import { useViewer } from '../hooks/useViewer';

type Mode = { kind: 'draft' } | { kind: 'viewing'; snapshotId: string };

// Fisher-Yates shuffle. Used once per session to "jumble" the pool of teams
// so the user isn't biased by the alphabetical / by-position order they're
// trying to predict against.
function shuffle<T>(input: readonly T[]): T[] {
    const arr = [...input];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

const PredictionsPage: React.FC = () => {
    const { activeLeague, activeSeason, isLoading: leagueLoading } = useLeague();
    const { viewer } = useViewer();
    const ability = useAbility<AppAbility>();
    const seasonId = activeSeason?.id ?? '';

    const { standings, teamsMap, isLoading: standingsLoading } = useStandings(seasonId);

    const teamIds = useMemo(() => standings.map((s) => s.teamId), [standings]);
    const N = teamIds.length;
    const teamSetKey = teamIds.join('|');
    const poolOrder = useMemo(
        () => shuffle(teamIds),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [teamSetKey],
    );
    const validTeamIds = useMemo(() => new Set(teamIds), [teamIds]);

    const [selectedType, setSelectedType] = useState<PredictionType>('PROJECTED_FINISH');
    const [userSlots, setUserSlots] = useState<(string | null)[] | null>(null);
    const [mode, setMode] = useState<Mode>({ kind: 'draft' });
    const [lockInError, setLockInError] = useState<string | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // Dexie-backed draft persistence. The composite key scopes drafts per
    // (user, season, type) — switching season or signing in/out flips to a
    // different draft cleanly. Guests (no viewer) get a stable null key and
    // skip persistence entirely.
    const persistKey =
        viewer && seasonId ? draftKey({ userId: viewer.id, seasonId, type: selectedType }) : null;
    const liveDraft = useLiveQuery(
        () => (persistKey ? loadDraft(persistKey) : undefined),
        [persistKey],
    );

    // Hydrate `userSlots` once per (persistKey, team-set) using the
    // set-state-during-render pattern. Re-runs only when the key or the team
    // set changes (e.g. user switches season), which is when stored drafts
    // need to be re-validated against the new team list.
    const [hydratedFor, setHydratedFor] = useState<string | null>(null);
    const hydrationFingerprint = persistKey ? `${persistKey}::${teamSetKey}` : null;
    if (
        hydrationFingerprint &&
        hydratedFor !== hydrationFingerprint &&
        liveDraft !== undefined &&
        N > 0
    ) {
        setHydratedFor(hydrationFingerprint);
        const sanitized = liveDraft
            ? sanitizeDraftSlots(liveDraft.slots, validTeamIds, N)
            : null;
        setUserSlots(sanitized);
    }
    const hasHydrated = hydratedFor === hydrationFingerprint;

    // Persist on change. Only after hydration, only with a viewer, only in
    // draft mode (view mode doesn't touch the draft). Writes are best-effort;
    // a transient failure just means the next change reattempts.
    useEffect(() => {
        if (!hasHydrated || !persistKey || mode.kind !== 'draft') return;
        if (userSlots === null) {
            void clearDraft(persistKey);
        } else {
            void saveDraft(persistKey, userSlots);
        }
    }, [userSlots, hasHydrated, persistKey, mode.kind]);

    const emptySlots = useMemo(() => Array<string | null>(N).fill(null), [N]);
    const draftSlots = userSlots ?? emptySlots;

    const currentPositions = useMemo(() => {
        const m = new Map<string, number>();
        for (const row of standings) m.set(row.teamId, row.position);
        return m;
    }, [standings]);
    const seasonStarted = useMemo(() => standings.some((s) => s.played > 0), [standings]);

    const zones: ZoneArrays = useMemo(() => {
        const seasonMeta = (activeSeason?.metadata as Record<string, unknown>) ?? {};
        const leagueMeta = (activeLeague?.metadata as Record<string, unknown>) ?? {};
        return {
            promotion: (seasonMeta.promotion ?? leagueMeta.promotion ?? []) as number[],
            playoffs: (seasonMeta.playoffs ?? leagueMeta.playoffs ?? []) as number[],
            relegation: (seasonMeta.relegation ?? leagueMeta.relegation ?? []) as number[],
        };
    }, [activeSeason, activeLeague]);

    const [historyResult, refetchHistory] = useQuery<{
        myPredictions: PredictionSnapshot[];
    }>({
        query: MY_PREDICTIONS_QUERY,
        variables: { seasonId, type: selectedType },
        pause: !seasonId || !viewer,
        requestPolicy: 'cache-and-network',
    });
    const snapshots = historyResult.data?.myPredictions ?? [];

    const viewingId = mode.kind === 'viewing' ? mode.snapshotId : null;

    const [snapshotResult] = useQuery<{
        predictionSnapshot: PredictionSnapshot | null;
    }>({
        query: PREDICTION_SNAPSHOT_QUERY,
        variables: { id: viewingId ?? '' },
        pause: !viewingId,
    });

    const viewingSnapshot =
        mode.kind === 'viewing' ? (snapshotResult.data?.predictionSnapshot ?? null) : null;

    const viewingSlots = useMemo(() => {
        if (!viewingSnapshot || N === 0) return null;
        const arr = Array<string | null>(N).fill(null);
        for (const entry of viewingSnapshot.entries) {
            const idx = entry.position - 1;
            if (idx >= 0 && idx < N) arr[idx] = entry.teamId;
        }
        return arr;
    }, [viewingSnapshot, N]);

    const slots = mode.kind === 'viewing' ? (viewingSlots ?? emptySlots) : draftSlots;
    const placedSet = useMemo(
        () => new Set(slots.filter((id): id is string => !!id)),
        [slots],
    );
    const poolTeamIds =
        mode.kind === 'viewing' ? [] : poolOrder.filter((id) => !placedSet.has(id));
    const allPlaced = N > 0 && slots.every((s) => s !== null);
    const hasAnyPlacement = mode.kind === 'draft' && draftSlots.some((s) => s !== null);

    const [lockInState, lockIn] = useMutation<
        { lockInPrediction: PredictionSnapshot },
        { input: { seasonId: string; type: PredictionType; orderedTeamIds: string[] } }
    >(LOCK_IN_PREDICTION_MUTATION);

    const [deleteState, deleteSnapshot] = useMutation<
        { deletePredictionSnapshot: string },
        { id: string }
    >(DELETE_PREDICTION_SNAPSHOT_MUTATION);

    const handleMove = (teamId: string, target: MoveTarget) => {
        if (mode.kind !== 'draft') return;
        setUserSlots((current) =>
            applyMove(current ?? Array<string | null>(N).fill(null), teamId, target),
        );
    };

    // Make Predictions / delete-success no longer juggle a pre-view snapshot
    // of the slots — the in-progress draft lives in Dexie, so it's already
    // there when we exit view mode.
    const handleSelectSnapshot = (id: string) => {
        setMode({ kind: 'viewing', snapshotId: id });
    };

    const handleMakePredictions = () => {
        setMode({ kind: 'draft' });
        setDeleteError(null);
    };

    const handleReset = async (): Promise<void> => {
        setUserSlots(null);
        if (persistKey) await clearDraft(persistKey);
    };

    const handleLockIn = async () => {
        if (!seasonId || !allPlaced || mode.kind !== 'draft') return;
        setLockInError(null);
        const orderedTeamIds = slots.filter((id): id is string => id !== null);
        const result = await lockIn({
            input: { seasonId, type: selectedType, orderedTeamIds },
        });
        if (result.error) {
            const msg = result.error.graphQLErrors[0]?.message ?? result.error.message;
            setLockInError(msg);
            return;
        }
        // Locked-in prediction is now an immutable snapshot in history; the
        // working draft has done its job. Clear it so the user lands on a
        // fresh board ready for the next prediction. The persistence effect
        // wipes the Dexie row in response to userSlots → null.
        setUserSlots(null);
        refetchHistory({ requestPolicy: 'network-only' });
    };

    const handleConfirmDelete = async (): Promise<boolean> => {
        if (mode.kind !== 'viewing') return false;
        setDeleteError(null);
        const result = await deleteSnapshot({ id: mode.snapshotId });
        if (result.error) {
            setDeleteError(result.error.graphQLErrors[0]?.message ?? result.error.message);
            return false;
        }
        setMode({ kind: 'draft' });
        refetchHistory({ requestPolicy: 'network-only' });
        return true;
    };

    const canDeleteCurrent = !!(
        viewingSnapshot &&
        ability.can('delete', subject('Prediction', { userId: viewingSnapshot.userId }))
    );

    const isLoading = leagueLoading || standingsLoading;

    if (isLoading) {
        return (
            <div className="text-center py-24">
                <p className="text-text-secondary">Loading data…</p>
            </div>
        );
    }

    if (!activeSeason) {
        return (
            <div className="text-center py-24">
                <p className="text-text-secondary">Please select a league and season.</p>
            </div>
        );
    }

    const placedCount = slots.filter((s) => s !== null).length;

    return (
        <div className="max-w-[1100px] mx-auto pt-5 pb-10">
            <Link
                to="/"
                className="inline-block text-sm text-text-muted no-underline mb-6 transition-colors hover:text-accent-blue"
            >
                ← Back to Tables
            </Link>
            <header className="mb-8">
                <h1 className="text-[2rem] max-sm:text-[1.6rem] font-extrabold tracking-tight">
                    Predictions
                </h1>
                <p className="text-sm text-text-muted">
                    {activeLeague?.name ?? 'League'} — current season
                </p>
            </header>
            <div className="grid grid-cols-1 md:grid-cols-[200px_1fr_240px] gap-8 items-start">
                <PredictionTypeNav selected={selectedType} onSelect={setSelectedType} />
                <ProjectedFinishBoard
                    poolTeamIds={poolTeamIds}
                    slots={slots}
                    teamsMap={teamsMap}
                    zones={zones}
                    currentPositions={currentPositions}
                    seasonStarted={seasonStarted}
                    readOnly={mode.kind === 'viewing'}
                    onMove={handleMove}
                />
                <PredictionHistoryPanel
                    snapshots={snapshots}
                    mode={mode.kind}
                    viewingSnapshotId={viewingId}
                    placedCount={placedCount}
                    totalCount={N}
                    canLockIn={allPlaced && mode.kind === 'draft'}
                    isLocking={lockInState.fetching}
                    lockInError={lockInError}
                    canReset={hasAnyPlacement}
                    onReset={handleReset}
                    canDeleteCurrent={canDeleteCurrent}
                    isDeleting={deleteState.fetching}
                    deleteError={deleteError}
                    onLockIn={handleLockIn}
                    onSelectSnapshot={handleSelectSnapshot}
                    onMakePredictions={handleMakePredictions}
                    onConfirmDelete={handleConfirmDelete}
                />
            </div>
        </div>
    );
};

export default PredictionsPage;
