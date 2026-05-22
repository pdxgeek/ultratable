# Deployment Phase: Infrastructure & Rollout

This phase details the target architecture and the steps to deploy the application to Fly.io and Vercel.

## Target Architecture

- **/apps/service** → Fly.io Docker app, always-on.
    - `POST /graphql`
    - `GET /graphql` (GraphiQL only in non-prod)
    - `GET|POST /api/auth/*` (Better Auth endpoints)
- **/apps/web** → Vercel static deploy. Rewrites `/api/auth/*` to the service.
- **/apps/admin** → Vercel static deploy. Rewrites `/api/auth/*` to the service.
- **Auth Model** → Better Auth issues a session cookie (`SameSite=Lax`, set on the SPA's own origin via the rewrite). Browser sends the cookie on credentialed fetches; the service resolves the session via [`auth.api.getSession`](apps/service/src/index.ts). See [docs/auth-architecture.md](docs/auth-architecture.md) for the full model.
- **Supabase Access** → Service-only using `SUPABASE_SERVICE_ROLE_KEY`.
- **Admin Security** → Service enforces admin role for admin resolvers.

## Step 1: Deploy Service to Fly.io

- Create Fly app `ultratable-api`.
- Deploy the Docker image created in PRE_DEPLOYMENT.
- Set Fly to keep 1 instance running (to avoid cold boot latency).
- **Custom Domain**: `api.ultratable.io` → Fly. (The hostname isn't user-facing — the frontends proxy to it. Pick whatever is convenient.)
- **GraphQL Endpoint**: `https://api.ultratable.io/graphql`.

### Required Environment Variables (Fly)

- `NODE_ENV=production`
- `PORT=8080`
- `BETTER_AUTH_SECRET=...` (≥32 chars)
- `ALLOWED_ORIGINS=https://ultratable.io,https://admin.ultratable.io` (every frontend origin)
- `SUPABASE_URL=...`
- `SUPABASE_SERVICE_ROLE_KEY=...`
- `DATABASE_URL=...`
- `API_FOOTBALL_KEY=...`
- (optional) `GOOGLE_CLIENT_ID=...`, `GOOGLE_CLIENT_SECRET=...`

> [!IMPORTANT]
> **Do NOT set `BETTER_AUTH_URL` in production.** With it unset, Better Auth derives the base URL per request from `X-Forwarded-Host` (sent by each frontend's edge rewrite), so the OAuth redirect URI lives on the frontend's own hostname. Pinning `BETTER_AUTH_URL` overrides this and forces every sign-in to bounce through the service domain. See [docs/auth-architecture.md § Per-frontend OAuth redirect URIs](docs/auth-architecture.md#per-frontend-oauth-redirect-uris-production).

## Step 2: Deploy Web + Admin to Vercel

Two separate Vercel projects:

- **ultratable-web** → `/apps/web` (Domain: `ultratable.io`)
- **ultratable-admin** → `/apps/admin` (Domain: `admin.ultratable.io`)

### Environment Variable (Vercel)

- `VITE_API_URL=https://api.ultratable.io`

### Required `vercel.json` rewrite (per frontend)

```json
{
    "rewrites": [
        { "source": "/api/auth/:path*", "destination": "https://api.ultratable.io/api/auth/:path*" }
    ]
}
```

The rewrite is what makes the per-request OAuth redirect URI work. Without it, `/api/auth/sign-in/social` would 404 on the frontend and Google sign-in would never start.

## Step 3: Google OAuth Client

Register one OAuth 2.0 client (Web application) at [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials). Add **one authorized redirect URI per frontend**:

```
https://ultratable.io/api/auth/callback/google
https://admin.ultratable.io/api/auth/callback/google
http://localhost:5174/api/auth/callback/google     # dev — admin
http://localhost:5175/api/auth/callback/google     # dev — web (when wired)
```

Authorized JavaScript origins can be empty — Better Auth doesn't use Google's JS SDK in the browser.

## Step 4: Final Production Wiring

- Ensure domains are correctly mapped.
- Verify `vercel.json` rewrites resolve — e.g. `curl -I https://ultratable.io/api/auth/ok` should hit the service.
- Confirm `VITE_API_URL` is injected during the Vercel build (used by urql/TanStack Query for cross-origin GraphQL).
- Sanity-check: `curl https://api.ultratable.io/healthz` returns 200.

## Future Hardening: Database RLS Facade

By default Drizzle bypasses Supabase Row Level Security because the service connects as a superuser. To add database-layer defense-in-depth on top of resolver RBAC, implement a facade that reads the user ID from the Yoga context and sets `request.jwt.claims` via `set_config` before executing queries. Focus on table-level / role-based restrictions (locking down the `user` table) rather than row-ownership rules, to keep query planning fast.
