import type { Tier, TierListEditorRow } from './queries';

import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from 'urql';

import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import {
    DELETE_TIER_LIST_MUTATION,
    SET_TIER_LIST_LOCKED_MUTATION,
    UPDATE_TIER_LIST_DISPLAY_CONFIG_MUTATION,
    UPDATE_TIER_LIST_TIERS_MUTATION,
    UPDATE_TIER_LIST_TITLE_MUTATION,
    UPDATE_TIER_RANKABLE_ITEM_OVERRIDES_MUTATION,
} from './queries';
import { colorForTierIndex } from './tierColors';

interface Props {
    list: TierListEditorRow;
    onChanged: () => void;
    onBack: () => void;
    onOpenAddDrawer: () => void;
    onRemoveItem: (itemId: string) => void;
}

const MIN_TIERS = 3;
const MAX_TIERS = 7;
const MAX_TITLE_LENGTH = 100;
const TIER_DEBOUNCE_MS = 300;

// Default name for a freshly-appended tier — picks the next letter in
// S/A/B/C/D/F sequence then falls back to numeric.
const DEFAULT_TIER_NAMES = ['S', 'A', 'B', 'C', 'D', 'F'];

function nextDefaultTierName(existing: Tier[]): string {
    const usedNames = new Set(existing.map((t) => t.name.toUpperCase()));
    for (const name of DEFAULT_TIER_NAMES) {
        if (!usedNames.has(name)) return name;
    }
    return `Tier ${existing.length + 1}`;
}

function newTierKey(): string {
    return `tier-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36).slice(-4)}`;
}

/**
 * Full-page config view (replaces the board) — all per-list settings in
 * one place. Title, recipe (locked label), tier list (vertical, add /
 * remove from bottom only), display toggle, locked toggle, delete.
 *
 * No modals. Saves live: title debounces, tier renames debounce, toggles
 * fire on flip, tier add/remove fires immediately (with confirm when the
 * removed tier holds items).
 */
