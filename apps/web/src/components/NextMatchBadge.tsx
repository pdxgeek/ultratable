import type { Fixture, Team } from '../db';

import { useLiveQuery } from 'dexie-react-hooks';

import { db } from '../db';
import { HoverCard, HoverCardContent, HoverCardTrigger } from './ui/hover-card';
import MatchPopup from './MatchPopup';

interface NextMatchBadgeProps {
    fixture: Fixture | null;
    teamId: string;
    teamsMap: Map<string, Team>;
}

const NextMatchBadge: React.FC<NextMatchBadgeProps> = ({ fixture, teamId, teamsMap }) => {
    const opponentId = fixture
        ? fixture.homeTeamId === teamId
            ? fixture.awayTeamId
            : fixture.homeTeamId
        : null;

    const opponent = useLiveQuery(async () => {
        if (!opponentId) return null;
        return await db.teams.get(opponentId);
    }, [opponentId]);

    if (!fixture || !opponent) return <span className="text-text-muted text-sm">-</span>;

    const date = new Date(fixture.scheduledAt);
    const isHome = fixture.homeTeamId === teamId;

    return (
        <HoverCard openDelay={200} closeDelay={150}>
            <HoverCardTrigger asChild>
                <div className="flex items-center gap-2 text-sm cursor-pointer whitespace-nowrap">
                    <span className="text-text-muted">{isHome ? 'vs' : '@'}</span>
                    {opponent.logo && (
                        <img
                            src={opponent.logo}
                            alt={opponent.name}
                            className="w-4 h-4 object-contain shrink-0"
                        />
                    )}
                    <span className="font-medium">{opponent.shortName || opponent.name}</span>
                    <span className="text-text-muted text-xs">
                        ({date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})
                    </span>
                </div>
            </HoverCardTrigger>
            <HoverCardContent className="w-[340px] p-4">
                <MatchPopup fixture={fixture} teamsMap={teamsMap} />
            </HoverCardContent>
        </HoverCard>
    );
};

export default NextMatchBadge;
