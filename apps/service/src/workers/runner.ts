import { db } from '../db';
import * as schema from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import { globalLogger } from '../services/log.service';

const logger = globalLogger.child({ module: 'JobRunner' });

export type JobStatus = 'running' | 'success' | 'failed';

export interface JobResult {
    processedCount?: number;
    totalCount?: number;
    apiCallsCount?: number;
    context?: Record<string, any>;
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
            console.log(`Skipping inactive job: ${name}`);
            return;
        }

        // 2. Create the execution record
        const [execution] = await db.insert(schema.jobExecutions).values({
            jobId: job.id,
            status: 'running',
            startedAt: new Date(),
        }).returning();

        console.log(`[Job: ${name}] Started (ID: ${execution.id})`);
        logger.info(`Job [${name}] started`, { jobId: job.id, executionId: execution.id });

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

            console.log(`[Job: ${name}] Finished successfully (Count: ${stats.processedCount || 0})`);
            logger.info(`Job [${name}] finished successfully`, {
                jobId: job.id,
                executionId: execution.id,
                processedCount: stats.processedCount,
                apiCallsCount: stats.apiCallsCount
            });
        } catch (error: any) {
            // 5. Record failure
            console.error(`[Job: ${name}] Failed:`, error);

            await db.update(schema.jobExecutions)
                .set({
                    status: 'failed',
                    finishedAt: new Date(),
                    errorMessage: error.message || String(error)
                })
                .where(eq(schema.jobExecutions.id, execution.id));

            logger.error(`Job [${name}] failed: ${error.message || error}`, {
                jobId: job.id,
                executionId: execution.id,
                error: error.message || String(error),
                stack: error.stack
            });

            throw error; // Re-throw to caller
        }
    }
}
