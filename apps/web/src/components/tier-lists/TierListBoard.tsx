import type { TierListEditorRow, TierRankableItem } from './queries';

import React, { useMemo, useState } from 'react';
import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
    PointerSensor,
    TouchSensor,
    closestCenter,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/core';

import TierItemCard from './TierItemCard';
import { colorForTierIndex } from './tierColors';

interface Props {
    list: TierListEditorRow;
    onMoveItem: (itemId: string, tierKey: string | null, position: number) => void;
    onRemoveItem: (itemId: string) => void;
    onOpenItemEditor: (itemId: string) => void;
    onOpenAddDrawer: () => void;
}

/** Bucket items by their tierKey. `null` key = pool. */
function bucketItems(
    items: TierRankableItem[],
): { pool: TierRankableItem[]; byTier: Map<string, TierRankableItem[]> } {
    const pool: TierRankableItem[] = [];
    const byTier = new Map<string, TierRankableItem[]>();
    for (const it of items) {
        if (it.tierKey === null) pool.push(it);
        else {
            const bucket = byTier.get(it.tierKey) ?? [];
            bucket.push(it);
            byTier.set(it.tierKey, bucket);
        }
    }
    const sortByPos = (a: TierRankableItem, b: TierRankableItem) => a.position - b.position;
    pool.sort(sortByPos);
    for (const bucket of byTier.values()) bucket.sort(sortByPos);
    return { pool, byTier };
}

/**
 * Compute the new `position` float for a drop. Insert at the end of the
 * target row if dropped on the row itself, or insert by midpoint between
 * neighbours if dropped between items. The simple end-append covers the
 * common case (drag from pool into a tier); a full insert-between-items
 * implementation can land in a follow-up.
 */
function nextPosition(target: TierRankableItem[]): number {
    if (target.length === 0) return 1.0;
    const maxPos = target[target.length - 1].position;
    return maxPos + 1.0;
}

const POOL_DROP_ID = '__pool__';
const tierDropId = (key: string) => `tier:${key}`;

function DraggableItem({
    item,
    disabled,
    children,
}: {
    item: TierRankableItem;
    disabled: boolean;
    children: React.ReactNode;
}) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: item.id,
        disabled,
    });
    return (
        <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            className={isDragging ? 'opacity-30' : undefined}
            style={{ touchAction: 'none' }}
        >
            {children}
        </div>
    );
}

function DropRow({
    id,
    children,
    className,
}: {
    id: string;
    children: React.ReactNode;
    className?: string;
}) {
    const { setNodeRef, isOver } = useDroppable({ id });
    return (
        <div
            ref={setNodeRef}
            className={`${className ?? ''} ${isOver ? 'bg-accent-blue/10' : ''}`}
        >
            {children}
        </div>
    );
}

const TierListBoard: React.FC<Props> = ({
    list,
    onMoveItem,
    onRemoveItem,
    onOpenItemEditor,
    onOpenAddDrawer,
}) => {
    const { pool, byTier } = useMemo(() => bucketItems(list.items), [list.items]);
    const [activeId, setActiveId] = useState<string | null>(null);

    const sensors = useSensors(
        // 5px activation gap lets the user click the card to edit without
        // triggering a drag every time.
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
        useSensor(KeyboardSensor),
    );

    const activeItem = useMemo(
        () => list.items.find((it) => it.id === activeId) ?? null,
        [activeId, list.items],
    );

    const handleDragStart = (e: DragStartEvent) => {
        setActiveId(String(e.active.id));
    };

    const handleDragEnd = (e: DragEndEvent) => {
        setActiveId(null);
        const { active, over } = e;
        if (!over) return;
        const overId = String(over.id);
        const itemId = String(active.id);
        const item = list.items.find((i) => i.id === itemId);
        if (!item) return;

        if (overId === POOL_DROP_ID) {
            if (item.tierKey === null) return; // no-op
            const pos = nextPosition(pool);
            onMoveItem(itemId, null, pos);
            return;
        }
        if (overId.startsWith('tier:')) {
            const tierKey = overId.slice('tier:'.length);
            if (item.tierKey === tierKey) return; // no-op (within-tier reorder TBD)
            const target = byTier.get(tierKey) ?? [];
            const pos = nextPosition(target);
            onMoveItem(itemId, tierKey, pos);
        }
    };

    const interactive = !list.isLocked;

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div className="flex flex-col gap-2 rounded-lg border border-glass-border overflow-hidden">
                {list.tiers.map((tier, idx) => {
                    const color = colorForTierIndex(idx);
                    const items = byTier.get(tier.key) ?? [];
                    return (
                        <div key={tier.key} className="flex bg-glass-bg/40">
                            <div
                                className={`flex w-16 min-h-[120px] items-center justify-center font-extrabold text-lg ${color.bg} ${color.text}`}
                                title={tier.name}
                            >
                                {tier.name}
                            </div>
                            <DropRow
                                id={tierDropId(tier.key)}
                                className="flex-1 min-h-[120px] p-3 flex flex-wrap gap-3 transition-colors"
                            >
                                {items.map((it) => (
                                    <DraggableItem key={it.id} item={it} disabled={!interactive}>
                                        <TierItemCard
                                            item={it}
                                            showTeamName={list.displayConfig.showTeamNames}
                                            isLocked={list.isLocked}
                                            onRemove={() => onRemoveItem(it.id)}
                                            onEdit={() => onOpenItemEditor(it.id)}
                                        />
                                    </DraggableItem>
                                ))}
                            </DropRow>
                        </div>
                    );
                })}
            </div>

            <div className="mt-6">
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
                        Pool
                    </h2>
                    {interactive && (
                        <button
                            type="button"
                            onClick={onOpenAddDrawer}
                            className="px-3 py-1.5 rounded-[20px] border border-accent-green text-xs font-semibold bg-accent-green text-white hover:brightness-110"
                        >
                            + Add items
                        </button>
                    )}
                </div>
                <DropRow
                    id={POOL_DROP_ID}
                    className="rounded-lg border border-dashed border-glass-border bg-glass-bg/40 min-h-[120px] p-3 flex flex-wrap gap-3 transition-colors"
                >
                    {pool.length === 0 ? (
                        <p className="text-xs text-text-muted">
                            Pool is empty. Click <strong>+ Add items</strong> to search.
                        </p>
                    ) : (
                        pool.map((it) => (
                            <DraggableItem key={it.id} item={it} disabled={!interactive}>
                                <TierItemCard
                                    item={it}
                                    showTeamName={list.displayConfig.showTeamNames}
                                    isLocked={list.isLocked}
                                    onRemove={() => onRemoveItem(it.id)}
                                    onEdit={() => onOpenItemEditor(it.id)}
                                />
                            </DraggableItem>
                        ))
                    )}
                </DropRow>
            </div>

            <DragOverlay>
                {activeItem && (
                    <TierItemCard
                        item={activeItem}
                        showTeamName={list.displayConfig.showTeamNames}
                        isLocked={false}
                        isOverlay
                    />
                )}
            </DragOverlay>
        </DndContext>
    );
};

export default TierListBoard;
