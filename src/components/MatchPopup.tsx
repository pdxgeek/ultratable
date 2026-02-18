import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Fixture, MatchEvent, Team } from '../types';
import { fetchEvents } from '../services/apiFootball';
import { transformEvents } from '../services/dataCompiler';
import { gfxRegistry } from '../services/gfxRegistry';
import { useLeague } from '../context/LeagueContext';
import { formatFullDateTime } from '../utils/dateUtils';
import TeamLogo from './TeamLogo';
import { useCachedImage } from '../hooks/useCachedImage';
import { usePopup } from '../context/PopupContext';

// Track which fixtures have had events loaded to prevent redundant API calls
const loadedEventsCache = new Set<string>();

interface MatchPopupProps {
    fixture: Fixture;
    teams: Map<string, Team>;
    anchorRect: DOMRect | null;
    onClose: () => void; // still used for existing props if needed, but we'll use context for immediate hide
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
}

export default function MatchPopup({
    fixture,
    teams,
    anchorRect,
    onMouseEnter,
    onMouseLeave,
}: MatchPopupProps) {
    const navigate = useNavigate();
    const { hidePopup } = usePopup();
    const { activeLeague: apiLeague, activeSeason: apiSeason } = useLeague();

    const [events, setEvents] = useState<MatchEvent[] | null>(
        fixture.events ?? null
    );
    const [loading, setLoading] = useState(false);
    const popupRef = useRef<HTMLDivElement>(null);

    const handleClick = () => {
        hidePopup();
        navigate(`/match/${fixture.id}`);
    };

    const homeTeam = teams.get(fixture.homeTeamId);
    const awayTeam = teams.get(fixture.awayTeamId);

    // Use denormalized logo properties if available, fallback to GFX registry (which might need strings/ints handling)
    // Team entity has `logo`.
    const homeLogo = homeTeam?.logo || gfxRegistry.getLogo(fixture.homeTeamId);
    const awayLogo = awayTeam?.logo || gfxRegistry.getLogo(fixture.awayTeamId);

    // For venue images: try fixture.venueImage (for mock leagues with direct URLs),
    // otherwise get from graphics registry (for real leagues which are already cached as blob URLs)
    const venueFromRegistry = gfxRegistry.getVenue(fixture.homeTeamId);
    const venueDirectUrl = useCachedImage(fixture.venueImage);
    const venueImageUrl = venueDirectUrl || venueFromRegistry;

    const loadEvents = useCallback(async () => {
        // Check cache first to prevent redundant API calls
        if (loadedEventsCache.has(fixture.id) || events || fixture.status !== 'played') return;

        // Skip fetch if no API key for real providers
        // Provider will handle whether it needs a key or not
        const hasKey = localStorage.getItem('ultratable_api_key');
        const isApiFootball = fixture.externalReferences.some(r => r.integrationName === 'api-football');

        if (!hasKey && isApiFootball) {
            // No key for real API
            return;
        }

        setLoading(true);
        try {
            const leagueConfig = {
                id: apiLeague?.id || '0',
                season: apiSeason?.season || 0,
                integrations: apiLeague?.integrations,
                externalReferences: apiSeason?.externalReferences || apiLeague?.externalReferences
            } as any;
            const apiEvents = await fetchEvents(leagueConfig, fixture.id);
            const transformed = transformEvents(apiEvents);
            setEvents(transformed);
            loadedEventsCache.add(fixture.id); // Mark as loaded
        } catch (err) {
            console.warn('Failed to load events:', err);
        } finally {
            setLoading(false);
        }
    }, [fixture.id, fixture.status, events, apiLeague, apiSeason]);

    useEffect(() => {
        if (!events && fixture.status === 'played' && !loading) {
            loadEvents();
        }
    }, [events, fixture.status, loading, loadEvents]);

    const [venueImgError, setVenueImgError] = useState(false);

    // Reset error when URL changes
    // But since MatchPopup is often unmounted/remounted, initial state false is likely fine
    // However, if we keep the same popup instance and change data (unlikely with current context), we might need an effect.
    // The key={fixture.id} strategy or just Effect helps.
    // Actually, useCachedImage handles the URL part. 
    // If venueImageUrl changes, we should reset error.

    // We can just rely on the key prop or useEffect if needed.
    // Let's add an effect to be safe, or just key the image.

    if (!anchorRect) return null;

    const style = getPopupPosition(anchorRect);

    const homeGoals = events?.filter(
        (e) => e.type === 'Goal' && e.teamId === fixture.homeTeamId
    );
    const awayGoals = events?.filter(
        (e) => e.type === 'Goal' && e.teamId === fixture.awayTeamId
    );

    const isUpcoming = fixture.status === 'scheduled';
    const isPostponed = fixture.status === 'postponed';


    return (
        <div
            className="match-popup"
            ref={popupRef}
            style={{ ...style, cursor: 'pointer' }}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            onClick={handleClick}
        >
            {fixture.venue && (
                <div className="match-popup__venue">
                    {venueImageUrl && !venueImgError ? (
                        <img
                            key={venueImageUrl} // Remount on url change to reset internal load state if any
                            src={venueImageUrl}
                            alt={fixture.venue}
                            className="match-popup__venue-image"
                            style={{ width: '100%', borderRadius: '4px', marginBottom: '4px', height: '120px', objectFit: 'cover' }}
                            onError={() => setVenueImgError(true)}
                        />
                    ) : (
                        <div className="match-popup__venue-placeholder" style={{
                            width: '100%',
                            height: '120px',
                            backgroundColor: '#34495e',
                            borderRadius: '4px',
                            marginBottom: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#ecf0f1',
                            flexDirection: 'column',
                            textAlign: 'center',
                            padding: '0.5rem'
                        }}>
                            <span style={{ fontSize: '2rem' }}>🏟️</span>
                        </div>
                    )}
                    <div>📍 {fixture.venue}{fixture.city ? `, ${fixture.city}` : ''}</div>
                </div>
            )}

            <div className="match-popup__status">
                {isUpcoming && <span className="badge badge--upcoming">Upcoming</span>}
                {isPostponed && <span className="badge badge--postponed">Postponed</span>}
                {fixture.status === 'played' && <span className="badge badge--played">Full Time</span>}
                {fixture.status === 'cancelled' && <span className="badge badge--cancelled">Cancelled</span>}
            </div>

            <div className="match-popup__header">
                <div className="match-popup__team match-popup__team--home">
                    <TeamLogo
                        url={homeLogo}
                        teamId={homeTeam?.id ?? fixture.homeTeamId}
                        name={homeTeam?.commonName}
                        className="match-popup__logo"
                        size={64}
                    />
                    <span className="match-popup__team-name">{homeTeam?.commonName}</span>
                </div>

                <div className="match-popup__score">
                    {fixture.status === 'played' ? (
                        <span className="match-popup__score-text">
                            {fixture.homeGoals} – {fixture.awayGoals}
                        </span>
                    ) : (
                        <span className="match-popup__score-text match-popup__score-text--vs">
                            vs
                        </span>
                    )}
                </div>

                <div className="match-popup__team match-popup__team--away">
                    <TeamLogo
                        url={awayLogo}
                        teamId={awayTeam?.id ?? fixture.awayTeamId}
                        name={awayTeam?.commonName}
                        className="match-popup__logo"
                        size={64}
                    />
                    <span className="match-popup__team-name">{awayTeam?.commonName}</span>
                </div>
            </div>

            {fixture.status === 'played' && (
                <div className="match-popup__events">
                    {loading && <div className="match-popup__loading">Loading scorers...</div>}
                    {!loading && events && (
                        <div className="match-popup__goals-grid">
                            <div className="match-popup__goals-col">
                                {homeGoals?.map((e, i) => (
                                    <div key={i} className="match-popup__goal">
                                        <span className="match-popup__goal-icon">⚽</span>
                                        <span className="match-popup__goal-player">
                                            {e.playerName ?? 'Unknown'}
                                        </span>
                                        <span className="match-popup__goal-minute">
                                            {e.minute}{e.extraMinute ? `+${e.extraMinute}` : ''}'
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <div className="match-popup__goals-col match-popup__goals-col--away">
                                {awayGoals?.map((e, i) => (
                                    <div key={i} className="match-popup__goal match-popup__goal--away">
                                        <span className="match-popup__goal-minute">
                                            {e.minute}{e.extraMinute ? `+${e.extraMinute}` : ''}'
                                        </span>
                                        <span className="match-popup__goal-player">
                                            {e.playerName ?? 'Unknown'}
                                        </span>
                                        <span className="match-popup__goal-icon">⚽</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="match-popup__date">
                📅 {formatFullDateTime(fixture.date)}
                <span className="match-popup__gameweek"> • Gameweek {fixture.gameweek}</span>
            </div>
        </div>
    );
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
