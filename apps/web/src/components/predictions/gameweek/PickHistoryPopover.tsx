import type { GameweekPredictionPick } from './queries';

import React from 'react';
import { format } from 'date-fns';
import { History } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';

interface PickHistoryPopoverProps {
    /**
     * Every pick row for this fixture in this slip, newest first. Caller
     * (`GameweekBoard`) filters the slip-level `pickHistory` to the rows for
     * this fixture before passing them down — the popover just renders.
     */
    history: GameweekPredictionPick[];
    fixtureLabel: string;
}

const formatScore = (h: number | null, a: number | null) =>
    h == null && a == null ? '—' : `${h ?? '–'}–${a ?? '–'}`;

const formatTimestamp = (iso: string) => format(new Date(iso), 'MMM d, h:mm a');

/**
 * Clock icon → popover listing every past commit for this fixture in this
 * slip, newest first. Read-only view of the per-fixture audit chain.
 *
 * No "revert to this" action in v1 — punt until we see whether users actually
 * want it. The data shape supports it (submitting a new pick with the old
 * values is the implementation); just don't expose the button yet.
 */
const PickHistoryPopover: React.FC<PickHistoryPopoverProps> = ({ history, fixtureLabel }) => {
    if (history.length === 0) return null;

    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label={`Pick history for ${fixtureLabel}`}
                    title="Pick history"
                    className="text-text-muted hover:text-text-primary transition-colors"
                >
                    <History className="w-4 h-4" aria-hidden="true" />
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-3">
                <div className="flex flex-col gap-2">
                    <p className="text-[0.75rem] uppercase tracking-wider text-text-muted font-semibold">
                        Pick history
                    </p>
                    <ul className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
                        {history.map((pick, idx) => (
                            <li
                                key={pick.id}
                                className="flex items-baseline justify-between gap-2 text-sm"
                            >
                                <span className="font-medium tabular-nums">
                                    {formatScore(pick.homeGoals, pick.awayGoals)}
                                </span>
                                <span className="flex-1 truncate text-text-muted text-[0.75rem]">
                                    {pick.note ?? (idx === 0 ? '(current)' : '')}
                                </span>
                                <span className="text-text-muted text-[0.7rem] whitespace-nowrap">
                                    {formatTimestamp(pick.createdAt)}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            </PopoverContent>
        </Popover>
    );
};

export default PickHistoryPopover;
