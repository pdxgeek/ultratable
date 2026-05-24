import type { TierListEditorRow } from './queries';

import React, { useEffect, useRef, useState } from 'react';
import { useMutation } from 'urql';

import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { SET_TIER_LIST_LOCKED_MUTATION } from './queries';

interface Props {
    list: TierListEditorRow;
    view: 'board' | 'config';
    onOpenConfig: () => void;
    onBackToBoard: () => void;
    onRenameTitle: (title: string) => Promise<void>;
    onToggleLock: () => void;
}

const TITLE_DEBOUNCE_MS = 300;
const MAX_TITLE_LENGTH = 100;

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
 * Top row of the editor — inline-editable title, "Edited X ago" indicator,
 * lock indicator with unlock affordance, Config <-> Back toggle.
 *
 * Title saves on a 300ms debounce. Server enforces title length / blank
 * checks; we just guard the input upper bound.
 */
const TierListEditorHeader: React.FC<Props> = ({
    list,
    view,
    onOpenConfig,
    onBackToBoard,
    onRenameTitle,
    onToggleLock,
}) => {
    const [syncedTitle, setSyncedTitle] = useState(list.title);
    const [draftTitle, setDraftTitle] = useState(list.title);
    const [editing, setEditing] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [lockState, setLockedMutation] = useMutation<
        { setTierListLocked: { id: string; isLocked: boolean } },
        { id: string; locked: boolean }
    >(SET_TIER_LIST_LOCKED_MUTATION);

    // Set-state-during-render pattern: when the server-returned title
    // changes (after a successful save or refetch), sync the draft only
    // if the user isn't actively editing. Avoids clobbering in-flight
    // typing while still picking up out-of-band updates.
    if (syncedTitle !== list.title) {
        setSyncedTitle(list.title);
        if (!editing) setDraftTitle(list.title);
    }

    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    const queueTitleSave = (next: string) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            const trimmed = next.trim();
            if (trimmed.length > 0 && trimmed !== list.title) {
                void onRenameTitle(trimmed);
            }
        }, TITLE_DEBOUNCE_MS);
    };

    const commitTitle = () => {
        setEditing(false);
        const trimmed = draftTitle.trim();
        if (trimmed.length === 0) {
            setDraftTitle(list.title);
            return;
        }
        if (trimmed !== list.title) void onRenameTitle(trimmed);
    };

    const handleUnlock = async () => {
        await setLockedMutation({ id: list.id, locked: false });
        onToggleLock();
    };

    return (
        <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1 min-w-0">
                {editing && !list.isLocked ? (
                    <Input
                        autoFocus
                        value={draftTitle}
                        maxLength={MAX_TITLE_LENGTH}
                        onChange={(e) => {
                            setDraftTitle(e.target.value);
                            queueTitleSave(e.target.value);
                        }}
                        onBlur={commitTitle}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') commitTitle();
                            if (e.key === 'Escape') {
                                setDraftTitle(list.title);
                                setEditing(false);
                            }
                        }}
                        className="text-[1.6rem] sm:text-[2rem] font-extrabold tracking-tight h-auto py-1"
                    />
                ) : (
                    <h1
                        className={`text-[2rem] max-sm:text-[1.6rem] font-extrabold tracking-tight break-words ${list.isLocked ? '' : 'cursor-text hover:bg-muted/40 rounded-sm -mx-1 px-1'}`}
                        onClick={() => {
                            if (!list.isLocked) setEditing(true);
                        }}
                        role={list.isLocked ? undefined : 'button'}
                        tabIndex={list.isLocked ? undefined : 0}
                        onKeyDown={(e) => {
                            if (!list.isLocked && (e.key === 'Enter' || e.key === ' ')) {
                                e.preventDefault();
                                setEditing(true);
                            }
                        }}
                    >
                        {list.title}
                    </h1>
                )}
                <div className="text-sm text-text-muted mt-1 flex items-center gap-3 flex-wrap">
                    <span>{list.tierRankableType?.name ?? 'Unknown recipe'}</span>
                    <span>·</span>
                    <span>Edited {formatRelative(list.updatedAt)}</span>
                    {list.isLocked && (
                        <>
                            <span>·</span>
                            <span className="inline-flex items-center gap-2">
                                <span
                                    className="text-[0.65rem] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                                    title="This list is locked"
                                >
                                    Locked
                                </span>
                                <button
                                    type="button"
                                    onClick={handleUnlock}
                                    disabled={lockState.fetching}
                                    className="text-xs underline hover:text-accent-blue disabled:opacity-50"
                                >
                                    {lockState.fetching ? 'Unlocking…' : 'Unlock to edit'}
                                </button>
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
