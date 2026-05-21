import { builder, requireAdmin } from './builder';
import * as schema from '../db/schema';
import { JobRunner } from '../workers/runner';
import { repository } from '../repositories';
import { GraphQLError } from 'graphql';

/** Upper bound on every paginated query, regardless of the per-field default. */
const MAX_PAGE_SIZE = 100;
const clampLimit = (requested: number | null | undefined, fallback: number) =>
    Math.min(Math.max(1, requested ?? fallback), MAX_PAGE_SIZE);

const JobRef = builder.objectRef<typeof schema.jobs.$inferSelect>('Job');
const JobExecutionRef = builder.objectRef<typeof schema.jobExecutions.$inferSelect>('JobExecution');

builder.objectType(JobRef, {
    fields: (t) => ({
        id: t.exposeString('id', { description: 'Unique internal UUID for this job definition. Jobs track recurring or on-demand background tasks like fixture syncing.' }),
        name: t.exposeString('name', { description: 'Unique job identifier string (e.g. "sync-fixtures-40-2025").' }),
        scheduleCron: t.exposeString('scheduleCron', { nullable: true, description: 'Cron expression for recurring execution. Null for on-demand-only jobs.' }),
        isActive: t.exposeBoolean('isActive', { description: 'Whether this job is enabled for scheduled execution.' }),
        lastRunAt: t.expose('lastRunAt', { type: 'DateTime', nullable: true, description: 'Timestamp of the most recent execution start. Null if never run.' }),
        updatedAt: t.expose('updatedAt', { type: 'DateTime', description: 'ISO-8601 timestamp of the last update to the job record.' }),
    }),
});

builder.objectType(JobExecutionRef, {
    fields: (t) => ({
        id: t.exposeString('id', { description: 'Unique internal UUID for this execution record. Each run of a job produces one execution with timing, status, and result metrics.' }),
        jobId: t.exposeString('jobId', { description: 'UUID of the parent job that triggered this execution. Use this to filter executions for a specific job via the jobExecutions query.' }),
        status: t.exposeString('status', { description: 'Execution status: "running", "completed", or "failed".' }),
        startedAt: t.expose('startedAt', { type: 'DateTime', description: 'Timestamp when execution began.' }),
        finishedAt: t.expose('finishedAt', { type: 'DateTime', nullable: true, description: 'Timestamp when execution completed. Null if still running.' }),
        errorMessage: t.exposeString('errorMessage', { nullable: true, description: 'Error message if execution failed. Null on success.' }),
        processedCount: t.exposeInt('processedCount', { nullable: true, description: 'Number of items successfully processed. Null if not tracked.' }),
        totalCount: t.exposeInt('totalCount', { nullable: true, description: 'Total number of items to process. Null if not known in advance.' }),
        apiCallsCount: t.exposeInt('apiCallsCount', { nullable: true, description: 'Number of external API calls made during execution. Null if not tracked.' }),
        updatedAt: t.expose('updatedAt', { type: 'DateTime', description: 'ISO-8601 timestamp of the last update.' }),
    }),
});

const SystemLog = builder.simpleObject('SystemLog', {
    fields: (t) => ({
        id: t.string({ description: 'UUID of this log entry.' }),
        level: t.string({ description: 'Log severity: "debug", "info", "warn", or "error".' }),
        module: t.string({ description: 'Module that produced this log (e.g. "SyncEngine", "CacheService").' }),
        message: t.string({ description: 'Human-readable log message.' }),
        context: t.field({ type: 'JSON', nullable: true, description: 'Additional structured data as JSON. Null if none.' }),
        createdAt: t.field({ type: 'DateTime', description: 'Timestamp when this log entry was created.' }),
    }),
});

builder.queryField('jobs', (t) =>
    t.field({
        description: 'Admin only. Returns all registered jobs, ordered by name.',
        type: [JobRef],
        resolve: async (_root, _args, ctx) => {
            requireAdmin(ctx);
            return repository.workers.listJobs();
        },
    })
);

builder.queryField('jobExecutions', (t) =>
    t.field({
        description: 'Admin only. Returns job execution history, newest first.',
        type: [JobExecutionRef],
        args: {
            jobId: t.arg.string({ required: false, description: 'Optional UUID of a specific job. When provided, only returns executions belonging to that job. Omit to see executions across all jobs.' }),
            limit: t.arg.int({ required: false, description: `Maximum number of executions to return. Defaults to 50. Clamped to [1, ${MAX_PAGE_SIZE}].` }),
        },
        resolve: async (_, { jobId, limit }, ctx) => {
            requireAdmin(ctx);
            return repository.workers.listJobExecutions(jobId ?? null, clampLimit(limit, 50));
        },
    })
);

builder.queryField('systemLogs', (t) =>
    t.field({
        description: 'Admin only. Returns recent system log entries, newest first.',
        type: [SystemLog],
        args: {
            limit: t.arg.int({ required: false, description: `Maximum number of log entries to return. Defaults to 100. Clamped to [1, ${MAX_PAGE_SIZE}].` }),
        },
        resolve: async (_, { limit }, ctx) => {
            requireAdmin(ctx);
            return repository.workers.listSystemLogs(clampLimit(limit, 100));
        },
    })
);

builder.mutationField('runJob', (t) =>
    t.field({
        description: 'Admin only. Manually triggers a job by name and returns the resulting execution record.',
        type: JobExecutionRef,
        args: {
            name: t.arg.string({ required: true, description: 'Unique job name that identifies the task to run (e.g. "sync-fixtures-40-2025"). For fixture syncs, the name encodes leagueSourceId and seasonYear.' }),
        },
        resolve: async (_, { name }, ctx) => {
            requireAdmin(ctx);
            await JobRunner.run(name, async (reporter) => {
                if (name.startsWith('sync-fixtures-')) {
                    const parts = name.split('-');
                    const leagueSourceId = parseInt(parts[2]);
                    const seasonYear = parseInt(parts[3]);
                    if (isNaN(leagueSourceId) || isNaN(seasonYear)) {
                        throw new GraphQLError(`Invalid job name format: expected sync-fixtures-<leagueSourceId>-<seasonYear>, got "${name}"`);
                    }
                    const syncRes = await repository.fixtures.syncFixtures(leagueSourceId, seasonYear, reporter);
                    return {
                        processedCount: syncRes.stats.processedCount,
                        totalCount: syncRes.stats.totalCount,
                        apiCallsCount: syncRes.stats.apiCallsCount,
                        context: { leagueSourceId, seasonYear }
                    };
                }
                return { processedCount: 0, apiCallsCount: 0 };
            });

            // Return the latest execution for THIS job specifically
            const job = await repository.workers.getJobByName(name);
            if (!job) {
                throw new GraphQLError(`Job "${name}" not found after execution`);
            }
            const execution = await repository.workers.getLatestJobExecution(job.id);
            if (!execution) {
                throw new GraphQLError(`Job "${name}" produced no execution record`);
            }
            return execution;
        },
    })
);
