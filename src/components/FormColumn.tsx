import { useRef, useCallback } from 'react';
import clsx from 'clsx';
import { useNavigate } from 'react-router-dom';
import type { Fixture, FormEntry, Team } from '../types';
import { usePopup } from '../context/PopupContext';
import { useSettings } from '../context/SettingsContext';

interface FormColumnProps {
    form: FormEntry[];
    fixtures: Fixture[];
    teams: Map<string, Team>;
}

export default function FormColumn({
    form,
    fixtures,
    teams,
}: FormColumnProps) {
    const navigate = useNavigate();
    const { showPopup, scheduleHide, cancelHide } = usePopup();
    const { settings } = useSettings();
    const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fixtureMap = new Map(fixtures.map((f) => [f.id, f]));

    const handleMouseEnter = useCallback(
        (fixtureId: string, el: HTMLElement) => {
            if (!settings.showHovers) return;
            const rect = el.getBoundingClientRect();
            cancelHide();
            hoverTimeoutRef.current = setTimeout(() => {
                const fixture = fixtureMap.get(fixtureId);
                if (fixture) {
                    showPopup({
                        fixture,
                        teams,
                        anchorRect: rect,
                    });
                }
            }, 200);
        },
        [fixtureMap, showPopup, teams, cancelHide, settings.showHovers]
    );

    const handleMouseLeave = useCallback(() => {
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
        }
        scheduleHide();
    }, [scheduleHide]);

    return (
        <div className="form-column">
            <div className="form-column__dots">
                {form.map((entry, idx) => (
                    <span
                        key={idx}
                        className={clsx('form-dot', `form-dot--${entry.result}`, {
                            'form-dot--latest': idx === form.length - 1
                        })}
                        onMouseEnter={(e) =>
                            handleMouseEnter(entry.fixtureId, e.currentTarget)
                        }
                        onMouseLeave={handleMouseLeave}
                        onClick={() => navigate(`/match/${entry.fixtureId}`)}
                        title={entry.result}
                        style={{ cursor: 'pointer' }}
                    >
                        {entry.result}
                    </span>
                ))}
                {form.length === 0 && (
                    <span className="form-dot form-dot--empty">–</span>
                )}
            </div>
        </div>
    );
}

