import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import MatchEventsTimeline from '../components/match/MatchEventsTimeline';
import MatchHeader from '../components/match/MatchHeader';
import TeamLineupColumn from '../components/match/TeamLineupColumn';
import { useMatchData } from '../hooks/useMatchData';

const backButtonClass =
    'bg-transparent border-none text-text-secondary cursor-pointer flex items-center gap-2 py-2 mb-5 text-[0.9rem] transition-colors hover:text-text-primary';

const MatchPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { fixture, homeLineup, awayLineup, timelineEvents, fetching, error } = useMatchData(id);

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [id]);

    if (fetching) {
        return (
            <div className="max-w-[1200px] mx-auto p-5">
                <button className={backButtonClass} onClick={() => navigate('/')}>
                    ← Back
                </button>
                <div className="text-center py-16">
                    <p>Loading match details...</p>
                </div>
            </div>
        );
    }

    if (error || !fixture) {
        return (
            <div className="max-w-[1200px] mx-auto p-5">
                <button className={backButtonClass} onClick={() => navigate('/')}>
                    ← Back
                </button>
                <div className="text-center py-16 text-accent-red">
                    <p>Error loading match. {error?.message}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-[1200px] mx-auto p-5">
            <button className={backButtonClass} onClick={() => navigate('/')}>
                ← Back to Standings
            </button>

            <MatchHeader fixture={fixture} />

            <div className="grid grid-cols-[280px_1fr_280px] gap-[30px] max-md:grid-cols-1 max-md:gap-5">
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
