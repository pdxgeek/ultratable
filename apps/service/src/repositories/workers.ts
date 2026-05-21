import * as schema from '../db/schema';

export interface WorkersRepository {
    listJobs(): Promise<Array<typeof schema.jobs.$inferSelect>>;
    getJobByName(name: string): Promise<typeof schema.jobs.$inferSelect | null>;
    listJobExecutions(jobId: string | null, limit: number): Promise<Array<typeof schema.jobExecutions.$inferSelect>>;
    getLatestJobExecution(jobId: string): Promise<typeof schema.jobExecutions.$inferSelect | null>;
    listSystemLogs(limit: number): Promise<Array<typeof schema.systemLogs.$inferSelect>>;
}
