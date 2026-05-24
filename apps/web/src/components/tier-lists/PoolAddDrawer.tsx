import type { TierListEditorRow, TierRankableItemCandidate } from './queries';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery } from 'urql';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
    ADD_TIER_RANKABLE_ITEM_MUTATION,
    TIER_RANKABLE_ITEM_CANDIDATES_QUERY,
} from './queries';

interface Props {
    list: TierListEditorRow;
    onClose: () => void;
    onAdded: () => void;
}

const PoolAddDrawer: React.FC<Props> = ({ list, onClose, onAdded }) => {
    const recipeId = list.tierRankableTypeId;
    const [query, setQuery] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busyKey, setBusyKey] = useState<string | null>(null);

    const [result] = useQuery<{
        tierRankableItemCandidates: TierRankableItemCandidate[];
    }>({
        query: TIER_RANKABLE_ITEM_CANDIDATES_QUERY,
        variables: { seasonId: list.seasonId, tierRankableTypeId: recipeId },
        requestPolicy: 'cache-and-network',
    });

    const [addState, addMutation] = useMutation<
        { addTierRankableItem: { id: string; naturalKey: string } },
        {
            input: {
                tierListId: string;
                tierRankableTypeId: string;
                naturalKey: string;
                name: string;
                imageUrl: string | null;
                teamId: string | null;
                sourceType: string | null;
                sourceId: string | null;
                sourcePath: unknown | null;
            };
        }
    >(ADD_TIER_RANKABLE_ITEM_MUTATION);

    // Existing pool / tier items already in this list — the drawer marks
    // these "Already added" rather than hiding them, so users can see
    // they're already represented and can re-add to restore a removed
    // item with overrides preserved.
    const existingNaturalKeys = useMemo(
        () => new Set(list.items.map((it) => it.naturalKey)),
        [list.items],
    );

    const loading = result.fetching && !result.data;
    const fetchError = result.error?.graphQLErrors[0]?.message ?? result.error?.message ?? null;

    const candidates = useMemo(
        () => result.data?.tierRankableItemCandidates ?? [],
        [result.data?.tierRankableItemCandidates],
    );

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (q.length === 0) return candidates;
        return candidates.filter(
            (c) =>
                c.name.toLowerCase().includes(q) ||
                (c.team?.name.toLowerCase().includes(q) ?? false) ||
                (c.subtitle?.toLowerCase().includes(q) ?? false),
        );
    }, [candidates, query]);

    const inputForCandidate = (cand: TierRankableItemCandidate) => ({
        tierListId: list.id,
        tierRankableTypeId: cand.tierRankableTypeId,
        naturalKey: cand.naturalKey,
        name: cand.name,
        imageUrl: cand.imageUrl,
        teamId: cand.teamId,
        sourceType: cand.sourceType,
        sourceId: cand.sourceId,
        sourcePath: cand.sourcePath,
    });

    const handleAdd = async (cand: TierRankableItemCandidate) => {
        setError(null);
        setBusyKey(cand.naturalKey);
        const result = await addMutation({ input: inputForCandidate(cand) });
        setBusyKey(null);
        if (result.error) {
            setError(result.error.graphQLErrors[0]?.message ?? result.error.message);
            return;
        }
        onAdded();
    };

    const [addingAll, setAddingAll] = useState(false);

    const handleAddAll = async () => {
        if (addingAll || filtered.length === 0) return;
        setError(null);
        setAddingAll(true);
        // Fire in parallel — server's addOrRestore is idempotent on
        // `(tierListId, naturalKey)` so duplicates collapse, and the
        // item cap surfaces as a typed error on whichever calls cross
        // it. Collect the first error to surface so the user sees
        // something specific (e.g. ITEM_LIMIT_REACHED).
        const results = await Promise.all(
            filtered.map((cand) =>
                addMutation({ input: inputForCandidate(cand) }),
            ),
        );
        setAddingAll(false);
        const firstError = results.find((r) => r.error)?.error;
        if (firstError) {
            setError(
                firstError.graphQLErrors[0]?.message ?? firstError.message,
            );
        }
        onAdded();
    };

    const secondaryLine = (cand: TierRankableItemCandidate): string | null => {
        // Coach candidates → team name. Venue candidates → subtitle
        // (city + capacity). Recipes can populate either; we just show
        // whichever is present without branching on recipe id.
        if (cand.team?.name) return cand.team.name;
        return cand.subtitle;
    };

    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>
                        Add {list.tierRankableType?.name?.toLowerCase() ?? 'items'} to pool
                    </DialogTitle>
                    <DialogDescription>
                        Click an item to add it to your pool. Items you previously removed will be
                        restored if you add them again.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex items-center gap-2">
                    <Input
                        autoFocus
                        placeholder="Search…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="flex-1"
                    />
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => void handleAddAll()}
                        disabled={addingAll || loading || filtered.length === 0}
                        title={
                            query.trim().length > 0
                                ? `Add all ${filtered.length} matches`
                                : `Add all ${filtered.length}`
                        }
                    >
                        {addingAll ? 'Adding…' : `Add all (${filtered.length})`}
                    </Button>
                </div>
                {(error || fetchError) && (
                    <p className="text-sm text-destructive" role="alert">
                        {error ?? fetchError}
                    </p>
                )}
                <div className="max-h-[420px] overflow-y-auto rounded-md border border-glass-border">
                    {loading ? (
                        <p className="p-4 text-sm text-text-secondary">Loading candidates…</p>
                    ) : filtered.length === 0 ? (
                        <p className="p-4 text-sm text-text-secondary">No matches.</p>
                    ) : (
                        <ul className="divide-y divide-glass-border">
                            {filtered.map((cand) => {
                                const already = existingNaturalKeys.has(cand.naturalKey);
                                const busy = busyKey === cand.naturalKey && addState.fetching;
                                const secondary = secondaryLine(cand);
                                return (
                                    <li
                                        key={cand.naturalKey}
                                        className="flex items-center gap-3 px-3 py-2 hover:bg-muted/40"
                                    >
                                        <div className="w-10 h-10 flex-shrink-0 rounded overflow-hidden bg-muted">
                                            {cand.imageUrl ? (
                                                <img
                                                    src={cand.imageUrl}
                                                    alt=""
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <span className="flex items-center justify-center w-full h-full text-xs text-text-muted">
                                                    {cand.name.slice(0, 2).toUpperCase()}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium truncate">
                                                {cand.name}
                                            </div>
                                            {secondary && (
                                                <div className="text-xs text-text-muted truncate">
                                                    {secondary}
                                                </div>
                                            )}
                                        </div>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={already ? 'outline' : 'default'}
                                            disabled={busy}
                                            onClick={() => void handleAdd(cand)}
                                        >
                                            {busy
                                                ? 'Adding…'
                                                : already
                                                  ? 'Re-add / restore'
                                                  : 'Add'}
                                        </Button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose}>
                        Done
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default PoolAddDrawer;
