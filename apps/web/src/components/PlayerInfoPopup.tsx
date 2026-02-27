import React from 'react';
import { usePlayer } from '../hooks/usePlayer';
import './PlayerInfoPopup.css';

interface PlayerInfoPopupProps {
    playerId: number;
    season: number;
    leagueSourceId?: number;
    anchorRect: DOMRect | null;
    onClose: () => void;
}

const PlayerInfoPopup: React.FC<PlayerInfoPopupProps> = ({ playerId, season, leagueSourceId, anchorRect, onClose }) => {
    const { player, isLoading } = usePlayer(playerId, season);

    if (!anchorRect) return null;

    let top = anchorRect.top - 320;
    if (top < 20) top = anchorRect.bottom + 10;
    let left = anchorRect.left + anchorRect.width / 2 - 160;
    if (left < 10) left = 10;
    if (left + 320 > window.innerWidth - 10) left = window.innerWidth - 330;

    const style: React.CSSProperties = {
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
    };

    if (isLoading) return (
        <div className="player-popup" style={style}>
            <div className="player-popup__loading">
                <div className="player-popup__loading-photo" />
                <div className="player-popup__loading-lines">
                    <div className="player-popup__loading-line" />
                    <div className="player-popup__loading-line" />
                    <div className="player-popup__loading-line" />
                </div>
            </div>
        </div>
    );

    if (!player) {
        const initials = String(playerId).slice(0, 2);
        return (
            <div className="player-popup" style={style} onClick={(e) => e.stopPropagation()}>
                <button className="player-popup__close" onClick={onClose}>✕</button>
                <div className="player-popup__header">
                    <div className="player-popup__photo-placeholder">{initials}</div>
                    <div className="player-popup__identity">
                        <h3 className="player-popup__name">Player #{playerId}</h3>
                        <p className="player-popup__nationality">Stats Unavailable</p>
                    </div>
                </div>
            </div>
        );
    }

    // Pick the stats entry matching the current league, or fall back to most appearances
    const currentStats = (() => {
        if (!player.statistics?.length) return null;
        if (leagueSourceId) {
            const match = player.statistics.find((s: any) => s.league?.id === leagueSourceId);
            if (match) return match;
        }
        // Fallback: pick entry with most appearances
        return player.statistics.reduce((best: any, s: any) =>
            (s.games?.appearences || 0) > (best?.games?.appearences || 0) ? s : best
            , player.statistics[0]);
    })();

    return (
        <div className="player-popup" style={style} onClick={(e) => e.stopPropagation()}>
            <button className="player-popup__close" onClick={onClose}>✕</button>

            {/* Header: Photo + Name */}
            <div className="player-popup__header">
                {player.photo ? (
                    <img src={player.photo} alt={player.name} className="player-popup__photo" />
                ) : (
                    <div className="player-popup__photo-placeholder">
                        {player.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                )}
                <div className="player-popup__identity">
                    <h3 className="player-popup__name">{player.name}</h3>
                    {player.nationality && <p className="player-popup__nationality">{player.nationality}</p>}
                    {currentStats?.games?.position && (
                        <p className="player-popup__nationality">{currentStats.games.position}</p>
                    )}
                </div>
            </div>

            {/* Body: Stats */}
            <div className="player-popup__body">
                {/* Bio */}
                <div className="player-popup__section">
                    <Row label="Age" value={player.age} />
                    {player.height && <Row label="Height" value={player.height} />}
                    {player.weight && <Row label="Weight" value={player.weight} />}
                </div>

                {/* Season stats */}
                {currentStats && (
                    <>
                        <div className="player-popup__section">
                            <div className="player-popup__section-title">Season Stats</div>
                            <Row label="Team" value={currentStats.team?.name} />
                            {currentStats.games?.number && <Row label="Number" value={`#${currentStats.games.number}`} />}
                            <Row label="Appearances" value={currentStats.games?.appearences || 0} />
                            <Row label="Minutes" value={(currentStats.games?.minutes || 0).toLocaleString()} />
                            {currentStats.games?.rating && <Row label="Rating" value={parseFloat(currentStats.games.rating).toFixed(2)} />}
                        </div>

                        <div className="player-popup__section">
                            <div className="player-popup__section-title">Output</div>
                            <Row label="Goals" value={currentStats.goals?.total || 0} />
                            <Row label="Assists" value={currentStats.goals?.assists || 0} />
                            <div className="player-popup__row">
                                <span className="player-popup__label">Cards</span>
                                <span className="player-popup__cards">
                                    <span style={{ color: '#ffd700' }}>🟨 {currentStats.cards?.yellow || 0}</span>
                                    <span style={{ color: '#ff4d4d' }}>🟥 {currentStats.cards?.red || 0}</span>
                                </span>
                            </div>
                        </div>
                    </>
                )}

                {player.injured && (
                    <div className="player-popup__injury">
                        ⚠️ Currently Injured
                    </div>
                )}
            </div>
        </div>
    );
};

const Row = ({ label, value }: { label: string; value: any }) => (
    <div className="player-popup__row">
        <span className="player-popup__label">{label}</span>
        <span className="player-popup__value">{value ?? 'N/A'}</span>
    </div>
);

export default PlayerInfoPopup;
