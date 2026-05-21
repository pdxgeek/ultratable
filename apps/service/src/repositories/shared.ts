export interface SyncResult<T = Record<string, unknown>> {
    data: T[];
    stats: {
        processedCount: number;
        totalCount?: number;
        apiCallsCount: number;
    };
}
