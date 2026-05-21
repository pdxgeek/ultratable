import type { Fixture, Team } from '../db';

import { FixtureRow } from './FixtureRow';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

interface FixtureDropdownProps {
    fixtures: Fixture[];
    teams: Map<string, Team>;
    teamId: string;
    type: 'past' | 'future';
    align?: 'start' | 'end' | 'center';
}

export function FixtureDropdown({
    fixtures,
    teams,
    teamId,
    type,
    align = 'center',
}: FixtureDropdownProps) {
    if (fixtures.length === 0) return null;

    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    className="bg-transparent border-none cursor-pointer text-[0.85rem] p-0 flex items-center justify-center w-[22px] h-[22px] rounded-sm transition-all text-text-muted opacity-60 hover:text-accent-blue hover:bg-white/5 hover:opacity-100 data-[state=open]:text-accent-blue data-[state=open]:opacity-100"
                    title={type === 'past' ? 'View past fixtures' : 'View future fixtures'}
                >
                    {type === 'past' ? '◂' : '▸'}
                </button>
            </PopoverTrigger>
            <PopoverContent
                align={align}
                className="scrollbar-themed w-auto min-w-[280px] max-h-[400px] overflow-y-auto p-2"
            >
                <div className="text-[0.7rem] font-bold uppercase text-text-muted pb-1.5 mb-1.5 border-b border-border tracking-wider">
                    {type === 'past' ? 'Recent Results' : 'Upcoming Schedule'}
                </div>
                <div className="flex flex-col gap-0.5">
                    {fixtures.map((f) => (
                        <FixtureRow key={f.id} fixture={f} teamId={teamId} teams={teams} />
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    );
}
