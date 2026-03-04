# UltraTable

UltraTable is a real-time fantasy sports platform. It consists of multiple applications managed in a monorepo setup.

## Project Structure

- `/apps/service` - The core BFF (Back-end for Front-end) service. Built with Fastify, GraphQL Yoga, and Drizzle ORM.
- `/apps/admin` - Administrative interface.
- `/apps/web` - Main consumer-facing web application.

## Local Development

We use Docker Compose to provide a seamless local development environment that closely mirrors our production Kubernetes deployment.

### Prerequisites
- [Docker & Docker Compose](https://docs.docker.com/get-docker/)
- Node.js (for local CLI tooling, though the service runs in Docker)

### Starting the Service

The Fastify GraphQL service relies on external integrations like Supabase and API-Football. Ensure your `.env` file is populated at `apps/service/.env` before starting.

```bash
# Start the service in the background
docker compose up -d
```

This will:
1. Build the `service` Docker image.
2. Inject your `apps/service/.env` secrets.
3. Start the service, binding it to `localhost:8080`.

### Accessing the API

Once the container is running, you can access the GraphQL Yoga playground to test queries and mutations:

- **GraphQL Endpoint:** `http://localhost:8080/graphql`
- **Health Check (Kubernetes Probes):** `http://localhost:8080/health`

### Viewing Logs

To view the stdout logs (powered by Fastify Pino):

```bash
docker compose logs -f service
```

### Stopping the Applications

To tear down the environment:

```bash
docker compose down
```

## Deployment

### Architecture

| Component | Hosting | Domain |
|-----------|---------|--------|
| `/apps/service` | Fly.io (Docker, always-on) | `api.ultratable.io` |
| `/apps/web` | Vercel (static) | `ultratable.io` |
| `/apps/admin` | Vercel (static) | `admin.ultratable.io` |

### Service Environment Variables (Fly.io)

All variables are set as Fly secrets. See [`apps/service/.env.example`](apps/service/.env.example) for full descriptions.

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | ✅ | Set to `production` |
| `PORT` | ✅ | `8080` (Fly default) |
| `HOST` | ✅ | `0.0.0.0` |
| `DATABASE_URL` | ✅ | Postgres connection string (Supabase pooler or direct) |
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_ANON_KEY` | ✅ | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key (server-side storage uploads) |
| `API_FOOTBALL_KEY` | ✅ | API-Football.com API key |
| `BETTER_AUTH_SECRET` | ✅ | Session signing secret (≥32 chars) |
| `BETTER_AUTH_URL` | ✅ | `https://api.ultratable.io` |
| `ALLOWED_ORIGINS` | ✅ | `https://ultratable.io,https://admin.ultratable.io` |
| `LOG_LEVEL` | Optional | Log verbosity: `trace\|debug\|info\|warn\|error\|fatal`. Defaults to `info` in production. Set to `warn` for minimal noise. Debug-level logs never hit the database. |
| `GOOGLE_CLIENT_ID` | Optional | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth client secret |

### Frontend Environment Variables (Vercel)

Set in each Vercel project's settings.

| Variable | Project | Description |
|----------|---------|-------------|
| `VITE_API_URL` | web, admin | `https://api.ultratable.io` (absolute URL for production builds) |

### Docker Compose (Local)

The service runs via Docker Compose locally. Config is in [`docker-compose.yml`](docker-compose.yml):

```bash
# Build and start
docker compose up --build -d service

# View logs
docker compose logs -f service

# Check health
docker inspect --format='{{.State.Health.Status}}' ultratable-service-1
```

The healthcheck hits `GET /healthz` every 30 seconds.

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
