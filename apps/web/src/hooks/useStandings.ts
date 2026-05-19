import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Team } from '../db';
import { compileStandings } from '../logic/dataCompiler';
import type { StandingsOptions } from '../logic/dataCompiler';

export function useStandings(seasonId: string, options: StandingsOptions = {}) {
    const data = useLiveQuery(async () => {
        const [allFixtures, season] = await Promise.all([
            db.fixtures.where('seasonId').equals(seasonId).toArray(),
            db.seasons.get(seasonId)
        ]);

        if (!season) return null;

        const league = await db.leagues.get(season.leagueId);

        // Exclude playoff matches from the main league table. The provider's "Play-offs - …" rounds
        // have no integer gameweek, so a null gameweek is a reliable marker for non-regular-season fixtures.
        const fixtures = allFixtures.filter(f => f.gameweek != null);

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

        const criteria = (season.rankingCriteria as { name: string; logicType: string; }[]) || options.criteria;
        const leagueMeta = (league?.metadata as Record<string, unknown>) || {};
        const seasonMeta = (season.metadata as Record<string, unknown>) || {};

        const deductions = (seasonMeta.deductions as { teamId: string; points: number; reason: string; }[]) || [];
        const zones = {
            promotion: (seasonMeta.promotion ?? leagueMeta.promotion ?? []) as number[],
            playoffs: (seasonMeta.playoffs ?? leagueMeta.playoffs ?? []) as number[],
            relegation: (seasonMeta.relegation ?? leagueMeta.relegation ?? []) as number[]
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
