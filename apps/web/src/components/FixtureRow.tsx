import { useNavigate } from 'react-router-dom';
import type { Fixture, Team } from '../db';

interface FixtureRowProps {
    fixture: Fixture;
    teamId: string;
    teams: Map<string, Team>;
}

export function FixtureRow({ fixture, teamId, teams }: FixtureRowProps) {
    const navigate = useNavigate();
    const isHome = fixture.homeTeamId === teamId;
    const opponentId = isHome ? fixture.awayTeamId : fixture.homeTeamId;
    const opponent = teams.get(opponentId);

    let resultClass = '';
    let resultChar = '';

    if (fixture.status === 'played' && fixture.goalsHome != null && fixture.goalsAway != null) {
        const teamGoals = isHome ? fixture.goalsHome : fixture.goalsAway;
        const oppGoals = isHome ? fixture.goalsAway : fixture.goalsHome;
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
    }

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };

    return (
        <div
            className={`fixture-row ${resultClass}`}
            style={{ cursor: 'pointer' }}
            onClick={() => navigate(`/match/${fixture.id}`)}
        >
            <span className="fixture-row__ha">{isHome ? 'H' : 'A'}</span>
            {opponent?.logo && (
                <img
                    src={opponent.logo}
                    alt=""
                    className="fixture-row__logo"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
            )}
            <span className="fixture-row__name">{opponent?.name ?? 'Unknown'}</span>
            {fixture.status === 'played' ? (
                <span className="fixture-row__score">
                    {fixture.goalsHome}–{fixture.goalsAway}
                </span>
            ) : fixture.gameweek ? (
                <span className="fixture-row__date">
                    GW {fixture.gameweek}
                </span>
            ) : (
                <span className="fixture-row__date">
                    {formatDate(fixture.scheduledAt)}
                </span>
            )}
            {resultChar && (
                <span className={`form-dot ${resultChar}`} style={{ width: 18, height: 18, fontSize: '0.6rem' }}>
                    {resultChar}
                </span>
            )}
        </div>
    );
}
