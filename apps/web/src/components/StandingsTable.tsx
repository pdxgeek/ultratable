import React from 'react';
import TeamCell from './TeamCell';
import FormColumn from './FormColumn';
import NextMatchBadge from './NextMatchBadge';
import type { StandingsRow } from '../logic/formulas';
import { useSettings } from '../context/SettingsContext';

interface StandingsTableProps {
    standings: StandingsRow[];
}

const StandingsTable: React.FC<StandingsTableProps> = ({ standings }) => {
    const { settings } = useSettings();

    return (
        <div className="glass-card" style={{ overflow: 'hidden' }}>
            <table className="standings-table">
                <thead>
                    <tr>
                        <th className="col-pos">#</th>
                        <th className="col-team">Team</th>
                        <th className="col-stat">P</th>
                        <th className="col-stat">W</th>
                        <th className="col-stat">D</th>
                        <th className="col-stat">L</th>
                        <th className="col-stat">GF</th>
                        <th className="col-stat">GA</th>
                        <th className="col-stat">GD</th>
                        <th className="col-pts">Pts</th>
                        {settings.showForm && <th className="col-form">Form</th>}
                        <th className="col-next">Next</th>
                    </tr>
                </thead>
                <tbody>
                    {standings.map((row) => (
                        <tr key={row.teamId} className="standings-row">
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
                            </td>
                            {settings.showForm && (
                                <td className="col-form">
                                    <FormColumn form={row.form} />
                                </td>
                            )}
                            <td className="col-next">
                                <NextMatchBadge fixture={row.nextFixture} teamId={row.teamId} />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default StandingsTable;
