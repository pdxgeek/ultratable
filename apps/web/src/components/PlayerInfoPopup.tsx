import React from 'react';
import { usePlayer } from '../hooks/usePlayer';

interface PlayerInfoPopupProps {
    playerId: number;
    season: number;
    anchorRect: DOMRect | null;
    onClose: () => void;
}

const PlayerInfoPopup: React.FC<PlayerInfoPopupProps> = ({ playerId, season, anchorRect, onClose }) => {
    const { player, isLoading } = usePlayer(playerId, season);

    if (!anchorRect) return null;

    let top = anchorRect.top - 250;
    if (top < 20) top = anchorRect.bottom + 10;

    const style: React.CSSProperties = {
        position: 'fixed',
        top: `${top}px`,
        left: `${anchorRect.left + anchorRect.width / 2 - 125}px`,
        width: '250px',
        zIndex: 999999, // Ensure it's on top of everything
    };

    console.log("PlayerInfoPopup rendering:", playerId, "loading:", isLoading, "player:", player?.name);

    if (isLoading) return (
        <div className="glass-card" style={style}>
            <div className="loading-shimmer" style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: 'white' }}>Loading Player...</span>
            </div>
        </div>
    );

    if (!player) {
        console.warn("PlayerInfoPopup: No player data returned for", playerId);
        return (
            <div className="glass-card player-popup" style={style} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-main)', cursor: 'pointer' }}>✕</button>
                </div>
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <h3 style={{ margin: '8px 0 4px 0', color: 'var(--text-muted)' }}>Stats Unavailable</h3>
                    <p style={{ fontSize: '0.85rem' }}>No detailed data found for this player.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="glass-card player-popup" style={style} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-main)', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <img
                    src={player.photo}
                    alt={player.name}
                    style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--accent-main)' }}
                />
                <h3 style={{ margin: '8px 0 4px 0' }}>{player.name}</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>{player.nationality}</p>
            </div>

            <div style={{ fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Age:</span>
                    <span>{player.age}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Height:</span>
                    <span>{player.height || 'N/A'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Weight:</span>
                    <span>{player.weight || 'N/A'}</span>
                </div>
                {player.injured && (
                    <div style={{ marginTop: '8px', color: '#ff4d4d', fontSize: '0.75rem', textAlign: 'center' }}>
                        ⚠️ Currently Injured
                    </div>
                )}
            </div>
        </div>
    );
};

export default PlayerInfoPopup;
