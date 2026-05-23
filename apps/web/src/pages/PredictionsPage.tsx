import type { PredictionSnapshot, PredictionType } from '../components/predictions/queries';
import type { AppAbility } from '../auth/abilities';
import type { ZoneArrays } from '../lib/zones';

import React, { useMemo, useState } from 'react';
import { subject } from '@casl/ability';
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
    // Stable shuffle: only re-shuffles when the team *set* changes (joined
    // key, not the standings reference). Live standings updates (scores,
    // form) won't re-jumble the pool mid-session.
    const teamSetKey = teamIds.join('|');
    const poolOrder = useMemo(
        () => shuffle(teamIds),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [teamSetKey],
    );

    const [selectedType, setSelectedType] = useState<PredictionType>('PROJECTED_FINISH');
    // `userSlots` is null until the user touches anything; we then fall back
    // to an all-empty slot array. This keeps "restore pre-view order" simple:
    // pass null to mean "snap back to a blank draft."
    const [userSlots, setUserSlots] = useState<(string | null)[] | null>(null);
    const [preViewSlots, setPreViewSlots] = useState<(string | null)[] | null>(null);
    const [mode, setMode] = useState<Mode>({ kind: 'draft' });
    const [lockInError, setLockInError] = useState<string | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

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

    const handleSelectSnapshot = (id: string) => {
        if (mode.kind === 'draft') setPreViewSlots(userSlots);
        setMode({ kind: 'viewing', snapshotId: id });
    };

    const handleMakePredictions = () => {
        setUserSlots(preViewSlots);
        setPreViewSlots(null);
        setMode({ kind: 'draft' });
        setDeleteError(null);
    };

    const handleLockIn = async () => {
        if (!seasonId || !allPlaced || mode.kind !== 'draft') return;
        setLockInError(null);
        const orderedTeamIds = slots.filter((id): id is string => id !== null);
        const result = await lockIn({
            input: { seasonId, type: selectedType, orderedTeamIds },
        });
        if (result.error) {
            // urql wraps GraphQLErrors. PREDICTION_LIMIT_REACHED message
            // arrives pre-formatted as "X/Y" from the server (#108); no extra
            // hint about deleting older snapshots because soft-delete doesn't
            // free capacity.
            const msg = result.error.graphQLErrors[0]?.message ?? result.error.message;
            setLockInError(msg);
            return;
        }
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
        setUserSlots(preViewSlots);
        setPreViewSlots(null);
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
            <div className="grid grid-cols-1 md:grid-cols-[200px_1fr_240px] gap-8">
                <PredictionTypeNav selected={selectedType} onSelect={setSelectedType} />
                <div className="flex flex-col gap-2">
                    {mode.kind === 'draft' && (
                        <p className="text-sm text-text-muted">
                            Drag each team into its predicted final position.{' '}
                            <span className="text-text-secondary">
                                {placedCount}/{N} placed
                            </span>
                        </p>
                    )}
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
                </div>
                <PredictionHistoryPanel
                    snapshots={snapshots}
                    mode={mode.kind}
                    viewingSnapshotId={viewingId}
                    canLockIn={allPlaced && mode.kind === 'draft'}
                    isLocking={lockInState.fetching}
                    lockInError={lockInError}
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
