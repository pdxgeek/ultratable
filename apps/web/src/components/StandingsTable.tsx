import type { Fixture, Team } from '../db';
import type { StandingsFilter } from '../logic/dataCompiler';
import type { StandingsRow } from '../logic/formulas';

import React, { useMemo, useState } from 'react';

import { useSettings } from '../context/SettingsContext';
import { FixtureDropdown } from './FixtureDropdown';
import FormColumn from './FormColumn';
import NextMatchBadge from './NextMatchBadge';
import TeamCell from './TeamCell';

interface StandingsTableProps {
    standings: StandingsRow[];
    fixtures: Fixture[];
    teamsMap: Map<string, Team>;
    filter?: StandingsFilter;
    onFilterChange?: (filter: StandingsFilter) => void;
}

type SortKey =
    | 'position'
    | 'team'
    | 'played'
    | 'won'
    | 'drawn'
    | 'lost'
    | 'goalsFor'
    | 'goalsAgainst'
    | 'goalDifference'
    | 'points'
    | 'form';
type SortDirection = 'asc' | 'desc';

const zoneBorderClass = (zone: string): string => {
    if (zone === 'promo') return 'border-l-2 border-accent-blue';
    if (zone === 'playoff') return 'border-l-2 border-accent-yellow';
    if (zone === 'rel') return 'border-l-2 border-accent-red';
    return '';
};

function getTeamFixtures(teamId: string, fixtures: Fixture[]): Fixture[] {
    return fixtures
        .filter((f) => f.homeTeamId === teamId || f.awayTeamId === teamId)
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
}

const thBase =
    'text-left px-3 py-3 align-top text-text-muted text-[0.75rem] uppercase tracking-wider font-semibold border-b border-border';
const thClickable = `${thBase} cursor-pointer select-none transition-colors hover:text-text-primary`;
const tdBase = 'px-3 py-2 border-b border-border text-[0.8rem]';
const colStat = 'w-[38px] text-center';

