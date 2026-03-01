# Pre-deployment Phase: Implementation & Security

This phase focuses on making the service production-ready and implementing the core security model.

## Step 1: Dockerize /apps/service
One Docker image, one exposed port (`8080`), env vars injected at runtime.

## Step 2: Make service a real HTTP server
Right now you have `localhost:4000/graphql`. Keep that shape.
Implement a **Fastify** server that mounts **Better Auth** + **Yoga**:
- `/auth/*` routes handled by `auth.handler(request.raw, reply.raw)`.
- `/graphql` handled by Yoga via `yoga.handleNodeRequestAndResponse`.
- Turn GraphiQL on only when `NODE_ENV !== 'production'`.
- In Yoga context, read the `Authorization` header, verify Better Auth JWT, set `ctx.user`.

## Step 3: Database Setup & Auth Linking
Integrate Better Auth with the Drizzle ORM schema:
- **UUID Enforcement**: Ensure the `user`, `session`, `account`, and `verification` tables use Postgres UUID v4 for primary keys (`uuid().defaultRandom()`), strictly adhering to the `AI_README_FIRST.MD` philosophy.
- **User Linking Pattern**: Implement a linking pattern. Rather than a 1:1 user-to-auth platform relationship, support multiple accounts (e.g., Google, Github, Email) linking to a single internal UltraTable User UUID.
- Run `drizzle-kit generate` and `drizzle-kit push` to apply the auth schema.

## Step 4: Wire the client to send JWTs (Logic)
In both web and admin apps:
- Implement login via Better Auth (hits `https://api.ultratable.io/auth/...` in prod).
- **Client-Side JWT Payload Requirements**: Since we are explicitly not caching user domain data, the JWT payload *must* contain:
  - `sub`: The internal Drizzle/Postgres `User.id` (UUIDv4) for immediate database lookups.
  - `roles`: An array of strings (e.g., `["admin"]` or `["user"]`) so the Yoga context can immediately enforce RBAC before hitting the database.
- Store and access JWT client-side.
- Ensure every GraphQL request includes: `Authorization: Bearer <jwt>`.
- No cookies. No CORS credential gymnastics. Local `localhost:4000/graphql` flow stays the same.

## Step 5: Enforce RBAC in the service
The lock is in the service. Implement the following roles:

- **Guest**: Unauthenticated/unverified. Specifically **denied** mutation access.
- **User**: Authenticated. Not specifically denied, but no available mutations.
- **Admin**: Specifically **granted** mutation access.

### Logic
- All current mutations: require `admin` role.
- GraphQL resolvers: use a `requireAdmin(ctx)` helper.
- Admin-only queries: throw error if `ctx.user.roles` does not contain `admin`.
- Authenticated queries: require `user` or `admin`.
- **No User Caching**: Explicitly **DO NOT cache** user-specific domain data. The only cached client state is the JWT. All user-specific datastore requests must hit the database fresh on every request.

## Step 6: Security Verification
Implement tests to verify RBAC enforcement for all mutations:

### Test Suite Requirements
- **Guest Baseline**: Every mutation must be tested with no token (unauthenticated). Expect `UNAUTHENTICATED` or `FORBIDDEN` error.
- **User Baseline**: Every mutation must be tested with a standard `user` JWT. Expect `FORBIDDEN` error.
- **Admin Baseline**: Every mutation must be tested with an `admin` JWT. Expect success.
- **Query Leakage**: Verify that admin-only queries (e.g., system logs, raw Supabase access) correctly reject non-admin users.

### Tools
- Use `vitest` in `apps/service`.
- Create a test utility to generate mock JWTs for `guest`, `user`, and `admin` roles to speed up local testing.

## Step 7: Supabase Facade Security (Database RLS - Final Layer)
Once application-layer security (Yoga/Resolvers) is fully verified, add database-layer defense-in-depth:
- By default, Drizzle bypasses Supabase Row Level Security (RLS) entirely because you are connecting as a superuser.
- To enforce RLS at the database layer, implement a **Facade Strategy**: The database client/facade must read the `sub` (User ID) from the Yoga context and set the Postgres session variables (`set_config('request.jwt.claims', ...)`) before executing Drizzle queries.
- Focus this step primarily on strict **Table-Level** or **Role-Based restrictions** (e.g., locking down the `users` table) rather than complex row-ownership to maintain fast query planner execution.
