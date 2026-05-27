import type { Team } from '../../../db';
import type { GameweekFixture } from './queries';

import React from 'react';
import { format } from 'date-fns';
import { Plus } from 'lucide-react';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';

interface AddFixtureDialogProps {
    open: boolean;
    onClose: () => void;
    /**
     * Rescheduled-window candidates the server returned via
     * `gameweekFixturesForPredictions(...).recommended`. Already filtered to
     * `status='scheduled'` and excludes fixtures already in the slip.
     */
    candidates: GameweekFixture[];
    teamsMap: Map<string, Team>;
    onAdd: (fixture: GameweekFixture) => void;
    gameweek: number;
}

const formatTime = (iso: string) => format(new Date(iso), 'EEE MMM d · h:mma');

/**
 * Add-fixture popup. **Recommended fixtures only** — the spec restricts
 * manual adds to the rescheduled-window between the previous and next
 * gameweek (#144). No general gameweek dropdown; the server-side
 * INVALID_MANUAL_ADD guard would reject anything outside the window anyway.
 *
 * Clicking "+" hands the fixture back to the parent, which seeds a Dexie
 * draft with `manuallyAdded: true`. The actual server commit happens when
 * the user fills in scores and clicks the row's Lock.
 */
const AddFixtureDialog: React.FC<AddFixtureDialogProps> = ({
    open,
    onClose,
    candidates,
    teamsMap,
    onAdd,
    gameweek,
}) => {
    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add a fixture to gameweek {gameweek}</DialogTitle>
                    <DialogDescription>
                        Rescheduled cup ties and midweek games that fall between gameweek{' '}
                        {gameweek - 1} and gameweek {gameweek + 1}. Only matches that haven&apos;t
                        kicked off yet appear here.
                    </DialogDescription>
                </DialogHeader>

                {candidates.length === 0 ? (
                    <p className="text-sm text-text-muted py-6 text-center">
                        No rescheduled fixtures in this window.
                    </p>
                ) : (
                    <ul className="flex flex-col gap-1 max-h-72 overflow-y-auto">
                        {candidates.map((f) => {
                            const home = teamsMap.get(f.homeTeamId);
                            const away = teamsMap.get(f.awayTeamId);
                            return (
                                <li
                                    key={f.id}
                                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/[0.04]"
                                >
                                    {home?.logo && (
                                        <img
                                            src={home.logo}
                                            alt=""
                                            className="w-5 h-5 object-contain"
                                            onError={(e) =>
                                                ((e.target as HTMLImageElement).style.display =
                                                    'none')
                                            }
                                        />
                                    )}
                                    <span className="text-sm font-medium truncate">
                                        {home?.name ?? '?'}
                                    </span>
                                    <span className="text-text-muted text-sm">vs</span>
                                    <span className="text-sm font-medium truncate">
                                        {away?.name ?? '?'}
                                    </span>
                                    {away?.logo && (
                                        <img
                                            src={away.logo}
                                            alt=""
                                            className="w-5 h-5 object-contain"
                                            onError={(e) =>
                                                ((e.target as HTMLImageElement).style.display =
                                                    'none')
                                            }
                                        />
                                    )}
                                    <span className="ml-auto text-[0.7rem] text-text-muted whitespace-nowrap">
                                        {formatTime(f.scheduledAt)}
                                    </span>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                            onAdd(f);
                                            onClose();
                                        }}
                                        aria-label={`Add ${home?.name ?? '?'} vs ${away?.name ?? '?'} to slip`}
                                    >
                                        <Plus className="w-4 h-4" aria-hidden="true" />
                                    </Button>
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

export default AddFixtureDialog;
