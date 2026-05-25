# Provider Integration

Every call to an upstream provider goes through a single chokepoint at the provider class. Two distinct concerns are baked in at that layer, and they look different on purpose.

## Metered JSON API — `v3.football.api-sports.io`

- **Single chokepoint:** [`apps/service/src/integrations/api-football/index.ts`](../apps/service/src/integrations/api-football/index.ts)'s private `request()` method. Every provider method (`getCountries`, `getLeagues`, `getSeasons`, `getTeams`, `getFixtures`, `getFixturesByIds`, `getMatchEvents`, `getPlayerData`, `getLineups`, `getCoachesByTeam`, `getSquad`) routes through it. The wrapper schedules every request through a per-instance `Bottleneck` limiter.
- **Header-driven plan detection.** A response interceptor reads `X-RateLimit-Limit` off any response and resizes the reservoir to match the account's actual plan — Free=10/min, Pro=300/min, anything else. No env var declaring the tier, no `/status` probe at boot. The limiter starts conservative (10/min) and widens once it sees the first response header.
- **Automatic 429 handling.** On a 429, the limiter reads `Retry-After` and queues a retry up to 3 attempts. Callers never see transient rate-limit errors.

> [!CAUTION]
> When adding a new method on `ApiFootballProvider`, it MUST go through `this.request(...)`, never `this.client.get(...)` directly. The wrapper is the rate-limit chokepoint; a direct call silently bypasses the budget and will trip 429s under load.

## Asset CDN — `media.api-sports.io`

- **Separate host, separate budget.** Image binaries from the CDN don't count against the metered API's per-minute window, so they have their own (looser) limiter rather than sharing the API's reservoir.
- **Lives at** [`apps/service/src/services/graphics.service.ts`](../apps/service/src/services/graphics.service.ts) as a module-level `Bottleneck({ maxConcurrent: 10 })` — concurrency-bounded, no per-minute reservoir.
- **Why a cap is necessary even without upstream throttling:** a 20-team squad sync lands ~500 fire-and-forget `graphicsService.sideload(...)` calls in rapid succession. Without a concurrency cap the Node HTTP agent's socket pool saturates and requests time out at the axios layer before they ever leave the process. The cap is about the local connection pool, not the CDN.

## Adding a new provider

Follow the same shape: rate-limit the **metered** API at the provider class (header-driven if the upstream exposes them, otherwise a static reservoir), and concurrency-bound the **asset CDN** at the service that consumes it. Don't fold both into one limiter — they have different bottlenecks at different layers and one config can only optimize for one of them.