const TierListConfigView: React.FC<Props> = ({
    list,
    onChanged,
    onBack,
    onOpenAddDrawer,
    onRemoveItem,
}) => {
    const navigate = useNavigate();
    const [syncedTitle, setSyncedTitle] = useState(list.title);
    const [draftTitle, setDraftTitle] = useState(list.title);
    const [syncedTiers, setSyncedTiers] = useState<Tier[]>(list.tiers);
    const [draftTiers, setDraftTiers] = useState<Tier[]>(list.tiers);
    const [error, setError] = useState<string | null>(null);
    const titleDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
    const tiersDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [, updateTitle] = useMutation(UPDATE_TIER_LIST_TITLE_MUTATION);
    const [, updateTiers] = useMutation(UPDATE_TIER_LIST_TIERS_MUTATION);
    const [, updateDisplayConfig] = useMutation(UPDATE_TIER_LIST_DISPLAY_CONFIG_MUTATION);
    const [, setLocked] = useMutation(SET_TIER_LIST_LOCKED_MUTATION);
    const [, deleteList] = useMutation(DELETE_TIER_LIST_MUTATION);
    const [, updateItemOverrides] = useMutation(
        UPDATE_TIER_RANKABLE_ITEM_OVERRIDES_MUTATION,
    );

    // Inline rename: at most one item is in edit mode at a time. Empty
    // input on commit clears the override (falls back to the recipe's
    // snapshot name).
    const [renamingItemId, setRenamingItemId] = useState<string | null>(null);
    const [renameDraft, setRenameDraft] = useState('');

    const startRename = (itemId: string, currentName: string) => {
        setRenamingItemId(itemId);
        setRenameDraft(currentName);
    };

    const commitRename = async () => {
        if (!renamingItemId) return;
        const itemId = renamingItemId;
        const trimmed = renameDraft.trim();
        const original = list.items.find((i) => i.id === itemId);
        setRenamingItemId(null);
        if (!original) return;
        // Empty input → clear the override. Non-empty + unchanged
        // (matches displayName) → no-op.
        if (trimmed === '' && original.nameOverride === null) return;
        if (trimmed === original.displayName) return;
        const result = await updateItemOverrides({
            input: {
                itemId,
                nameOverride: trimmed === '' ? null : trimmed,
            },
        });
        if (result.error) {
            setError(result.error.graphQLErrors[0]?.message ?? result.error.message);
            return;
        }
        onChanged();
    };

    const cancelRename = () => {
        setRenamingItemId(null);
    };

    // Set-state-during-render: re-sync drafts when the server-returned
    // values change (after our own save or an out-of-band refetch). The
    // pending debounce stays scheduled — when it fires it sees the
    // up-to-date `list.title`/`list.tiers` and no-ops if there's nothing
    // to change.
    if (syncedTitle !== list.title) {
        setSyncedTitle(list.title);
        setDraftTitle(list.title);
    }
    if (syncedTiers !== list.tiers) {
        setSyncedTiers(list.tiers);
        setDraftTiers(list.tiers);
    }
    useEffect(() => {
        return () => {
            if (titleDebounce.current) clearTimeout(titleDebounce.current);
            if (tiersDebounce.current) clearTimeout(tiersDebounce.current);
        };
    }, []);

    const itemsInTier = (key: string) =>
        list.items.filter((it) => it.tierKey === key).length;

    const flushTiers = async (next: Tier[]) => {
        setError(null);
        const result = await updateTiers({
            id: list.id,
            tiers: next.map((t) => ({ key: t.key, name: t.name })),
        });
        if (result.error) {
            setError(result.error.graphQLErrors[0]?.message ?? result.error.message);
            return false;
        }
        onChanged();
        return true;
    };

    const queueTitleSave = (next: string) => {
        if (titleDebounce.current) clearTimeout(titleDebounce.current);
        titleDebounce.current = setTimeout(async () => {
            const trimmed = next.trim();
            if (trimmed.length === 0 || trimmed === list.title) return;
            setError(null);
            const result = await updateTitle({ id: list.id, title: trimmed });
            if (result.error) {
                setError(result.error.graphQLErrors[0]?.message ?? result.error.message);
                return;
            }
            onChanged();
        }, TIER_DEBOUNCE_MS);
    };

    const queueTiersSave = (next: Tier[]) => {
        if (tiersDebounce.current) clearTimeout(tiersDebounce.current);
        tiersDebounce.current = setTimeout(() => {
            void flushTiers(next);
        }, TIER_DEBOUNCE_MS);
    };

    const renameTier = (index: number, name: string) => {
        const next = draftTiers.map((t, i) => (i === index ? { ...t, name } : t));
        setDraftTiers(next);
        queueTiersSave(next);
    };

    const addTier = () => {
        if (draftTiers.length >= MAX_TIERS) return;
        const next = [
            ...draftTiers,
            { key: newTierKey(), name: nextDefaultTierName(draftTiers) },
        ];
        setDraftTiers(next);
        void flushTiers(next);
    };

    const removeBottomTier = async () => {
        if (draftTiers.length <= MIN_TIERS) return;
        const last = draftTiers[draftTiers.length - 1];
        const inUse = itemsInTier(last.key);
        if (inUse > 0) {
            const ok = window.confirm(
                `Removing "${last.name}" will send its ${inUse} item(s) back to the pool. Continue?`,
            );
            if (!ok) return;
        }
        const next = draftTiers.slice(0, -1);
        setDraftTiers(next);
        void flushTiers(next);
    };

    const patchDisplayConfig = async (
        next: { showTeamNames?: boolean; showTeamLogos?: boolean },
    ) => {
        setError(null);
        const result = await updateDisplayConfig({
            id: list.id,
            displayConfig: {
                showTeamNames: next.showTeamNames ?? list.displayConfig.showTeamNames,
                showTeamLogos: next.showTeamLogos ?? list.displayConfig.showTeamLogos,
            },
        });
        if (result.error) {
            setError(result.error.graphQLErrors[0]?.message ?? result.error.message);
            return;
        }
        onChanged();
    };

    const toggleLocked = async (locked: boolean) => {
        setError(null);
        const result = await setLocked({ id: list.id, locked });
        if (result.error) {
            setError(result.error.graphQLErrors[0]?.message ?? result.error.message);
            return;
        }
        onChanged();
    };

    const handleDelete = async () => {
        const ok = window.confirm(
            `Delete "${list.title}"? This can't be undone from the app.`,
        );
        if (!ok) return;
        const result = await deleteList({ id: list.id });
        if (result.error) {
            setError(result.error.graphQLErrors[0]?.message ?? result.error.message);
            return;
        }
        navigate('/tier-lists');
    };

    return (
        <div className="flex flex-col gap-8">
            {error && (
                <div className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                </div>
            )}

            <section className="flex flex-col gap-2">
                <Label htmlFor="config-title">Title</Label>
                <Input
                    id="config-title"
                    value={draftTitle}
                    maxLength={MAX_TITLE_LENGTH}
                    onChange={(e) => {
                        setDraftTitle(e.target.value);
                        queueTitleSave(e.target.value);
                    }}
                    onBlur={() => queueTitleSave(draftTitle)}
                />
            </section>

            <section className="flex flex-col gap-2">
                <Label>What this list ranks</Label>
                <div className="text-sm rounded-md border border-glass-border bg-glass-bg px-3 py-2">
                    {list.tierRankableType?.name ?? 'Unknown'}
                </div>
                <p className="text-xs text-text-muted">
                    The ranking type is set when the list is created and can&apos;t be changed.
                </p>
            </section>

            <section className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <div>
                        <Label>Pool ({list.items.length} items)</Label>
                        <p className="text-xs text-text-muted mt-0.5">
                            Items live here until you drag them into a tier on the main list.
                        </p>
                    </div>
                    {!list.isLocked && (
                        <Button type="button" onClick={onOpenAddDrawer}>
                            + Add items
                        </Button>
                    )}
                </div>
                {list.items.length === 0 ? (
                    <p className="rounded-md border border-dashed border-glass-border bg-glass-bg/40 p-4 text-sm text-text-muted">
                        No items yet. Click <strong>+ Add items</strong> to fill the pool.
                    </p>
                ) : (
                    <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {list.items.map((it) => (
                            <li
                                key={it.id}
                                className="flex items-center gap-2 rounded-md border border-glass-border bg-glass-bg px-2 py-1.5"
                            >
                                <div className="w-8 h-8 flex-shrink-0 rounded overflow-hidden bg-muted">
                                    {it.displayImageUrl ? (
                                        <img
                                            src={it.displayImageUrl}
                                            alt=""
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <span className="flex items-center justify-center w-full h-full text-[0.65rem] text-text-muted">
                                            {it.displayName.slice(0, 2).toUpperCase()}
                                        </span>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    {renamingItemId === it.id ? (
                                        <Input
                                            autoFocus
                                            value={renameDraft}
                                            placeholder={it.name}
                                            onChange={(e) => setRenameDraft(e.target.value)}
                                            onBlur={() => void commitRename()}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') void commitRename();
                                                if (e.key === 'Escape') cancelRename();
                                            }}
                                            maxLength={120}
                                            className="h-7 text-xs px-1.5"
                                        />
                                    ) : (
                                        <button
                                            type="button"
                                            disabled={list.isLocked}
                                            onClick={() => startRename(it.id, it.displayName)}
                                            className="text-xs font-medium truncate text-left w-full enabled:cursor-text enabled:hover:bg-muted/40 rounded-sm px-1 -mx-1"
                                            title="Click to rename"
                                        >
                                            {it.displayName}
                                            {it.nameOverride && (
                                                <span
                                                    className="ml-1 text-text-muted"
                                                    title={`Original: ${it.name}`}
                                                >
                                                    *
                                                </span>
                                            )}
                                        </button>
                                    )}
                                    {it.team?.name && (
                                        <div className="text-[0.65rem] text-text-muted truncate px-1 -mx-1">
                                            {it.team.name}
                                        </div>
                                    )}
                                </div>
                                {!list.isLocked && (
                                    <button
                                        type="button"
                                        onClick={() => onRemoveItem(it.id)}
                                        className="text-xs text-text-muted hover:text-destructive"
                                        aria-label={`Remove ${it.displayName}`}
                                    >
                                        ×
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <Label>Tiers ({draftTiers.length})</Label>
                    <span className="text-xs text-text-muted">
                        Min {MIN_TIERS} · Max {MAX_TIERS}
                    </span>
                </div>
                <ul className="flex flex-col gap-2">
                    {draftTiers.map((tier, idx) => {
                        const color = colorForTierIndex(idx);
                        return (
                            <li key={tier.key} className="flex items-center gap-3">
                                <span
                                    className={`inline-flex items-center justify-center w-9 h-9 rounded font-extrabold ${color.bg} ${color.text}`}
                                    aria-hidden
                                >
                                    {idx + 1}
                                </span>
                                <Input
                                    value={tier.name}
                                    onChange={(e) => renameTier(idx, e.target.value)}
                                    maxLength={32}
                                    aria-label={`Tier ${idx + 1} name`}
                                />
                            </li>
                        );
                    })}
                </ul>
                <div className="flex gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={addTier}
                        disabled={draftTiers.length >= MAX_TIERS}
                        aria-label="Add tier at bottom"
                        title="Add tier at bottom"
                    >
                        +
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={removeBottomTier}
                        disabled={draftTiers.length <= MIN_TIERS}
                        aria-label="Remove bottom tier"
                        title="Remove bottom tier"
                    >
                        −
                    </Button>
                </div>
            </section>

            <section className="flex items-center justify-between gap-3">
                <div className="flex-1">
                    <Label htmlFor="config-show-team-names">Show team names</Label>
                    <p className="text-xs text-text-muted">
                        When on, the team name appears under each item thumbnail.
                    </p>
                </div>
                <Switch
                    id="config-show-team-names"
                    checked={list.displayConfig.showTeamNames}
                    onCheckedChange={(v) => void patchDisplayConfig({ showTeamNames: v })}
                />
            </section>

            <section className="flex items-center justify-between gap-3">
                <div className="flex-1">
                    <Label htmlFor="config-show-team-logos">Show team logos</Label>
                    <p className="text-xs text-text-muted">
                        When on, the team crest renders as a small badge on each item thumbnail.
                    </p>
                </div>
                <Switch
                    id="config-show-team-logos"
                    checked={list.displayConfig.showTeamLogos}
                    onCheckedChange={(v) => void patchDisplayConfig({ showTeamLogos: v })}
                />
            </section>

            <section className="flex items-center justify-between gap-3">
                <div className="flex-1">
                    <Label htmlFor="config-locked">Locked</Label>
                    <p className="text-xs text-text-muted">
                        When locked, you can&apos;t edit items, tiers, or settings until you flip
                        this back.
                    </p>
                </div>
                <Switch
                    id="config-locked"
                    checked={list.isLocked}
                    onCheckedChange={(v) => void toggleLocked(v)}
                />
            </section>

            <section className="flex flex-col gap-2 border-t border-glass-border pt-6">
                <h3 className="text-sm font-semibold text-destructive">Danger zone</h3>
                <Button
                    type="button"
                    variant="destructive"
                    onClick={handleDelete}
                    className="self-start"
                >
                    Delete this tier list
                </Button>
            </section>

            <div>
                <Button type="button" variant="outline" onClick={onBack}>
                    ← Back to list
                </Button>
            </div>
        </div>
    );
};

export default TierListConfigView;
