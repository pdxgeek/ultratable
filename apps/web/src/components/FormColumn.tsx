import type { Fixture, Team } from '../db';

import { useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { usePopup } from '../context/PopupContext';

interface FormColumnProps {
    form: Array<{ result: 'W' | 'D' | 'L'; fixtureId: string }>;
    fixtures: Fixture[];
    teamsMap: Map<string, Team>;
}

const FormColumn: React.FC<FormColumnProps> = ({ form, fixtures, teamsMap }) => {
    const { showPopup, scheduleHide, cancelHide, hidePopup } = usePopup();
    const navigate = useNavigate();
    const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const fixtureMap = useMemo(() => new Map(fixtures.map((f) => [f.id, f])), [fixtures]);

    const handleMouseEnter = useCallback(
        (fixtureId: string, el: HTMLElement) => {
            const rect = el.getBoundingClientRect();
            cancelHide();
            hoverTimeoutRef.current = setTimeout(() => {
                const fixture = fixtureMap.get(fixtureId);
                if (fixture) {
                    showPopup({ fixture, teamsMap, anchorRect: rect });
                }
            }, 200);
        },
        [fixtureMap, showPopup, teamsMap, cancelHide],
    );

    const handleMouseLeave = useCallback(() => {
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
        }
        scheduleHide();
    }, [scheduleHide]);

    const handleClick = useCallback(
        (fixtureId: string) => {
            if (hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current);
            }
            hidePopup();
            navigate(`/match/${fixtureId}`);
        },
        [hidePopup, navigate],
    );

    return (
        <div style={{ display: 'flex', gap: '4px' }}>
            {form.map((entry, idx) => (
                <div
                    key={idx}
                    className={`form-dot ${entry.result}`}
                    title={entry.result === 'W' ? 'Win' : entry.result === 'D' ? 'Draw' : 'Loss'}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={(e) => handleMouseEnter(entry.fixtureId, e.currentTarget)}
                    onMouseLeave={handleMouseLeave}
                    onClick={() => handleClick(entry.fixtureId)}
                >
                    {entry.result}
                </div>
            ))}
            {form.length === 0 && <span style={{ color: 'var(--text-muted)' }}>–</span>}
        </div>
    );
};

export default FormColumn;
