import React from 'react';
import type { Fixture } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';

interface NextMatchBadgeProps {
    fixture: Fixture | null;
    teamId: string;
}

const NextMatchBadge: React.FC<NextMatchBadgeProps> = ({ fixture, teamId }) => {
    const opponentId = fixture ? (fixture.homeTeamId === teamId ? fixture.awayTeamId : fixture.homeTeamId) : null;

    const opponent = useLiveQuery(async () => {
        if (!opponentId) return null;
        return await db.teams.get(opponentId);
    }, [opponentId]);

    if (!fixture || !opponent) return <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>-</span>;

    const date = new Date(fixture.scheduledAt);
    const isHome = fixture.homeTeamId === teamId;

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem' }}>
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
