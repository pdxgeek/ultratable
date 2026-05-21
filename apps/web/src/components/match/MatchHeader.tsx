import React from 'react';
import type { MatchFixture } from './types';

interface MatchHeaderProps {
    fixture: MatchFixture;
}

const MatchHeader: React.FC<MatchHeaderProps> = ({ fixture }) => {
    const { homeTeam, awayTeam, venue, status, goalsHome, goalsAway, scheduledAt } = fixture;
    const isPlayed = status === 'played';
    const isLive = status === 'live';

    return (
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
                        {isPlayed ? 'Full Time' : isLive ? 'Live' : 'Upcoming'}
                    </div>
                    <div className="score-display">
                        {isPlayed || isLive ? (
                            `${goalsHome ?? '-'} : ${goalsAway ?? '-'}`
                        ) : (
                            'VS'
                        )}
                    </div>
                    <div className="match-date">
                        {new Date(scheduledAt).toLocaleString()}
                    </div>
                </div>

                <div className="team-block away-team">
                    {awayTeam.logo && <img src={awayTeam.logo} alt={awayTeam.name} />}
                    <h3>{awayTeam.name}</h3>
                </div>
            </div>
        </div>
    );
};

export default MatchHeader;
