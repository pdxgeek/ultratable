import { useState, useRef, useCallback, useEffect } from 'react';
import clsx from 'clsx';
import { useNavigate } from 'react-router-dom';
import type { Fixture, FormEntry, Team } from '../types';
import { formatMatchDate } from '../utils/dateUtils';
import { gfxRegistry } from '../services/gfxRegistry';
import { usePopup } from '../context/PopupContext';
import { useSettings } from '../context/SettingsContext';
import TeamLogo from './TeamLogo';

interface FormColumnProps {
    form: FormEntry[];
    fixtures: Fixture[];
    teams: Map<string, Team>;
    teamId: string;
    allTeamFixtures: Fixture[];
}

export default function FormColumn({
    form,
    fixtures,
    teams,
    teamId,
    allTeamFixtures,
}: FormColumnProps) {
    const navigate = useNavigate();
    const [expanded, setExpanded] = useState(false);
    const { showPopup, scheduleHide, cancelHide } = usePopup();
    const { settings } = useSettings();
    const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setExpanded(false);
            }
        }

        if (expanded) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [expanded]);

    const fixtureMap = new Map(fixtures.map((f) => [f.id, f]));

    // Hover logic restored
    const handleMouseEnter = useCallback(
        (fixtureId: string, el: HTMLElement) => {
            if (!settings.showHovers) return;
            const rect = el.getBoundingClientRect();
            cancelHide();
            hoverTimeoutRef.current = setTimeout(() => {
                const fixture = fixtureMap.get(fixtureId) ?? allTeamFixtures.find(f => f.id === fixtureId);
                if (fixture) {
                    showPopup({
                        fixture,
                        teams,
                        anchorRect: rect,
                    });
                }
            }, 200);
        },
        [allTeamFixtures, fixtureMap, showPopup, teams, cancelHide, settings.showHovers]
    );

    const handleMouseLeave = useCallback(() => {
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
        }
        scheduleHide();
    }, [scheduleHide]);

    // ... (rest of filtering logic)
    // Actually we need to make sure filtering logic below still works? 
    // Yes, allTeamFixtures is Fixture[]. 

    const playedFixtures = allTeamFixtures
        .filter((f) => f.status === 'played' || f.status === 'cancelled')
        .sort((a, b) => a.timestamp - b.timestamp);

    const upcomingFixtures = allTeamFixtures
        .filter((f) => f.status === 'scheduled')
        .sort((a, b) => a.timestamp - b.timestamp);

    const [position, setPosition] = useState<'down' | 'up'>('down');

    useEffect(() => {
        if (expanded && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            // If less than 400px below and more space above, go up
            if (spaceBelow < 400 && spaceAbove > spaceBelow) {
                setPosition('up');
            } else {
                setPosition('down');
            }
        }
    }, [expanded]);

    return (
        <div className="form-column" ref={containerRef}>
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

            <button
                className="form-column__expand-btn"
                onClick={() => setExpanded(!expanded)}
                title={expanded ? 'Collapse fixtures' : 'Expand fixtures'}
            >
                {expanded ? '▾' : '▸'}
            </button>

            {expanded && (
                <div className={clsx('form-column__expanded', `form-column__expanded--${position}`)}>
                    <div className="form-column__section">
                        <div className="form-column__section-title">Fixtures</div>
                        {playedFixtures.map((f) => (
                            <FixtureRow
                                key={f.id}
                                fixture={f}
                                teamId={teamId}
                                teams={teams}
                                onClick={() => navigate(`/match/${f.id}`)}
                            />
                        ))}
                    </div>
                    {upcomingFixtures.length > 0 && (
                        <div className="form-column__section">
                            <div className="form-column__section-title">Upcoming</div>
                            {upcomingFixtures.map((f) => (
                                <FixtureRow
                                    key={f.id}
                                    fixture={f}
                                    teamId={teamId}
                                    teams={teams}
                                    onClick={() => navigate(`/match/${f.id}`)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

interface FixtureRowProps {
    fixture: Fixture;
    teamId: string;
    teams: Map<string, Team>;
    onClick: () => void;
}

function FixtureRow({
    fixture,
    teamId,
    teams,
    onClick,
}: FixtureRowProps) {
    const isHome = fixture.homeTeamId === teamId;
    const opponentId = isHome ? fixture.awayTeamId : fixture.homeTeamId;
    const opponent = teams.get(opponentId);
    // gfxRegistry might expect number for getLogo? 
    // Types say: getLogo(teamId: number): string
    // We should treat string vs number carefully. 
    // BUT BaseEntity IDs are strings. 
    // We need to update gfxRegistry or parse int if we can constant map?
    // Or just use opponent.logo if available?
    // Domain Team has logo property.
    const logo = opponent?.logo || gfxRegistry.getLogo(parseInt(opponentId) || 0); // Fallback

    let resultClass = '';
    let resultChar = '-';

    if (fixture.status === 'played' && fixture.homeGoals !== null && fixture.awayGoals !== null) {
        const teamGoals = isHome ? fixture.homeGoals : fixture.awayGoals;
        const oppGoals = isHome ? fixture.awayGoals : fixture.homeGoals;
        if (teamGoals > oppGoals) {
            resultClass = 'fixture-row--win';
            resultChar = 'W';
        } else if (teamGoals < oppGoals) {
            resultClass = 'fixture-row--loss';
            resultChar = 'L';
        } else {
            resultClass = 'fixture-row--draw';
            resultChar = 'D';
        }
    } else if (fixture.status === 'scheduled') {
        resultChar = '';
    }

    if (fixture.status === 'cancelled') {
        resultClass = 'fixture-row--cancelled';
        resultChar = '';
    }

    return (
        <div
            className={clsx('fixture-row', resultClass)}
            onClick={onClick}
            style={{ cursor: 'pointer' }}
        >

            <span className="fixture-row__ha">{isHome ? 'H' : 'A'}</span>
            <TeamLogo
                url={logo}
                name={opponent?.commonName}
                className="fixture-row__logo"
            />
            <span className="fixture-row__name">{opponent?.commonName ?? 'Unknown'}</span>
            {fixture.status === 'played' ? (
                <span className="fixture-row__score">
                    {fixture.homeGoals}–{fixture.awayGoals}
                </span>
            ) : fixture.status === 'cancelled' ? (
                <span className="fixture-row__score fixture-row__score--cancelled" title="Match Cancelled/Postponed">
                    ❌
                </span>
            ) : (
                <span className="fixture-row__date">
                    {formatMatchDate(fixture.date)}
                </span>
            )}
            {resultChar && (
                <span className={clsx('form-dot', `form-dot--${resultChar}`, 'fixture-row__result-box')}>
                    {resultChar}
                </span>
            )}
        </div>
    );
}
