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
    if (!lineup) return <div className="team-column" />;

    const alignRight = reverse ? { textAlign: 'right' as const } : undefined;

    return (
        <div className="team-column">
            <div className={`coach-card ${reverse ? 'coach-card-reverse' : ''}`}>
                {lineup.coachPhoto ? (
                    <img src={lineup.coachPhoto} alt={lineup.coachName} className="coach-img" />
                ) : (
                    <div className="coach-placeholder">👤</div>
                )}
                <div style={alignRight}>
                    <div className="coach-label">Coach</div>
                    <div className="coach-name">{lineup.coachName || 'Unknown'}</div>
                    <div className="formation-label">{lineup.formation}</div>
                </div>
            </div>

            <h4 style={alignRight}>Starting XI</h4>
            <ul className="player-list" style={alignRight}>
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

            <h4 style={alignRight}>Substitutes</h4>
            <p className="subs-list-text" style={alignRight}>
                {lineup.substitutes?.map((p) => p.name).join(', ')}
            </p>
        </div>
    );
};

export default TeamLineupColumn;
