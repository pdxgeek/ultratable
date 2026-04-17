import React, { useState, useMemo } from 'react';
import TeamCell from './TeamCell';
import FormColumn from './FormColumn';
import NextMatchBadge from './NextMatchBadge';
import { FixtureDropdown } from './FixtureDropdown';
import type { StandingsRow } from '../logic/formulas';
import type { StandingsFilter } from '../logic/dataCompiler';
import type { Fixture, Team } from '../db';
import { useSettings } from '../context/SettingsContext';

interface StandingsTableProps {
    standings: StandingsRow[];
    fixtures: Fixture[];
    teamsMap: Map<string, Team>;
    filter?: StandingsFilter;
    onFilterChange?: (filter: StandingsFilter) => void;
}

type SortKey = 'position' | 'team' | 'played' | 'won' | 'drawn' | 'lost' | 'goalsFor' | 'goalsAgainst' | 'goalDifference' | 'points' | 'form';
type SortDirection = 'asc' | 'desc';

function getTeamFixtures(teamId: string, fixtures: Fixture[]): Fixture[] {
    return fixtures
        .filter(f => f.homeTeamId === teamId || f.awayTeamId === teamId)
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
}

const StandingsTable: React.FC<StandingsTableProps> = ({ standings, fixtures, teamsMap, filter = 'all', onFilterChange }) => {
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
            const defaultDirection = ['team', 'position'].includes(key) ? 'asc' : 'desc';
            return { key, direction: defaultDirection };
        });
    };

    const sortedStandings = useMemo(() => {
        const sorted = [...standings];
        sorted.sort((a, b) => {
            let comparison: number;

            switch (sortConfig.key) {
                case 'team': {
                    const nameA = a.team.name || '';
                    const nameB = b.team.name || '';
                    comparison = nameA.localeCompare(nameB);
                    break;
                }
                case 'form': {
                    const getFormScore = (row: StandingsRow) =>
                        row.form.reduce((acc, entry) => {
                            if (entry.result === 'W') return acc + 3;
                            if (entry.result === 'D') return acc + 1;
                            return acc;
                        }, 0);
                    comparison = getFormScore(a) - getFormScore(b);
                    break;
                }
                default: {
                    const rowA = a as unknown as Record<string, number>;
                    const rowB = b as unknown as Record<string, number>;
                    const valA = rowA[sortConfig.key];
                    const valB = rowB[sortConfig.key];
                    comparison = valA - valB;
                }
            }

            return sortConfig.direction === 'asc' ? comparison : -comparison;
        });
        return sorted;
    }, [standings, sortConfig]);

    const SortIcon = ({ column }: { column: SortKey }) => {
        if (sortConfig.key !== column) return <span className="sort-icon sort-icon--inactive">⇅</span>;
        return <span className="sort-icon">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
    };

    // Calculate unique deductions across all teams to assign asterisk legends
    const deductionMap = useMemo(() => {
        const dMap = new Map<string, { teamName: string; reason: string; points: number; asterisks: string }>();
        let asteriskCount = 1;

        sortedStandings.forEach(row => {
            if (row.deductions && row.deductions.length > 0) {
                row.deductions.forEach(deduction => {
                    const key = `${row.teamId}-${deduction.reason}`;
                    if (!dMap.has(key)) {
                        dMap.set(key, {
                            teamName: row.team.name,
                            reason: deduction.reason,
                            points: deduction.points,
                            asterisks: `${asteriskCount++}`
                        });
                    }
                });
            }
        });
        return Array.from(dMap.values());
    }, [sortedStandings]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* All / Home / Away filter */}
            <div style={{ display: 'flex', gap: '8px' }}>
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

            <div className="glass-card" style={{ overflow: 'visible' }}>
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
                            <th className="col-stat clickable" title="Goal Difference" onClick={() => handleSort('goalDifference')}>
                                GD <SortIcon column="goalDifference" />
                            </th>
                            <th className="col-pts clickable" title="Points" onClick={() => handleSort('points')}>
                                Pts <SortIcon column="points" />
                            </th>
                            {settings.showForm && (
                                <th className="col-form clickable" title="Last 5 Matches (oldest → newest)" onClick={() => handleSort('form')}>
                                    Form <SortIcon column="form" />
                                </th>
                            )}
                            <th className="col-next" title="Next Match">Next</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedStandings.map((row) => {
                            const teamFixtures = getTeamFixtures(row.teamId, fixtures);
                            const pastFixtures = teamFixtures
                                .filter(f => f.status === 'played')
                                .filter(f => {
                                    if (filter === 'home') return f.homeTeamId === row.teamId;
                                    if (filter === 'away') return f.awayTeamId === row.teamId;
                                    return true;
                                });
                            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
                            const futureFixtures = teamFixtures
                                .filter(f => (f.status === 'scheduled' || f.status === 'postponed') &&
                                    new Date(f.scheduledAt).getTime() > twoHoursAgo.getTime())
                                .filter(f => {
                                    if (filter === 'home') return f.homeTeamId === row.teamId;
                                    if (filter === 'away') return f.awayTeamId === row.teamId;
                                    return true;
                                });

                            const zoneClass = settings.showZones ? (
                                row.description === 'promotion' ? 'promo' :
                                    row.description === 'playoffs' ? 'playoff' :
                                        row.description === 'relegation' ? 'rel' : ''
                            ) : '';

                            return (
                                <tr key={row.teamId} className={`standings-row ${zoneClass}`}>
                                    <td className="col-pos">{row.position}</td>
                                    <td className="col-team">
                                        <TeamCell team={{ id: row.teamId, ...row.team }} showLogo={settings.showLogos} />
                                    </td>
                                    <td className="col-stat">{row.played}</td>
                                    <td className="col-stat">{row.won}</td>
                                    <td className="col-stat">{row.drawn}</td>
                                    <td className="col-stat">{row.lost}</td>
                                    <td className="col-stat">{row.goalsFor}</td>
                                    <td className="col-stat">{row.goalsAgainst}</td>
                                    <td className="col-stat">
                                        <span className={row.goalDifference > 0 ? 'gd-positive' : row.goalDifference < 0 ? 'gd-negative' : ''}>
                                            {row.goalDifference > 0 ? '+' : ''}{row.goalDifference}
                                        </span>
                                    </td>
                                    <td className="col-pts">
                                        <span className="pts-value">{row.points}</span>
                                        {row.deductions && row.deductions.length > 0 && (
                                            <span className="pts-asterisk">
                                                {row.deductions.map(d => deductionMap.find(m => m.teamName === row.team.name && m.reason === d.reason)?.asterisks).join(',')}
                                            </span>
                                        )}
                                    </td>
                                    {settings.showForm && (
                                        <td className="col-form">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <FixtureDropdown
                                                    type="past"
                                                    align="left"
                                                    teamId={row.teamId}
                                                    teams={teamsMap}
                                                    fixtures={pastFixtures}
                                                />
                                                <FormColumn form={row.form} fixtures={fixtures} teamsMap={teamsMap} />
                                            </div>
                                        </td>
                                    )}
                                    <td className="col-next">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <NextMatchBadge fixture={row.nextFixture} teamId={row.teamId} teamsMap={teamsMap} />
                                            <FixtureDropdown
                                                type="future"
                                                align="right"
                                                teamId={row.teamId}
                                                teams={teamsMap}
                                                fixtures={futureFixtures}
                                            />
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {deductionMap.length > 0 && (
                    <div className="standings-footnotes">
                        <ul>
                            {deductionMap.map((d, i) => (
                                <li key={i}>
                                    <span className="pts-asterisk">{d.asterisks}</span> {d.teamName} had {Math.abs(d.points)} points deducted: {d.reason}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
};

export default StandingsTable;
