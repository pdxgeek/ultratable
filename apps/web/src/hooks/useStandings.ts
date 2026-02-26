import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Team } from '../db';
import { compileStandings } from '../logic/dataCompiler';
import type { StandingsOptions } from '../logic/dataCompiler';

export function useStandings(seasonId: string, options: StandingsOptions = {}) {
    const data = useLiveQuery(async () => {
        const [fixtures, season] = await Promise.all([
            db.fixtures.where('seasonId').equals(seasonId).toArray(),
            db.seasons.get(seasonId)
        ]);

        if (!season) return null;

        const league = await db.leagues.get(season.leagueId);

        // Only include teams that appear in this season's fixtures
        const teamIds = new Set<string>();
        fixtures.forEach(f => {
            teamIds.add(f.homeTeamId);
            teamIds.add(f.awayTeamId);
        });
        const teams = teamIds.size > 0
            ? await db.teams.where('id').anyOf([...teamIds]).toArray()
            : [];

        const teamsMap = new Map<string, Team>(teams.map(t => [t.id, t]));

        const criteria = season.rankingCriteria || options.criteria;
        const leagueMeta = league?.metadata || {};
        const seasonMeta = season.metadata || {};

        const deductions = seasonMeta.deductions || [];
        const zones = {
            promotion: seasonMeta.promotion || leagueMeta.promotion || [],
            playoffs: seasonMeta.playoffs || leagueMeta.playoffs || [],
            relegation: seasonMeta.relegation || leagueMeta.relegation || []
        };

        const standings = compileStandings(teams, fixtures, {
            ...options,
            criteria,
            deductions,
            zones
        });

        return {
            standings,
            fixtures,
            teamsMap,
            season,
            lastUpdated: new Date().toISOString()
        };
    }, [seasonId, options.criteria, options.filter]);

    return {
        standings: data?.standings || [],
        fixtures: data?.fixtures || [],
        teamsMap: data?.teamsMap || new Map<string, Team>(),
        season: data?.season,
        isLoading: data === undefined,
        lastUpdated: data?.lastUpdated
    };
}
