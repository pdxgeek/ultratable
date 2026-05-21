import type { Fixture, Team } from '../db';

import { useCallback, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';

import { usePopup } from '../context/PopupContext';
import { db } from '../db';

interface NextMatchBadgeProps {
    fixture: Fixture | null;
    teamId: string;
    teamsMap: Map<string, Team>;
}

const NextMatchBadge: React.FC<NextMatchBadgeProps> = ({ fixture, teamId, teamsMap }) => {
    const { showPopup, scheduleHide, cancelHide } = usePopup();
    const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const opponentId = fixture
        ? fixture.homeTeamId === teamId
            ? fixture.awayTeamId
            : fixture.homeTeamId
        : null;

    const opponent = useLiveQuery(async () => {
        if (!opponentId) return null;
        return await db.teams.get(opponentId);
    }, [opponentId]);

    const handleMouseEnter = useCallback(
        (el: HTMLElement) => {
            if (!fixture) return;
            const rect = el.getBoundingClientRect();
            cancelHide();
            hoverTimeoutRef.current = setTimeout(() => {
                showPopup({ fixture, teamsMap, anchorRect: rect });
            }, 200);
        },
        [fixture, showPopup, teamsMap, cancelHide],
    );

    const handleMouseLeave = useCallback(() => {
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
        }
        scheduleHide();
    }, [scheduleHide]);

    if (!fixture || !opponent) return <span className="text-text-muted text-sm">-</span>;

    const date = new Date(fixture.scheduledAt);
    const isHome = fixture.homeTeamId === teamId;

    return (
        <div
            className="flex items-center gap-2 text-sm cursor-pointer whitespace-nowrap"
            onMouseEnter={(e) => handleMouseEnter(e.currentTarget)}
            onMouseLeave={handleMouseLeave}
        >
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
    );
};

export default NextMatchBadge;
