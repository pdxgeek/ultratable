import type { AppAbility } from '../auth/abilities';
import type {
    TierListOverviewRow,
    TierRankableTypeRef,
} from '../components/tier-lists/queries';

import React, { useState } from 'react';
import { subject } from '@casl/ability';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from 'urql';

import { Can, useAbility } from '../auth/abilities';
import SectionNav, { type SectionItem } from '../components/predictions/SectionNav';
import NewTierListDialog from '../components/tier-lists/NewTierListDialog';
import {
    DELETE_TIER_LIST_MUTATION,
    MY_TIER_LISTS_QUERY,
    TIER_RANKABLE_TYPES_QUERY,
} from '../components/tier-lists/queries';
import { useLeague } from '../context/LeagueContext';

type RankingsSection = 'PROJECTED_FINISH' | 'TIER_LISTS';

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

const TierListsPage: React.FC = () => {
    const { activeLeague, activeSeason, isLoading: leagueLoading } = useLeague();
    const ability = useAbility<AppAbility>();
    const navigate = useNavigate();
    const seasonId = activeSeason?.id ?? '';

    const [showNewDialog, setShowNewDialog] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const [listsResult, refetchLists] = useQuery<{ myTierLists: TierListOverviewRow[] }>({
        query: MY_TIER_LISTS_QUERY,
        variables: { seasonId },
        pause: !seasonId,
        requestPolicy: 'cache-and-network',
    });

    const [typesResult] = useQuery<{ tierRankableTypes: TierRankableTypeRef[] }>({
        query: TIER_RANKABLE_TYPES_QUERY,
        pause: !ability.can('create', 'TierList'),
    });

    const [, deleteList] = useMutation<{ deleteTierList: string }, { id: string }>(
        DELETE_TIER_LIST_MUTATION,
    );

    if (leagueLoading) {
        return (
            <div className="text-center py-24">
                <p className="text-text-secondary">Loading data…</p>
            </div>
        );
    }

    if (!activeSeason) {
        return (
            <div className="text-center py-24">
                <p className="text-text-secondary">Please select a league and season.</p>
            </div>
        );
    }

    const navItems: SectionItem<RankingsSection>[] = [
        { id: 'PROJECTED_FINISH', label: 'Projected Finish' },
    ];
    if (ability.can('create', 'TierList')) {
        navItems.push({ id: 'TIER_LISTS', label: 'Tier Lists' });
    }
    const onSelectSection = (id: RankingsSection) => {
        if (id === 'PROJECTED_FINISH') navigate('/predictions');
    };

    const lists = listsResult.data?.myTierLists ?? [];
    const recipes = typesResult.data?.tierRankableTypes ?? [];

    const handleDelete = async (id: string) => {
        setDeleteError(null);
        const result = await deleteList({ id });
        if (result.error) {
            setDeleteError(result.error.graphQLErrors[0]?.message ?? result.error.message);
            return;
        }
        refetchLists({ requestPolicy: 'network-only' });
    };

    return (
        <div className="max-w-[1100px] mx-auto pt-5 pb-10">
            <Link
                to="/"
                className="inline-block text-sm text-text-muted no-underline mb-6 transition-colors hover:text-accent-blue"
            >
                ← Back to Tables
            </Link>
            <header className="mb-8">
                <h1 className="text-[2rem] max-sm:text-[1.6rem] font-extrabold tracking-tight">
                    Predictions &amp; Rankings
                </h1>
                <p className="text-sm text-text-muted">
                    {activeLeague?.name ?? 'League'} — current season
                </p>
            </header>
            <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-8 items-start">
                <SectionNav
                    items={navItems}
                    selected="TIER_LISTS"
                    onSelect={onSelectSection}
                    ariaLabel="Predictions and rankings sections"
                />
                <section>
                    <div className="flex items-center justify-between mb-5">
                        <h2 className="text-lg font-semibold">My Tier Lists</h2>
                        <Can I="create" a="TierList">
                            <button
                                type="button"
                                onClick={() => setShowNewDialog(true)}
                                className="px-4 py-1.5 rounded-[20px] border border-accent-green text-[0.85rem] font-semibold bg-accent-green text-white hover:brightness-110"
                            >
                                + New Tier List
                            </button>
                        </Can>
                    </div>
                    {deleteError && (
                        <div className="mb-4 rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
                            {deleteError}
                        </div>
                    )}
                    {listsResult.fetching && lists.length === 0 ? (
                        <p className="text-sm text-text-secondary">Loading tier lists…</p>
                    ) : lists.length === 0 ? (
                        <div className="rounded-lg border border-glass-border bg-glass-bg p-8 text-center">
                            <p className="text-sm text-text-secondary mb-3">
                                You don&apos;t have any tier lists this season yet.
                            </p>
                            <Can I="create" a="TierList">
                                <button
                                    type="button"
                                    onClick={() => setShowNewDialog(true)}
                                    className="px-4 py-1.5 rounded-[20px] border border-accent-green text-[0.85rem] font-semibold bg-accent-green text-white hover:brightness-110"
                                >
                                    Create your first tier list
                                </button>
                            </Can>
                        </div>
                    ) : (
                        <ul className="flex flex-col gap-2">
                            {lists.map((list) => {
                                const canDelete = ability.can(
                                    'delete',
                                    subject('TierList', { userId: list.userId }),
                                );
                                return (
                                    <li
                                        key={list.id}
                                        className="rounded-lg border border-glass-border bg-glass-bg px-4 py-3 flex items-center justify-between gap-4"
                                    >
                                        <Link
                                            to={`/tier-lists/${list.id}`}
                                            className="flex-1 min-w-0 no-underline text-foreground hover:text-accent-blue"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold truncate">
                                                    {list.title}
                                                </span>
                                                {list.isLocked && (
                                                    <span
                                                        className="text-[0.65rem] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                                                        title="Locked — read only until unlocked"
                                                    >
                                                        Locked
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs text-text-muted mt-0.5 flex gap-3">
                                                <span>
                                                    {list.tierRankableType?.name ?? 'Unknown'}
                                                </span>
                                                <span>·</span>
                                                <span>{list.items.length} items</span>
                                                <span>·</span>
                                                <span>Edited {formatRelative(list.updatedAt)}</span>
                                            </div>
                                        </Link>
                                        {canDelete && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (
                                                        window.confirm(
                                                            `Delete "${list.title}"? This can't be undone from the app.`,
                                                        )
                                                    ) {
                                                        void handleDelete(list.id);
                                                    }
                                                }}
                                                className="text-xs text-text-muted hover:text-destructive transition-colors"
                                            >
                                                Delete
                                            </button>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>
            </div>
            {showNewDialog && (
                <NewTierListDialog
                    seasonId={seasonId}
                    recipes={recipes}
                    onClose={() => setShowNewDialog(false)}
                    onCreated={(id) => {
                        setShowNewDialog(false);
                        navigate(`/tier-lists/${id}`);
                    }}
                />
            )}
        </div>
    );
};

export default TierListsPage;
