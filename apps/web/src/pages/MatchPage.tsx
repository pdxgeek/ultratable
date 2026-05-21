import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import MatchHeader from '../components/match/MatchHeader';
import MatchEventsTimeline from '../components/match/MatchEventsTimeline';
import TeamLineupColumn from '../components/match/TeamLineupColumn';
import { useMatchData } from '../hooks/useMatchData';
import './MatchPage.css';

const MatchPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { fixture, homeLineup, awayLineup, timelineEvents, fetching, error } = useMatchData(id);

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [id]);

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

    return (
        <div className="match-page-container">
            <button className="back-button" onClick={() => navigate('/')}>← Back to Standings</button>

            <MatchHeader fixture={fixture} />

            <div className="match-content-grid">
                <TeamLineupColumn
                    lineup={homeLineup}
                    season={fixture.season}
                    leagueSourceId={fixture.leagueSourceId}
                    keyPrefix="home"
                />
                <MatchEventsTimeline
                    events={timelineEvents}
                    homeTeamSourceId={fixture.homeTeam.sourceId}
                />
                <TeamLineupColumn
                    lineup={awayLineup}
                    season={fixture.season}
                    leagueSourceId={fixture.leagueSourceId}
                    keyPrefix="away"
                    reverse
                />
            </div>
        </div>
    );
};

export default MatchPage;
