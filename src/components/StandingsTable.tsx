import { useState, useMemo } from 'react';
import type {
    StandingsRow,
    Team,
    Fixture,
    SeasonRules,
    ScheduleEntry,
} from '../types';
import clsx from 'clsx';
import FormColumn from './FormColumn';
import NextMatchBadge from './NextMatchBadge';
import TeamCell from './TeamCell';
import { getTeamFixtures } from '../services/dataCompiler';
import { useSettings } from '../context/SettingsContext';
import { FixtureDropdown } from './FixtureDropdown';

import type { StandingsFilter } from '../services/dataCompiler';

interface StandingsTableProps {
    standings: StandingsRow[];
    teams: Map<string, Team>;
    fixtures: Fixture[];
    schedules: Map<string, ScheduleEntry[]> | null;
    rules: SeasonRules;
    filter?: StandingsFilter;
    onFilterChange?: (filter: StandingsFilter) => void;
}

type SortKey = 'position' | 'team' | 'played' | 'won' | 'drawn' | 'lost' | 'goalsFor' | 'goalsAgainst' | 'goalDifference' | 'points' | 'form';
type SortDirection = 'asc' | 'desc';

export default function StandingsTable({
    standings,
    teams,
    fixtures,
    schedules,
    rules,
    filter = 'all',
    onFilterChange,
}: StandingsTableProps) {
    const { settings } = useSettings();
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
        key: 'position',
        direction: 'asc',
    });

    const handleSort = (key: SortKey) => {
        setSortConfig((current) => {
            if (current.key === key) {
                return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
            }
            // Default desc for stats, asc for text/position
            const defaultDirection = ['team', 'position'].includes(key) ? 'asc' : 'desc';
            return { key, direction: defaultDirection };
        });
    };

    const sortedStandings = useMemo(() => {
        const sorted = [...standings];
        sorted.sort((a, b) => {
            let comparison = 0;

            switch (sortConfig.key) {
                case 'team': {
                    const nameA = teams.get(a.teamId)?.commonName || '';
                    const nameB = teams.get(b.teamId)?.commonName || '';
                    comparison = nameA.localeCompare(nameB);
                    break;
                }
                case 'form': {
                    // Calculate form score based on rules
                    const getFormScore = (row: StandingsRow) => {
                        return row.form.reduce((acc, entry) => {
                            if (entry.result === 'W') return acc + rules.pointsForWin;
                            if (entry.result === 'D') return acc + rules.pointsForDraw;
                            return acc + rules.pointsForLoss; // Usually 0
                        }, 0);
                    };
                    comparison = getFormScore(a) - getFormScore(b);
                    break;
                }
                default: {
                    // Numeric columns
                    // @ts-ignore - dynamic access to properties that match SortKey
                    const valA = a[sortConfig.key] as number;
                    // @ts-ignore
                    const valB = b[sortConfig.key] as number;
                    comparison = valA - valB;
                }
            }

            return sortConfig.direction === 'asc' ? comparison : -comparison;
        });
        return sorted;
    }, [standings, sortConfig, teams, rules]);

    const SortIcon = ({ column }: { column: SortKey }) => {
        if (sortConfig.key !== column) return <span className="sort-icon sort-icon--inactive">⇅</span>;
        return <span className="sort-icon">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
    };

    return (
        <div className="standings-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="standings-filters" style={{ display: 'flex', gap: '8px' }}>
                {(['all', 'home', 'away'] as const).map((f) => (
                    <button
                        key={f}
                        onClick={() => onFilterChange?.(f)}
                        style={{
                            padding: '6px 16px',
                            borderRadius: '20px',
                            border: '1px solid var(--border-color)',
                            background: filter === f ? 'var(--accent-blue)' : 'var(--bg-secondary)',
                            color: filter === f ? 'white' : 'var(--text-primary)',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            textTransform: 'capitalize',
                            transition: 'all 0.2s'
                        }}
                    >
                        {f}
                    </button>
                ))}
            </div>
            <div className="standings-wrapper">
                <table className="standings-table">
                    <thead>
                        <tr>
                            <th className="col-pos clickable" title="Position" onClick={() => handleSort('position')}>
                                # <SortIcon column="position" />
                            </th>
                            <th className="col-team clickable" title="Team Name" onClick={() => handleSort('team')}>
                                Team <SortIcon column="team" />
                            </th>
                            <th className="col-stat clickable" title="Played" onClick={() => handleSort('played')}>
                                P <SortIcon column="played" />
                            </th>
                            <th className="col-stat clickable" title="Won" onClick={() => handleSort('won')}>
                                W <SortIcon column="won" />
                            </th>
                            <th className="col-stat clickable" title="Drawn" onClick={() => handleSort('drawn')}>
                                D <SortIcon column="drawn" />
                            </th>
                            <th className="col-stat clickable" title="Lost" onClick={() => handleSort('lost')}>
                                L <SortIcon column="lost" />
                            </th>
                            <th className="col-stat clickable" title="Goals For" onClick={() => handleSort('goalsFor')}>
                                GF <SortIcon column="goalsFor" />
                            </th>
                            <th className="col-stat clickable" title="Goals Against" onClick={() => handleSort('goalsAgainst')}>
                                GA <SortIcon column="goalsAgainst" />
                            </th>
                            <th className="col-stat col-gd clickable" title="Goal Difference" onClick={() => handleSort('goalDifference')}>
                                GD <SortIcon column="goalDifference" />
                            </th>
                            <th className="col-stat col-pts clickable" title="Points" onClick={() => handleSort('points')}>
                                Pts <SortIcon column="points" />
                            </th>
                            {settings.showForm && (
                                <th className="col-form clickable" title="Last 5 Matches (oldest → newest)" onClick={() => handleSort('form')}>
                                    Form → <SortIcon column="form" />
                                </th>
                            )}
                            <th className="col-next" title="Next Match">Next</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedStandings.map((row) => {
                            const team = teams.get(row.teamId);
                            if (!team) return null;

                            const zoneClass = (settings.showZones && filter === 'all') ? getZoneClass(row.position, rules) : '';
                            const style: React.CSSProperties = {};
                            if (settings.showZones) {
                                if (zoneClass === 'zone-promotion') style.borderLeft = '3px solid #2ecc71';
                                if (zoneClass === 'zone-playoff') style.borderLeft = '3px solid #1abc9c';
                                if (zoneClass === 'zone-relegation') style.borderLeft = '3px solid #e74c3c';
                            }

                            return (
                                <tr key={team.id} className={clsx('standings-row', zoneClass)} style={style}>
                                    <td className="col-pos">
                                        <span className="pos-number">{row.position}</span>
                                    </td>
                                    <td className="col-team">
                                        <TeamCell team={team} showLogo={settings.showLogos} />
                                    </td>
                                    <td className="col-stat">{row.played}</td>
                                    <td className="col-stat">{row.won}</td>
                                    <td className="col-stat">{row.drawn}</td>
                                    <td className="col-stat">{row.lost}</td>
                                    <td className="col-stat">{row.goalsFor}</td>
                                    <td className="col-stat">{row.goalsAgainst}</td>
                                    <td className="col-stat col-gd">
                                        <span
                                            className={clsx({
                                                'gd-positive': row.goalDifference > 0,
                                                'gd-negative': row.goalDifference < 0
                                            })}
                                        >
                                            {row.goalDifference > 0 ? '+' : ''}
                                            {row.goalDifference}
                                        </span>
                                    </td>
                                    <td className="col-stat col-pts">
                                        <span className="pts-value">
                                            {row.points}
                                            {rules.pointModifications?.some(m => m.teamId === row.teamId) && (
                                                <span style={{ fontSize: '0.7em', verticalAlign: 'top', marginLeft: '2px', color: 'var(--accent-orange)' }}>*</span>
                                            )}
                                        </span>
                                    </td>
                                    {settings.showForm && (
                                        <td className="col-form">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <FixtureDropdown
                                                    type="past"
                                                    align="left"
                                                    teamId={team.id}
                                                    teams={teams}
                                                    fixtures={getTeamFixtures(team.id, fixtures, schedules).filter(f => {
                                                        if (filter === 'home') return f.homeTeamId === team.id;
                                                        if (filter === 'away') return f.awayTeamId === team.id;
                                                        return true;
                                                    }).filter(f => f.status === 'played' || f.status === 'cancelled')}
                                                />
                                                <FormColumn
                                                    form={row.form}
                                                    fixtures={fixtures}
                                                    teams={teams}
                                                />
                                            </div>
                                        </td>
                                    )}
                                    <td className="col-next">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <NextMatchBadge
                                                fixture={row.nextFixture}
                                                teamId={team.id}
                                                teams={teams}
                                                allFixtures={fixtures}
                                            />
                                            <FixtureDropdown
                                                type="future"
                                                align="right"
                                                teamId={team.id}
                                                teams={teams}
                                                fixtures={getTeamFixtures(team.id, fixtures, schedules).filter(f => {
                                                    if (filter === 'home') return f.homeTeamId === team.id;
                                                    if (filter === 'away') return f.awayTeamId === team.id;
                                                    return true;
                                                }).filter(f => f.status === 'scheduled' || f.status === 'postponed')}
                                            />
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {rules.pointModifications && rules.pointModifications.length > 0 && (
                    <div className="standings-footnotes" style={{
                        marginTop: '20px',
                        padding: '16px',
                        background: 'var(--bg-secondary)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-color)',
                        fontSize: '0.85rem',
                        color: 'var(--text-secondary)'
                    }}>
                        <div style={{ fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>Footnotes:</div>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                            {rules.pointModifications.map((mod, idx) => {
                                const team = teams.get(mod.teamId);
                                return (
                                    <li key={idx} style={{ marginBottom: '4px', display: 'flex', gap: '8px' }}>
                                        <span style={{ color: 'var(--accent-orange)', fontWeight: 600 }}>*</span>
                                        <span>
                                            <strong>{team?.commonName || mod.teamId}:</strong> {mod.modification > 0 ? '+' : ''}{mod.modification} points. {mod.note}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}

function getZoneClass(pos: number, rules: SeasonRules): string {
    if (pos <= rules.promotionSlots) {
        return 'zone-promotion';
    }
    if (pos >= rules.playoffStart && pos <= rules.playoffEnd) {
        return 'zone-playoff';
    }
    if (pos >= rules.relegationStart) {
        return 'zone-relegation';
    }
    return '';
}

