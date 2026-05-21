import type { MatchPlayer } from './types';

import React from 'react';

import { HoverCard, HoverCardContent, HoverCardTrigger } from '../ui/hover-card';
import PlayerInfoPopup from '../PlayerInfoPopup';

interface PlayerRowProps {
    player: MatchPlayer;
    season: number;
    leagueSourceId?: number;
    reverse?: boolean;
}

const PlayerRow: React.FC<PlayerRowProps> = ({ player, season, leagueSourceId, reverse }) => {
    return (
        <HoverCard openDelay={150} closeDelay={150}>
            <HoverCardTrigger asChild>
                <li
                    className={`relative px-3 py-2 text-[0.95rem] rounded-md bg-bg-accent mb-1.5 transition-all hover:bg-white/5 hover:-translate-y-px cursor-pointer flex items-center gap-3 ${reverse ? 'flex-row-reverse' : ''}`}
                >
                    {player.photo ? (
                        <img
                            src={player.photo}
                            alt={player.name}
                            className="w-[30px] h-[30px] rounded-full object-cover bg-white/5"
                        />
                    ) : (
                        <div className="w-[30px] h-[30px] rounded-full bg-white/5" />
                    )}
                    <span className="flex-1">{player.name}</span>
                </li>
            </HoverCardTrigger>
            <HoverCardContent
                align={reverse ? 'end' : 'start'}
                className="w-[320px] max-w-[340px] p-2.5"
            >
                <PlayerInfoPopup
                    playerId={player.sourceId}
                    season={season}
                    leagueSourceId={leagueSourceId}
                />
            </HoverCardContent>
        </HoverCard>
    );
};

export default PlayerRow;
