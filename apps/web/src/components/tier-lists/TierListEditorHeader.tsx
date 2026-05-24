import type { TierListEditorRow } from './queries';

import React from 'react';
import { ArrowLeft, Settings } from 'lucide-react';

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
 * Top row of the editor — title + meta + a subtle gear icon on the left
 * for config. Display-only otherwise; every list-level edit lives in
 * the config view. The lock state surfaces in the meta line for
 * awareness but the toggle itself is in config — keeps "all edits in
 * one place" honest.
 *
 * Layout: icon button on the left, title + meta to its right. In the
 * config view the icon flips to an arrow-left to return to the board.
 */
const TierListEditorHeader: React.FC<Props> = ({
    list,
    view,
    onOpenConfig,
    onBackToBoard,
}) => {
    const isConfig = view === 'config';
    return (
        <header className="mb-6 flex items-start gap-3">
            <button
                type="button"
                onClick={isConfig ? onBackToBoard : onOpenConfig}
                aria-label={isConfig ? 'Back to tier list' : 'Open list config'}
                title={isConfig ? 'Back to tier list' : 'Open list config'}
                className="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-muted/40 hover:text-foreground"
            >
                {isConfig ? <ArrowLeft className="h-4 w-4" /> : <Settings className="h-4 w-4" />}
            </button>
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
        </header>
    );
};

export default TierListEditorHeader;
