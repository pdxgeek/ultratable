/**
 * Prometheus exporter held as a module-level singleton so both the NodeSDK
 * (which registers it as a MetricReader) and the Fastify route (which calls
 * `getMetricsRequestHandler` to serve `/metrics`) reference the same
 * instance. `preventServerStart: true` keeps the exporter from binding its
 * own port — Fastify owns 8080 and routes /metrics through here.
 */
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';

export const prometheusExporter = new PrometheusExporter({
    preventServerStart: true,
});
