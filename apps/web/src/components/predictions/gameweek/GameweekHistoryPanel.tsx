import type { GameweekPrediction } from './queries';

import React, { useState } from 'react';
import { format } from 'date-fns';
import { Plus, Trash2 } from 'lucide-react';

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
import { Button } from '../../ui/button';

interface GameweekHistoryPanelProps {
    /**
     * Live (non-soft-deleted) slips for the viewer, newest activity first.
     * Comes straight from `myGameweekPredictions(seasonId)`.
     */
    slips: GameweekPrediction[];
    /**
     * Gameweek the editor is currently showing. Used to highlight the matching
     * row + decide what the soft-delete affordance applies to. Null when the
     * editor is in its empty state (no gameweek selected).
     */
    activeGameweek: number | null;
    onSelectGameweek: (gameweek: number) => void;
    onOpenAddGameweekDialog: () => void;
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
 * Right column of the Gameweek section: an "+ Add a gameweek" CTA and a
 * sorted list of the viewer's existing slips. Click a slip to load it into
 * the editor; click the CTA to open the picker.
 *
 * Gameweeks the user hasn't touched yet do NOT show here — they live in
 * the Add-gameweek dialog. Slips are listed in ascending gameweek order so
 * the season reads top-down.
 */
const GameweekHistoryPanel: React.FC<GameweekHistoryPanelProps> = ({
    slips,
    activeGameweek,
    onSelectGameweek,
    onOpenAddGameweekDialog,
    canDeleteCurrent,
    isDeleting,
    deleteError,
    onConfirmDelete,
    activeSlipId,
}) => {
    const [confirmOpen, setConfirmOpen] = useState(false);
    const sortedSlips = [...slips].sort((a, b) => a.gameweek - b.gameweek);

    return (
        <aside className="flex flex-col gap-3">
            <Button
                type="button"
                variant="outline"
                onClick={onOpenAddGameweekDialog}
                className="self-stretch justify-start"
            >
                <Plus className="w-4 h-4 mr-1" aria-hidden="true" />
                Add a gameweek
            </Button>

            <div className="flex flex-col gap-2 rounded-lg border border-border bg-glass-bg/40 p-3">
                <h3 className="text-[0.75rem] uppercase tracking-wider text-text-muted font-semibold">
                    Your slips
                </h3>
                {sortedSlips.length === 0 ? (
                    <p className="text-sm text-text-muted">
                        No slips yet. Click <span className="font-medium">Add a gameweek</span>{' '}
                        to start.
                    </p>
                ) : (
                    <ul className="flex flex-col gap-1 max-h-[480px] overflow-y-auto pr-1">
                        {sortedSlips.map((slip) => {
                            const isActive = slip.gameweek === activeGameweek;
                            return (
                                <li key={slip.id}>
                                    <button
                                        type="button"
                                        onClick={() => onSelectGameweek(slip.gameweek)}
                                        className={`w-full text-left text-sm px-2 py-1.5 rounded-md transition-colors ${
                                            isActive
                                                ? 'bg-white/[0.06] text-text-primary'
                                                : 'text-text-secondary hover:bg-white/[0.04] hover:text-text-primary'
                                        }`}
                                    >
                                        <span className="flex items-center justify-between gap-2">
                                            <span className="font-medium">GW {slip.gameweek}</span>
                                            <span className="text-[0.7rem] text-text-muted whitespace-nowrap">
                                                {formatRelative(slip.updatedAt)}
                                            </span>
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
