import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { compileStandings } from '../logic/dataCompiler';
import type { StandingsOptions } from '../logic/dataCompiler';

export function useStandings(seasonId: string, options: StandingsOptions = {}) {
    const data = useLiveQuery(async () => {
        const [fixtures, season] = await Promise.all([
            db.fixtures.where('seasonId').equals(seasonId).toArray(),
            db.seasons.get(seasonId)
        ]);

        if (!season) return null;

        // Only include teams that appear in this season's fixtures
        const teamIds = new Set<string>();
        fixtures.forEach(f => {
            teamIds.add(f.homeTeamId);
            teamIds.add(f.awayTeamId);
        });
        const teams = teamIds.size > 0
            ? await db.teams.where('id').anyOf([...teamIds]).toArray()
            : [];

        const criteria = season.rankingCriteria || options.criteria;
        const deductions = season.metadata?.deductions || [];

        const standings = compileStandings(teams, fixtures, {
            ...options,
            criteria,
            deductions
        });

        return {
            standings,
            season,
            lastUpdated: new Date().toISOString()
        };
    }, [seasonId, options.criteria]);

    return {
        standings: data?.standings || [],
        season: data?.season,
        isLoading: data === undefined,
        lastUpdated: data?.lastUpdated
    };
}
