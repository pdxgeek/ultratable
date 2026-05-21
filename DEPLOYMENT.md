# Deployment Phase: Infrastructure & Rollout

This phase details the target architecture and the steps to deploy the application to Fly.io and Vercel.

## Target Architecture
- **/apps/service** → Fly.io Docker app, always-on.
  - `POST /graphql`
  - `GET /graphql` (GraphiQL only in non-prod)
  - `POST /auth/*` (Better Auth endpoints)
- **/apps/web** → Vercel static deploy.
- **/apps/admin** → Vercel static deploy.
- **Auth Model** → Better Auth issues JWT; browser sends `Authorization: Bearer <jwt>` to `/graphql`.
- **Supabase Access** → Service-only using `SUPABASE_SERVICE_ROLE_KEY`.
- **Admin Security** → Service enforces admin role for admin resolvers.

## Step 1: Deploy Service to Fly.io
- Create Fly app `ultratable-api`.
- Deploy the Docker image created in PRE_DEPLOYMENT.
- Set Fly to keep 1 instance running (to avoid cold boot latency).
- **Custom Domain**: `api.ultratable.io` → Fly.
- **GraphQL Endpoint**: `https://api.ultratable.io/graphql`.

### Required Environment Variables (Fly)
- `NODE_ENV=production`
- `PORT=8080`
- `BETTER_AUTH_SECRET=...`
- `BETTER_AUTH_URL=https://api.ultratable.io`
- `SUPABASE_URL=...`
- `SUPABASE_SERVICE_ROLE_KEY=...`

## Step 2: Deploy Web + Admin to Vercel
Two separate Vercel projects:
- **ultratable-web** → `/apps/web` (Domain: `ultratable.io`)
- **ultratable-admin** → `/apps/admin` (Domain: `admin.ultratable.io`)

### Environment Variable (Vercel)
- `VITE_API_URL=https://api.ultratable.io`

## Step 3: Final Production Wiring
- Ensure domains are correctly mapped.
- Verify that `https://api.ultratable.io/auth/...` endpoints are reachable from the frontends.
- Confirm the `VITE_API_URL` is correctly injected during the Vercel build.

## Future Hardening: Database RLS Facade

By default Drizzle bypasses Supabase Row Level Security because the service connects as a superuser. To add database-layer defense-in-depth on top of resolver RBAC, implement a facade that reads the user ID from the Yoga context and sets `request.jwt.claims` via `set_config` before executing queries. Focus on table-level / role-based restrictions (locking down the `user` table) rather than row-ownership rules, to keep query planning fast.
