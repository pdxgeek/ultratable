import React from 'react';
import type { MatchEvent } from './types';

interface MatchEventsTimelineProps {
    events: MatchEvent[];
    homeTeamSourceId: number;
}

const eventIcon = (evt: MatchEvent): string => {
    if (evt.type === 'Goal') return '⚽️';
    if (evt.detail === 'Yellow Card') return '🟨';
    if (evt.detail === 'Red Card') return '🟥';
    return '';
};

const SubstitutionRow: React.FC<{ sub: MatchEvent }> = ({ sub }) => (
    <div className="event-sub">
        <span className="event-out">{sub.playerName}</span>{' '}
        <span className="sub-icon">🔁</span>{' '}
        <span className="event-player">{sub.assistName}</span>
    </div>
);

const EventContent: React.FC<{ evt: MatchEvent }> = ({ evt }) => {
    if (evt.type === 'subst_group') {
        return (
            <>
                {(evt.subs || []).map((sub, idx) => (
                    <SubstitutionRow key={idx} sub={sub} />
                ))}
            </>
        );
    }
    if (evt.type === 'subst') {
        return <SubstitutionRow sub={evt} />;
    }
    return (
        <>
            <span className="event-type">
                {eventIcon(evt)} {evt.type} {evt.detail !== 'Normal Goal' ? evt.detail : ''}
            </span>
            <span className="event-player">{evt.playerName}</span>
            {evt.comments && <span className="event-comment">({evt.comments})</span>}
        </>
    );
};

const MatchEventsTimeline: React.FC<MatchEventsTimelineProps> = ({ events, homeTeamSourceId }) => {
    return (
        <div className="timeline-column">
            <h3>Match Events</h3>
            {events.length === 0 ? (
                <p className="no-events">No events recorded.</p>
            ) : (
                <div className="timeline-list">
                    {events.map((evt, i) => {
                        const isHome = evt.teamId === homeTeamSourceId;
                        return (
                            <div key={i} className="timeline-event">
                                <div className="event-time">
                                    {evt.minute}{evt.extraMinute ? `+${evt.extraMinute}` : ''}'
                                </div>
                                <div className={`event-layout ${isHome ? 'event-layout-home' : 'event-layout-away'}`}>
                                    <div className={`event-details ${isHome ? 'event-details-home' : 'event-details-away'}`}>
                                        <EventContent evt={evt} />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default MatchEventsTimeline;
