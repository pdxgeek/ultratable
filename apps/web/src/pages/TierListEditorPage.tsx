import type { TierListEditorRow } from '../components/tier-lists/queries';

import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery } from 'urql';

import TierListBoard from '../components/tier-lists/TierListBoard';
import TierListConfigView from '../components/tier-lists/TierListConfigView';
import TierListEditorHeader from '../components/tier-lists/TierListEditorHeader';
import OverrideEditorPopover from '../components/tier-lists/OverrideEditorPopover';
import PoolAddDrawer from '../components/tier-lists/PoolAddDrawer';
import {
    MOVE_TIER_RANKABLE_ITEM_MUTATION,
    REMOVE_TIER_RANKABLE_ITEM_MUTATION,
    TIER_LIST_QUERY,
    UPDATE_TIER_LIST_TITLE_MUTATION,
} from '../components/tier-lists/queries';

type EditorView = 'board' | 'config';

const TierListEditorPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [view, setView] = useState<EditorView>('board');
    const [showAddDrawer, setShowAddDrawer] = useState(false);
    const [editingItemId, setEditingItemId] = useState<string | null>(null);

    const [result, refetch] = useQuery<{ tierList: TierListEditorRow | null }>({
        query: TIER_LIST_QUERY,
        variables: { id: id ?? '' },
        pause: !id,
        requestPolicy: 'cache-and-network',
    });

    const list = result.data?.tierList ?? null;

    const [, updateTitleMutation] = useMutation(UPDATE_TIER_LIST_TITLE_MUTATION);
    const [, moveItemMutation] = useMutation(MOVE_TIER_RANKABLE_ITEM_MUTATION);
    const [, removeItemMutation] = useMutation(REMOVE_TIER_RANKABLE_ITEM_MUTATION);

    const editingItem = useMemo(
        () => list?.items.find((it) => it.id === editingItemId) ?? null,
        [editingItemId, list],
    );

    if (!id) {
        return (
            <div className="text-center py-24">
                <p className="text-text-secondary">Missing tier list id.</p>
            </div>
        );
    }

    if (result.fetching && !list) {
        return (
            <div className="text-center py-24">
                <p className="text-text-secondary">Loading tier list…</p>
            </div>
        );
    }

    if (!list) {
        return (
            <div className="text-center py-24">
                <p className="text-text-secondary mb-3">
                    Tier list not found — it may have been deleted.
                </p>
                <Link
                    to="/tier-lists"
                    className="text-sm text-accent-blue no-underline hover:underline"
                >
                    ← Back to Tier Lists
                </Link>
            </div>
        );
    }

    const refetchList = () => refetch({ requestPolicy: 'network-only' });

    const handleRenameTitle = async (title: string) => {
        await updateTitleMutation({ id: list.id, title });
    };

    const handleMove = async (itemId: string, tierKey: string | null, position: number) => {
        await moveItemMutation({ itemId, tierKey, position });
        refetchList();
    };

    const handleRemove = async (itemId: string) => {
        await removeItemMutation({ itemId });
        refetchList();
    };

    return (
        <div className="max-w-[1100px] mx-auto pt-5 pb-10">
            <Link
                to="/tier-lists"
                className="inline-block text-sm text-text-muted no-underline mb-6 transition-colors hover:text-accent-blue"
            >
                ← Back to Tier Lists
            </Link>
            <TierListEditorHeader
                list={list}
                view={view}
                onOpenConfig={() => setView('config')}
                onBackToBoard={() => setView('board')}
                onRenameTitle={handleRenameTitle}
                onToggleLock={refetchList}
            />
            {view === 'config' ? (
                <TierListConfigView
                    list={list}
                    onChanged={refetchList}
                    onBack={() => setView('board')}
                    onOpenAddDrawer={() => setShowAddDrawer(true)}
                    onRemoveItem={handleRemove}
                />
            ) : (
                <TierListBoard
                    list={list}
                    onMoveItem={handleMove}
                    onRemoveItem={handleRemove}
                    onOpenItemEditor={(itemId) => setEditingItemId(itemId)}
                />
            )}
            {showAddDrawer && (
                <PoolAddDrawer
                    list={list}
                    onClose={() => setShowAddDrawer(false)}
                    onAdded={() => {
                        refetchList();
                    }}
                />
            )}
            {editingItem && (
                <OverrideEditorPopover
                    item={editingItem}
                    isLocked={list.isLocked}
                    onClose={() => setEditingItemId(null)}
                    onSaved={() => {
                        setEditingItemId(null);
                        refetchList();
                    }}
                />
            )}
        </div>
    );
};

export default TierListEditorPage;
