import type { Fixture, Team } from '../db';

import { useEffect, useRef, useState } from 'react';

import { FixtureRow } from './FixtureRow';

interface FixtureDropdownProps {
    fixtures: Fixture[];
    teams: Map<string, Team>;
    teamId: string;
    type: 'past' | 'future';
    align?: 'left' | 'right' | 'center';
}

const alignClass: Record<'left' | 'right' | 'center', string> = {
    left: 'left-0',
    right: 'right-0',
    center: 'left-1/2 -translate-x-1/2',
};

export function FixtureDropdown({
    fixtures,
    teams,
    teamId,
    type,
    align = 'center',
}: FixtureDropdownProps) {
    const [expanded, setExpanded] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<'down' | 'up'>('down');

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setExpanded(false);
            }
        }

        if (expanded) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [expanded]);

    const handleToggle = () => {
        if (!expanded && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            setPosition(spaceBelow < 400 && spaceAbove > spaceBelow ? 'up' : 'down');
        }
        setExpanded(!expanded);
    };

    if (fixtures.length === 0) return null;

    const positionClass = position === 'down' ? 'top-full mt-2' : 'bottom-full mb-2';

    return (
        <div className="relative flex items-center" ref={containerRef}>
            <button
                className={`bg-transparent border-none cursor-pointer text-[0.85rem] p-0 flex items-center justify-center w-[22px] h-[22px] rounded-sm transition-all hover:text-accent-blue hover:bg-white/5 hover:opacity-100 ${expanded ? 'text-accent-blue opacity-100' : 'text-text-muted opacity-60'}`}
                onClick={handleToggle}
                title={type === 'past' ? 'View past fixtures' : 'View future fixtures'}
            >
                {type === 'past' ? '◂' : '▸'}
            </button>

            {expanded && (
                <div
                    className={`absolute z-[100] bg-bg-primary border border-border rounded-md shadow-[0_12px_40px_rgba(0,0,0,0.5)] p-2 min-w-[280px] max-h-[400px] overflow-y-auto text-left ${positionClass} ${alignClass[align]}`}
                >
                    <div>
                        <div className="text-[0.7rem] font-bold uppercase text-text-muted pb-1.5 mb-1.5 border-b border-border tracking-wider">
                            {type === 'past' ? 'Recent Results' : 'Upcoming Schedule'}
                        </div>
                        <div className="flex flex-col gap-0.5">
                            {fixtures.map((f) => (
                                <FixtureRow key={f.id} fixture={f} teamId={teamId} teams={teams} />
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
