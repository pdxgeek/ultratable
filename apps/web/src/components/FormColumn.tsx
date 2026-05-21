import type { Fixture, Team } from '../db';

import { useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { usePopup } from '../context/PopupContext';

interface FormColumnProps {
    form: Array<{ result: 'W' | 'D' | 'L'; fixtureId: string }>;
    fixtures: Fixture[];
    teamsMap: Map<string, Team>;
}

const dotColor: Record<'W' | 'D' | 'L', string> = {
    W: 'bg-accent-green',
    D: 'bg-text-muted',
    L: 'bg-accent-red',
};

const barColor: Record<'W' | 'D' | 'L', string> = {
    W: 'bg-accent-green',
    D: 'bg-text-muted',
    L: 'bg-accent-red',
};

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
        <div className="flex gap-1 items-center">
            {form.map((entry, idx) => {
                const isLatest = idx === form.length - 1;
                const label = entry.result === 'W' ? 'Win' : entry.result === 'D' ? 'Draw' : 'Loss';
                return (
                    <div
                        key={idx}
                        className="flex flex-col items-center gap-0.5 cursor-pointer"
                        title={isLatest ? `${label} (latest)` : label}
                        onMouseEnter={(e) => handleMouseEnter(entry.fixtureId, e.currentTarget)}
                        onMouseLeave={handleMouseLeave}
                        onClick={() => handleClick(entry.fixtureId)}
                    >
                        <div
                            className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${dotColor[entry.result]}`}
                        >
                            {entry.result}
                        </div>
                        <div
                            className={`h-1 w-1 rounded-full ${isLatest ? barColor[entry.result] : 'bg-transparent'}`}
                        />
                    </div>
                );
            })}
            {form.length === 0 && <span className="text-text-muted">–</span>}
        </div>
    );
};

export default FormColumn;
