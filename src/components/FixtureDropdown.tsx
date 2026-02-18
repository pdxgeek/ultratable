import { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import { useNavigate } from 'react-router-dom';
import type { Fixture, Team } from '../types';
import { FixtureRow } from './FixtureRow';

interface FixtureDropdownProps {
    fixtures: Fixture[];
    teams: Map<string, Team>;
    teamId: string;
    type: 'past' | 'future';
    align?: 'left' | 'right' | 'center';
}

export function FixtureDropdown({
    fixtures,
    teams,
    teamId,
    type,
    align = 'center',
}: FixtureDropdownProps) {
    const navigate = useNavigate();
    const [expanded, setExpanded] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<'down' | 'up'>('down');

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setExpanded(false);
            }
        }

        if (expanded) {
            document.addEventListener('mousedown', handleClickOutside);

            // Re-calculate position when expanding
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                const spaceBelow = window.innerHeight - rect.bottom;
                const spaceAbove = rect.top;
                if (spaceBelow < 400 && spaceAbove > spaceBelow) {
                    setPosition('up');
                } else {
                    setPosition('down');
                }
            }
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [expanded]);

    if (fixtures.length === 0) return null;

    return (
        <div className="fixture-dropdown" ref={containerRef}>
            <button
                className={clsx('fixture-dropdown__toggle', {
                    'fixture-dropdown__toggle--active': expanded
                })}
                onClick={() => setExpanded(!expanded)}
                title={type === 'past' ? 'View past fixtures' : 'View future fixtures'}
            >
                {type === 'past' ? '◂' : '▸'}
            </button>

            {expanded && (
                <div className={clsx(
                    'fixture-dropdown__content',
                    `fixture-dropdown__content--${position}`,
                    `fixture-dropdown__content--align-${align}`
                )}>
                    <div className="fixture-dropdown__section">
                        <div className="fixture-dropdown__section-title">
                            {type === 'past' ? 'Recent Results' : 'Upcoming Schedule'}
                        </div>
                        <div className="fixture-dropdown__list">
                            {fixtures.map((f) => (
                                <FixtureRow
                                    key={f.id}
                                    fixture={f}
                                    teamId={teamId}
                                    teams={teams}
                                    onClick={() => {
                                        setExpanded(false);
                                        navigate(`/match/${f.id}`);
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
