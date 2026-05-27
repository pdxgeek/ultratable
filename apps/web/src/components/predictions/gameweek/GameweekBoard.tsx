import type { Team } from '../../../db';
import type { GameweekFixture, GameweekPredictionPick } from './queries';

import React, { useState } from 'react';
import { format } from 'date-fns';
import { Plus, StickyNote, X } from 'lucide-react';

import { Button } from '../../ui/button';
import PickHistoryPopover from './PickHistoryPopover';
import { isDirty } from './rowState';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Per-row state owned by the parent `GameweekSection`. The board is purely
 * presentational — it renders, the section handles the locking + Dexie draft
 * write-through.
 */
export interface RowDraft {
    homeGoals: number | null;
    awayGoals: number | null;
    note: string | null;
    manuallyAdded: boolean;
}

export interface RowState {
    fixture: GameweekFixture;
    /** Latest committed pick on the server, if any. */
    currentPick: GameweekPredictionPick | null;
    /** Every committed pick for this fixture in this slip, newest first. */
    history: GameweekPredictionPick[];
    /** Unsaved scratch state from the Dexie draft. Null when no draft exists. */
    draft: RowDraft | null;
}

interface GameweekBoardProps {
    gameweek: number;
    /**
     * Default-gameweek rows (everything where `fixture.gameweek === gameweek`),
     * sorted by scheduledAt.
     */
    rows: RowState[];
    /**
     * Manually-added rows (rescheduled cup ties / midweek games), sorted by
     * scheduledAt. Rendered in a separate section.
     */
    manualRows: RowState[];
    teamsMap: Map<string, Team>;
    /**
     * `teamId → current standings position` for the active season. Looked up
     * per-row to render a small number next to each team name ("8th plays
     * 14th" context). A missing teamId (manually-added cup fixture against a
     * team not in this season's table) just renders without the badge.
     */
    currentPositions: Map<string, number>;
    /** "Add fixture" button → open the picker. Null hides the button (e.g. closed gameweek). */
    onOpenAddDialog: (() => void) | null;
    onDraftChange: (fixtureId: string, draft: RowDraft) => void;
    onClearDraft: (fixtureId: string) => void;
    /**
     * Remove a manually-added row from the editor. v1 just clears the draft;
     * server-side removal is out of scope (the user leaves scores blank
     * instead). Hidden for rows whose pick is already committed — once it's
     * in the server-side chain the visual "remove" wouldn't actually unsave
     * anything.
     */
    onRemoveManualRow: (fixtureId: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<GameweekFixture['status'], string | null> = {
    scheduled: null,
    live: 'Live',
    played: 'Played',
    cancelled: 'Cancelled',
    postponed: 'Postponed',
};

const isScoreable = (status: GameweekFixture['status']) => status === 'scheduled';

/** Returns the effective values to display + send on lock — draft beats committed. */
function effective(row: RowState): RowDraft {
    if (row.draft) return row.draft;
    if (row.currentPick) {
        return {
            homeGoals: row.currentPick.homeGoals,
            awayGoals: row.currentPick.awayGoals,
            note: row.currentPick.note,
            manuallyAdded: row.currentPick.manuallyAdded,
        };
    }
    return { homeGoals: null, awayGoals: null, note: null, manuallyAdded: false };
}

// `isDirty` moved to ./rowState.ts so the parent section can import it
// without tripping Vite's "only export components from component files" rule.

const formatTime = (iso: string) => format(new Date(iso), 'EEE MMM d · h:mma');

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

interface RowProps {
    row: RowState;
    teamsMap: Map<string, Team>;
    currentPositions: Map<string, number>;
    onDraftChange: (fixtureId: string, draft: RowDraft) => void;
    onClearDraft: (fixtureId: string) => void;
    onRemove?: () => void;
}

const FixtureScoreRow: React.FC<RowProps> = ({
    row,
    teamsMap,
    currentPositions,
    onDraftChange,
    onClearDraft,
    onRemove,
}) => {
    const home = teamsMap.get(row.fixture.homeTeamId);
    const away = teamsMap.get(row.fixture.awayTeamId);
    const homePosition = currentPositions.get(row.fixture.homeTeamId);
    const awayPosition = currentPositions.get(row.fixture.awayTeamId);
    const eff = effective(row);
    const scoreable = isScoreable(row.fixture.status);
    const statusLabel = STATUS_LABEL[row.fixture.status];
    const dirty = isDirty(row);
    const [noteOpen, setNoteOpen] = useState((eff.note ?? '').length > 0);

    const handleScoreInput = (which: 'home' | 'away') => (e: React.ChangeEvent<HTMLInputElement>) => {
        // Strip anything that isn't a digit so paste-from-clipboard, accidental
        // letters, and minus signs all sanitize cleanly. Empty after strip → null.
        const digits = e.target.value.replace(/\D/g, '');
        const next = digits === '' ? null : Number.parseInt(digits, 10);
        onDraftChange(row.fixture.id, {
            ...eff,
            [which === 'home' ? 'homeGoals' : 'awayGoals']: next,
        });
    };

    const handleNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onDraftChange(row.fixture.id, { ...eff, note: e.target.value || null });
    };

    const handleClearDraft = () => {
        setNoteOpen((row.currentPick?.note ?? '').length > 0);
        onClearDraft(row.fixture.id);
    };

    const fixtureLabel = `${home?.name ?? 'Home'} vs ${away?.name ?? 'Away'}`;

    return (
        <li
            className={`rounded-lg border border-border bg-glass-bg/40 ${scoreable ? '' : 'opacity-60'}`}
        >
            <div className="flex items-center gap-3 px-3 py-2">
                {/* Home team */}
                <div className="flex items-center gap-2 flex-1 min-w-0 justify-end text-right">
                    {/*
                     * Position is on the OUTSIDE of the row (away from the
                     * score) for each team — small muted number so it reads
                     * as secondary context, not as a competing label.
                     */}
                    {homePosition != null && (
                        <span
                            className="text-[0.7rem] font-semibold text-text-muted tabular-nums shrink-0"
                            title={`Currently ${homePosition} in the table`}
                        >
                            {homePosition}
                        </span>
                    )}
                    <span className="font-medium text-text-primary truncate">
                        {home?.name ?? 'Home'}
                    </span>
                    {home?.logo && (
                        <img
                            src={home.logo}
                            alt=""
                            className="w-6 h-6 object-contain"
                            onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
                        />
                    )}
                </div>

                {/* Score inputs */}
                {/*
                 * `type="text"` (rather than `type="number"`) so the browser
                 * doesn't render the up/down spinner buttons or apply its own
                 * permissive number parsing (which would let "e", "+", "-"
                 * through). `inputMode="numeric"` + `pattern="\d*"` still
                 * surface the numeric keypad on mobile, and the onChange
                 * handler strips any non-digits defensively.
                 */}
                <div className="flex items-center gap-1">
                    <input
                        type="text"
                        inputMode="numeric"
                        pattern="\d*"
                        maxLength={2}
                        value={eff.homeGoals ?? ''}
                        onChange={handleScoreInput('home')}
                        disabled={!scoreable}
                        aria-label={`Home goals for ${fixtureLabel}`}
                        className="w-10 h-9 text-center rounded-md border border-input bg-transparent text-sm tabular-nums disabled:cursor-not-allowed"
                    />
                    <span className="text-text-muted text-sm">–</span>
                    <input
                        type="text"
                        inputMode="numeric"
                        pattern="\d*"
                        maxLength={2}
                        value={eff.awayGoals ?? ''}
                        onChange={handleScoreInput('away')}
                        disabled={!scoreable}
                        aria-label={`Away goals for ${fixtureLabel}`}
                        className="w-10 h-9 text-center rounded-md border border-input bg-transparent text-sm tabular-nums disabled:cursor-not-allowed"
                    />
                </div>

                {/* Away team */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    {away?.logo && (
                        <img
                            src={away.logo}
                            alt=""
                            className="w-6 h-6 object-contain"
                            onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
                        />
                    )}
                    <span className="font-medium text-text-primary truncate">
                        {away?.name ?? 'Away'}
                    </span>
                    {awayPosition != null && (
                        <span
                            className="text-[0.7rem] font-semibold text-text-muted tabular-nums shrink-0"
                            title={`Currently ${awayPosition} in the table`}
                        >
                            {awayPosition}
                        </span>
                    )}
                </div>
            </div>

            {/*
             * Meta row: timestamp + status / dirty marker on the left, per-row
             * actions on the right. The actions used to share the main row
             * with the teams + score inputs, which truncated long names on
             * narrow viewports. Splitting them out gives the team labels the
             * full width above.
             */}
            <div className="flex items-center justify-between gap-2 px-3 pb-2 text-[0.7rem] text-text-muted">
                <span className="flex items-center gap-2 min-w-0">
                    <span className="truncate">{formatTime(row.fixture.scheduledAt)}</span>
                    {statusLabel && (
                        <span className="uppercase font-semibold tracking-wider">
                            {statusLabel}
                        </span>
                    )}
                    {dirty && (
                        <button
                            type="button"
                            onClick={handleClearDraft}
                            className="underline hover:text-text-primary"
                            title="Discard unsaved changes"
                        >
                            unsaved · discard
                        </button>
                    )}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                    <button
                        type="button"
                        onClick={() => setNoteOpen((v) => !v)}
                        aria-label={`Toggle note for ${fixtureLabel}`}
                        title="Note"
                        className={`text-text-muted hover:text-text-primary transition-colors ${
                            (eff.note ?? '').length > 0 ? 'text-accent-purple' : ''
                        }`}
                    >
                        <StickyNote className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <PickHistoryPopover history={row.history} fixtureLabel={fixtureLabel} />
                    {onRemove && (
                        <button
                            type="button"
                            onClick={onRemove}
                            aria-label={`Remove ${fixtureLabel} from slip`}
                            title="Remove from slip"
                            className="text-text-muted hover:text-destructive transition-colors"
                        >
                            <X className="w-4 h-4" aria-hidden="true" />
                        </button>
                    )}
                </div>
            </div>

            {/* Note textarea (expands inline) */}
            {noteOpen && (
                <div className="px-3 pb-3">
                    <textarea
                        value={eff.note ?? ''}
                        onChange={handleNoteChange}
                        maxLength={500}
                        rows={2}
                        placeholder="Add a note for this fixture (optional, ≤ 500 chars)"
                        className="w-full text-sm rounded-md border border-input bg-transparent px-2 py-1.5 resize-y"
                    />
                </div>
            )}
        </li>
    );
};

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

const GameweekBoard: React.FC<GameweekBoardProps> = ({
    gameweek,
    rows,
    manualRows,
    teamsMap,
    currentPositions,
    onOpenAddDialog,
    onDraftChange,
    onClearDraft,
    onRemoveManualRow,
}) => {
    return (
        <section className="flex flex-col gap-4">
            <header className="flex items-baseline justify-between">
                <h2 className="text-lg font-semibold text-text-primary">Gameweek {gameweek}</h2>
                <span className="text-[0.75rem] text-text-muted">
                    {rows.length} fixture{rows.length === 1 ? '' : 's'}
                </span>
            </header>

            {rows.length === 0 ? (
                <p className="text-sm text-text-muted">
                    No fixtures in this gameweek.
                </p>
            ) : (
                <ul className="flex flex-col gap-2">
                    {rows.map((row) => (
                        <FixtureScoreRow
                            key={row.fixture.id}
                            row={row}
                            teamsMap={teamsMap}
                            currentPositions={currentPositions}
                            onDraftChange={onDraftChange}
                            onClearDraft={onClearDraft}
                        />
                    ))}
                </ul>
            )}

            {(manualRows.length > 0 || onOpenAddDialog) && (
                <div className="flex flex-col gap-3">
                    <header className="flex items-baseline justify-between">
                        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
                            Added fixtures
                        </h3>
                        <span className="text-[0.7rem] text-text-muted">
                            Rescheduled cup ties / midweek games
                        </span>
                    </header>

                    {manualRows.length === 0 ? (
                        <p className="text-sm text-text-muted">
                            Add a fixture that falls between this gameweek and the next.
                        </p>
                    ) : (
                        <ul className="flex flex-col gap-2">
                            {manualRows.map((row) => {
                                // Only show the remove button when the row is a pure
                                // draft (no committed pick yet) — once it's saved
                                // server-side, "remove" wouldn't actually un-commit.
                                const removable = row.currentPick == null;
                                return (
                                    <FixtureScoreRow
                                        key={row.fixture.id}
                                        row={row}
                                        teamsMap={teamsMap}
                                        currentPositions={currentPositions}
                                        onDraftChange={onDraftChange}
                                        onClearDraft={onClearDraft}
                                        onRemove={
                                            removable
                                                ? () =>
                                                      onRemoveManualRow(row.fixture.id)
                                                : undefined
                                        }
                                    />
                                );
                            })}
                        </ul>
                    )}

                    {onOpenAddDialog && (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onOpenAddDialog}
                            className="self-start"
                        >
                            <Plus className="w-4 h-4 mr-1" aria-hidden="true" />
                            Add fixture
                        </Button>
                    )}
                </div>
            )}
        </section>
    );
};

export default GameweekBoard;
