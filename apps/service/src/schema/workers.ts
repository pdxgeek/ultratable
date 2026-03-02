import { builder, requireAdmin } from './builder';
import { db } from '../db';
import * as schema from '../db/schema';
import { desc, eq } from 'drizzle-orm';
import { JobRunner } from '../workers/runner';
import { repository } from '../repositories/supabase.repository';

const JobRef = builder.objectRef<typeof schema.jobs.$inferSelect>('Job');
const JobExecutionRef = builder.objectRef<typeof schema.jobExecutions.$inferSelect>('JobExecution');

builder.objectType(JobRef, {
    fields: (t) => ({
        id: t.exposeString('id'),
        name: t.exposeString('name'),
        scheduleCron: t.exposeString('scheduleCron', { nullable: true }),
        isActive: t.exposeBoolean('isActive'),
        lastRunAt: t.expose('lastRunAt', { type: 'DateTime', nullable: true }),
        updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    }),
});

builder.objectType(JobExecutionRef, {
    fields: (t) => ({
        id: t.exposeString('id'),
        jobId: t.exposeString('jobId'),
        status: t.exposeString('status'),
        startedAt: t.expose('startedAt', { type: 'DateTime' }),
        finishedAt: t.expose('finishedAt', { type: 'DateTime', nullable: true }),
        errorMessage: t.exposeString('errorMessage', { nullable: true }),
        processedCount: t.exposeInt('processedCount', { nullable: true }),
        totalCount: t.exposeInt('totalCount', { nullable: true }),
        apiCallsCount: t.exposeInt('apiCallsCount', { nullable: true }),
        updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    }),
});

const SystemLog = builder.simpleObject('SystemLog', {
    fields: (t) => ({
        id: t.string(),
        level: t.string(),
        module: t.string(),
        message: t.string(),
        context: t.field({ type: 'JSON', nullable: true }),
        createdAt: t.field({ type: 'DateTime' }),
    }),
});

builder.queryField('jobs', (t) =>
    t.field({
        type: [JobRef],
        resolve: async (_root, _args, ctx) => {
            requireAdmin(ctx);
            return db.select().from(schema.jobs).orderBy(schema.jobs.name);
        },
    })
);

builder.queryField('jobExecutions', (t) =>
    t.field({
        type: [JobExecutionRef],
        args: {
            jobId: t.arg.string({ required: false }),
            limit: t.arg.int({ required: false }),
        },
        resolve: async (_, { jobId, limit }, ctx) => {
            requireAdmin(ctx);
            const query = db.select().from(schema.jobExecutions).orderBy(desc(schema.jobExecutions.startedAt));
            if (jobId) {
                const res = await db.select().from(schema.jobExecutions)
                    .where(eq(schema.jobExecutions.jobId, jobId))
                    .orderBy(desc(schema.jobExecutions.startedAt))
                    .limit(limit || 50);
                return res;
            }
            return query.limit(limit || 50);
        },
    })
);

builder.queryField('systemLogs', (t) =>
    t.field({
        type: [SystemLog],
        args: {
            limit: t.arg.int({ required: false }),
        },
        resolve: async (_, { limit }, ctx) => {
            requireAdmin(ctx);
            return db.select().from(schema.systemLogs).orderBy(desc(schema.systemLogs.createdAt)).limit(limit || 100);
        },
    })
);

builder.mutationField('runJob', (t) =>
    t.field({
        type: JobExecutionRef,
        args: {
            name: t.arg.string({ required: true }),
        },
        resolve: async (_, { name }, ctx) => {
            requireAdmin(ctx);
            await JobRunner.run(name, async (reporter) => {
                if (name.startsWith('sync-fixtures-')) {
                    const parts = name.split('-');
                    const leagueId = parseInt(parts[2]);
                    const season = parseInt(parts[3]);
                    const syncRes = await repository.football.syncFixtures(leagueId, season, reporter);
                    return {
                        processedCount: syncRes.stats.processedCount,
                        totalCount: syncRes.stats.totalCount,
                        apiCallsCount: syncRes.stats.apiCallsCount,
                        context: { leagueId, season }
                    };
                }
                return { processedCount: 0, apiCallsCount: 0 };
            });

            const [execution] = await db.select().from(schema.jobExecutions)
                .orderBy(desc(schema.jobExecutions.startedAt))
                .limit(1);
            return execution;
        },
    })
);
