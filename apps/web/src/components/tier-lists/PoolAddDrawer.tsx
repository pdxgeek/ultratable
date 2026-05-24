import type {
    CoachDrawerFixture,
    CoachDrawerTeam,
    TierListEditorRow,
    VenueDrawerVenue,
} from './queries';
import type { AddPoolItemInput } from './recipeClient';

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
    COACH_DRAWER_SOURCES_QUERY,
    VENUE_DRAWER_SOURCES_QUERY,
} from './queries';
import { buildCoachCandidates, buildVenueCandidates } from './recipeClient';

interface Props {
    list: TierListEditorRow;
    onClose: () => void;
    onAdded: () => void;
}

interface CandidateView {
    key: string;
    primary: string;
    secondary: string | null;
    imageUrl: string | null;
    input: AddPoolItemInput;
}

const PoolAddDrawer: React.FC<Props> = ({ list, onClose, onAdded }) => {
    const recipeId = list.tierRankableTypeId;
    const [query, setQuery] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busyKey, setBusyKey] = useState<string | null>(null);

    const [coachResult] = useQuery<{
        fixtures: CoachDrawerFixture[];
        teams: CoachDrawerTeam[];
    }>({
        query: COACH_DRAWER_SOURCES_QUERY,
        variables: { seasonId: list.seasonId },
        pause: recipeId !== 'coach',
        requestPolicy: 'cache-and-network',
    });

    const [venueResult] = useQuery<{ venues: VenueDrawerVenue[] }>({
        query: VENUE_DRAWER_SOURCES_QUERY,
        variables: { seasonId: list.seasonId },
        pause: recipeId !== 'venue',
        requestPolicy: 'cache-and-network',
    });

    const [addState, addMutation] = useMutation<
        { addTierRankableItem: { id: string; naturalKey: string } },
        { input: AddPoolItemInput & { tierListId: string } }
    >(ADD_TIER_RANKABLE_ITEM_MUTATION);

    // Existing pool / tier items already in this list — the drawer marks
    // these "Already added" rather than hiding them, so users can see
    // they're already represented.
    const existingNaturalKeys = useMemo(
        () => new Set(list.items.map((it) => it.naturalKey)),
        [list.items],
    );

    const candidates: CandidateView[] = useMemo(() => {
        if (recipeId === 'coach') {
            return buildCoachCandidates(
                coachResult.data?.fixtures ?? [],
                coachResult.data?.teams ?? [],
            ).map((c) => ({
                key: c.naturalKey,
                primary: c.name,
                secondary: c.teamName,
                imageUrl: c.photo,
                input: {
                    tierRankableTypeId: c.tierRankableTypeId,
                    naturalKey: c.naturalKey,
                    name: c.name,
                    imageUrl: c.imageUrl,
                    teamId: c.teamId,
                    sourceType: c.sourceType,
                    sourceId: c.sourceId,
                    sourcePath: c.sourcePath,
                },
            }));
        }
        if (recipeId === 'venue') {
            return buildVenueCandidates(venueResult.data?.venues ?? []).map((v) => ({
                key: v.naturalKey,
                primary: v.name,
                secondary:
                    v.city && v.capacity
                        ? `${v.city} · ${v.capacity.toLocaleString()} seats`
                        : (v.city ?? (v.capacity ? `${v.capacity.toLocaleString()} seats` : null)),
                imageUrl: v.imageUrl,
                input: {
                    tierRankableTypeId: v.tierRankableTypeId,
                    naturalKey: v.naturalKey,
                    name: v.name,
                    imageUrl: v.imageUrl,
                    teamId: v.teamId,
                    sourceType: v.sourceType,
                    sourceId: v.sourceId,
                    sourcePath: v.sourcePath,
                },
            }));
        }
        return [];
    }, [
        recipeId,
        coachResult.data?.fixtures,
        coachResult.data?.teams,
        venueResult.data?.venues,
    ]);

    const filtered = useMemo(() => {
        if (query.trim().length === 0) return candidates;
        const q = query.toLowerCase();
        return candidates.filter(
            (c) =>
                c.primary.toLowerCase().includes(q) ||
                (c.secondary?.toLowerCase().includes(q) ?? false),
        );
    }, [candidates, query]);

    const loading =
        (recipeId === 'coach' && coachResult.fetching && !coachResult.data) ||
        (recipeId === 'venue' && venueResult.fetching && !venueResult.data);

    const handleAdd = async (cand: CandidateView) => {
        setError(null);
        setBusyKey(cand.key);
        const result = await addMutation({
            input: { ...cand.input, tierListId: list.id },
        });
        setBusyKey(null);
        if (result.error) {
            setError(result.error.graphQLErrors[0]?.message ?? result.error.message);
            return;
        }
        onAdded();
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
                <Input
                    autoFocus
                    placeholder="Search…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />
                {error && (
                    <p className="text-sm text-destructive" role="alert">
                        {error}
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
                                const already = existingNaturalKeys.has(cand.key);
                                const busy = busyKey === cand.key && addState.fetching;
                                return (
                                    <li
                                        key={cand.key}
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
                                                    {cand.primary.slice(0, 2).toUpperCase()}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium truncate">
                                                {cand.primary}
                                            </div>
                                            {cand.secondary && (
                                                <div className="text-xs text-text-muted truncate">
                                                    {cand.secondary}
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
