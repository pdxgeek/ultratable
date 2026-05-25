# Observability

The service wires OpenTelemetry pre-deploy (issues [#130](../../../issues/130) / [#131](../../../issues/131)). All instrumentation runs in-process; the Prometheus exporter is exposed at `/metrics` on the same Fastify port, no extra container required.

## Wired now

| What                              | Where                                                                      |
| --------------------------------- | -------------------------------------------------------------------------- |
| OTel SDK bootstrap                | [`apps/service/src/telemetry/index.ts`](../apps/service/src/telemetry/index.ts) — imported first thing in `src/index.ts` |
| Metric instruments                | [`apps/service/src/telemetry/metrics.ts`](../apps/service/src/telemetry/metrics.ts)                                       |
| Custom-span tracer handle         | [`apps/service/src/telemetry/tracer.ts`](../apps/service/src/telemetry/tracer.ts)                                         |
| Prometheus scrape endpoint        | `GET /metrics` (mounted in [`apps/service/src/index.ts`](../apps/service/src/index.ts))                                   |
| Auto-instrumentation              | `@opentelemetry/instrumentation-http`, `@opentelemetry/instrumentation-fastify`                                            |

### Metrics

| Name                                | Type      | Labels                                          | Where it's recorded                                                                                                                                                  |
| ----------------------------------- | --------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `graphql_resolver_duration_seconds` | Histogram | `operation`, `operation_name`, `status`          | Yoga `onExecute` plugin in [`apps/service/src/index.ts`](../apps/service/src/index.ts)                                                                                |
| `db_query_duration_seconds`         | Histogram | `repository`, `method`, `status`                 | `withDbMetric()` wrapper — opt-in per repo method (see "Adopting `withDbMetric`" below)                                                                              |
| `upstream_api_call_total`           | Counter   | `endpoint`, `status`                             | `ApiFootballProvider.request()` in [`apps/service/src/integrations/api-football/index.ts`](../apps/service/src/integrations/api-football/index.ts)                   |
| `upstream_api_call_duration_seconds`| Histogram | `endpoint`                                       | Same chokepoint as above                                                                                                                                            |
| `upstream_rate_limit_remaining`     | Gauge     | `provider`                                       | `absorbRateLimitHeaders()` — reads `X-RateLimit-Remaining` from every response                                                                                       |
| `job_execution_total`               | Counter   | `job_name`, `status` (`success` / `failed`)       | `JobRunner.runTask()` in [`apps/service/src/workers/runner.ts`](../apps/service/src/workers/runner.ts)                                                               |
| `job_execution_duration_seconds`    | Histogram | `job_name`, `status`                             | Same chokepoint as above                                                                                                                                            |

Histogram buckets are coarse on purpose — Prometheus cardinality is `buckets × labels`, and a portfolio-scale service does not need 20-bucket resolution. Edit [`apps/service/src/telemetry/metrics.ts`](../apps/service/src/telemetry/metrics.ts) if dashboards demand finer grain.

### Tracing

Fastify and HTTP spans land automatically. Custom spans are added explicitly where they are load-bearing:

- One span per upstream call inside `ApiFootballProvider.request()`, with attributes `http.url`, `http.status_code`, `rate_limit.remaining`, `provider`.

No trace exporter is configured for non-dev runs — spans are created but not shipped anywhere. That's the "connect at deploy" half of the plan.

## Verify locally

```bash
# Hit the service so something gets recorded.
curl -s -X POST http://localhost:8080/graphql \
  -H 'content-type: application/json' \
  -d '{"query":"{ health }"}' >/dev/null

# Scrape.
curl -s http://localhost:8080/metrics | grep -E 'graphql_|upstream_|job_'
```

You should see at least `graphql_resolver_duration_seconds_*` and `target_info` rows. Upstream / job metrics appear once you exercise those paths (any admin sync triggers both).

## Adopting `withDbMetric`

The repo uses the `postgres-js` driver, which has no OTel auto-instrumentation. `db_query_duration_seconds` is therefore **opt-in per call site** — wrap a repository method with `withDbMetric(repoName, methodName, fn)` from [`apps/service/src/telemetry/metrics.ts`](../apps/service/src/telemetry/metrics.ts) and the histogram picks it up. One representative method is wired today (`PostgresLeaguesRepository.getLeagueById` / `getLeaguesByIds`); extend coverage as new dashboards demand it. **Don't speculatively wrap every method** — the cost of an unread label compounds forever.

## At deploy: connect

The pre-deploy wiring is intentionally local-only. When deploying:

1. Decide on a backend (Grafana Cloud Free, Honeycomb sandbox, self-hosted Prometheus + Grafana on Fly).
2. **Pull model:** point Prometheus at `https://<service-host>/metrics`. No code change required.
3. **Push model / traces:** add an OTLP exporter to [`apps/service/src/telemetry/index.ts`](../apps/service/src/telemetry/index.ts) and set `OTEL_EXPORTER_OTLP_ENDPOINT` + `OTEL_EXPORTER_OTLP_HEADERS` in the deploy environment.

Dashboards land under `ops/grafana/` when they exist so they version with the schema they describe — don't propose dashboards before there is real traffic to dashboard.
