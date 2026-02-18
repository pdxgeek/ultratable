import clsx from 'clsx';
import type { Fixture, Team } from '../types';
import { formatMatchDate } from '../utils/dateUtils';
import { gfxRegistry } from '../services/gfxRegistry';
import TeamLogo from './TeamLogo';

interface FixtureRowProps {
    fixture: Fixture;
    teamId: string;
    teams: Map<string, Team>;
    onClick: () => void;
}

export function FixtureRow({
    fixture,
    teamId,
    teams,
    onClick,
}: FixtureRowProps) {
    const isHome = fixture.homeTeamId === teamId;
    const opponentId = isHome ? fixture.awayTeamId : fixture.homeTeamId;
    const opponent = teams.get(opponentId);

    // Domain Team has logo property. Fallback to GFX registry.
    const logo = opponent?.logo || gfxRegistry.getLogo(opponentId);

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
                teamId={opponent?.id || opponentId}
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
