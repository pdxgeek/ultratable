import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PlayerInfoPopup from '../PlayerInfoPopup';
import type { MatchPlayer } from './types';

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
        // Slight close delay lets the user move into the popup without it disappearing.
        hoverTimer.current = setTimeout(() => {
            setShowPopup(false);
        }, 300);
    };

    return (
        <li
            className={`player-row ${reverse ? 'player-row-reverse' : ''}`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            style={{ position: 'relative' }}
        >
            {player.photo ? (
                <img src={player.photo} alt={player.name} className="player-photo" />
            ) : (
                <div className="player-photo-placeholder" />
            )}
            <span className="player-name">{player.name}</span>
            {showPopup && createPortal(
                <div
                    onMouseEnter={() => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }}
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
                document.body
            )}
        </li>
    );
};

export default PlayerRow;
