import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { fetchFixtureDetails, fetchLineups, fetchEvents } from '../services/apiFootball';
import type { Fixture } from '../types';
import { useCachedImage } from '../hooks/useCachedImage';
import TeamLogo from '../components/TeamLogo';
import { gfxRegistry } from '../services/gfxRegistry';
import { fetchPlayersFromLineup } from '../services/playerData';

// Component to handle player photo display
function PlayerPhoto({ playerId, name }: { playerId: string; name: string }) {
    // Try to get photo from graphics registry (will be there after fetchPlayersFromLineup completes)
    // Extract external ID from internal ID (format: "api-football:12345")
    const externalId = playerId.split(':')[1];
    const photoUrl = gfxRegistry.getById(`gfx_player_${externalId}_photo`);

    if (!photoUrl) {
        // Show placeholder with initials
        const initials = name
            .split(' ')
            .map(n => n[0])
            .join('')
            .substring(0, 2)
            .toUpperCase();
        return (
            <div className="player-photo" style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 'bold',
                fontSize: '0.7rem'
            }}>
                {initials}
            </div>
        );
    }

    return (
        <img
            src={photoUrl}
            alt={name}
            className="player-photo"
            onError={(e) => {
                // Show initials fallback on error
                const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                const parent = e.currentTarget.parentElement;
                if (parent) {
                    parent.innerHTML = `<div class="player-photo" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 0.7rem;">${initials}</div>`;
                }
            }}
        />
    );
}

