import type { TierListEditorRow } from './queries';

import React from 'react';

import { Button } from '../ui/button';

interface Props {
    list: TierListEditorRow;
    view: 'board' | 'config';
    onOpenConfig: () => void;
    onBackToBoard: () => void;
}

function formatRelative(iso: string): string {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diffSec = Math.max(0, Math.round((now - then) / 1000));
    if (diffSec < 60) return 'just now';
    const diffMin = Math.round(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.round(diffHr / 24);
    return `${diffDay}d ago`;
}

/**
 * Top row of the editor — title + meta + Config/Back toggle. Display-only;
 * every list-level edit (title rename, recipe display, tier scheme,
 * display toggles, lock, delete) lives in the config view. The header
 * surfaces the lock state for awareness but the toggle itself is in
 * config — keeps "all edits in one place" honest.
 */
const TierListEditorHeader: React.FC<Props> = ({
    list,
    view,
    onOpenConfig,
    onBackToBoard,
}) => {
    return (
        <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1 min-w-0">
                <h1 className="text-[2rem] max-sm:text-[1.6rem] font-extrabold tracking-tight break-words">
                    {list.title}
                </h1>
                <div className="text-sm text-text-muted mt-1 flex items-center gap-3 flex-wrap">
                    <span>{list.tierRankableType?.name ?? 'Unknown recipe'}</span>
                    <span>·</span>
                    <span>Edited {formatRelative(list.updatedAt)}</span>
                    {list.isLocked && (
                        <>
                            <span>·</span>
                            <span
                                className="text-[0.65rem] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                                title="This list is locked — open Config to unlock"
                            >
                                Locked
                            </span>
                        </>
                    )}
                </div>
            </div>
            <div className="flex gap-2 shrink-0">
                {view === 'config' ? (
                    <Button type="button" variant="outline" onClick={onBackToBoard}>
                        ← Back to list
                    </Button>
                ) : (
                    <Button type="button" variant="outline" onClick={onOpenConfig}>
                        Config
                    </Button>
                )}
            </div>
        </header>
    );
};

export default TierListEditorHeader;
