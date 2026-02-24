import { useRef, useCallback } from 'react';
import type { Fixture, Team } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { usePopup } from '../context/PopupContext';

interface NextMatchBadgeProps {
    fixture: Fixture | null;
    teamId: string;
    teamsMap: Map<string, Team>;
}

const NextMatchBadge: React.FC<NextMatchBadgeProps> = ({ fixture, teamId, teamsMap }) => {
    const { showPopup, scheduleHide, cancelHide } = usePopup();
    const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const opponentId = fixture ? (fixture.homeTeamId === teamId ? fixture.awayTeamId : fixture.homeTeamId) : null;

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
        [fixture, showPopup, teamsMap, cancelHide]
    );

    const handleMouseLeave = useCallback(() => {
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
        }
        scheduleHide();
    }, [scheduleHide]);

    if (!fixture || !opponent) return <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>-</span>;

    const date = new Date(fixture.scheduledAt);
    const isHome = fixture.homeTeamId === teamId;

    return (
        <div
            style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', cursor: 'pointer' }}
            onMouseEnter={(e) => handleMouseEnter(e.currentTarget)}
            onMouseLeave={handleMouseLeave}
        >
            <span style={{ color: 'var(--text-muted)' }}>{isHome ? 'vs' : '@'}</span>
            {opponent.logo && (
                <img
                    src={opponent.logo}
                    alt={opponent.name}
                    style={{ width: '16px', height: '16px', objectFit: 'contain' }}
                />
            )}
            <span style={{ fontWeight: 500 }}>{opponent.shortName || opponent.name}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                ({date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})
            </span>
        </div>
    );
};

export default NextMatchBadge;
