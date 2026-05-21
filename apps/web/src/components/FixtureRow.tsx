import type { Fixture, Team } from '../db';

import { useNavigate } from 'react-router-dom';

interface FixtureRowProps {
    fixture: Fixture;
    teamId: string;
    teams: Map<string, Team>;
}

const dotColor: Record<'W' | 'D' | 'L', string> = {
    W: 'bg-accent-green',
    D: 'bg-text-muted',
    L: 'bg-accent-red',
};

const borderColor: Record<'W' | 'D' | 'L', string> = {
    W: 'border-l-2 border-accent-green',
    D: 'border-l-2 border-text-muted',
    L: 'border-l-2 border-accent-red',
};

export function FixtureRow({ fixture, teamId, teams }: FixtureRowProps) {
    const navigate = useNavigate();
    const isHome = fixture.homeTeamId === teamId;
    const opponentId = isHome ? fixture.awayTeamId : fixture.homeTeamId;
    const opponent = teams.get(opponentId);

    let resultChar: 'W' | 'D' | 'L' | '' = '';

    if (fixture.status === 'played' && fixture.goalsHome != null && fixture.goalsAway != null) {
        const teamGoals = isHome ? fixture.goalsHome : fixture.goalsAway;
        const oppGoals = isHome ? fixture.goalsAway : fixture.goalsHome;
        if (teamGoals > oppGoals) resultChar = 'W';
        else if (teamGoals < oppGoals) resultChar = 'L';
        else resultChar = 'D';
    }

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };

    return (
        <div
            className={`flex items-center gap-2 px-1.5 py-1 rounded-sm text-xs transition-colors hover:bg-white/5 cursor-pointer ${resultChar ? borderColor[resultChar] : ''}`}
            onClick={() => navigate(`/match/${fixture.id}`)}
        >
            <span className="text-[0.65rem] font-bold text-text-muted w-3.5 text-left">
                {isHome ? 'H' : 'A'}
            </span>
            {opponent?.logo && (
                <img
                    src={opponent.logo}
                    alt=""
                    className="w-[18px] h-[18px] object-contain"
                    onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                    }}
                />
            )}
            <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                {opponent?.name ?? 'Unknown'}
            </span>
            {fixture.status === 'played' ? (
                <span className="font-semibold tabular-nums text-right min-w-10">
                    {fixture.goalsHome}–{fixture.goalsAway}
                </span>
            ) : fixture.gameweek ? (
                <span className="text-text-muted text-[0.75rem]">GW {fixture.gameweek}</span>
            ) : (
                <span className="text-text-muted text-[0.75rem]">
                    {formatDate(fixture.scheduledAt)}
                </span>
            )}
            {resultChar && (
                <span
                    className={`w-[18px] h-[18px] rounded-full flex items-center justify-center text-[0.6rem] font-bold text-white ${dotColor[resultChar]}`}
                >
                    {resultChar}
                </span>
            )}
        </div>
    );
}
