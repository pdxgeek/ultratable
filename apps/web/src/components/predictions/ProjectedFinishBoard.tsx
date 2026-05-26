import type { Team } from '../../db';
import type { ZoneArrays } from '../../lib/zones';

import React, { useState } from 'react';
import {
    closestCenter,
    DndContext,
    DragOverlay,
    KeyboardSensor,
    PointerSensor,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/core';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';

import { zoneBorderClass, zoneForPosition } from '../../lib/zones';

export type MoveTarget = { kind: 'pool' } | { kind: 'slot'; position: number };

interface ProjectedFinishBoardProps {
    poolTeamIds: string[];
    slots: (string | null)[];
    teamsMap: Map<string, Team>;
    zones: ZoneArrays;
    currentPositions: Map<string, number>;
    seasonStarted: boolean;
    readOnly: boolean;
    onMove: (teamId: string, target: MoveTarget) => void;
}

const DRAG_TYPE_TEAM = 'team:';
const DRAG_TYPE_SLOT = 'slot:';
const DRAG_ID_POOL = 'pool';

interface TeamBarProps {
    teamId: string;
    name: string;
    logo?: string;
    compact?: boolean;
}

const TeamBar: React.FC<TeamBarProps> = ({ name, logo, compact }) => (
    <div
        className={`flex items-center gap-2 rounded-md border border-border bg-bg-secondary/70 px-2 py-1 text-[0.8rem] font-medium text-text-primary shadow-sm ${
            compact ? '' : 'min-w-[140px]'
        }`}
    >
        {logo && (
            <img
                src={logo}
                alt=""
                aria-hidden="true"
                className="w-4 h-4 object-contain drop-shadow"
            />
        )}
        <span className="whitespace-nowrap">{name}</span>
    </div>
);

interface DraggableTeamProps {
    teamId: string;
    name: string;
    logo?: string;
    readOnly: boolean;
}

const DraggableTeam: React.FC<DraggableTeamProps> = ({ teamId, name, logo, readOnly }) => {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: DRAG_TYPE_TEAM + teamId,
        disabled: readOnly,
    });
    return (
        <div
            ref={setNodeRef}
            {...(readOnly ? {} : { ...attributes, ...listeners })}
            className={`${readOnly ? '' : 'cursor-grab active:cursor-grabbing'} ${isDragging ? 'opacity-30' : ''}`}
        >
            <TeamBar teamId={teamId} name={name} logo={logo} />
        </div>
    );
};

interface DeltaProps {
    delta: number;
}

