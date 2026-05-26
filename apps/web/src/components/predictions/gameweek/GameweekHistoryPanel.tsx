import type { GameweekPrediction } from './queries';

import React, { useState } from 'react';
import { format } from 'date-fns';
import { Trash2 } from 'lucide-react';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '../../ui/alert-dialog';

interface GameweekHistoryPanelProps {
    /**
     * Live (non-soft-deleted) slips for the viewer, newest activity first.
     * Comes straight from `myGameweekPredictions(seasonId)`.
     */
    slips: GameweekPrediction[];
    /**
     * Gameweek the editor is currently showing. Used to highlight the matching
     * row + decide what the soft-delete affordance applies to.
     */
    activeGameweek: number | null;
    selectableGameweeks: number[];
    onSelectGameweek: (gameweek: number) => void;
    canDeleteCurrent: boolean;
    isDeleting: boolean;
    deleteError: string | null;
    /**
     * Confirm soft-delete of whichever slip is currently being shown.
     * Resolves true on success so the dialog can close itself.
     */
    onConfirmDelete: () => Promise<boolean>;
    activeSlipId: string | null;
}

const formatRelative = (iso: string) => format(new Date(iso), 'MMM d · h:mma');

/**
 * Right column of the Gameweek section: gameweek picker + activity-sorted
 * history. Each entry shows which gameweek the slip is for and when the
 * user last touched it (the server-side `updatedAt` bumps on every committed
 * pick). Gameweeks that have no slip but are still selectable also show as
 * empty rows so the user can navigate forward.
 *
 * Soft-delete affordance applies to the currently-viewed slip — confirm
 * dialog gates it.
 */
const GameweekHistoryPanel: React.FC<GameweekHistoryPanelProps> = ({
    slips,
    activeGameweek,
    selectableGameweeks,
    onSelectGameweek,
    canDeleteCurrent,
    isDeleting,
    deleteError,
    onConfirmDelete,
    activeSlipId,
}) => {
    const [confirmOpen, setConfirmOpen] = useState(false);
    const slipsByGameweek = new Map(slips.map((s) => [s.gameweek, s] as const));

    // Union of "weeks the user has touched" + "weeks still selectable" so the
    // picker stays useful both for revisiting a past slip and for jumping
    // ahead to a future gameweek the user hasn't opened yet.
    const allWeeks = new Set<number>([
        ...slips.map((s) => s.gameweek),
        ...selectableGameweeks,
    ]);
    const sortedWeeks = [...allWeeks].sort((a, b) => b - a);

    return (
        <aside className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-glass-bg/40 p-3">
                <h3 className="text-[0.75rem] uppercase tracking-wider text-text-muted font-semibold">
                    Your gameweeks
                </h3>
                {sortedWeeks.length === 0 ? (
                    <p className="text-sm text-text-muted">No gameweeks available.</p>
                ) : (
                    <ul className="flex flex-col gap-1 max-h-[480px] overflow-y-auto pr-1">
                        {sortedWeeks.map((gw) => {
                            const slip = slipsByGameweek.get(gw);
                            const isActive = gw === activeGameweek;
                            const isSelectable = selectableGameweeks.includes(gw);
                            return (
                                <li key={gw}>
                                    <button
                                        type="button"
                                        onClick={() => onSelectGameweek(gw)}
                                        className={`w-full text-left text-sm px-2 py-1.5 rounded-md transition-colors ${
                                            isActive
                                                ? 'bg-white/[0.06] text-text-primary'
                                                : 'text-text-secondary hover:bg-white/[0.04] hover:text-text-primary'
                                        }`}
                                    >
                                        <span className="flex items-center justify-between gap-2">
                                            <span className="font-medium">GW {gw}</span>
                                            {!isSelectable && (
                                                <span className="text-[0.65rem] uppercase tracking-wider text-text-muted">
                                                    closed
                                                </span>
                                            )}
                                            {slip && (
                                                <span className="text-[0.7rem] text-text-muted whitespace-nowrap">
                                                    {formatRelative(slip.updatedAt)}
                                                </span>
                                            )}
                                            {!slip && isSelectable && (
                                                <span className="text-[0.7rem] text-text-muted">
                                                    no picks yet
                                                </span>
                                            )}
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {canDeleteCurrent && activeSlipId && (
                <button
                    type="button"
                    onClick={() => setConfirmOpen(true)}
                    className="inline-flex items-center gap-1 self-start text-[0.75rem] text-text-muted hover:text-destructive transition-colors"
                >
                    <Trash2 className="w-3 h-3" aria-hidden="true" />
                    Delete this slip
                </button>
            )}

            <AlertDialog
                open={confirmOpen}
                onOpenChange={(next) => {
                    if (!isDeleting) setConfirmOpen(next);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this gameweek slip?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Your committed picks for this gameweek will be hidden. Submitting a
                            new pick for the same gameweek starts a fresh slip.
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
                                    if (ok) setConfirmOpen(false);
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
        </aside>
    );
};

export default GameweekHistoryPanel;
