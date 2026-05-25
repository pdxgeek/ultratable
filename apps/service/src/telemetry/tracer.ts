/**
 * Shared tracer handle. Call sites that want a custom span around
 * non-HTTP work (upstream API requests, DataLoader batches) pull this
 * tracer rather than re-resolving one each time.
 */
import { trace } from '@opentelemetry/api';

export const tracer = trace.getTracer('ultratable-service');
