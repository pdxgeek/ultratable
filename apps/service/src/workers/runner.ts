import { db } from '../db';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import { globalLogger } from '../services/log.service';

const logger = globalLogger.child({ module: 'JobRunner' });

export type JobStatus = 'running' | 'success' | 'failed';

export interface JobResult {
    processedCount?: number;
    totalCount?: number;
    apiCallsCount?: number;
    context?: Record<string, unknown>;
}

export interface JobReporter {
    updateProgress: (stats: { processedCount?: number; totalCount?: number; apiCallsCount?: number }) => Promise<void>;
}

export class JobRunner {
    /**
     * Executes a job and tracks its progress in the database.
     * @param name The unique name of the job
     * @param task The async function to perform, returns stats
     */
    static async run(name: string, task: (reporter: JobReporter) => Promise<JobResult | void>) {
        // 1. Find or create the job definition
        let [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.name, name));

        if (!job) {
            [job] = await db.insert(schema.jobs).values({
                name,
                isActive: true
            }).returning();
        }

        if (!job.isActive) {
            logger.info({ jobId: job.id }, `Skipping inactive job: ${name}`);
            return;
        }

        // 2. Create the execution record
        const [execution] = await db.insert(schema.jobExecutions).values({
            jobId: job.id,
            status: 'running',
            startedAt: new Date(),
        }).returning();

        logger.info({ jobId: job.id, executionId: execution.id }, `Job [${name}] started`);
        const startMs = Date.now();

        const reporter: JobReporter = {
            updateProgress: async (stats) => {
                await db.update(schema.jobExecutions)
                    .set({
                        processedCount: stats.processedCount,
                        totalCount: stats.totalCount,
                        apiCallsCount: stats.apiCallsCount,
                        updatedAt: new Date(),
                    })
                    .where(eq(schema.jobExecutions.id, execution.id));
            }
        };

        try {
            // 3. Perform the task
            const result = await task(reporter);
            const stats = result || {};

            // 4. Record success
            await db.update(schema.jobExecutions)
                .set({
                    status: 'success',
                    finishedAt: new Date(),
                    processedCount: stats.processedCount || 0,
                    totalCount: stats.totalCount || stats.processedCount || 0,
                    apiCallsCount: stats.apiCallsCount || 0,
                    context: stats.context || null
                })
                .where(eq(schema.jobExecutions.id, execution.id));

            await db.update(schema.jobs)
                .set({ lastRunAt: new Date() })
                .where(eq(schema.jobs.id, job.id));

            logger.info({
                jobId: job.id,
                executionId: execution.id,
                durationMs: Date.now() - startMs,
                processedCount: stats.processedCount,
                apiCallsCount: stats.apiCallsCount
            }, `Job [${name}] completed in ${Date.now() - startMs}ms`);
        } catch (error: unknown) {
            // 5. Record failure
            const err = error as Error;

            await db.update(schema.jobExecutions)
                .set({
                    status: 'failed',
                    finishedAt: new Date(),
                    errorMessage: err.message || String(error)
                })
                .where(eq(schema.jobExecutions.id, execution.id));

            logger.error({
                jobId: job.id,
                executionId: execution.id,
                durationMs: Date.now() - startMs,
                error: err.message || String(error),
                stack: err.stack
            }, `Job [${name}] failed after ${Date.now() - startMs}ms: ${err.message || error}`);

            throw error; // Re-throw to caller
        }
    }
}