const StandingsTable: React.FC<StandingsTableProps> = ({
    standings,
    fixtures,
    teamsMap,
    filter = 'all',
    onFilterChange,
}) => {
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
        if (sortConfig.key !== column)
            return <span className="text-[0.7rem] opacity-30 leading-none">⇅</span>;
        return (
            <span className="text-[0.7rem] text-accent-blue leading-none">
                {sortConfig.direction === 'asc' ? '↑' : '↓'}
            </span>
        );
    };

    const SortHeader = ({ label, column }: { label: string; column: SortKey }) => (
        <span className="inline-flex flex-col items-center gap-1 leading-none">
            <span>{label}</span>
            <SortIcon column={column} />
        </span>
    );

    const deductionMap = useMemo(() => {
        const dMap = new Map<
            string,
            { teamName: string; reason: string; points: number; asterisks: string }
        >();
        let asteriskCount = 1;

        sortedStandings.forEach((row) => {
            if (row.deductions && row.deductions.length > 0) {
                row.deductions.forEach((deduction) => {
                    const key = `${row.teamId}-${deduction.reason}`;
                    if (!dMap.has(key)) {
                        dMap.set(key, {
                            teamName: row.team.name,
                            reason: deduction.reason,
                            points: deduction.points,
                            asterisks: `${asteriskCount++}`,
                        });
                    }
                });
            }
        });
        return Array.from(dMap.values());
    }, [sortedStandings]);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex gap-2">
                {(['all', 'home', 'away'] as const).map((f) => (
                    <button
                        key={f}
                        onClick={() => onFilterChange?.(f)}
                        className={`px-4 py-1.5 rounded-[20px] border border-border text-[0.85rem] font-semibold cursor-pointer capitalize transition-all ${
                            filter === f
                                ? 'bg-accent-blue text-white'
                                : 'bg-bg-secondary text-text-primary'
                        }`}
                    >
                        {f}
                    </button>
                ))}
            </div>

            <div className="bg-glass-bg backdrop-blur-md border border-glass-border rounded-lg shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] overflow-visible">
                <table className="w-full border-separate border-spacing-0">
                    <thead>
                        <tr>
                            <th
                                className={`${thClickable} w-10 text-center`}
                                title="Position"
                                onClick={() => handleSort('position')}
                            >
                                <SortHeader label="#" column="position" />
                            </th>
                            <th
                                className={thClickable}
                                title="Team Name"
                                onClick={() => handleSort('team')}
                            >
                                <SortHeader label="Team" column="team" />
                            </th>
                            <th
                                className={`${thClickable} ${colStat}`}
                                title="Played"
                                onClick={() => handleSort('played')}
                            >
                                <SortHeader label="P" column="played" />
                            </th>
                            <th
                                className={`${thClickable} ${colStat}`}
                                title="Won"
                                onClick={() => handleSort('won')}
                            >
                                <SortHeader label="W" column="won" />
                            </th>
                            <th
                                className={`${thClickable} ${colStat}`}
                                title="Drawn"
                                onClick={() => handleSort('drawn')}
                            >
                                <SortHeader label="D" column="drawn" />
                            </th>
                            <th
                                className={`${thClickable} ${colStat}`}
                                title="Lost"
                                onClick={() => handleSort('lost')}
                            >
                                <SortHeader label="L" column="lost" />
                            </th>
                            <th
                                className={`${thClickable} ${colStat}`}
                                title="Goals For"
                                onClick={() => handleSort('goalsFor')}
                            >
                                <SortHeader label="GF" column="goalsFor" />
                            </th>
                            <th
                                className={`${thClickable} ${colStat}`}
                                title="Goals Against"
                                onClick={() => handleSort('goalsAgainst')}
                            >
                                <SortHeader label="GA" column="goalsAgainst" />
                            </th>
                            <th
                                className={`${thClickable} ${colStat}`}
                                title="Goal Difference"
                                onClick={() => handleSort('goalDifference')}
                            >
                                <SortHeader label="GD" column="goalDifference" />
                            </th>
                            <th
                                className={`${thClickable} w-[60px] text-left font-bold`}
                                title="Points"
                                onClick={() => handleSort('points')}
                            >
                                <SortHeader label="Pts" column="points" />
                            </th>
                            {settings.showForm && (
                                <th
                                    className={`${thClickable} w-[140px]`}
                                    title="Last 5 Matches (oldest → newest)"
                                    onClick={() => handleSort('form')}
                                >
                                    <SortHeader label="Form" column="form" />
                                </th>
                            )}
                            <th className={thBase} title="Next Match">
                                Next
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedStandings.map((row) => {
                            const teamFixtures = getTeamFixtures(row.teamId, fixtures);
                            const pastFixtures = teamFixtures
                                .filter((f) => f.status === 'played')
                                .filter((f) => {
                                    if (filter === 'home') return f.homeTeamId === row.teamId;
                                    if (filter === 'away') return f.awayTeamId === row.teamId;
                                    return true;
                                });
                            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
                            const futureFixtures = teamFixtures
                                .filter(
                                    (f) =>
                                        (f.status === 'scheduled' || f.status === 'postponed') &&
                                        new Date(f.scheduledAt).getTime() > twoHoursAgo.getTime(),
                                )
                                .filter((f) => {
                                    if (filter === 'home') return f.homeTeamId === row.teamId;
                                    if (filter === 'away') return f.awayTeamId === row.teamId;
                                    return true;
                                });

                            const zoneClass = settings.showZones
                                ? row.description === 'promotion'
                                    ? 'promo'
                                    : row.description === 'playoffs'
                                      ? 'playoff'
                                      : row.description === 'relegation'
                                        ? 'rel'
                                        : ''
                                : '';

                            const posBorder = zoneBorderClass(zoneClass);

                            return (
                                <tr key={row.teamId} className="hover:bg-white/[0.03]">
                                    <td className={`${tdBase} w-10 text-center ${posBorder}`}>
                                        {row.position}
                                    </td>
                                    <td className={tdBase}>
                                        <TeamCell
                                            team={{ id: row.teamId, ...row.team }}
                                            showLogo={settings.showLogos}
                                        />
                                    </td>
                                    <td className={`${tdBase} ${colStat}`}>{row.played}</td>
                                    <td className={`${tdBase} ${colStat}`}>{row.won}</td>
                                    <td className={`${tdBase} ${colStat}`}>{row.drawn}</td>
                                    <td className={`${tdBase} ${colStat}`}>{row.lost}</td>
                                    <td className={`${tdBase} ${colStat}`}>{row.goalsFor}</td>
                                    <td className={`${tdBase} ${colStat}`}>{row.goalsAgainst}</td>
                                    <td className={`${tdBase} ${colStat}`}>
                                        <span
                                            className={
                                                row.goalDifference > 0
                                                    ? 'text-accent-green'
                                                    : row.goalDifference < 0
                                                      ? 'text-accent-red'
                                                      : ''
                                            }
                                        >
                                            {row.goalDifference > 0 ? '+' : ''}
                                            {row.goalDifference}
                                        </span>
                                    </td>
                                    <td className={`${tdBase} w-[60px] text-left font-bold`}>
                                        <span className="font-bold text-accent-blue">
                                            {row.points}
                                        </span>
                                        {row.deductions && row.deductions.length > 0 && (
                                            <span className="text-accent-red text-[0.65em] align-super ml-0.5">
                                                {row.deductions
                                                    .map(
                                                        (d) =>
                                                            deductionMap.find(
                                                                (m) =>
                                                                    m.teamName === row.team.name &&
                                                                    m.reason === d.reason,
                                                            )?.asterisks,
                                                    )
                                                    .join(',')}
                                            </span>
                                        )}
                                    </td>
                                    {settings.showForm && (
                                        <td className={`${tdBase} w-[140px]`}>
                                            <div className="flex items-center gap-2">
                                                <FixtureDropdown
                                                    type="past"
                                                    align="start"
                                                    teamId={row.teamId}
                                                    teams={teamsMap}
                                                    fixtures={pastFixtures}
                                                />
                                                <FormColumn
                                                    form={row.form}
                                                    fixtures={fixtures}
                                                    teamsMap={teamsMap}
                                                />
                                            </div>
                                        </td>
                                    )}
                                    <td className={tdBase}>
                                        <div className="flex items-center gap-2">
                                            <NextMatchBadge
                                                fixture={row.nextFixture}
                                                teamId={row.teamId}
                                                teamsMap={teamsMap}
                                            />
                                            <FixtureDropdown
                                                type="future"
                                                align="end"
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
                    <div className="mt-4 px-4 py-3 bg-black/20 rounded-md border border-dashed border-border text-[0.75rem] text-text-secondary text-left">
                        <ul className="list-none flex flex-col gap-1">
                            {deductionMap.map((d, i) => (
                                <li key={i}>
                                    <span className="text-accent-red text-[0.65em] align-super ml-0.5">
                                        {d.asterisks}
                                    </span>{' '}
                                    {d.teamName} had {Math.abs(d.points)} points deducted: {d.reason}
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
