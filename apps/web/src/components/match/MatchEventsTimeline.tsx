import type { MatchEvent } from './types';

import React from 'react';

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
    <div className="text-[0.9rem] flex items-center gap-2 mb-1 last:mb-0">
        <span className="text-text-muted">{sub.playerName}</span>
        <span className="text-[0.8rem] text-text-secondary">🔁</span>
        <span className="font-medium text-text-primary text-[0.85rem]">{sub.assistName}</span>
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
            <span className="text-[0.85rem] font-normal text-text-secondary">
                {eventIcon(evt)} {evt.type} {evt.detail !== 'Normal Goal' ? evt.detail : ''}
            </span>
            <span className="text-[0.85rem] font-medium text-text-primary">{evt.playerName}</span>
            {evt.comments && (
                <span className="text-[0.75rem] italic text-text-muted">({evt.comments})</span>
            )}
        </>
    );
};

const MatchEventsTimeline: React.FC<MatchEventsTimelineProps> = ({ events, homeTeamSourceId }) => {
    return (
        <div className="bg-bg-accent rounded-xl p-5 shadow-[0_2px_10px_rgba(0,0,0,0.1)] max-md:order-3">
            <h3 className="mt-0 mb-5 text-center text-[1.1rem] pb-4 border-b border-border">
                Match Events
            </h3>
            {events.length === 0 ? (
                <p className="text-center text-text-muted italic py-10">No events recorded.</p>
            ) : (
                <div className="flex flex-col">
                    {events.map((evt, i) => {
                        const isHome = evt.teamId === homeTeamSourceId;
                        return (
                            <div
                                key={i}
                                className="grid grid-cols-[70px_1fr] gap-[15px] items-center py-3 border-b border-border last:border-b-0"
                            >
                                <div className="font-bold text-accent-blue text-[0.9rem] text-right pr-[15px] border-r-2 border-border">
                                    {evt.minute}
                                    {evt.extraMinute ? `+${evt.extraMinute}` : ''}'
                                </div>
                                <div
                                    className={`flex flex-1 ${isHome ? 'justify-start' : 'justify-end'}`}
                                >
                                    <div
                                        className={`inline-flex flex-col gap-[3px] max-w-[80%] ${isHome ? 'text-left' : 'text-right'}`}
                                    >
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
