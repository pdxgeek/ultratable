import type { Fixture, Team } from '../db';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';

import { usePopup } from '../context/PopupContext';
import { db } from '../db';

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

const badgeBase =
    'inline-block text-[0.65rem] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-[10px]';

export default function MatchPopup({ fixture, teamsMap, anchorRect }: MatchPopupProps) {
    const { cancelHide, scheduleHide, hidePopup } = usePopup();
    const navigate = useNavigate();
    const [venueImgError, setVenueImgError] = useState(false);

    const homeTeam = teamsMap.get(fixture.homeTeamId);
    const awayTeam = teamsMap.get(fixture.awayTeamId);

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
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <div
            className="bg-bg-primary border border-border rounded-lg shadow-[0_16px_48px_rgba(0,0,0,0.6)] p-4 cursor-pointer pointer-events-auto [animation:popup-fade-in_0.15s_ease-out]"
            style={style}
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
            onClick={() => {
                hidePopup();
                navigate(`/match/${fixture.id}`);
            }}
        >
            {venue && (
                <div className="mb-2">
                    {venue.image && !venueImgError ? (
                        <img
                            key={venue.image}
                            src={venue.image}
                            alt={venue.name}
                            className="w-full h-[120px] object-cover rounded-sm mb-1"
                            onError={() => setVenueImgError(true)}
                        />
                    ) : (
                        <div className="w-full h-[120px] bg-bg-secondary rounded-sm mb-1 flex items-center justify-center">
                            <span className="text-[2rem]">🏟️</span>
                        </div>
                    )}
                    <div className="text-[0.75rem] text-text-secondary mb-1">
                        📍 {venue.name}
                        {venue.city ? `, ${venue.city}` : ''}
                    </div>
                </div>
            )}

            <div className="text-center mb-2">
                {isUpcoming && (
                    <span className={`${badgeBase} bg-accent-blue/15 text-accent-blue`}>
                        Upcoming
                    </span>
                )}
                {fixture.status === 'postponed' && (
                    <span className={`${badgeBase} bg-accent-orange/15 text-accent-orange`}>
                        Postponed
                    </span>
                )}
                {isPlayed && (
                    <span className={`${badgeBase} bg-accent-green/15 text-accent-green`}>
                        Full Time
                    </span>
                )}
                {fixture.gameweek && (
                    <span className={`${badgeBase} bg-accent-blue/15 text-accent-blue ml-1`}>
                        Gameweek {fixture.gameweek}
                    </span>
                )}
            </div>

            <div className="flex items-center justify-center gap-3 mb-3">
                <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                    {homeTeam?.logo && (
                        <img
                            src={homeTeam.logo}
                            alt=""
                            className="w-9 h-9 object-contain"
                            onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                            }}
                        />
                    )}
                    <span className="text-[0.75rem] font-semibold text-center leading-tight overflow-hidden text-ellipsis whitespace-nowrap max-w-full">
                        {homeTeam?.name ?? 'Unknown'}
                    </span>
                </div>

                <div className="flex-shrink-0">
                    {isPlayed ? (
                        <span className="text-[1.6rem] font-bold tracking-wider">
                            {fixture.goalsHome} – {fixture.goalsAway}
                        </span>
                    ) : (
                        <span className="text-base font-medium text-text-muted">vs</span>
                    )}
                </div>

                <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                    {awayTeam?.logo && (
                        <img
                            src={awayTeam.logo}
                            alt=""
                            className="w-9 h-9 object-contain"
                            onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                            }}
                        />
                    )}
                    <span className="text-[0.75rem] font-semibold text-center leading-tight overflow-hidden text-ellipsis whitespace-nowrap max-w-full">
                        {awayTeam?.name ?? 'Unknown'}
                    </span>
                </div>
            </div>

            <div className="text-center text-[0.75rem] text-text-secondary border-t border-border pt-2">
                📅 {formatDate(fixture.scheduledAt)}
            </div>
        </div>
    );
}
