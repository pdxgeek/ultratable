import type { PredictionSnapshot } from './queries';

import React, { useState } from 'react';
import { format } from 'date-fns';
import { RotateCcw, Trash2 } from 'lucide-react';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '../ui/alert-dialog';
import { Button } from '../ui/button';

interface PredictionHistoryPanelProps {
    snapshots: PredictionSnapshot[];
    mode: 'draft' | 'viewing';
    viewingSnapshotId: string | null;
    canLockIn: boolean;
    isLocking: boolean;
    lockInError: string | null;
    canReset: boolean;
    onReset: () => Promise<void>;
    canDeleteCurrent: boolean;
    isDeleting: boolean;
    deleteError: string | null;
    onLockIn: () => void;
    onSelectSnapshot: (id: string) => void;
    onMakePredictions: () => void;
    onConfirmDelete: () => Promise<boolean>;
}

const formatTimestamp = (iso: string) => format(new Date(iso), 'MMM d, yyyy · h:mm a');

const PredictionHistoryPanel: React.FC<PredictionHistoryPanelProps> = ({
    snapshots,
    mode,
    viewingSnapshotId,
    canLockIn,
    isLocking,
    lockInError,
    canReset,
    onReset,
    canDeleteCurrent,
    isDeleting,
    deleteError,
    onLockIn,
    onSelectSnapshot,
    onMakePredictions,
    onConfirmDelete,
}) => {
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [confirmResetOpen, setConfirmResetOpen] = useState(false);
    const currentSnapshot = snapshots.find((s) => s.id === viewingSnapshotId) ?? null;

    return (
        <aside className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-glass-bg/40 p-3">
                <h3 className="text-[0.75rem] uppercase tracking-wider text-text-muted font-semibold">
                    History
                </h3>
                {snapshots.length === 0 ? (
                    <p className="text-sm text-text-muted">No predictions yet.</p>
                ) : (
                    <ul className="flex flex-col gap-1 max-h-[420px] overflow-y-auto pr-1">
                        {snapshots.map((s) => {
                            const isViewing = s.id === viewingSnapshotId;
                            return (
                                <li key={s.id}>
                                    <button
                                        type="button"
                                        onClick={() => onSelectSnapshot(s.id)}
                                        className={`w-full text-left text-sm px-2 py-1.5 rounded-md transition-colors ${
                                            isViewing
                                                ? 'bg-white/[0.06] text-text-primary'
                                                : 'text-text-secondary hover:bg-white/[0.04] hover:text-text-primary'
                                        }`}
                                    >
                                        {formatTimestamp(s.lockedAt)}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {mode === 'draft' ? (
                <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                        <Button
                            type="button"
                            onClick={onLockIn}
                            disabled={!canLockIn || isLocking}
                            className="flex-1 bg-accent-purple text-white hover:brightness-110"
                        >
                            {isLocking ? 'Locking in…' : 'Lock In'}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setConfirmResetOpen(true)}
                            disabled={!canReset}
                            title="Clear all placements"
                            aria-label="Reset placements"
                        >
                            <RotateCcw aria-hidden="true" />
                            Reset
                        </Button>
                    </div>
                    {lockInError && (
                        <p className="text-sm text-destructive" role="alert">
                            {lockInError}
                        </p>
                    )}
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    <Button
                        type="button"
                        onClick={onMakePredictions}
                        className="bg-accent-purple text-white hover:brightness-110"
                    >
                        Make Predictions
                    </Button>
                    {canDeleteCurrent && currentSnapshot && (
                        <button
                            type="button"
                            onClick={() => setConfirmDeleteOpen(true)}
                            className="inline-flex items-center gap-1 self-start text-[0.75rem] text-text-muted hover:text-destructive transition-colors"
                        >
                            <Trash2 className="w-3 h-3" aria-hidden="true" />
                            Delete this prediction
                        </button>
                    )}
                </div>
            )}

            <AlertDialog
                open={confirmDeleteOpen}
                onOpenChange={(next) => {
                    if (!isDeleting) setConfirmDeleteOpen(next);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this prediction?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {currentSnapshot
                                ? `Delete this prediction from ${formatTimestamp(currentSnapshot.lockedAt)}? This cannot be undone.`
                                : 'Delete this prediction? This cannot be undone.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {deleteError && (
                        <p className="text-sm text-destructive" role="alert">
                            {deleteError}
                        </p>
                    )}
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault();
                                void (async () => {
                                    const ok = await onConfirmDelete();
                                    if (ok) setConfirmDeleteOpen(false);
                                })();
                            }}
                            disabled={isDeleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isDeleting ? 'Deleting…' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={confirmResetOpen} onOpenChange={setConfirmResetOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Reset your prediction?</AlertDialogTitle>
                        <AlertDialogDescription>
                            All current placements will be cleared and the pool will be refilled
                            with every team. Saved snapshots in the history list aren&apos;t
                            affected.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault();
                                void (async () => {
                                    await onReset();
                                    setConfirmResetOpen(false);
                                })();
                            }}
                        >
                            Reset
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </aside>
    );
};

export default PredictionHistoryPanel;