export default function MatchPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    // ID handling: URL id is string (maybe integrationId or internalId).
    // Service expects string.
    const fixtureId = id || '';

    // Hook call must be inside component, but we need fixture data first?
    // Actually, we can't call hook conditionally. 
    // We need to call it with null if fixture is not loaded.
    // access fixture.venueImage safely.
    // But fixture is loaded via useQuery.
    // So we need to put this hook call AFTER fixture is loaded? 
    // NO, hooks cannot be conditional.
    // We must call it at top level.
    // But we don't have fixture yet.
    // We can pass undefined/null to hook.
    // But we need to get fixture from useQuery state... which is lower down.
    // Wait, useQuery is at top.

    // Let's look at the file again.
    // useQuery is line 16.
    // fixture is available there.
    // So we can call useCachedImage below that.

    const queryClient = useQueryClient();

    const { data: fixture, isLoading: loadingFixture, error: errorFixture } = useQuery({
        queryKey: ['fixture', fixtureId],
        queryFn: () => fetchFixtureDetails(fixtureId),
        enabled: !!fixtureId,
        initialData: () => {
            // Attempt to find fixture in existing 'fixtures' queries (which are Fixture[])
            const queries = queryClient.getQueriesData<Fixture[]>({ queryKey: ['fixtures'] });
            for (const [_, data] of queries) {
                // Determine equality. If internalId, match directly. 
                // If ID is string in both places, simple match.
                // If fixtureId from param is 'mock:123', and fixture.id is 'nano_xyz', we can't match easily without map.
                // But typically navigation comes from list which has the IDs.
                const found = data?.find(f => f.id === fixtureId || f.integrationId === fixtureId);
                if (found) return found;
            }
            return undefined;
        },
    });

    const { data: events = [] } = useQuery({
        queryKey: ['events', fixtureId],
        queryFn: () => fetchEvents(fixtureId),
        enabled: !!fixtureId,
    });

    const { data: lineups = [] } = useQuery({
        queryKey: ['lineups', fixtureId],
        queryFn: () => fetchLineups(fixtureId),
        enabled: !!fixtureId,
    });

    // For venue images: try fixture.venueImage (for mock leagues with direct URLs),
    // otherwise get from graphics registry (for real leagues which are already cached as blob URLs)
    const venueFromRegistry = fixture ? gfxRegistry.getVenue(fixture.homeTeamId) : undefined;
    const venueDirectUrl = useCachedImage(fixture?.venueImage);
    const venueImageUrl = venueDirectUrl || venueFromRegistry;

    // Fetch player photos when lineups are loaded
    const [playerPhotosLoaded, setPlayerPhotosLoaded] = useState(false);
    useEffect(() => {
        if (!lineups || lineups.length === 0 || playerPhotosLoaded) return;

        // Extract player IDs from lineup
        const playerIds: number[] = [];
        lineups.forEach(lineup => {
            lineup.startXI.forEach(item => {
                // Extract external ID from integrationId (format: "api-football:12345")
                const externalId = parseInt(item.player.integrationId.split(':')[1]);
                if (!isNaN(externalId)) {
                    playerIds.push(externalId);
                }
            });
            lineup.substitutes.forEach(item => {
                const externalId = parseInt(item.player.integrationId.split(':')[1]);
                if (!isNaN(externalId)) {
                    playerIds.push(externalId);
                }
            });
        });

        if (playerIds.length > 0 && fixture) {
            // Extract season from fixture date (year)
            const season = new Date(fixture.date).getFullYear();
            fetchPlayersFromLineup(playerIds, season).then(() => {
                setPlayerPhotosLoaded(true);
                console.log('Player photos loaded and cached');
            });
        }
    }, [lineups, playerPhotosLoaded, fixture]);

    // Only block if we have absolutely no fixture data
    if (loadingFixture && !fixture) return <div className="page loading">Loading Match Details...</div>;

    // Show error if we have no fixture and an error occurred
    const errorMsg = errorFixture instanceof Error ? errorFixture.message : 'Match not found';
    if (!fixture && errorFixture) return <div className="page error">{errorMsg}</div>;

    if (!fixture) return <div className="page error">Match not found</div>;

    const homeTeam = fixture.homeTeam;
    const awayTeam = fixture.awayTeam;
    const homeLineup = lineups.find(l => l.team.name === homeTeam.name); // Heuristic match by name if ID differs or using different ID systems
    // Ideally match by ID. Lineup team has ID. fixture.homeTeamId is string. Lineup.team.id is number (from API).
    // This mismatch is painful. We should normalize Lineup too or use loose matching.
    const awayLineup = lineups.find(l => l.team.name === awayTeam.name);

    return (
        <div className="page match-page">
            <button className="btn-back" onClick={() => navigate(-1)}>← Back</button>

            <div className="match-layout">
                {/* Left Column: Home Team */}
                <div className="match-col team-col home-col">
                    <div style={{ width: '120px', height: '120px', marginBottom: '16px' }}>
                        <TeamLogo
                            url={homeTeam.logo}
                            teamId={fixture.homeTeamId}
                            name={homeTeam.name}
                            className="team-logo-large"
                            size={120}
                        />
                    </div>
                    <h2 className="team-name">{homeTeam.name}</h2>

                    {homeLineup && (
                        <div className="lineup-container">
                            <h3>Starting XI</h3>
                            <ul className="player-list">
                                {homeLineup.startXI.map(item => (
                                    <li key={item.player.id} className="player-item">
                                        <PlayerPhoto playerId={item.player.integrationId} name={item.player.commonName} />
                                        <span className="player-number">{item.player.number}</span>
                                        <span className="player-name">{item.player.commonName}</span>
                                        <span className="player-pos">{item.player.pos}</span>
                                    </li>
                                ))}
                            </ul>
                            <h3>Substitutes</h3>
                            <ul className="player-list small">
                                {homeLineup.substitutes.map(item => (
                                    <li key={item.player.id} className="player-item">
                                        <span className="player-number">{item.player.number}</span>
                                        <span className="player-name">{item.player.commonName}</span>
                                        <span className="player-pos">{item.player.pos}</span>
                                    </li>
                                ))}
                            </ul>
                            <div className="coach-info">
                                <strong>Coach:</strong> {homeLineup.coach.name}
                            </div>
                        </div>
                    )}
                </div>

                {/* Center Column: Match Info */}
                <div className="match-col center-col">
                    <div className="venue-info">
                        {venueImageUrl ? (
                            <img
                                src={venueImageUrl}
                                alt={fixture.venue || 'Stadium'}
                                className="venue-image"
                                onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    const next = e.currentTarget.nextElementSibling as HTMLElement;
                                    if (next) next.classList.remove('hidden');
                                }}
                            />
                        ) : null}
                        <div className={`venue-placeholder ${venueImageUrl ? 'hidden' : ''}`} style={{
                            width: '100%',
                            height: '200px',
                            backgroundColor: '#2c3e50',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '8px',
                            marginBottom: '1rem',
                            color: '#bdc3c7',
                            flexDirection: 'column'
                        }}>
                            <span style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏟️</span>
                            <span>{fixture.venue || 'Stadium'}</span>
                        </div>
                        <h3>{fixture.venue}</h3>
                        <p>{fixture.city}</p>
                        <p>{new Date(fixture.date).toLocaleDateString()} {new Date(fixture.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>

                    <div className="score-board-large">
                        <div className="score">{fixture.homeGoals ?? 0} &ndash; {fixture.awayGoals ?? 0}</div>
                        <div className="match-status">{fixture.statusLong}</div>
                    </div>

                    <div className="events-timeline">
                        <h3>Match Events</h3>
                        {events.length === 0 ? <p className="no-events">No major events recorded</p> : (
                            <ul className="events-list">
                                {events.map((ev, i) => (
                                    <li key={i} className={clsx('event-item', ev.team.id.toString() === fixture.homeTeamId || ev.team.name === homeTeam.name ? 'home-event' : 'away-event')}>
                                        <span className="event-time">{ev.time.elapsed}'{ev.time.extra ? `+${ev.time.extra}` : ''}</span>
                                        <span className="event-detail">
                                            <strong>{ev.player.name}</strong> {ev.type === 'Goal' ? '⚽' : ev.type === 'Card' ? (ev.detail === 'Yellow Card' ? '🟨' : '🟥') : ev.type === 'subst' ? '⇄' : ''}
                                            {ev.detail !== 'Normal Goal' && ev.type === 'Goal' && ` (${ev.detail})`}
                                            {ev.assist.name && ` (assist: ${ev.assist.name})`}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                {/* Right Column: Away Team */}
                <div className="match-col team-col away-col">
                    <div style={{ width: '120px', height: '120px', marginBottom: '16px' }}>
                        <TeamLogo
                            url={awayTeam.logo}
                            teamId={fixture.awayTeamId}
                            name={awayTeam.name}
                            className="team-logo-large"
                            size={120}
                        />
                    </div>
                    <h2 className="team-name">{awayTeam.name}</h2>

                    {awayLineup && (
                        <div className="lineup-container">
                            <h3>Starting XI</h3>
                            <ul className="player-list">
                                {awayLineup.startXI.map(item => (
                                    <li key={item.player.id} className="player-item">
                                        <div className="player-info-right">
                                            <span className="player-pos">{item.player.pos}</span>
                                            <span className="player-name">{item.player.commonName}</span>
                                            <span className="player-number">{item.player.number}</span>
                                        </div>
                                        <PlayerPhoto playerId={item.player.integrationId} name={item.player.commonName} />
                                    </li>
                                ))}
                            </ul>
                            <h3>Substitutes</h3>
                            <ul className="player-list small">
                                {awayLineup.substitutes.map(item => (
                                    <li key={item.player.id} className="player-item right-align">
                                        <span className="player-pos">{item.player.pos}</span>
                                        <span className="player-name">{item.player.commonName}</span>
                                        <span className="player-number">{item.player.number}</span>
                                    </li>
                                ))}
                            </ul>
                            <div className="coach-info right-align">
                                <strong>Coach:</strong> {awayLineup.coach.name}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                .match-page {
                    padding: 20px;
                    max-width: 1200px;
                    margin: 0 auto;
                }
                .btn-back {
                    background: none;
                    border: none;
                    color: var(--text-secondary);
                    font-size: 1rem;
                    cursor: pointer;
                    margin-bottom: 20px;
                    padding: 0;
                }
                .btn-back:hover {
                    color: var(--text-primary);
                    text-decoration: underline;
                }
                .match-layout {
                    display: grid;
                    grid-template-columns: 1fr 1.2fr 1fr;
                    gap: 40px;
                    align-items: start;
                }
                .match-col {
                    display: flex;
                    flex-direction: column;
                }
                .team-col {
                    align-items: center;
                    text-align: center;
                }
                .center-col {
                    text-align: center;
                }
                .team-logo-large {
                    width: 120px;
                    height: 120px;
                    object-fit: contain;
                    margin-bottom: 16px;
                }
                .team-name {
                    font-size: 1.5rem;
                    margin: 0 0 20px 0;
                }
                .score-board-large {
                    background: var(--bg-surface);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-lg);
                    padding: 20px;
                    margin-bottom: 30px;
                }
                .score {
                    font-size: 3.5rem;
                    font-weight: 700;
                    line-height: 1;
                    margin-bottom: 8px;
                }
                .match-status {
                    color: var(--text-secondary);
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }
                .venue-info {
                    margin-bottom: 20px;
                    color: var(--text-secondary);
                }
                .venue-info h3 {
                    margin: 8px 0 0 0;
                    color: var(--text-primary);
                }
                .venue-info p {
                    margin: 4px 0 0 0;
                    font-size: 0.9rem;
                }
                .venue-image {
                    width: 100%;
                    max-width: 400px;
                    height: auto;
                    border-radius: var(--radius-md);
                    margin-bottom: 12px;
                    border: 1px solid var(--border-color);
                }
                .lineup-container {
                    width: 100%;
                    background: var(--bg-surface);
                    border-radius: var(--radius-md);
                    padding: 16px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }
                .lineup-container h3 {
                    font-size: 1rem;
                    margin: 0 0 12px 0;
                    text-align: left;
                    border-bottom: 1px solid var(--border-color);
                    padding-bottom: 8px;
                    color: var(--text-secondary);
                    text-transform: uppercase;
                }
                .player-list {
                    list-style: none;
                    padding: 0;
                    margin: 0 0 20px 0;
                }
                .player-item {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 6px 0;
                    border-bottom: 1px solid var(--border-color);
                    font-size: 0.95rem;
                }
                .player-item:last-child {
                    border-bottom: none;
                }
                .player-photo {
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    background: #ccc;
                    object-fit: cover;
                }
                .player-number {
                    font-weight: 700;
                    color: var(--text-secondary);
                    width: 24px;
                    text-align: center;
                }
                .player-pos {
                    font-size: 0.8rem;
                    color: var(--text-tertiary);
                    width: 24px;
                }
                .player-name {
                    font-weight: 500;
                }
                .player-info-right {
                    margin-left: auto;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    text-align: right;
                }
                .right-align {
                    justify-content: flex-end;
                    text-align: right;
                }
                .events-list {
                    list-style: none;
                    padding: 0;
                    max-width: 400px;
                    margin: 0 auto;
                }
                .event-item {
                    display: flex;
                    gap: 12px;
                    padding: 8px 0;
                    border-bottom: 1px solid var(--border-color);
                    align-items: center;
                }
                .event-time {
                    font-weight: 700;
                    color: var(--accent-primary);
                    width: 30px;
                    text-align: right;
                }
                .home-event {
                    justify-content: flex-start;
                }
                .away-event {
                    justify-content: flex-end;
                    flex-direction: row-reverse;
                }
                .coach-info {
                    margin-top: 10px;
                    text-align: left;
                    font-size: 0.9rem;
                }
                .coach-info.right-align {
                    text-align: right;
                }
                @media (max-width: 900px) {
                    .match-layout {
                        grid-template-columns: 1fr;
                    }
                    .center-col {
                        order: -1;
                    }
                }
            `}</style>
        </div>
    );
}
