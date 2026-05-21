import type { MatchPlayer } from './types';

import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import PlayerInfoPopup from '../PlayerInfoPopup';

interface PlayerRowProps {
    player: MatchPlayer;
    season: number;
    leagueSourceId?: number;
    reverse?: boolean;
}

const PlayerRow: React.FC<PlayerRowProps> = ({ player, season, leagueSourceId, reverse }) => {
    const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
    const [showPopup, setShowPopup] = useState(false);
    const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleMouseEnter = (e: React.MouseEvent) => {
        const rect = e.currentTarget.getBoundingClientRect();
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        hoverTimer.current = setTimeout(() => {
            setAnchorRect(rect);
            setShowPopup(true);
        }, 150);
    };

    const handleMouseLeave = () => {
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        hoverTimer.current = setTimeout(() => {
            setShowPopup(false);
        }, 300);
    };

    return (
        <li
            className={`relative px-3 py-2 text-[0.95rem] rounded-md bg-bg-accent mb-1.5 transition-all hover:bg-white/5 hover:-translate-y-px cursor-pointer flex items-center gap-3 ${reverse ? 'flex-row-reverse' : ''}`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
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
            {showPopup &&
                createPortal(
                    <div
                        onMouseEnter={() => {
                            if (hoverTimer.current) clearTimeout(hoverTimer.current);
                        }}
                        onMouseLeave={handleMouseLeave}
                    >
                        <PlayerInfoPopup
                            playerId={player.sourceId}
                            season={season}
                            leagueSourceId={leagueSourceId}
                            anchorRect={anchorRect}
                            onClose={handleMouseLeave}
                        />
                    </div>,
                    document.body,
                )}
        </li>
    );
};

export default PlayerRow;
