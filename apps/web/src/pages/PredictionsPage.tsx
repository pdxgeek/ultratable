import type { PredictionSnapshot, PredictionType } from '../components/predictions/queries';
import type { AppAbility } from '../auth/abilities';
import type { ZoneArrays } from '../lib/zones';

import React, { useMemo, useState } from 'react';
import { subject } from '@casl/ability';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from 'urql';

import PredictionHistoryPanel from '../components/predictions/PredictionHistoryPanel';
import PredictionTypeNav from '../components/predictions/PredictionTypeNav';
import ProjectedFinishTable from '../components/predictions/ProjectedFinishTable';
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

const PredictionsPage: React.FC = () => {
    const { activeLeague, activeSeason, isLoading: leagueLoading } = useLeague();
    const { viewer } = useViewer();
    const ability = useAbility<AppAbility>();
    const seasonId = activeSeason?.id ?? '';

    const { standings, teamsMap, isLoading: standingsLoading } = useStandings(seasonId);

    const [selectedType, setSelectedType] = useState<PredictionType>('PROJECTED_FINISH');
    // `userDraftOrder` is null until the user has touched anything; the
    // displayed draft falls back to `defaultOrder` (current standings) in
    // that case. This shape lets "Make Predictions" / post-delete "restore
    // pre-view order" pass null to mean "snap back to standings" without
    // any synchronization effects.
    const [userDraftOrder, setUserDraftOrder] = useState<string[] | null>(null);
    const [preViewOrder, setPreViewOrder] = useState<string[] | null>(null);
    const [mode, setMode] = useState<Mode>({ kind: 'draft' });
    const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
    const [lockInError, setLockInError] = useState<string | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const defaultOrder = useMemo(
        () =>
            [...standings]
                .sort((a, b) => a.position - b.position)
                .map((row) => row.teamId),
        [standings],
    );
    const draftOrder = userDraftOrder ?? defaultOrder;

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

    const viewingOrder = useMemo(() => {
        if (!viewingSnapshot) return null;
        return [...viewingSnapshot.entries]
            .sort((a, b) => a.position - b.position)
            .map((e) => e.teamId);
    }, [viewingSnapshot]);

    const displayedOrder =
        mode.kind === 'viewing' ? (viewingOrder ?? draftOrder) : draftOrder;

    const [lockInState, lockIn] = useMutation<
        { lockInPrediction: PredictionSnapshot },
        { input: { seasonId: string; type: PredictionType; orderedTeamIds: string[] } }
    >(LOCK_IN_PREDICTION_MUTATION);

    const [deleteState, deleteSnapshot] = useMutation<
        { deletePredictionSnapshot: string },
        { id: string }
    >(DELETE_PREDICTION_SNAPSHOT_MUTATION);

    const moveTeam = (teamId: string, direction: 'up' | 'down') => {
        const current = draftOrder;
        const idx = current.indexOf(teamId);
        if (idx < 0) return;
        const newIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (newIdx < 0 || newIdx >= current.length) return;
        const next = [...current];
        [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
        setUserDraftOrder(next);
    };

    const handleSelectSnapshot = (id: string) => {
        if (mode.kind === 'draft') setPreViewOrder(userDraftOrder);
        setMode({ kind: 'viewing', snapshotId: id });
        setSelectedTeamId(null);
    };

    const handleMakePredictions = () => {
        setUserDraftOrder(preViewOrder);
        setPreViewOrder(null);
        setMode({ kind: 'draft' });
        setDeleteError(null);
    };

    const handleLockIn = async () => {
        if (!seasonId || draftOrder.length === 0) return;
        setLockInError(null);
        const result = await lockIn({
            input: { seasonId, type: selectedType, orderedTeamIds: draftOrder },
        });
        if (result.error) {
            // urql wraps GraphQLErrors; surface the first one's message verbatim.
            // For PREDICTION_LIMIT_REACHED the server already includes the
            // honest "X/Y" framing — no extra hint about deleting old
            // snapshots because soft-delete doesn't free capacity (issue #106).
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
        // Success: exit viewing mode, restore the order the user had before
        // opening the snapshot (null → fall back to current standings via
        // defaultOrder), refresh history.
        setUserDraftOrder(preViewOrder);
        setPreViewOrder(null);
        setMode({ kind: 'draft' });
        refetchHistory({ requestPolicy: 'network-only' });
        return true;
    };

    const canDeleteCurrent = !!(
        viewingSnapshot && ability.can('delete', subject('Prediction', { userId: viewingSnapshot.userId }))
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
            <div className="grid grid-cols-1 md:grid-cols-[180px_1fr_240px] gap-6">
                <PredictionTypeNav selected={selectedType} onSelect={setSelectedType} />
                <ProjectedFinishTable
                    orderedTeamIds={displayedOrder}
                    teamsMap={teamsMap}
                    zones={zones}
                    readOnly={mode.kind === 'viewing'}
                    selectedTeamId={selectedTeamId}
                    onSelectTeam={setSelectedTeamId}
                    onMoveTeam={moveTeam}
                    onReorder={(next) => setUserDraftOrder(next)}
                />
                <PredictionHistoryPanel
                    snapshots={snapshots}
                    mode={mode.kind}
                    viewingSnapshotId={viewingId}
                    canLockIn={draftOrder.length > 0}
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
