/**
 * Custom metric instruments.
 *
 * The metric *names* (and label keys) match the contract spelled out in
 * issue #131 so dashboards built off this contract don't break the day we
 * add a non-Prometheus exporter. Keep new instruments here so callers get a
 * single, typed import surface instead of re-resolving meter handles.
 *
 * Histogram bucket boundaries are deliberately coarse — Prometheus
 * histogram cardinality is `buckets × labels`, and a portfolio-scale
 * service does not need 20-bucket resolution.
 */
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('ultratable-service');

const SECONDS_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

export const resolverDuration = meter.createHistogram('graphql_resolver_duration_seconds', {
    description: 'GraphQL operation duration in seconds, labeled by operation type + name.',
    unit: 's',
    advice: { explicitBucketBoundaries: SECONDS_BUCKETS },
});

export const dbQueryDuration = meter.createHistogram('db_query_duration_seconds', {
    description: 'Database query duration in seconds, labeled by repository + method.',
    unit: 's',
    advice: { explicitBucketBoundaries: SECONDS_BUCKETS },
});

export const upstreamApiCallTotal = meter.createCounter('upstream_api_call_total', {
    description: 'Total upstream API calls, labeled by endpoint + HTTP status.',
});

export const upstreamApiCallDuration = meter.createHistogram(
    'upstream_api_call_duration_seconds',
    {
        description: 'Upstream API call duration in seconds, labeled by endpoint.',
        unit: 's',
        advice: { explicitBucketBoundaries: SECONDS_BUCKETS },
    },
);

export const upstreamRateLimitRemaining = meter.createGauge('upstream_rate_limit_remaining', {
    description: 'Remaining upstream rate-limit quota, labeled by provider.',
});

export const jobExecutionTotal = meter.createCounter('job_execution_total', {
    description: 'Total JobRunner executions, labeled by job_name + terminal status.',
});

export const jobExecutionDuration = meter.createHistogram('job_execution_duration_seconds', {
    description: 'JobRunner execution duration in seconds, labeled by job_name + status.',
    unit: 's',
    advice: {
        // Jobs can run for minutes; widen the upper buckets so we don't lose
        // resolution on the long-running syncs.
        explicitBucketBoundaries: [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300, 600],
    },
});

/**
 * Time an async function and record the elapsed seconds into a histogram.
 * Returns whatever the function returns; rethrows on error after recording
 * the duration with a `status: 'error'` label so failures aren't invisible.
 */
export async function recordDuration<T>(
    histogram: { record: (value: number, attributes?: Record<string, string>) => void },
    attributes: Record<string, string>,
    fn: () => Promise<T>,
): Promise<T> {
    const start = process.hrtime.bigint();
    try {
        const result = await fn();
        histogram.record(Number(process.hrtime.bigint() - start) / 1e9, {
            ...attributes,
            status: 'success',
        });
        return result;
    } catch (err) {
        histogram.record(Number(process.hrtime.bigint() - start) / 1e9, {
            ...attributes,
            status: 'error',
        });
        throw err;
    }
}

/**
 * Wrap a repository call to record `db_query_duration_seconds`. There is no
 * OTel auto-instrumentation for postgres-js, so adoption is opt-in per
 * call-site — wrap the methods that show up on the hot path first. See
 * docs/observability.md for the rollout plan.
 */
export function withDbMetric<T>(
    repository: string,
    method: string,
    fn: () => Promise<T>,
): Promise<T> {
    return recordDuration(dbQueryDuration, { repository, method }, fn);
}
