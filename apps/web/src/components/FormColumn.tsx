import type { Fixture, Team } from '../db';

import { useMemo } from 'react';

import { HoverCard, HoverCardContent, HoverCardTrigger } from './ui/hover-card';
import MatchPopup from './MatchPopup';

interface FormColumnProps {
    form: Array<{ result: 'W' | 'D' | 'L'; fixtureId: string }>;
    fixtures: Fixture[];
    teamsMap: Map<string, Team>;
}

const dotColor: Record<'W' | 'D' | 'L', string> = {
    W: 'bg-accent-green',
    D: 'bg-text-muted',
    L: 'bg-accent-red',
};

const barColor: Record<'W' | 'D' | 'L', string> = {
    W: 'bg-accent-green',
    D: 'bg-text-muted',
    L: 'bg-accent-red',
};

const FormColumn: React.FC<FormColumnProps> = ({ form, fixtures, teamsMap }) => {
    const fixtureMap = useMemo(() => new Map(fixtures.map((f) => [f.id, f])), [fixtures]);

    return (
        <div className="flex gap-1 items-center">
            {form.map((entry, idx) => {
                const isLatest = idx === form.length - 1;
                const label =
                    entry.result === 'W' ? 'Win' : entry.result === 'D' ? 'Draw' : 'Loss';
                const fixture = fixtureMap.get(entry.fixtureId);

                const dot = (
                    <div className="flex flex-col items-center gap-0.5 cursor-pointer">
                        <div
                            className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${dotColor[entry.result]}`}
                            title={isLatest ? `${label} (latest)` : label}
                        >
                            {entry.result}
                        </div>
                        <div
                            className={`h-1 w-1 rounded-full ${isLatest ? barColor[entry.result] : 'bg-transparent'}`}
                        />
                    </div>
                );

                if (!fixture) {
                    return <div key={idx}>{dot}</div>;
                }

                return (
                    <HoverCard key={idx} openDelay={200} closeDelay={150}>
                        <HoverCardTrigger asChild>{dot}</HoverCardTrigger>
                        <HoverCardContent className="w-[340px] p-4">
                            <MatchPopup fixture={fixture} teamsMap={teamsMap} />
                        </HoverCardContent>
                    </HoverCard>
                );
            })}
            {form.length === 0 && <span className="text-text-muted">–</span>}
        </div>
    );
};

export default FormColumn;
