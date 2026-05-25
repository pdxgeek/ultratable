# Workers / Background Job Execution

The 15-second authenticated GraphQL timeout in [`apps/service/src/index.ts`](../apps/service/src/index.ts) (`REQUEST_TIMEOUT_MS_AUTH`) is a hard ceiling on any resolver. Any mutation whose runtime scales with input size (number of teams, fixtures, players, …) MUST dispatch off the request thread or it will eventually fail in production.

The job runner at [`apps/service/src/workers/runner.ts`](../apps/service/src/workers/runner.ts) gives every long-running operation a persistent execution record and a polling-friendly status. Two variants:

| Variant                                 | Returns                                            | Throws on task error?                | When to use                                                                |
| --------------------------------------- | -------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------- |
| `JobRunner.run(name, task)`             | `void` after the task settles                      | Yes — re-throws after persisting     | Short tasks that fit inside the GraphQL request budget (sub-second).        |
| `JobRunner.runInBackground(name, task)` | `JobExecution` row immediately, status `'running'` | No — failures land in `errorMessage` | Tasks that may take seconds or minutes. The caller MUST NOT block the request. |

Both variants share the same persistence (`status`, `processedCount`, `totalCount`, `apiCallsCount`, `errorMessage`, `finishedAt`) so the admin's `WorkersView` polls progress regardless of which one the resolver chose.

## The `runJob` dispatcher

[`apps/service/src/schema/workers.ts`](../apps/service/src/schema/workers.ts) exposes a generic `runJob(name: String!)` mutation. The name's prefix selects the work (e.g. `sync-fixtures-39-2024` dispatches to `repository.fixtures.syncFixtures(39, 2024, reporter)`); the resolver wires the call through `runInBackground` and returns the freshly-created `JobExecution`. The admin's `WorkersView` already polls `jobExecutions` for completion — there is no separate "wait for it" path.

**Adding a new background-eligible mutation:** do NOT introduce a new top-level GraphQL mutation that wraps `JobRunner.run` in a closure (the pattern of `let result; await JobRunner.run(...); return result` does not survive background execution — by the time the resolver returns, `result` is still empty). Instead, add a new name-prefix branch inside the `runJob` resolver and let it dispatch via `runInBackground`.

## Cache invalidation belongs in the repository method

When a sync runs via `runInBackground`, the resolver returns before the task completes. Any `cacheService.invalidate(...)` call placed in the resolver runs against stale state and gets overwritten the moment the background task finishes. Move invalidations into the `repository.X.syncY()` method that owns the work, where they fire after the writes land.

## In-process execution — known limitation

`runInBackground` runs the task on the same Node process (a microtask tick after the resolver returns). There is no Redis queue, BullMQ broker, or separate worker tier. A process restart kills any in-flight job; its execution row stays in `'running'` status with no `finishedAt`. This is acceptable for the current scale of admin-triggered syncs; if it becomes a problem, a persistent queue is the next step. **Don't add a queue speculatively** — the API surface stays the same when the day comes.
