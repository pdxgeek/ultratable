# UltraTable — Admin

The administrative interface for UltraTable. Used by operators to manage the football data inventory (countries, leagues, seasons, fixtures), configure ranking and zone rules, run sync jobs, and inspect system logs.

React + TypeScript + Vite. Talks to the BFF GraphQL service at `apps/service` via the `/graphql` endpoint.

## Local dev

From the monorepo root: `npm run start:all`. Admin runs at <http://localhost:5174/>.

Sign in via the **Dev Auth Tools** floating panel (bottom-right, dev mode only) — click **Admin** to mint a Better Auth session as a dev admin user. Without a session, the admin GraphQL queries return 401.

## Pages

| Tab | Purpose | Docs |
|---|---|---|
| Dashboard | At-a-glance system + integration status. | — |
| Inventory | Browse the upstream catalog, activate leagues, import seasons, configure ranking and zones. | **[docs/inventory.md](./docs/inventory.md)** |
| Integrations | Manage external API credentials (API-Football). | — |
| Database | Database connection status and tooling. | — |
| Workers | Background job runs and progress. | — |
| Graphics | Team / venue / league logo registry. | — |
| Logs | System log viewer. | — |

(Pages without a docs link are either self-explanatory or pending documentation.)

## Documentation

All admin-specific documentation lives in [`docs/`](./docs/). Link new page docs from the table above so they are discoverable.
