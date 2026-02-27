import React, { useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from 'urql';
import PlayerInfoPopup from '../components/PlayerInfoPopup';
import './MatchPage.css';

const MATCH_QUERY = `
  query GetMatch($id: String!) {
    fixture(id: $id) {
      id
      season
      leagueSourceId
      scheduledAt
      status
      goalsHome
      goalsAway
      homeTeam {
        id
        name
        shortName
        logo
        sourceId
      }
      awayTeam {
        id
        name
        shortName
        logo
        sourceId
      }
      venue {
        name
        city
        image
      }
      events {
        minute
        extraMinute
        teamId
        playerName
        assistName
        type
        detail
        comments
      }
      lineups {
        teamSourceId
        teamName
        teamLogo
        formation
        coachName
        coachPhoto
        startXI {
          name
          sourceId
          photo
        }
        substitutes {
          name
          sourceId
          photo
        }
      }
    }
  }
`;

const PlayerRow = ({ player, season, leagueSourceId, reverse }: { player: any; season: number; leagueSourceId?: number; reverse?: boolean }) => {
    const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
    const [showPopup, setShowPopup] = useState(false);
    const hoverTimer = useRef<any>(null);

    const handleMouseEnter = (e: React.MouseEvent) => {
        const rect = e.currentTarget.getBoundingClientRect();
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        hoverTimer.current = setTimeout(() => {
            setAnchorRect(rect);
            setShowPopup(true);
        }, 150); // Faster popup
    };

    const handleMouseLeave = () => {
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        // Add a slight delay before closing so user can move mouse into popup if needed
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

const MatchPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [{ data, fetching, error }] = useQuery({
        query: MATCH_QUERY,
        variables: { id },
        pause: !id
    });

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [id]);

    const fixture = data?.fixture;

    // Group lineups by home/away
    const homeLineup = useMemo(() => {
        if (!fixture?.lineups || !fixture.homeTeam) return null;
        return fixture.lineups.find((l: any) => l.teamSourceId === fixture.homeTeam.sourceId) || null;
    }, [fixture]);

    const awayLineup = useMemo(() => {
        if (!fixture?.lineups || !fixture.awayTeam) return null;
        return fixture.lineups.find((l: any) => l.teamSourceId === fixture.awayTeam.sourceId) || null;
    }, [fixture]);

    // Group events into a unified timeline, sorted by minute
    const timelineEvents = useMemo(() => {
        if (!fixture?.events) return [];
        const rawEvents = [...fixture.events].sort((a, b) => {
            if (a.minute === b.minute) {
                return (a.extraMinute || 0) - (b.extraMinute || 0);
            }
            return a.minute - b.minute;
        });

        const collapsed: any[] = [];
        for (const evt of rawEvents) {
            if (evt.type === 'subst') {
                const prev = collapsed.length > 0 ? collapsed[collapsed.length - 1] : null;
                if (prev && prev.minute === evt.minute && prev.teamId === evt.teamId && prev.type === 'subst_group') {
                    prev.subs.push(evt);
                } else if (prev && prev.minute === evt.minute && prev.teamId === evt.teamId && prev.type === 'subst') {
                    const group = {
                        ...prev,
                        type: 'subst_group',
                        subs: [prev, evt]
                    };
                    collapsed[collapsed.length - 1] = group;
                } else {
                    collapsed.push(evt);
                }
            } else {
                collapsed.push(evt);
            }
        }
        return collapsed;
    }, [fixture?.events]);

    if (fetching) {
        return (
            <div className="match-page-container">
                <button className="back-button" onClick={() => navigate('/')}>← Back</button>
                <div style={{ textAlign: 'center', padding: '60px' }}>
                    <p>Loading match details...</p>
                </div>
            </div>
        );
    }

    if (error || !fixture) {
        return (
            <div className="match-page-container">
                <button className="back-button" onClick={() => navigate('/')}>← Back</button>
                <div style={{ textAlign: 'center', padding: '60px', color: 'red' }}>
                    <p>Error loading match. {error?.message}</p>
                </div>
            </div>
        );
    }

    const { homeTeam, awayTeam, venue } = fixture;
    const isPlayed = fixture.status === 'played';

    return (
        <div className="match-page-container">
            <button className="back-button" onClick={() => navigate('/')}>← Back to Standings</button>

            <div className="match-header">
                {venue && (
                    <div className="match-venue-banner">
                        {venue.image ? (
                            <img src={venue.image} alt={venue.name} className="venue-bg" />
                        ) : (
                            <div className="venue-bg-placeholder"></div>
                        )}
                        <div className="venue-overlay">
                            <h2>{venue.name}</h2>
                            {venue.city && <p>{venue.city}</p>}
                        </div>
                    </div>
                )}

                <div className="match-score-card">
                    <div className="team-block home-team">
                        {homeTeam.logo && <img src={homeTeam.logo} alt={homeTeam.name} />}
                        <h3>{homeTeam.name}</h3>
                    </div>

                    <div className="score-block">
                        <div className="status-badge">
                            {isPlayed ? 'Full Time' : fixture.status === 'live' ? 'Live' : 'Upcoming'}
                        </div>
                        <div className="score-display">
                            {isPlayed || fixture.status === 'live' ? (
                                `${fixture.goalsHome ?? '-'} : ${fixture.goalsAway ?? '-'}`
                            ) : (
                                'VS'
                            )}
                        </div>
                        <div className="match-date">
                            {new Date(fixture.scheduledAt).toLocaleString()}
                        </div>
                    </div>

                    <div className="team-block away-team">
                        {awayTeam.logo && <img src={awayTeam.logo} alt={awayTeam.name} />}
                        <h3>{awayTeam.name}</h3>
                    </div>
                </div>
            </div>

            <div className="match-content-grid">
                {/* Home Team Column */}
                <div className="team-column">
                    {homeLineup && (
                        <>
                            <div className="coach-card">
                                {homeLineup.coachPhoto ? (
                                    <img src={homeLineup.coachPhoto} alt={homeLineup.coachName} className="coach-img" />
                                ) : (
                                    <div className="coach-placeholder">👤</div>
                                )}
                                <div>
                                    <div className="coach-label">Coach</div>
                                    <div className="coach-name">{homeLineup.coachName || 'Unknown'}</div>
                                    <div className="formation-label">{homeLineup.formation}</div>
                                </div>
                            </div>

                            <h4>Starting XI</h4>
                            <ul className="player-list">
                                {homeLineup.startXI?.map((p: any) => (
                                    <PlayerRow key={`home-start-${p.sourceId}`} player={p} season={fixture.season} leagueSourceId={fixture.leagueSourceId} />
                                ))}
                            </ul>

                            <h4>Substitutes</h4>
                            <p className="subs-list-text">
                                {homeLineup.substitutes?.map((p: any) => p.name).join(', ')}
                            </p>
                        </>
                    )}
                </div>

                {/* Timeline / Events Column */}
                <div className="timeline-column">
                    <h3>Match Events</h3>
                    {timelineEvents.length === 0 ? (
                        <p className="no-events">No events recorded.</p>
                    ) : (
                        <div className="timeline-list">
                            {timelineEvents.map((evt: any, i: number) => {
                                const isHome = evt.teamId === homeTeam.sourceId;

                                let content;
                                if (evt.type === 'subst_group') {
                                    content = evt.subs.map((sub: any, idx: number) => (
                                        <div key={idx} className="event-sub">
                                            <span className="event-out">{sub.playerName}</span> <span className="sub-icon">🔁</span> <span className="event-player">{sub.assistName}</span>
                                        </div>
                                    ));
                                } else if (evt.type === 'subst') {
                                    content = (
                                        <div className="event-sub">
                                            <span className="event-out">{evt.playerName}</span> <span className="sub-icon">🔁</span> <span className="event-player">{evt.assistName}</span>
                                        </div>
                                    );
                                } else {
                                    let icon = '';
                                    if (evt.type === 'Goal') icon = '⚽️';
                                    else if (evt.detail === 'Yellow Card') icon = '🟨';
                                    else if (evt.detail === 'Red Card') icon = '🟥';

                                    content = (
                                        <>
                                            <span className="event-type">{icon} {evt.type} {evt.detail !== 'Normal Goal' ? evt.detail : ''}</span>
                                            <span className="event-player">{evt.playerName}</span>
                                            {evt.comments && <span className="event-comment">({evt.comments})</span>}
                                        </>
                                    );
                                }

                                return (
                                    <div key={i} className={`timeline-event`}>
                                        <div className="event-time">
                                            {evt.minute}{evt.extraMinute ? `+${evt.extraMinute}` : ''}'
                                        </div>
                                        <div className={`event-layout ${isHome ? 'event-layout-home' : 'event-layout-away'}`}>
                                            <div className={`event-details ${isHome ? 'event-details-home' : 'event-details-away'}`}>
                                                {content}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Away Team Column */}
                <div className="team-column">
                    {awayLineup && (
                        <>
                            <div className="coach-card coach-card-reverse">
                                {awayLineup.coachPhoto ? (
                                    <img src={awayLineup.coachPhoto} alt={awayLineup.coachName} className="coach-img" />
                                ) : (
                                    <div className="coach-placeholder">👤</div>
                                )}
                                <div style={{ textAlign: 'right' }}>
                                    <div className="coach-label">Coach</div>
                                    <div className="coach-name">{awayLineup.coachName || 'Unknown'}</div>
                                    <div className="formation-label">{awayLineup.formation}</div>
                                </div>
                            </div>

                            <h4 style={{ textAlign: 'right' }}>Starting XI</h4>
                            <ul className="player-list" style={{ textAlign: 'right' }}>
                                {awayLineup.startXI?.map((p: any) => (
                                    <PlayerRow key={`away-start-${p.sourceId}`} player={p} season={fixture.season} leagueSourceId={fixture.leagueSourceId} reverse />
                                ))}
                            </ul>

                            <h4 style={{ textAlign: 'right' }}>Substitutes</h4>
                            <p className="subs-list-text" style={{ textAlign: 'right' }}>
                                {awayLineup.substitutes?.map((p: any) => p.name).join(', ')}
                            </p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MatchPage;
