import type { GameweekPrediction } from './queries';

import React, { useState } from 'react';
import { format } from 'date-fns';
import { Lock, Plus, Trash2 } from 'lucide-react';

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
     * Live (non-soft-deleted) saved gameweeks for the viewer, newest
     * activity first. Comes straight from `myGameweekPredictions(seasonId)`.
     */
    savedGameweeks: GameweekPrediction[];
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
     * Confirm soft-delete of whichever gameweek is currently being shown.
     * Resolves true on success so the dialog can close itself.
     */
    onConfirmDelete: () => Promise<boolean>;
    activeSavedGameweekId: string | null;
    /**
     * Lock-In action moved into the right column (#144 review feedback).
     * The board itself stays focused on data entry; saving lives next to
     * the list of what's already saved.
     */
    onLockAll: () => void;
    isLocking: boolean;
    lockError: string | null;
    /** Count of fixture rows whose draft differs from their committed pick. */
    dirtyCount: number;
}

const formatRelative = (iso: string) => format(new Date(iso), 'MMM d · h:mma');

/**
 * Right column of the Gameweek section: a "+ Add a gameweek" CTA, a sorted
 * list of the viewer's saved gameweeks, and the Lock-In button at the bottom.
 *
 * Saved gameweeks list in ascending gameweek order so the season reads top-
 * down. Clicking one loads it into the editor. Gameweeks the user hasn't
 * touched live in the Add-gameweek dialog (not here).
 */
const GameweekHistoryPanel: React.FC<GameweekHistoryPanelProps> = ({
    savedGameweeks,
    activeGameweek,
    onSelectGameweek,
    onOpenAddGameweekDialog,
    canDeleteCurrent,
    isDeleting,
    deleteError,
    onConfirmDelete,
    activeSavedGameweekId,
    onLockAll,
    isLocking,
    lockError,
    dirtyCount,
}) => {
    const [confirmOpen, setConfirmOpen] = useState(false);
    const sortedSaved = [...savedGameweeks].sort((a, b) => a.gameweek - b.gameweek);

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
                    Saved gameweeks
                </h3>
                {sortedSaved.length === 0 ? (
                    <p className="text-sm text-text-muted">
                        Nothing saved yet. Click <span className="font-medium">Add a gameweek</span>{' '}
                        to start.
                    </p>
                ) : (
                    <ul className="flex flex-col gap-1 max-h-[480px] overflow-y-auto pr-1">
                        {sortedSaved.map((saved) => {
                            const isActive = saved.gameweek === activeGameweek;
                            return (
                                <li key={saved.id}>
                                    <button
                                        type="button"
                                        onClick={() => onSelectGameweek(saved.gameweek)}
                                        className={`w-full text-left text-sm px-2 py-1.5 rounded-md transition-colors ${
                                            isActive
                                                ? 'bg-white/[0.06] text-text-primary'
                                                : 'text-text-secondary hover:bg-white/[0.04] hover:text-text-primary'
                                        }`}
                                    >
                                        <span className="flex items-center justify-between gap-2">
                                            <span className="font-medium">GW {saved.gameweek}</span>
                                            <span className="text-[0.7rem] text-text-muted whitespace-nowrap">
                                                {formatRelative(saved.updatedAt)}
                                            </span>
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {canDeleteCurrent && activeSavedGameweekId && (
                <button
                    type="button"
                    onClick={() => setConfirmOpen(true)}
                    className="inline-flex items-center gap-1 self-start text-[0.75rem] text-text-muted hover:text-destructive transition-colors"
                >
                    <Trash2 className="w-3 h-3" aria-hidden="true" />
                    Delete this gameweek
                </button>
            )}

            {/* Lock-In footer — moved here from the board (#144 review feedback). */}
            <div className="flex flex-col gap-2 border-t border-border pt-3 mt-2">
                <p className="text-[0.75rem] text-text-muted">
                    {dirtyCount === 0
                        ? 'No unsaved changes.'
                        : `${dirtyCount} unsaved change${dirtyCount === 1 ? '' : 's'}.`}
                </p>
                <Button
                    type="button"
                    disabled={dirtyCount === 0 || isLocking}
                    onClick={onLockAll}
                    className="bg-accent-purple text-white hover:brightness-110 disabled:opacity-50"
                >
                    <Lock className="w-4 h-4 mr-1" aria-hidden="true" />
                    {isLocking ? 'Locking in…' : 'Lock In'}
                </Button>
                {lockError && (
                    <p className="text-sm text-destructive" role="alert">
                        {lockError}
                    </p>
                )}
            </div>

            <AlertDialog
                open={confirmOpen}
                onOpenChange={(next) => {
                    if (!isDeleting) setConfirmOpen(next);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this gameweek?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Your committed picks for this gameweek will be hidden. Submitting a
                            new pick for the same gameweek starts a fresh set.
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
