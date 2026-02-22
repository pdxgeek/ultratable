import { builder } from './builder';
import { repository } from '../repositories/supabase.repository';
import { JobRunner } from '../workers/runner';

// Define object refs first
export const LeagueRef = builder.objectRef<any>('League');
const TeamRef = builder.objectRef<any>('Team');
const SeasonRef = builder.objectRef<any>('Season');
const FixtureRef = builder.objectRef<any>('Fixture');

const SourceRef = builder.simpleObject('SourceInfo', {
    fields: (t) => ({
        sourceName: t.string(),
        sourceId: t.int(),
    }),
});

builder.objectType(LeagueRef, {
    fields: (t) => ({
        id: t.exposeString('id'),
        name: t.exposeString('name'),
        slug: t.exposeString('slug'),
        country: t.exposeString('country', { nullable: true }),
        logo: t.exposeString('logo', { nullable: true }),
        metadata: t.field({
            type: SourceRef,
            resolve: (parent: any) => ({
                sourceName: parent.sourceName,
                sourceId: parent.sourceId,
            }),
        }),
    }),
});

builder.objectType(TeamRef, {
    fields: (t) => ({
        id: t.exposeString('id'),
        name: t.exposeString('name'),
        shortName: t.exposeString('shortName', { nullable: true }),
        logo: t.exposeString('logo', { nullable: true }),
        metadata: t.field({
            type: SourceRef,
            resolve: (parent: any) => ({
                sourceName: parent.sourceName,
                sourceId: parent.sourceId,
            }),
        }),
    }),
});

builder.objectType(SeasonRef, {
    fields: (t) => ({
        id: t.exposeString('id'),
        year: t.exposeInt('year'),
        startDate: t.expose('startDate', { type: 'DateTime', nullable: true }),
        endDate: t.expose('endDate', { type: 'DateTime', nullable: true }),
    }),
});

builder.objectType(FixtureRef, {
    fields: (t) => ({
        id: t.exposeString('id'),
        scheduledAt: t.expose('scheduledAt', { type: 'DateTime' }),
        status: t.exposeString('status'),
        goalsHome: t.exposeInt('goalsHome', { nullable: true }),
        goalsAway: t.exposeInt('goalsAway', { nullable: true }),
        updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
        metadata: t.field({
            type: SourceRef,
            resolve: (parent: any) => ({
                sourceName: parent.sourceName,
                sourceId: parent.sourceId,
            }),
        }),
    }),
});

builder.queryField('leagues', (t) =>
    t.field({
        type: [LeagueRef],
        resolve: async () => {
            return repository.football.getLeagues();
        },
    })
);

builder.queryField('fixtures', (t) =>
    t.field({
        type: [FixtureRef],
        args: {
            leagueId: t.arg.int({ required: true }),
            season: t.arg.int({ required: true }),
            since: t.arg({ type: 'DateTime', required: false }),
        },
        resolve: async (_: any, { leagueId, season, since }: any) => {
            return repository.football.getFixtures(leagueId, season, since || undefined);
        },
    })
);

builder.mutationField('ingestLeagues', (t) =>
    t.field({
        type: [LeagueRef],
        resolve: async () => {
            return repository.football.getLeagues();
        },
    })
);

builder.mutationField('syncFixtures', (t) =>
    t.field({
        type: [FixtureRef],
        args: {
            leagueId: t.arg.int({ required: true }),
            season: t.arg.int({ required: true }),
        },
        resolve: async (_: any, { leagueId, season }: any) => {
            let result: any[] = [];
            await JobRunner.run(`sync-fixtures-${leagueId}-${season}`, async () => {
                const syncRes = await repository.football.syncFixtures(leagueId, season);
                result = syncRes.data;
                return {
                    processedCount: syncRes.stats.processedCount,
                    apiCallsCount: syncRes.stats.apiCallsCount,
                    context: { leagueId, season }
                };
            });
            return result;
        },
    })
);
