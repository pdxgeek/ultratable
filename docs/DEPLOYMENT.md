# Deployment Phase: Infrastructure & Rollout

This phase details the target architecture and the steps to deploy the application to Fly.io and Vercel.

## Target Architecture

- **/apps/service** → Fly.io Docker app, always-on.
    - `POST /graphql`
    - `GET /graphql` (GraphiQL only in non-prod)
    - `GET|POST /api/auth/*` (Better Auth endpoints)
- **/apps/web** → Vercel static deploy. Rewrites `/api/auth/*` to the service.
- **/apps/admin** → Vercel static deploy. Rewrites `/api/auth/*` to the service.
- **Auth Model** → Better Auth issues a session cookie (`SameSite=Lax`, set on the SPA's own origin via the rewrite). Browser sends the cookie on credentialed fetches; the service resolves the session via [`auth.api.getSession`](../apps/service/src/index.ts). See [auth-architecture.md](./auth-architecture.md) for the full model.
- **Supabase Access** → Service-only using `SUPABASE_SERVICE_ROLE_KEY`.
- **Admin Security** → Service enforces admin role for admin resolvers.

## Step 1: Deploy Service to Fly.io

- Create Fly app `ultratable-api`.
- Deploy the Docker image created in PRE_DEPLOYMENT.
- Set Fly to keep 1 instance running (to avoid cold boot latency).
- **Custom Domain**: `api.ultratable.io` → Fly. (The hostname isn't user-facing — the frontends proxy to it. Pick whatever is convenient.)
- **GraphQL Endpoint**: `https://api.ultratable.io/graphql`.

### Required Environment Variables (Fly)

All variables are set as Fly secrets. See [`apps/service/.env.example`](../apps/service/.env.example) for full descriptions.

| Variable                     | Required | Description                                                                                                                                                          |
| ---------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                   | ✅       | Set to `production`                                                                                                                                                  |
| `PORT`                       | ✅       | `8080` (Fly default)                                                                                                                                                 |
| `HOST`                       | ✅       | `0.0.0.0`                                                                                                                                                            |
| `DATABASE_URL`               | ✅       | Postgres connection string (Supabase pooler or direct)                                                                                                               |
| `SUPABASE_URL`               | ✅       | Supabase project URL                                                                                                                                                 |
| `SUPABASE_ANON_KEY`          | ✅       | Supabase anon/public key                                                                                                                                             |
| `SUPABASE_SERVICE_ROLE_KEY`  | ✅       | Supabase service role key (server-side storage uploads)                                                                                                              |
| `API_FOOTBALL_KEY`           | ✅       | API-Football.com API key                                                                                                                                             |
| `BETTER_AUTH_SECRET`         | ✅       | Session signing secret (≥32 chars)                                                                                                                                   |
| `ALLOWED_ORIGINS`            | ✅       | Comma-separated list of every frontend origin. Feeds both Fastify CORS and Better Auth's `trustedOrigins`. e.g. `https://ultratable.io,https://admin.ultratable.io`  |
| `LOG_LEVEL`                  | Optional | Log verbosity: `trace\|debug\|info\|warn\|error\|fatal`. Defaults to `info` in production. Set to `warn` for minimal noise. Debug-level logs never hit the database. |
| `GOOGLE_CLIENT_ID_ADMIN`     | Optional | Admin frontend's Google OAuth client ID. Same value as `VITE_GOOGLE_CLIENT_ID` in `apps/admin/.env`.                                                                 |
| `GOOGLE_CLIENT_SECRET_ADMIN` | Optional | Admin frontend's Google OAuth client secret. Stays server-side only.                                                                                                 |
| `GOOGLE_CLIENT_ID_WEB`       | Optional | Web frontend's Google OAuth client ID. Same value as `VITE_GOOGLE_CLIENT_ID` in `apps/web/.env`.                                                                     |
| `GOOGLE_CLIENT_SECRET_WEB`   | Optional | Web frontend's Google OAuth client secret. Stays server-side only.                                                                                                   |

> [!IMPORTANT]
> **Do NOT set `BETTER_AUTH_URL` in production.** With it unset, Better Auth derives the base URL per request from `X-Forwarded-Host` (sent by each frontend's edge rewrite), so the OAuth redirect URI lives on the frontend's own hostname. Pinning `BETTER_AUTH_URL` overrides this and forces every sign-in to bounce through the service domain. See [auth-architecture.md § Per-frontend OAuth redirect URIs](./auth-architecture.md#per-frontend-oauth-redirect-uris-production).

### Deploying to Fly.io

```bash
# First time
fly apps create ultratable-api
fly secrets set NODE_ENV=production PORT=8080 HOST=0.0.0.0 \
  DATABASE_URL=... SUPABASE_URL=... SUPABASE_ANON_KEY=... \
  SUPABASE_SERVICE_ROLE_KEY=... API_FOOTBALL_KEY=... \
  BETTER_AUTH_SECRET=... \
  ALLOWED_ORIGINS=https://ultratable.io,https://admin.ultratable.io
# NOTE: BETTER_AUTH_URL is intentionally not set in prod — Better Auth
# derives the base URL per request from X-Forwarded-Host.

# Deploy
fly deploy

# Subsequent deploys
fly deploy
```

## Step 2: Deploy Web + Admin to Vercel

Two separate Vercel projects:

- **ultratable-web** → `/apps/web` (Domain: `ultratable.io`)
- **ultratable-admin** → `/apps/admin` (Domain: `admin.ultratable.io`)

### Frontend Environment Variables (Vercel)

Set in each Vercel project's settings.

| Variable                | Project    | Description                                                                                       |
| ----------------------- | ---------- | ------------------------------------------------------------------------------------------------- |
| `VITE_API_URL`          | web, admin | `https://api.ultratable.io` (absolute URL for production builds)                                  |
| `VITE_GOOGLE_CLIENT_ID` | web, admin | Public Google OAuth client ID — one per frontend, different value for each. Bundled into the JS. |

### Required `vercel.json` rewrite (per frontend)

```json
{
    "rewrites": [
        { "source": "/api/auth/:path*", "destination": "https://api.ultratable.io/api/auth/:path*" }
    ]
}
```

The rewrite proxies `/api/auth/*` to the service so the session cookie ends up on the SPA's origin (same-site, no `SameSite=None` needed). It also makes the optional auth-code redirect fallback work without the user briefly leaving the SPA. The primary ID-token sign-in flow (see [auth-architecture.md](./auth-architecture.md)) uses this rewrite to POST the Google ID token to the service via the same-origin path.

## Step 3: Google OAuth Clients (two of them)

Register **two** OAuth 2.0 Web application clients in the same Google Cloud project at [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials) — one per frontend, with its own consent screen and per-host redirect URI:

**Admin client**
- JavaScript origin: `https://admin.ultratable.io` (and `http://localhost:5174` for dev)
- Redirect URI:      `https://admin.ultratable.io/api/auth/callback/google` (and `http://localhost:5174/api/auth/callback/google` for dev)

**Web client**
- JavaScript origin: `https://ultratable.io` (and `http://localhost:5175` for dev)
- Redirect URI:      `https://ultratable.io/api/auth/callback/google` (and `http://localhost:5175/api/auth/callback/google` for dev)

Credential layout:
- Public client IDs → `VITE_GOOGLE_CLIENT_ID` in each frontend's Vercel project env (different value each), plus mirrored as `GOOGLE_CLIENT_ID_ADMIN` / `GOOGLE_CLIENT_ID_WEB` on the service.
- Secrets → `GOOGLE_CLIENT_SECRET_ADMIN` / `GOOGLE_CLIENT_SECRET_WEB` on the service. **Never in a frontend env.**

See [auth-architecture.md](./auth-architecture.md) for the rationale and the ID-token sign-in flow.

## Step 4: Final Production Wiring

- Ensure domains are correctly mapped.
- Verify `vercel.json` rewrites resolve — e.g. `curl -I https://ultratable.io/api/auth/ok` should hit the service.
- Confirm `VITE_API_URL` is injected during the Vercel build (used by urql/TanStack Query for cross-origin GraphQL).
- Sanity-check: `curl https://api.ultratable.io/healthz` returns 200.

## Future Hardening: Database RLS Facade

By default Drizzle bypasses Supabase Row Level Security because the service connects as a superuser. To add database-layer defense-in-depth on top of resolver RBAC, implement a facade that reads the user ID from the Yoga context and sets `request.jwt.claims` via `set_config` before executing queries. Focus on table-level / role-based restrictions (locking down the `user` table) rather than row-ownership rules, to keep query planning fast.
