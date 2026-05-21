import type { MatchFixture } from './types';

import React from 'react';

interface MatchHeaderProps {
    fixture: MatchFixture;
}

const MatchHeader: React.FC<MatchHeaderProps> = ({ fixture }) => {
    const { homeTeam, awayTeam, venue, status, goalsHome, goalsAway, scheduledAt } = fixture;
    const isPlayed = status === 'played';
    const isLive = status === 'live';

    return (
        <div className="bg-bg-accent rounded-xl overflow-hidden mb-[30px] shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
            {venue && (
                <div className="relative h-[300px] w-full">
                    {venue.image ? (
                        <img
                            src={venue.image}
                            alt={venue.name}
                            className="w-full h-full object-cover object-center"
                        />
                    ) : (
                        <div className="w-full h-full bg-[linear-gradient(45deg,#1a1a2e,#16213e)]" />
                    )}
                    <div className="absolute bottom-0 left-0 right-0 p-5 bg-[linear-gradient(to_top,rgba(0,0,0,0.8),transparent)] text-white">
                        <h2 className="m-0 text-2xl">{venue.name}</h2>
                        {venue.city && <p className="mt-1 text-sm text-[#e0e0e0]">{venue.city}</p>}
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center px-10 pt-2.5 pb-7 -mt-[60px] relative z-10">
                <div className="flex flex-col items-center flex-1">
                    {homeTeam.logo && (
                        <img
                            src={homeTeam.logo}
                            alt={homeTeam.name}
                            className="h-[120px] w-[120px] object-contain mb-3 drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]"
                        />
                    )}
                    <h3 className="m-0 text-xl text-center">{homeTeam.name}</h3>
                </div>

                <div className="flex flex-col items-center flex-1 mt-[50px]">
                    <div className="bg-accent-blue text-white px-3 py-1 rounded-2xl text-[0.8rem] font-semibold uppercase tracking-wider">
                        {isPlayed ? 'Full Time' : isLive ? 'Live' : 'Upcoming'}
                    </div>
                    <div className="text-[3rem] font-extrabold leading-none my-2.5 tabular-nums">
                        {isPlayed || isLive ? `${goalsHome ?? '-'} : ${goalsAway ?? '-'}` : 'VS'}
                    </div>
                    <div className="text-[0.85rem] text-text-muted">
                        {new Date(scheduledAt).toLocaleString()}
                    </div>
                </div>

                <div className="flex flex-col items-center flex-1">
                    {awayTeam.logo && (
                        <img
                            src={awayTeam.logo}
                            alt={awayTeam.name}
                            className="h-[120px] w-[120px] object-contain mb-3 drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]"
                        />
                    )}
                    <h3 className="m-0 text-xl text-center">{awayTeam.name}</h3>
                </div>
            </div>
        </div>
    );
};

export default MatchHeader;
