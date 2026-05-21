import type { MatchLineup } from './types';

import React from 'react';

import PlayerRow from './PlayerRow';

interface TeamLineupColumnProps {
    lineup: MatchLineup | null;
    season: number;
    leagueSourceId: number;
    reverse?: boolean;
    keyPrefix: string;
}

const TeamLineupColumn: React.FC<TeamLineupColumnProps> = ({
    lineup,
    season,
    leagueSourceId,
    reverse,
    keyPrefix,
}) => {
    if (!lineup) return <div />;

    const align = reverse ? 'text-right' : '';
    const headingClass = `mt-0 mb-3 text-[0.9rem] uppercase text-text-secondary border-b border-border pb-2 ${align}`;

    return (
        <div>
            <div
                className={`flex items-center gap-[15px] bg-bg-accent p-[15px] rounded-xl mb-6 shadow-[0_2px_10px_rgba(0,0,0,0.1)] ${reverse ? 'flex-row-reverse' : ''}`}
            >
                {lineup.coachPhoto ? (
                    <img
                        src={lineup.coachPhoto}
                        alt={lineup.coachName}
                        className="w-[60px] h-[60px] rounded-full object-cover border-2 border-border"
                    />
                ) : (
                    <div className="w-[60px] h-[60px] rounded-full bg-bg-secondary flex items-center justify-center text-2xl border-2 border-border">
                        👤
                    </div>
                )}
                <div className={align}>
                    <div className="text-[0.75rem] uppercase text-text-muted tracking-wider">
                        Coach
                    </div>
                    <div className="font-semibold text-base my-0.5">
                        {lineup.coachName || 'Unknown'}
                    </div>
                    <div className="text-[0.85rem] text-accent-blue font-medium">
                        {lineup.formation}
                    </div>
                </div>
            </div>

            <h4 className={headingClass}>Starting XI</h4>
            <ul className={`list-none p-0 mt-0 mb-[30px] ${align}`}>
                {lineup.startXI?.map((p) => (
                    <PlayerRow
                        key={`${keyPrefix}-start-${p.sourceId}`}
                        player={p}
                        season={season}
                        leagueSourceId={leagueSourceId}
                        reverse={reverse}
                    />
                ))}
            </ul>

            <h4 className={headingClass}>Substitutes</h4>
            <p className={`text-[0.85rem] text-text-secondary ${align}`}>
                {lineup.substitutes?.map((p) => p.name).join(', ')}
            </p>
        </div>
    );
};

export default TeamLineupColumn;
