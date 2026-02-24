import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Fixture, Team } from '../db';
import { db } from '../db';
import { usePopup } from '../context/PopupContext';

interface MatchPopupProps {
    fixture: Fixture;
    teamsMap: Map<string, Team>;
    anchorRect: DOMRect;
}

function getPopupPosition(anchorRect: DOMRect): React.CSSProperties {
    const popupWidth = 340;
    const popupHeight = 280;
    const margin = 8;

    let left = anchorRect.left + anchorRect.width / 2 - popupWidth / 2;
    let top = anchorRect.top - popupHeight - margin;

    if (left < margin) left = margin;
    if (left + popupWidth > window.innerWidth - margin) {
        left = window.innerWidth - popupWidth - margin;
    }
    if (top < margin) {
        top = anchorRect.bottom + margin;
    }

    return {
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        width: `${popupWidth}px`,
        zIndex: 1000,
    };
}

export default function MatchPopup({ fixture, teamsMap, anchorRect }: MatchPopupProps) {
    const { cancelHide, scheduleHide } = usePopup();
    const [venueImgError, setVenueImgError] = useState(false);

    const homeTeam = teamsMap.get(fixture.homeTeamId);
    const awayTeam = teamsMap.get(fixture.awayTeamId);

    // Look up venue from Dexie
    const venue = useLiveQuery(async () => {
        if (!fixture.venueId) return null;
        return await db.venues.get(fixture.venueId);
    }, [fixture.venueId]);

    const style = getPopupPosition(anchorRect);
    const isPlayed = fixture.status === 'played';
    const isUpcoming = fixture.status === 'scheduled';

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString(undefined, {
            weekday: 'short', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    return (
        <div
            className="match-popup"
            style={style}
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
        >
            {/* Venue Image Banner */}
            {venue && (
                <div className="match-popup__venue">
                    {venue.image && !venueImgError ? (
                        <img
                            key={venue.image}
                            src={venue.image}
                            alt={venue.name}
                            className="match-popup__venue-image"
                            onError={() => setVenueImgError(true)}
                        />
                    ) : (
                        <div className="match-popup__venue-placeholder">
                            <span style={{ fontSize: '2rem' }}>🏟️</span>
                        </div>
                    )}
                    <div className="match-popup__venue-name">
                        📍 {venue.name}{venue.city ? `, ${venue.city}` : ''}
                    </div>
                </div>
            )}

            <div className="match-popup__status">
                {isUpcoming && <span className="badge badge--upcoming">Upcoming</span>}
                {fixture.status === 'postponed' && <span className="badge badge--postponed">Postponed</span>}
                {isPlayed && <span className="badge badge--played">Full Time</span>}
            </div>

            <div className="match-popup__header">
                <div className="match-popup__team">
                    {homeTeam?.logo && (
                        <img
                            src={homeTeam.logo}
                            alt=""
                            className="match-popup__logo"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                    )}
                    <span className="match-popup__team-name">{homeTeam?.name ?? 'Unknown'}</span>
                </div>

                <div className="match-popup__score">
                    {isPlayed ? (
                        <span className="match-popup__score-text">
                            {fixture.goalsHome} – {fixture.goalsAway}
                        </span>
                    ) : (
                        <span className="match-popup__score-text match-popup__score-text--vs">
                            vs
                        </span>
                    )}
                </div>

                <div className="match-popup__team">
                    {awayTeam?.logo && (
                        <img
                            src={awayTeam.logo}
                            alt=""
                            className="match-popup__logo"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                    )}
                    <span className="match-popup__team-name">{awayTeam?.name ?? 'Unknown'}</span>
                </div>
            </div>

            <div className="match-popup__date">
                📅 {formatDate(fixture.scheduledAt)}
            </div>
        </div>
    );
}
