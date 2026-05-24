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
 * Top row of the editor — title + meta line. Display-only otherwise;
 * every list-level edit lives in the config view. The lock state
 * surfaces in the meta line for awareness but the toggle itself is
 * in config — keeps "all edits in one place" honest.
 *
 * The Settings / Back-to-list affordance is the leading item in the
 * meta line as an icon + label, blending into the same row as the
 * recipe / edited / locked metadata instead of floating as a
 * standalone button.
 */
const TierListEditorHeader: React.FC<Props> = ({
    list,
    view,
    onOpenConfig,
    onBackToBoard,
}) => {
    const isConfig = view === 'config';
    return (
        <header className="mb-6">
            <h1 className="text-[2rem] max-sm:text-[1.6rem] font-extrabold tracking-tight break-words">
                {list.title}
            </h1>
            <div className="text-sm text-text-muted mt-1 flex items-center gap-3 flex-wrap">
                <button
                    type="button"
                    onClick={isConfig ? onBackToBoard : onOpenConfig}
                    aria-label={isConfig ? 'Back to tier list' : 'Open list settings'}
                    className="inline-flex items-center gap-1 text-text-muted hover:text-foreground transition-colors"
                >
                    {isConfig ? (
                        <ArrowLeft className="h-3.5 w-3.5" />
                    ) : (
                        <Settings className="h-3.5 w-3.5" />
                    )}
                    <span>{isConfig ? 'Back to list' : 'Settings'}</span>
                </button>
                <span>·</span>
                <span>{list.tierRankableType?.name ?? 'Unknown recipe'}</span>
                <span>·</span>
                <span>Edited {formatRelative(list.updatedAt)}</span>
                {list.isLocked && (
                    <>
                        <span>·</span>
                        <span
                            className="text-[0.65rem] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                            title="This list is locked — open Settings to unlock"
                        >
                            Locked
                        </span>
                    </>
                )}
            </div>
        </header>
    );
};

export default TierListEditorHeader;
