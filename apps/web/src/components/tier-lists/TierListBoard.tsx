import type { TierListEditorRow, TierRankableItem } from './queries';

import React, { useMemo, useState } from 'react';
import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
    PointerSensor,
    TouchSensor,
    closestCenter,
    useDroppable,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    horizontalListSortingStrategy,
    sortableKeyboardCoordinates,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import TierItemCard from './TierItemCard';
import { colorForTierIndex } from './tierColors';

interface Props {
    list: TierListEditorRow;
    onMoveItem: (itemId: string, tierKey: string | null, position: number) => void;
    onRemoveItem: (itemId: string) => void;
    onOpenItemEditor: (itemId: string) => void;
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
 * Compute the float `position` to insert an item at `targetIndex` in a
 * row whose items are sorted ascending by position. `targetIndex` is the
 * destination slot in the row AFTER the active item has been removed
 * (so it's always 0..siblings.length).
 *
 * - Insert at the head: position = first.position - 1.0
 * - Insert at the tail: position = last.position + 1.0
 * - Insert between A and B: position = midpoint(A.position, B.position)
 * - Empty row: 1.0 (the canonical first slot)
 *
 * Float positions let drags rewrite a single row's `position` value
 * rather than re-numbering every sibling.
 */
function positionForInsert(siblings: TierRankableItem[], targetIndex: number): number {
    if (siblings.length === 0) return 1.0;
    if (targetIndex <= 0) return siblings[0].position - 1.0;
    if (targetIndex >= siblings.length) return siblings[siblings.length - 1].position + 1.0;
    const before = siblings[targetIndex - 1].position;
    const after = siblings[targetIndex].position;
    return (before + after) / 2;
}

const POOL_DROP_ID = '__pool__';
const tierDropId = (key: string) => `tier:${key}`;

interface SortableItemProps {
    item: TierRankableItem;
    disabled: boolean;
    children: (handleProps: {
        ref: (node: HTMLElement | null) => void;
        style: React.CSSProperties;
        isDragging: boolean;
        attributes: ReturnType<typeof useSortable>['attributes'];
        listeners: ReturnType<typeof useSortable>['listeners'];
    }) => React.ReactNode;
}

function SortableItem({ item, disabled, children }: SortableItemProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({ id: item.id, disabled });
    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        touchAction: 'none',
        opacity: isDragging ? 0.3 : undefined,
    };
    return <>{children({ ref: setNodeRef, style, isDragging, attributes, listeners })}</>;
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
}) => {
    const { pool, byTier } = useMemo(() => bucketItems(list.items), [list.items]);
    const [activeId, setActiveId] = useState<string | null>(null);

    const sensors = useSensors(
        // 5px activation gap lets the user click the card to edit without
        // triggering a drag every time.
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const itemsById = useMemo(() => new Map(list.items.map((i) => [i.id, i])), [list.items]);
    const activeItem = activeId ? (itemsById.get(activeId) ?? null) : null;

    const handleDragStart = (e: DragStartEvent) => {
        setActiveId(String(e.active.id));
    };

    const handleDragEnd = (e: DragEndEvent) => {
        setActiveId(null);
        const { active, over } = e;
        if (!over) return;
        const itemId = String(active.id);
        const item = itemsById.get(itemId);
        if (!item) return;

        const overId = String(over.id);

        // Resolve the destination tier (null = pool) and the row's
        // siblings sorted by position. Two cases:
        //   1. Drop on a row container ("__pool__" / "tier:X") — append
        //      to that row.
        //   2. Drop on another item — insert at that item's position.
        let targetTierKey: string | null;
        let siblingsBeforeRemove: TierRankableItem[];
        let insertIndex: number;

        if (overId === POOL_DROP_ID) {
            targetTierKey = null;
            siblingsBeforeRemove = pool;
            insertIndex = pool.length;
        } else if (overId.startsWith('tier:')) {
            targetTierKey = overId.slice('tier:'.length);
            siblingsBeforeRemove = byTier.get(targetTierKey) ?? [];
            insertIndex = siblingsBeforeRemove.length;
        } else {
            // Dropped on another item — pick its row + index.
            const overItem = itemsById.get(overId);
            if (!overItem) return;
            targetTierKey = overItem.tierKey;
            siblingsBeforeRemove =
                targetTierKey === null
                    ? pool
                    : (byTier.get(targetTierKey) ?? []);
            insertIndex = siblingsBeforeRemove.findIndex((i) => i.id === overItem.id);
            if (insertIndex < 0) insertIndex = siblingsBeforeRemove.length;
        }

        // For position math we need siblings as they'd look AFTER the
        // active item is removed from its current row. Same-row drags
        // also need their target index adjusted: if the active item
        // was at i < insertIndex in the original list, the index in
        // the trimmed list shifts down by one.
        const siblings = siblingsBeforeRemove.filter((i) => i.id !== item.id);
        const originalIndex = siblingsBeforeRemove.findIndex((i) => i.id === item.id);
        let adjustedIndex = insertIndex;
        if (item.tierKey === targetTierKey && originalIndex >= 0 && originalIndex < insertIndex) {
            adjustedIndex -= 1;
        }

        // No-op: dropped on its own current slot.
        if (item.tierKey === targetTierKey && originalIndex === adjustedIndex) {
            return;
        }

        const nextPosition = positionForInsert(siblings, adjustedIndex);
        onMoveItem(item.id, targetTierKey, nextPosition);
    };

    const interactive = !list.isLocked;

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}
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
                                <SortableContext
                                    items={items.map((i) => i.id)}
                                    strategy={horizontalListSortingStrategy}
                                >
                                    {items.map((it) => (
                                        <SortableItem
                                            key={it.id}
                                            item={it}
                                            disabled={!interactive}
                                        >
                                            {({ ref, style, attributes, listeners }) => (
                                                <div
                                                    ref={ref}
                                                    style={style}
                                                    {...attributes}
                                                    {...listeners}
                                                >
                                                    <TierItemCard
                                                        item={it}
                                                        showTeamName={
                                                            list.displayConfig.showTeamNames
                                                        }
                                                        showTeamLogo={
                                                            list.displayConfig.showTeamLogos
                                                        }
                                                        isLocked={list.isLocked}
                                                        onRemove={() => onRemoveItem(it.id)}
                                                        onEdit={() => onOpenItemEditor(it.id)}
                                                    />
                                                </div>
                                            )}
                                        </SortableItem>
                                    ))}
                                </SortableContext>
                            </DropRow>
                        </div>
                    );
                })}
            </div>

            <div className="mt-6">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-2">
                    Pool
                </h2>
                <DropRow
                    id={POOL_DROP_ID}
                    className="rounded-lg border border-dashed border-glass-border bg-glass-bg/40 min-h-[120px] p-3 flex flex-wrap gap-3 transition-colors"
                >
                    {pool.length === 0 ? (
                        <p className="text-xs text-text-muted">
                            Pool is empty. Open <strong>Config</strong> to add items.
                        </p>
                    ) : (
                        <SortableContext
                            items={pool.map((i) => i.id)}
                            strategy={horizontalListSortingStrategy}
                        >
                            {pool.map((it) => (
                                <SortableItem key={it.id} item={it} disabled={!interactive}>
                                    {({ ref, style, attributes, listeners }) => (
                                        <div
                                            ref={ref}
                                            style={style}
                                            {...attributes}
                                            {...listeners}
                                        >
                                            <TierItemCard
                                                item={it}
                                                showTeamName={list.displayConfig.showTeamNames}
                                                showTeamLogo={list.displayConfig.showTeamLogos}
                                                isLocked={list.isLocked}
                                                onRemove={() => onRemoveItem(it.id)}
                                                onEdit={() => onOpenItemEditor(it.id)}
                                            />
                                        </div>
                                    )}
                                </SortableItem>
                            ))}
                        </SortableContext>
                    )}
                </DropRow>
            </div>

            <DragOverlay>
                {activeItem && (
                    <TierItemCard
                        item={activeItem}
                        showTeamName={list.displayConfig.showTeamNames}
                        showTeamLogo={list.displayConfig.showTeamLogos}
                        isLocked={false}
                        isOverlay
                    />
                )}
            </DragOverlay>
        </DndContext>
    );
};

export default TierListBoard;
