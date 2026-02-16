import { useState, useEffect } from 'react';
import { fetchPlayerData, type ApiPlayerData } from '../services/playerData';
import { gfxRegistry } from '../services/gfxRegistry';
import './PlayerInfoPopup.css';

interface PlayerInfoPopupProps {
    playerId: string; // integrationId format: "api-football:12345"
    name: string;
    season: number;
    position?: {
        x: number;
        y: number;
    };
}

export default function PlayerInfoPopup({ playerId, name, season, position }: PlayerInfoPopupProps) {
    const [playerData, setPlayerData] = useState<ApiPlayerData | null>(null);
    const [loading, setLoading] = useState(true);

    // Extract external ID from integrationId
    const externalId = playerId.split(':')[1];
    const photoUrl = gfxRegistry.getPlayerPhoto(externalId);

    useEffect(() => {
        const externalIdNum = parseInt(externalId);
        if (isNaN(externalIdNum)) {
            setLoading(false);
            return;
        }

        fetchPlayerData(externalIdNum, season).then(data => {
            setPlayerData(data);
            setLoading(false);
        });
    }, [externalId, season]);

    if (loading) {
        return (
            <div className="player-info-popup" style={position ? { left: position.x, top: position.y } : {}}>
                <div className="player-info-popup__content">
                    <div className="player-info-popup__photo-container">
                        <div className="player-info-popup__photo-placeholder">
                            Loading...
                        </div>
                    </div>
                    <div className="player-info-popup__details">
                        <h3>{name}</h3>
                    </div>
                </div>
            </div>
        );
    }

    if (!playerData) {
        // Show basic info with just what we have
        const initials = name
            .split(' ')
            .map(n => n[0])
            .join('')
            .substring(0, 2)
            .toUpperCase();

        return (
            <div className="player-info-popup" style={position ? { left: position.x, top: position.y } : {}}>
                <div className="player-info-popup__content">
                    <div className="player-info-popup__photo-container">
                        {photoUrl ? (
                            <img src={photoUrl} alt={name} className="player-info-popup__photo" />
                        ) : (
                            <div className="player-info-popup__photo-placeholder">
                                {initials}
                            </div>
                        )}
                    </div>
                    <div className="player-info-popup__details">
                        <h3>{name}</h3>
                        <p className="player-info-popup__note">No additional data available</p>
                    </div>
                </div>
            </div>
        );
    }

    const { player, statistics } = playerData;
    const currentStats = statistics[0]; // Most recent season stats

    const initials = name
        .split(' ')
        .map(n => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase();

    return (
        <div className="player-info-popup" style={position ? { left: position.x, top: position.y } : {}}>
            <div className="player-info-popup__content">
                <div className="player-info-popup__photo-container">
                    {photoUrl ? (
                        <img src={photoUrl} alt={name} className="player-info-popup__photo" />
                    ) : (
                        <div className="player-info-popup__photo-placeholder">
                            {initials}
                        </div>
                    )}
                </div>
                <div className="player-info-popup__details">
                    <h3 className="player-info-popup__name">{player.name}</h3>

                    <div className="player-info-popup__section">
                        <div className="player-info-popup__row">
                            <span className="label">Age:</span>
                            <span className="value">{player.age}</span>
                        </div>
                        <div className="player-info-popup__row">
                            <span className="label">Nationality:</span>
                            <span className="value">{player.nationality}</span>
                        </div>
                        {player.height && (
                            <div className="player-info-popup__row">
                                <span className="label">Height:</span>
                                <span className="value">{player.height}</span>
                            </div>
                        )}
                        {player.weight && (
                            <div className="player-info-popup__row">
                                <span className="label">Weight:</span>
                                <span className="value">{player.weight}</span>
                            </div>
                        )}
                    </div>

                    {currentStats && (
                        <>
                            <div className="player-info-popup__section">
                                <h4>Current Season</h4>
                                <div className="player-info-popup__row">
                                    <span className="label">Team:</span>
                                    <span className="value">{currentStats.team.name}</span>
                                </div>
                                <div className="player-info-popup__row">
                                    <span className="label">Position:</span>
                                    <span className="value">{currentStats.games.position}</span>
                                </div>
                                {currentStats.games.number && (
                                    <div className="player-info-popup__row">
                                        <span className="label">Number:</span>
                                        <span className="value">{currentStats.games.number}</span>
                                    </div>
                                )}
                            </div>

                            <div className="player-info-popup__section">
                                <h4>Statistics</h4>
                                <div className="player-info-popup__row">
                                    <span className="label">Appearances:</span>
                                    <span className="value">{currentStats.games.appearences || 0}</span>
                                </div>
                                <div className="player-info-popup__row">
                                    <span className="label">Minutes:</span>
                                    <span className="value">{currentStats.games.minutes || 0}</span>
                                </div>
                                {currentStats.games.rating && (
                                    <div className="player-info-popup__row">
                                        <span className="label">Rating:</span>
                                        <span className="value">{parseFloat(currentStats.games.rating).toFixed(2)}</span>
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {player.injured && (
                        <div className="player-info-popup__injury-notice">
                            ⚠️ Currently injured
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
