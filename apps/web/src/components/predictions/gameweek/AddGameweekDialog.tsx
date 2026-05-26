import type { SelectableGameweek } from './queries';

import React from 'react';
import { format } from 'date-fns';
import { Calendar } from 'lucide-react';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';

interface AddGameweekDialogProps {
    open: boolean;
    onClose: () => void;
    /**
     * Server-sorted by `nextKickoff` ascending so the soonest match is on
     * top. Already filtered to gameweeks with ≥1 `scheduled` fixture.
     */
    candidates: SelectableGameweek[];
    /**
     * Gameweeks the user already has a live slip for — rendered with a
     * subtle disabled style so the user doesn't accidentally start a second
     * one (the server-side partial unique would reject it anyway).
     */
    existingSlipGameweeks: Set<number>;
    onSelect: (gameweek: number) => void;
}

const formatKickoff = (iso: string) => format(new Date(iso), 'EEE MMM d · h:mma');

/**
 * Add-gameweek picker. Replaces the auto-defaulted active gameweek — the
 * editor stays empty until the user explicitly opts into a slip from this
 * list. Sort matches the user's mental model ("what's playing soon?") so
 * MLS-style straggler gameweeks with one rescheduled match in three months
 * sit at the bottom rather than getting auto-loaded.
 */
const AddGameweekDialog: React.FC<AddGameweekDialogProps> = ({
    open,
    onClose,
    candidates,
    existingSlipGameweeks,
    onSelect,
}) => {
    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Pick a gameweek to predict</DialogTitle>
                    <DialogDescription>
                        Gameweeks with at least one match still to be played, sorted by the
                        soonest kickoff. Gameweeks you already have a slip for are dimmed.
                    </DialogDescription>
                </DialogHeader>

                {candidates.length === 0 ? (
                    <p className="text-sm text-text-muted py-6 text-center">
                        No gameweeks available — the season may be fully played.
                    </p>
                ) : (
                    <ul className="flex flex-col gap-1 max-h-80 overflow-y-auto">
                        {candidates.map((c) => {
                            const existing = existingSlipGameweeks.has(c.gameweek);
                            return (
                                <li key={c.gameweek}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onSelect(c.gameweek);
                                            onClose();
                                        }}
                                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors ${
                                            existing
                                                ? 'text-text-muted hover:bg-white/[0.03]'
                                                : 'text-text-primary hover:bg-white/[0.06]'
                                        }`}
                                    >
                                        <Calendar
                                            className="w-4 h-4 text-text-muted shrink-0"
                                            aria-hidden="true"
                                        />
                                        <span className="font-medium">GW {c.gameweek}</span>
                                        <span className="ml-auto text-[0.75rem] text-text-muted whitespace-nowrap">
                                            {formatKickoff(c.nextKickoff)}
                                        </span>
                                        {existing && (
                                            <span className="text-[0.65rem] uppercase tracking-wider text-text-muted">
                                                slip exists
                                            </span>
                                        )}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}

                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={onClose}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default AddGameweekDialog;