const Delta: React.FC<DeltaProps> = ({ delta }) => {
    if (delta > 0) {
        return (
            <span className="inline-flex items-center gap-0.5 text-accent-green text-[0.75rem] font-semibold">
                <ArrowUp className="w-3 h-3" aria-hidden="true" />
                {delta}
                <span className="sr-only">{`${delta} positions higher than current standings`}</span>
            </span>
        );
    }
    if (delta < 0) {
        return (
            <span className="inline-flex items-center gap-0.5 text-accent-red text-[0.75rem] font-semibold">
                <ArrowDown className="w-3 h-3" aria-hidden="true" />
                {Math.abs(delta)}
                <span className="sr-only">{`${Math.abs(delta)} positions lower than current standings`}</span>
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-0.5 text-text-muted text-[0.75rem] font-semibold">
            <Minus className="w-3 h-3" aria-hidden="true" />
            <span className="sr-only">Same position as current standings</span>
        </span>
    );
};

interface SlotProps {
    position: number;
    teamId: string | null;
    teamsMap: Map<string, Team>;
    borderClass: string;
    delta: number | null;
    readOnly: boolean;
}

const Slot: React.FC<SlotProps> = ({ position, teamId, teamsMap, borderClass, delta, readOnly }) => {
    const { setNodeRef, isOver } = useDroppable({
        id: DRAG_TYPE_SLOT + position,
        disabled: readOnly,
    });
    const team = teamId ? teamsMap.get(teamId) : null;
    const ringClass = isOver ? 'ring-2 ring-accent-blue' : '';
    return (
        <div
            ref={setNodeRef}
            data-testid={`slot-${position}`}
            className={`grid grid-cols-[40px_1fr_60px] items-center gap-2 rounded-md border border-border bg-glass-bg/60 px-2 py-1.5 min-h-[44px] ${ringClass}`}
        >
            <div
                className={`text-center font-semibold text-text-primary ${borderClass} pl-1`}
            >
                {position}
            </div>
            <div className="min-w-0">
                {teamId && team ? (
                    <DraggableTeam
                        teamId={teamId}
                        name={team.name}
                        logo={team.logo}
                        readOnly={readOnly}
                    />
                ) : (
                    <span className="text-[0.75rem] text-text-muted italic">
                        Drop a team here
                    </span>
                )}
            </div>
            <div className="text-right">{delta !== null ? <Delta delta={delta} /> : null}</div>
        </div>
    );
};

interface PoolProps {
    teamIds: string[];
    teamsMap: Map<string, Team>;
    readOnly: boolean;
}

const Pool: React.FC<PoolProps> = ({ teamIds, teamsMap, readOnly }) => {
    const { setNodeRef, isOver } = useDroppable({ id: DRAG_ID_POOL, disabled: readOnly });
    const ringClass = isOver ? 'ring-2 ring-accent-blue' : '';
    return (
        <div
            ref={setNodeRef}
            aria-label="Unplaced teams"
            data-testid="pool"
            className={`flex flex-wrap gap-2 rounded-md border border-dashed border-border bg-glass-bg/40 p-3 min-h-[80px] ${ringClass}`}
        >
            {teamIds.length === 0 ? (
                <span className="text-[0.8rem] text-text-muted italic self-center">
                    All teams placed.
                </span>
            ) : (
                teamIds.map((teamId) => {
                    const team = teamsMap.get(teamId);
                    return (
                        <DraggableTeam
                            key={teamId}
                            teamId={teamId}
                            name={team?.name ?? teamId}
                            logo={team?.logo}
                            readOnly={readOnly}
                        />
                    );
                })
            )}
        </div>
    );
};

const parseTarget = (overId: string): MoveTarget | null => {
    if (overId === DRAG_ID_POOL) return { kind: 'pool' };
    if (overId.startsWith(DRAG_TYPE_SLOT)) {
        const pos = parseInt(overId.slice(DRAG_TYPE_SLOT.length), 10);
        if (Number.isFinite(pos)) return { kind: 'slot', position: pos };
    }
    return null;
};

const ProjectedFinishBoard: React.FC<ProjectedFinishBoardProps> = ({
    poolTeamIds,
    slots,
    teamsMap,
    zones,
    currentPositions,
    seasonStarted,
    readOnly,
    onMove,
}) => {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor),
    );
    const [activeTeamId, setActiveTeamId] = useState<string | null>(null);

    const handleDragStart = (event: DragStartEvent) => {
        const id = String(event.active.id);
        if (id.startsWith(DRAG_TYPE_TEAM)) {
            setActiveTeamId(id.slice(DRAG_TYPE_TEAM.length));
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        setActiveTeamId(null);
        const activeId = String(event.active.id);
        if (!activeId.startsWith(DRAG_TYPE_TEAM)) return;
        const teamId = activeId.slice(DRAG_TYPE_TEAM.length);
        const overId = event.over ? String(event.over.id) : null;
        if (!overId) return;
        const target = parseTarget(overId);
        if (!target) return;
        onMove(teamId, target);
    };

    const renderSlots = () =>
        slots.map((teamId, idx) => {
            const position = idx + 1;
            const zone = zoneForPosition(position, zones);
            const borderClass = zoneBorderClass(zone);
            let delta: number | null = null;
            if (teamId && seasonStarted) {
                const current = currentPositions.get(teamId);
                if (current !== undefined) delta = current - position;
            }
            return (
                <Slot
                    key={position}
                    position={position}
                    teamId={teamId}
                    teamsMap={teamsMap}
                    borderClass={borderClass}
                    delta={delta}
                    readOnly={readOnly}
                />
            );
        });

    const activeTeam = activeTeamId ? teamsMap.get(activeTeamId) : null;

    const content = (
        <div className="flex flex-col gap-4">
            {!readOnly && (
                <Pool teamIds={poolTeamIds} teamsMap={teamsMap} readOnly={readOnly} />
            )}
            {/*
             * Two-column layout for the position slots at lg+ (1024px), one
             * column below. CSS columns flow top-to-bottom then left-to-right,
             * so positions 1-10 fill the left column and 11-20 the right,
             * which is the natural reading order for ranked lists.
             *
             * `gap-x-3` is the inter-column gutter (CSS `gap` doesn't apply
             * inside multi-column the way it does in grid/flex). Per-slot
             * vertical spacing comes from `[&>*]:mb-1`. `break-inside-avoid`
             * keeps a slot from splitting across columns at the boundary.
             *
             * dnd-kit reads pointer position rather than DOM order, so the
             * column layout is invisible to the drag system — drops still
             * land on whichever slot is under the cursor.
             */}
            <div className="columns-1 lg:columns-2 gap-x-3 [&>*]:mb-1 [&>*]:break-inside-avoid">
                {renderSlots()}
            </div>
        </div>
    );

    if (readOnly) return content;

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            {content}
            <DragOverlay>
                {activeTeam ? (
                    <TeamBar
                        teamId={activeTeamId ?? ''}
                        name={activeTeam.name}
                        logo={activeTeam.logo}
                    />
                ) : null}
            </DragOverlay>
        </DndContext>
    );
};

export default ProjectedFinishBoard;
