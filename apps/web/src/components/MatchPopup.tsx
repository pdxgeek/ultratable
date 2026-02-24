import React, { useEffect } from 'react';
import type { Fixture } from '../db';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';

interface MatchPopupProps {
    fixture: Fixture;
    anchorRect: DOMRect | null;
    onClose: () => void;
}

const MatchPopup: React.FC<MatchPopupProps> = ({ fixture, anchorRect, onClose }) => {
    const homeTeam = useLiveQuery(() => db.teams.get(fixture.homeTeamId), [fixture.homeTeamId]);
    const awayTeam = useLiveQuery(() => db.teams.get(fixture.awayTeamId), [fixture.awayTeamId]);

    useEffect(() => {
        if (fixture.status === 'played') {
            // Logic for future event fetching could go here
        }
    }, [fixture.id, fixture.status]);

    if (!anchorRect) return null;

    const style: React.CSSProperties = {
        position: 'fixed',
        top: Math.max(10, anchorRect.top - 200),
        left: Math.max(10, anchorRect.left + anchorRect.width / 2 - 150),
        width: '300px',
        zIndex: 1000,
    };

    return (
        <div className="glass-card match-popup" style={style} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--accent-main)' }}>{fixture.status.toUpperCase()}</span>
                <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-main)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ textAlign: 'center', flex: 1 }}>
                    <img src={homeTeam?.logo} alt={homeTeam?.name} style={{ width: '48px', height: '48px', objectFit: 'contain' }} />
                    <div style={{ fontSize: '0.9rem', marginTop: '8px', fontWeight: 500 }}>{homeTeam?.name}</div>
                </div>

                <div style={{ fontSize: '1.8rem', fontWeight: 800, margin: '0 20px', color: 'var(--text-main)' }}>
                    {fixture.status === 'played' ? `${fixture.goalsHome} - ${fixture.goalsAway}` : 'VS'}
                </div>

                <div style={{ textAlign: 'center', flex: 1 }}>
                    <img src={awayTeam?.logo} alt={awayTeam?.name} style={{ width: '48px', height: '48px', objectFit: 'contain' }} />
                    <div style={{ fontSize: '0.9rem', marginTop: '8px', fontWeight: 500 }}>{awayTeam?.name}</div>
                </div>
            </div>

            <div style={{ marginTop: '20px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                <div style={{ marginBottom: '4px' }}>📅 {new Date(fixture.scheduledAt).toLocaleDateString()}</div>
                <div>⏰ {new Date(fixture.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
        </div>
    );
};

export default MatchPopup;
