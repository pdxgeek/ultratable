import { desc, eq } from 'drizzle-orm';
import { db } from '../../db';
import * as schema from '../../db/schema';
import { WorkersRepository } from '../interfaces';

export class PostgresWorkersRepository implements WorkersRepository {
    async listJobs(): Promise<Array<typeof schema.jobs.$inferSelect>> {
        if (!db) return [];
        return db.select().from(schema.jobs).orderBy(schema.jobs.name);
    }

    async getJobByName(name: string): Promise<typeof schema.jobs.$inferSelect | null> {
        if (!db) return null;
        const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.name, name));
        return row ?? null;
    }

    async listJobExecutions(jobId: string | null, limit: number): Promise<Array<typeof schema.jobExecutions.$inferSelect>> {
        if (!db) return [];
        const base = db.select().from(schema.jobExecutions).orderBy(desc(schema.jobExecutions.startedAt));
        if (jobId) {
            return db.select().from(schema.jobExecutions)
                .where(eq(schema.jobExecutions.jobId, jobId))
                .orderBy(desc(schema.jobExecutions.startedAt))
                .limit(limit);
        }
        return base.limit(limit);
    }

    async getLatestJobExecution(jobId: string): Promise<typeof schema.jobExecutions.$inferSelect | null> {
        if (!db) return null;
        const [row] = await db.select().from(schema.jobExecutions)
            .where(eq(schema.jobExecutions.jobId, jobId))
            .orderBy(desc(schema.jobExecutions.startedAt))
            .limit(1);
        return row ?? null;
    }

    async listSystemLogs(limit: number): Promise<Array<typeof schema.systemLogs.$inferSelect>> {
        if (!db) return [];
        return db.select().from(schema.systemLogs)
            .orderBy(desc(schema.systemLogs.createdAt))
            .limit(limit);
    }
}
