# UltraTable

> **Source-visible, not open-source.** This codebase is published for portfolio review. You may clone and run it locally on your own machine (loopback only) to evaluate it — see [LICENSE](LICENSE) for the full terms. Hosting, public deployment, modification beyond local config, and redistribution are not permitted. For commercial licensing, contact pdxgeek@gmail.com.

UltraTable is a real-time fantasy sports platform. It consists of multiple applications managed in a monorepo setup.

## Project Structure

- `/apps/service` - The core BFF (Back-end for Front-end) service. Built with Fastify, GraphQL Yoga, and Drizzle ORM.
- `/apps/admin` - Administrative interface.
- `/apps/web` - Main consumer-facing web application.

## Local Development

### Prerequisites

- **[Volta](https://volta.sh/)** — `curl https://get.volta.sh | bash`. The root `package.json`'s `volta` field pins Node + npm; Volta auto-installs the right versions the moment you `cd` into the repo. No manual `nvm`/`fnm`/`brew install node` needed.
- **Docker** — only if you want the setup script to provision a local Postgres for you. Skip if you're using Supabase or a system Postgres.

> Without Volta you can still install Node manually, but the pinned versions in `package.json` (`volta.node`, `volta.npm`) are the source of truth — match them or you may hit lockfile / engine drift.

### One-command setup

From a fresh clone:

```bash
npm run setup
```

This interactive script:

1. Checks that Node, npm, and (optionally) Docker are installed.
2. Asks how you want to run Postgres:
    - **`docker`** — spins up `postgres:16-alpine` via `docker compose up -d postgres`.
    - **`supabase`** — collects your Supabase project URL, anon key, service role key, and connection string.
    - **`system`** — you bring your own `DATABASE_URL`.
3. Asks for your API-Football key (optional — the service starts without it, but sport-data endpoints will 401 until you add one).
4. Generates a `BETTER_AUTH_SECRET` automatically.
5. Writes [`apps/service/.env`](apps/service/.env.example) and the root [`.env`](.env.example).
6. Offers to run `npm install` and `npm run db:push --prefix apps/service` (Drizzle migrations).

Re-run it any time to change credentials — existing values become the prompt defaults, so press Enter to keep them. Each run timestamps the prior `apps/service/.env` to `apps/service/.env.backup.<ISO timestamp>` so nothing is lost.

> **Supabase = Postgres.** The Supabase URL/keys aren't an add-on — they're how you connect to a Supabase-hosted Postgres + storage. Pick `supabase` _or_ `docker`/`system`, not both.

### Starting all services

```bash
npm run dev
```

Wraps `concurrently` to start all three dev servers, killing any stale processes on the relevant ports first. **Never** start them individually with `pkill`/`kill -9` — use `Ctrl+C` on the `dev` process so child processes shut down cleanly.

| Service                   | URL                           |
| ------------------------- | ----------------------------- |
| GraphQL / Yoga playground | http://localhost:8080/graphql |
| Health check              | http://localhost:8080/healthz |
| Admin UI                  | http://localhost:5174         |
| Web UI                    | http://localhost:5175         |

### Useful commands

```bash
npm run health:check                  # ping all three ports
npm run db:push --prefix apps/service # apply migrations
npm run db:reset --prefix apps/service # wipe + reseed
npm run lint --workspaces             # lint all packages
npm run test                          # vitest across all workspaces
docker compose up -d postgres         # bring just Postgres up
docker compose down                   # stop everything
```

### Production-like local run via Docker

The `docker-compose.yml` also builds the service image so you can run it the way Fly.io does:

```bash
docker compose up --build -d service  # uses apps/service/.env
docker compose logs -f service
```

## Deployment

### Architecture

| Component       | Hosting                    | Domain                |
| --------------- | -------------------------- | --------------------- |
| `/apps/service` | Fly.io (Docker, always-on) | `api.ultratable.io`   |
| `/apps/web`     | Vercel (static)            | `ultratable.io`       |
| `/apps/admin`   | Vercel (static)            | `admin.ultratable.io` |

### Service Environment Variables (Fly.io)

All variables are set as Fly secrets. See [`apps/service/.env.example`](apps/service/.env.example) for full descriptions.

| Variable                    | Required | Description                                                                                                                                                          |
| --------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                  | ✅       | Set to `production`                                                                                                                                                  |
| `PORT`                      | ✅       | `8080` (Fly default)                                                                                                                                                 |
| `HOST`                      | ✅       | `0.0.0.0`                                                                                                                                                            |
| `DATABASE_URL`              | ✅       | Postgres connection string (Supabase pooler or direct)                                                                                                               |
| `SUPABASE_URL`              | ✅       | Supabase project URL                                                                                                                                                 |
| `SUPABASE_ANON_KEY`         | ✅       | Supabase anon/public key                                                                                                                                             |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅       | Supabase service role key (server-side storage uploads)                                                                                                              |
| `API_FOOTBALL_KEY`          | ✅       | API-Football.com API key                                                                                                                                             |
| `BETTER_AUTH_SECRET`        | ✅       | Session signing secret (≥32 chars)                                                                                                                                   |
| `BETTER_AUTH_URL`           | ✅       | `https://api.ultratable.io`                                                                                                                                          |
| `ALLOWED_ORIGINS`           | ✅       | `https://ultratable.io,https://admin.ultratable.io`                                                                                                                  |
| `LOG_LEVEL`                 | Optional | Log verbosity: `trace\|debug\|info\|warn\|error\|fatal`. Defaults to `info` in production. Set to `warn` for minimal noise. Debug-level logs never hit the database. |
| `GOOGLE_CLIENT_ID`          | Optional | Google OAuth client ID                                                                                                                                               |
| `GOOGLE_CLIENT_SECRET`      | Optional | Google OAuth client secret                                                                                                                                           |

### Frontend Environment Variables (Vercel)

Set in each Vercel project's settings.

| Variable       | Project    | Description                                                      |
| -------------- | ---------- | ---------------------------------------------------------------- |
| `VITE_API_URL` | web, admin | `https://api.ultratable.io` (absolute URL for production builds) |

### Google OAuth Setup

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Create an OAuth 2.0 Client ID (Web application)
3. Add authorized redirect URIs:
    - Dev: `http://localhost:8080/api/auth/callback/google`
    - Prod: `https://api.ultratable.io/api/auth/callback/google`
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the service env.

### Deploying to Fly.io

```bash
# First time
fly apps create ultratable-api
fly secrets set NODE_ENV=production PORT=8080 HOST=0.0.0.0 \
  DATABASE_URL=... SUPABASE_URL=... SUPABASE_ANON_KEY=... \
  SUPABASE_SERVICE_ROLE_KEY=... API_FOOTBALL_KEY=... \
  BETTER_AUTH_SECRET=... BETTER_AUTH_URL=https://api.ultratable.io \
  ALLOWED_ORIGINS=https://ultratable.io,https://admin.ultratable.io

# Deploy
fly deploy

# Subsequent deploys
fly deploy
```
