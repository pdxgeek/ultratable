/**
 * OpenTelemetry bootstrap.
 *
 * Wired pre-deploy per the plan in issues #130 / #131: the SDK is initialised
 * here, custom metrics are emitted via `./metrics`, and the Prometheus
 * exporter is mounted as a Fastify route in `src/index.ts` (it does NOT spin
 * up its own HTTP server — `preventServerStart: true` keeps it passive so
 * Fastify owns the port).
 *
 * This file MUST be imported before anything that should be instrumented —
 * `src/index.ts` does that on its first line so require-in-the-middle has
 * registered its hooks before Fastify / pino / http load.
 *
 * At deploy time, swap or add a trace exporter (OTLP, Honeycomb, etc.)
 * via env vars or by extending the NodeSDK config below.
 */
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
    ATTR_SERVICE_NAME,
    ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';

import { prometheusExporter } from './prometheus-exporter';

const sdk = new NodeSDK({
    resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: 'ultratable-service',
        [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '0.0.0',
    }),
    metricReaders: [prometheusExporter],
    instrumentations: [
        new HttpInstrumentation({
            // /healthz and /metrics fire constantly and tell us nothing useful;
            // dropping them keeps trace noise down without losing the
            // request-level spans that actually matter.
            ignoreIncomingRequestHook: (req) => {
                const url = req.url || '';
                return url.startsWith('/healthz') || url.startsWith('/metrics');
            },
        }),
        new FastifyInstrumentation(),
    ],
});

sdk.start();

// Flush before exit so the last scrape window isn't dropped on SIGTERM.
const SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
SIGNALS.forEach((sig) => {
    process.on(sig, () => {
        sdk.shutdown().catch(() => {
            /* swallow — the process is going down anyway */
        });
    });
});

export { sdk };
