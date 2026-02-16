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

interface StandingsTableProps {
    standings: StandingsRow[];
    teams: Map<string, Team>;
    fixtures: Fixture[];
    rules: SeasonRules;
}

import { useSettings } from '../context/SettingsContext';

export default function StandingsTable({
    standings,
    teams,
    fixtures,
    rules,
}: StandingsTableProps) {

    const { settings } = useSettings();

    return (
        <div className="standings-wrapper">
            <table className="standings-table">
                <thead>
                    <tr>
                        <th className="col-pos" title="Position">#</th>
                        <th className="col-team" title="Team Name">Team</th>
                        <th className="col-stat" title="Played">P</th>
                        <th className="col-stat" title="Won">W</th>
                        <th className="col-stat" title="Drawn">D</th>
                        <th className="col-stat" title="Lost">L</th>
                        <th className="col-stat" title="Goals For">GF</th>
                        <th className="col-stat" title="Goals Against">GA</th>
                        <th className="col-stat col-gd" title="Goal Difference">GD</th>
                        <th className="col-stat col-pts" title="Points">Pts</th>
                        {settings.showForm && <th className="col-form" title="Last 5 Matches (oldest → newest)">Form →</th>}
                        <th className="col-next" title="Next Match">Next</th>
                    </tr>
                </thead>
                <tbody>
                    {standings.map((row) => {
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
