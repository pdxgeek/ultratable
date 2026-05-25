import { eq } from 'drizzle-orm';

import { db } from '../db';
import * as schema from '../db/schema';
import { globalLogger } from '../services/log.service';
import { jobExecutionDuration, jobExecutionTotal } from '../telemetry/metrics';

const logger = globalLogger.child({ module: 'JobRunner' });

export type JobStatus = 'running' | 'success' | 'failed';

export interface JobResult {
    processedCount?: number;
    totalCount?: number;
    apiCallsCount?: number;
    context?: Record<string, unknown>;
}

export interface JobReporter {
    updateProgress: (stats: {
        processedCount?: number;
        totalCount?: number;
        apiCallsCount?: number;
    }) => Promise<void>;
}

interface JobHandle {
    name: string;
    job: typeof schema.jobs.$inferSelect;
    execution: typeof schema.jobExecutions.$inferSelect;
    startMs: number;
}

export class JobRunner {
    /**
     * Executes a job synchronously and tracks its progress in the database.
     * Blocks the caller until the task settles. Re-throws task errors after
     * persisting the failure to the execution row.
     *
     * Use only for short tasks that fit inside the GraphQL request budget.
     * For long-running syncs that may exceed the timeout, prefer
     * {@link runInBackground}.
     */
    static async run(name: string, task: (reporter: JobReporter) => Promise<JobResult | void>) {
        const handle = await this.startExecution(name);
        if (!handle) return;
        await this.runTask(handle, task);
    }

    /**
     * Records the start of a job execution and kicks the task off on a
     * background tick. Returns the freshly-created execution row immediately
     * (status `'running'`) so the GraphQL caller can hand a job-id to the
     * client without waiting on a sync that may take minutes. Clients poll
     * `jobExecutions` for completion. Task failures are persisted to the
     * execution row, not re-thrown.
     */
    static async runInBackground(
        name: string,
        task: (reporter: JobReporter) => Promise<JobResult | void>,
    ): Promise<typeof schema.jobExecutions.$inferSelect | null> {
        const handle = await this.startExecution(name);
        if (!handle) return null;
        // Intentional fire-and-forget: the resolver returns immediately
        // while the task continues. Errors are captured and persisted to
        // the execution row by runTask().
        void this.runTask(handle, task).catch(() => {});
        return handle.execution;
    }

    private static async startExecution(name: string): Promise<JobHandle | null> {
        let [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.name, name));

        if (!job) {
            [job] = await db
                .insert(schema.jobs)
                .values({
                    name,
                    isActive: true,
                })
                .returning();
        }

        if (!job.isActive) {
            logger.info({ jobId: job.id }, `Skipping inactive job: ${name}`);
            return null;
        }

        const [execution] = await db
            .insert(schema.jobExecutions)
            .values({
                jobId: job.id,
                status: 'running',
                startedAt: new Date(),
            })
            .returning();

        logger.info({ jobId: job.id, executionId: execution.id }, `Job [${name}] started`);
        return { name, job, execution, startMs: Date.now() };
    }

    private static async runTask(
        handle: JobHandle,
        task: (reporter: JobReporter) => Promise<JobResult | void>,
    ): Promise<void> {
        const { name, job, execution, startMs } = handle;
        const reporter: JobReporter = {
            updateProgress: async (stats) => {
                await db
                    .update(schema.jobExecutions)
                    .set({
                        processedCount: stats.processedCount,
                        totalCount: stats.totalCount,
                        apiCallsCount: stats.apiCallsCount,
                        updatedAt: new Date(),
                    })
                    .where(eq(schema.jobExecutions.id, execution.id));
            },
        };

        try {
            const result = await task(reporter);
            const stats = result || {};

            await db
                .update(schema.jobExecutions)
                .set({
                    status: 'success',
                    finishedAt: new Date(),
                    processedCount: stats.processedCount || 0,
                    totalCount: stats.totalCount || stats.processedCount || 0,
                    apiCallsCount: stats.apiCallsCount || 0,
                    context: stats.context || null,
                })
                .where(eq(schema.jobExecutions.id, execution.id));

            await db
                .update(schema.jobs)
                .set({ lastRunAt: new Date() })
                .where(eq(schema.jobs.id, job.id));

            const durationSec = (Date.now() - startMs) / 1000;
            jobExecutionTotal.add(1, { job_name: name, status: 'success' });
            jobExecutionDuration.record(durationSec, { job_name: name, status: 'success' });

            logger.info(
                {
                    jobId: job.id,
                    executionId: execution.id,
                    durationMs: Date.now() - startMs,
                    processedCount: stats.processedCount,
                    apiCallsCount: stats.apiCallsCount,
                },
                `Job [${name}] completed in ${Date.now() - startMs}ms`,
            );
        } catch (error: unknown) {
            const err = error as Error;

            await db
                .update(schema.jobExecutions)
                .set({
                    status: 'failed',
                    finishedAt: new Date(),
                    errorMessage: err.message || String(error),
                })
                .where(eq(schema.jobExecutions.id, execution.id));

            const durationSec = (Date.now() - startMs) / 1000;
            jobExecutionTotal.add(1, { job_name: name, status: 'failed' });
            jobExecutionDuration.record(durationSec, { job_name: name, status: 'failed' });

            logger.error(
                {
                    jobId: job.id,
                    executionId: execution.id,
                    durationMs: Date.now() - startMs,
                    error: err.message || String(error),
                    stack: err.stack,
                },
                `Job [${name}] failed after ${Date.now() - startMs}ms: ${err.message || error}`,
            );

            throw error;
        }
    }
}
