import { useState, useMemo } from 'react';
import type {
    StandingsRow,
    Team,
    Fixture,
    SeasonRules,
} from '../types';
import clsx from 'clsx';
import FormColumn from './FormColumn';
import NextMatchBadge from './NextMatchBadge';
import TeamCell from './TeamCell';
import { getTeamFixtures } from '../services/dataCompiler';
import { useSettings } from '../context/SettingsContext';

interface StandingsTableProps {
    standings: StandingsRow[];
    teams: Map<string, Team>;
    fixtures: Fixture[];
    rules: SeasonRules;
}

type SortKey = 'position' | 'team' | 'played' | 'won' | 'drawn' | 'lost' | 'goalsFor' | 'goalsAgainst' | 'goalDifference' | 'points' | 'form';
type SortDirection = 'asc' | 'desc';

export default function StandingsTable({
    standings,
    teams,
    fixtures,
    rules,
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

                        const zoneClass = settings.showZones ? getZoneClass(row.position, rules) : '';
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
                                    <span className="pts-value">{row.points}</span>
                                </td>
                                {settings.showForm && (
                                    <td className="col-form">
                                        <FormColumn
                                            form={row.form}
                                            fixtures={fixtures}
                                            teams={teams}
                                            teamId={team.id}
                                            allTeamFixtures={getTeamFixtures(team.id, fixtures)}
                                        />
                                    </td>
                                )}
                                <td className="col-next">
                                    <NextMatchBadge
                                        fixture={row.nextFixture}
                                        teamId={team.id}
                                        teams={teams}
                                        allFixtures={fixtures}
                                    />
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
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

