import type { Team } from '../../db';
import type { ZoneArrays } from '../../lib/zones';

import React from 'react';
import {
    closestCenter,
    DndContext,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { zoneBorderClass, zoneForPosition } from '../../lib/zones';
import TeamCell from '../TeamCell';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '../ui/table';

interface ProjectedFinishTableProps {
    orderedTeamIds: string[];
    teamsMap: Map<string, Team>;
    zones: ZoneArrays;
    readOnly: boolean;
    selectedTeamId: string | null;
    onSelectTeam: (teamId: string | null) => void;
    onMoveTeam: (teamId: string, direction: 'up' | 'down') => void;
    onReorder: (nextOrder: string[]) => void;
}

const cellBase = 'px-3 py-2 border-b border-border text-[0.8rem]';
const headBase =
    'px-3 py-3 align-top text-text-muted text-[0.75rem] uppercase tracking-wider font-semibold border-b border-border';

interface SortableRowProps {
    teamId: string;
    teamName: string;
    teamLogo?: string;
    position: number;
    borderClass: string;
    isSelected: boolean;
    readOnly: boolean;
    canMoveUp: boolean;
    canMoveDown: boolean;
    onSelect: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
}

const SortableRow: React.FC<SortableRowProps> = ({
    teamId,
    teamName,
    teamLogo,
    position,
    borderClass,
    isSelected,
    readOnly,
    canMoveUp,
    canMoveDown,
    onSelect,
    onMoveUp,
    onMoveDown,
}) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: teamId,
        disabled: readOnly,
    });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : undefined,
    };

    const rowClass = [
        'transition-colors',
        readOnly ? '' : 'cursor-grab active:cursor-grabbing',
        isSelected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <TableRow ref={setNodeRef} style={style} className={rowClass}>
            <TableCell
                className={`${cellBase} w-10 text-center ${borderClass}`}
                onClick={readOnly ? undefined : onSelect}
            >
                {position}
            </TableCell>
            <TableCell
                className={cellBase}
                {...(readOnly ? {} : { ...attributes, ...listeners })}
                onClick={readOnly ? undefined : onSelect}
            >
                <TeamCell team={{ id: teamId, name: teamName, logo: teamLogo }} />
            </TableCell>
            <TableCell className={`${cellBase} w-[120px] text-right`}>
                {!readOnly && isSelected ? (
                    <span className="inline-flex gap-1">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onMoveUp();
                            }}
                            disabled={!canMoveUp}
                            aria-label={`Move ${teamName} up`}
                            className="px-2 py-1 rounded border border-border bg-bg-secondary text-text-primary text-[0.75rem] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/[0.06]"
                        >
                            ↑
                        </button>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onMoveDown();
                            }}
                            disabled={!canMoveDown}
                            aria-label={`Move ${teamName} down`}
                            className="px-2 py-1 rounded border border-border bg-bg-secondary text-text-primary text-[0.75rem] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/[0.06]"
                        >
                            ↓
                        </button>
                    </span>
                ) : null}
            </TableCell>
        </TableRow>
    );
};

const ProjectedFinishTable: React.FC<ProjectedFinishTableProps> = ({
    orderedTeamIds,
    teamsMap,
    zones,
    readOnly,
    selectedTeamId,
    onSelectTeam,
    onMoveTeam,
    onReorder,
}) => {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = orderedTeamIds.indexOf(active.id as string);
        const newIndex = orderedTeamIds.indexOf(over.id as string);
        if (oldIndex < 0 || newIndex < 0) return;
        onReorder(arrayMove(orderedTeamIds, oldIndex, newIndex));
    };

    const rows = orderedTeamIds.map((teamId, index) => {
        const team = teamsMap.get(teamId);
        const position = index + 1;
        const zone = zoneForPosition(position, zones);
        const borderClass = zoneBorderClass(zone);
        const isSelected = !readOnly && selectedTeamId === teamId;
        return (
            <SortableRow
                key={teamId}
                teamId={teamId}
                teamName={team?.name ?? teamId}
                teamLogo={team?.logo}
                position={position}
                borderClass={borderClass}
                isSelected={isSelected}
                readOnly={readOnly}
                canMoveUp={index > 0}
                canMoveDown={index < orderedTeamIds.length - 1}
                onSelect={() => onSelectTeam(isSelected ? null : teamId)}
                onMoveUp={() => onMoveTeam(teamId, 'up')}
                onMoveDown={() => onMoveTeam(teamId, 'down')}
            />
        );
    });

    const tableContent = (
        <Table className="border-separate border-spacing-0">
            <TableHeader>
                <TableRow className="hover:bg-transparent border-b-0">
                    <TableHead className={`${headBase} w-10 text-center`}>#</TableHead>
                    <TableHead className={headBase}>Team</TableHead>
                    <TableHead className={`${headBase} w-[120px] text-right`}>
                        {readOnly ? '' : 'Move'}
                    </TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>{rows}</TableBody>
        </Table>
    );

    return (
        <div className="bg-glass-bg backdrop-blur-md border border-glass-border rounded-lg shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] overflow-visible">
            {readOnly ? (
                tableContent
            ) : (
                // DndContext wraps the table (not just tbody) because it
                // injects a hidden a11y live region <div> that would
                // otherwise nest illegally inside <table>.
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={orderedTeamIds}
                        strategy={verticalListSortingStrategy}
                    >
                        {tableContent}
                    </SortableContext>
                </DndContext>
            )}
        </div>
    );
};

export default ProjectedFinishTable;
