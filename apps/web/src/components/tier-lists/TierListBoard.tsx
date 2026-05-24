import type { TierListEditorRow, TierRankableItem } from './queries';

import React, { useMemo, useState } from 'react';
import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
    PointerSensor,
    TouchSensor,
    closestCorners,
    pointerWithin,
    useDroppable,
    useSensor,
    useSensors,
    type CollisionDetection,
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

/**
 * Custom collision detection for the multi-container sortable layout.
 * Each tier row is its own droppable + SortableContext; the default
 * `closestCenter` and `closestCorners` algorithms can fail to resolve
 * an over-target on cross-row drags (cursor sits between droppables,
 * neither corner nor center wins), leaving `over` null and the drop
 * a silent no-op.
 *
 * `pointerWithin` first: if the cursor is literally inside any
 * droppable's rectangle, that's the over. Falls back to
 * `closestCorners` when the cursor is between droppables (e.g. in the
 * gap above/below a row), which still resolves a sensible target.
 */
const multiContainerCollision: CollisionDetection = (args) => {
    const within = pointerWithin(args);
    if (within.length > 0) return within;
    return closestCorners(args);
};

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
    // Optimistic local mirror of list.items. Drag drops update this
    // immediately so the item visually lands in its new slot without
    // waiting for the server round-trip — without this, dnd-kit's
    // slide-out animation resets at drop time and the item briefly
    // snaps back to its source row before the refetch updates props.
    //
    // Set-state-during-render to resync: when the server's authoritative
    // list comes back from refetch, the props reference changes and we
    // adopt it (which will be identical to the optimistic state on
    // success, or snap to truth on failure).
    const [syncedItems, setSyncedItems] = useState(list.items);
    const [items, setItems] = useState(list.items);
    if (syncedItems !== list.items) {
        setSyncedItems(list.items);
        setItems(list.items);
    }

    const { pool, byTier } = useMemo(() => bucketItems(items), [items]);
    const [activeId, setActiveId] = useState<string | null>(null);

    const sensors = useSensors(
        // 5px activation gap lets the user click the card to edit without
        // triggering a drag every time.
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
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

        // Resolve the destination row + where in it the item should land
        // as `(targetTierKey, siblings, insertAt)` where `siblings` is
        // the destination row WITHOUT the active item.
        //
        // Three cases:
        //   1. Drop on a row container ("__pool__" / "tier:X") → append.
        //   2. Drop on an item in a DIFFERENT row → insert at that
        //      item's slot (pushes over-item to the right).
        //   3. Drop on an item in the SAME row → reorder. The drop side
        //      is inferred from the active vs. over index direction:
        //      dragging right-onto inserts AFTER over, dragging left-
        //      onto inserts BEFORE over. Matches @dnd-kit/sortable's
        //      arrayMove convention so the visual slide-out during
        //      drag matches the saved order on drop.
        let targetTierKey: string | null;
        let siblings: TierRankableItem[];
        let insertAt: number;

        if (overId === POOL_DROP_ID || overId.startsWith('tier:')) {
            targetTierKey = overId === POOL_DROP_ID ? null : overId.slice('tier:'.length);
            const destItems =
                targetTierKey === null ? pool : (byTier.get(targetTierKey) ?? []);
            siblings = destItems.filter((i) => i.id !== item.id);
            insertAt = siblings.length;
        } else {
            const overItem = itemsById.get(overId);
            if (!overItem) return;
            // Dropping on yourself is always a no-op (also catches the
            // pointer-up-without-moving case from the activation gap).
            if (overItem.id === item.id) return;

            targetTierKey = overItem.tierKey;
            const destItems =
                targetTierKey === null ? pool : (byTier.get(targetTierKey) ?? []);
            const overIdx = destItems.findIndex((i) => i.id === overItem.id);
            if (overIdx < 0) return;

            if (item.tierKey === targetTierKey) {
                // Same-row reorder: trim self, compute insertion side.
                const activeIdx = destItems.findIndex((i) => i.id === item.id);
                if (activeIdx === overIdx) return;
                siblings = destItems.filter((_, i) => i !== activeIdx);
                const overInTrimmed = overIdx > activeIdx ? overIdx - 1 : overIdx;
                // Dragging from the left onto over → land AFTER over.
                // Dragging from the right onto over → land BEFORE over.
                insertAt = activeIdx < overIdx ? overInTrimmed + 1 : overInTrimmed;
            } else {
                // Cross-row drop on an item — take that slot, pushing
                // the over-item right.
                siblings = destItems;
                insertAt = overIdx;
            }
        }

        const nextPosition = positionForInsert(siblings, insertAt);

        // No-op detection (cross-row drops are always real moves; only
        // same-row needs this guard).
        if (
            item.tierKey === targetTierKey &&
            Math.abs(item.position - nextPosition) < Number.EPSILON
        ) {
            return;
        }

        // Optimistic update: rewrite the item locally so it lands in its
        // new slot immediately. Server reconciliation runs in parallel;
        // when the refetch returns, the props-vs-state sync above adopts
        // the server's truth.
        setItems((prev) =>
            prev.map((i) =>
                i.id === item.id
                    ? { ...i, tierKey: targetTierKey, position: nextPosition }
                    : i,
            ),
        );
        onMoveItem(item.id, targetTierKey, nextPosition);
    };

    const interactive = !list.isLocked;

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={multiContainerCollision}
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
                                            {/* Pool items on the main page are not
                                                removable — pool composition lives in
                                                the config view. Drag into a tier
                                                here; remove from config. */}
                                            <TierItemCard
                                                item={it}
                                                showTeamName={list.displayConfig.showTeamNames}
                                                showTeamLogo={list.displayConfig.showTeamLogos}
                                                isLocked={list.isLocked}
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
