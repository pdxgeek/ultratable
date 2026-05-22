# Auth architecture

This is the operating manual for authentication in UltraTable. It complements [CLAUDE.md](../CLAUDE.md) and the architecture guide in [AI_README_FIRST.MD](../AI_README_FIRST.MD), and is the canonical reference for everything that touches sign-in, sessions, or identity linking.

Auth is provided by [Better Auth](https://www.better-auth.com) and lives entirely in [apps/service](../apps/service). The frontends never see a client secret and never talk to Google directly — they navigate the browser to the service's `/api/auth/*` endpoints and let the redirect flow do the rest.

## Identity is not an account

UltraTable uses a **two-tier user model** that deliberately separates *who you are with a provider* from *what account you own in our system*. The model has three tables in [apps/service/src/db/schema.ts](../apps/service/src/db/schema.ts):

| Table       | Owned by    | What it represents                                          |
| ----------- | ----------- | ----------------------------------------------------------- |
| `auth_user` | Better Auth | One sign-in identity (a Google identity, a credential pair) |
| `auth_link` | UltraTable  | Many-to-one bridge from auth identities to a domain account |
| `user`      | UltraTable  | The domain account — roles, profile, the thing GraphQL exposes |

A single domain `user` row can have many `auth_link` rows pointing at it (Google identity + credential identity → same account). New identities never auto-merge into an existing account by matching email — explicit linking is the only path, and it lives in the account-page flow (separate issue).

The GraphQL surface speaks in terms of the domain account, never the auth identity. `Query.viewer` returns a `Viewer` whose `id` is the domain UUID; `Viewer.identities` is the list of `auth_user` rows linked to it.

## The bootstrap hook

When Better Auth creates a new `auth_user` (any provider), [`bootstrapDomainUserFromAuthUser`](../apps/service/src/services/auth-bootstrap.ts) fires from `databaseHooks.user.create.after` and:

1. Inserts a fresh `user` row mirroring the auth identity's profile (name, email, image, emailVerified). Default role is `["user"]`.
2. Inserts an `auth_link` binding the new `auth_user` to the new `user`.

**The hook never auto-links by email.** If the new identity's email collides with an existing `users.email` (which is `UNIQUE`), the insert fails, the error is logged, and the `auth_user` stays unlinked. The GraphQL context handles unlinked auth users by falling back to a default role; the account-page flow is the path to explicit linking. Do not change this — auto-merging on email match means anyone who creates a Google account at your address can merge into your account.

The hook is unit-tested directly in [auth-bootstrap.test.ts](../apps/service/src/services/auth-bootstrap.test.ts) because it's load-bearing for every sign-up flow.

## The viewer query

`Query.viewer` returns `null` (not an error) when unauthenticated, so frontends can render a signed-out state without try/catch. When authenticated it returns the joined domain account:

```graphql
type Viewer {
    id: ID!                # domain user UUID
    name: String!
    email: String!
    image: String
    emailVerified: Boolean!
    roles: [String!]!
    createdAt: DateTime!
    identities: [AuthIdentity!]!
}

type AuthIdentity {
    authUserId: ID!        # the linked auth_user row
    provider: String!      # 'google' | 'credential' | ...
    linkedAt: DateTime!
}
```

`identities` joins through `auth_link` → `auth_account` (provider lives on `auth_account.provider_id`). The resolver lives in [`apps/service/src/schema/viewer.ts`](../apps/service/src/schema/viewer.ts) and goes through `repository.users` rather than touching `db` directly — this is the storage-agnostic facade rule from [AI_README_FIRST.MD §5](../AI_README_FIRST.MD).

## Dev login

`/api/auth/dev-login` is a non-production endpoint that mints a Better Auth session for one of three canned roles (`admin`, `user`, `guest`). It calls Better Auth's `signUpEmail` if the identity doesn't exist (which fires the bootstrap hook, creating the matching domain user + link), then force-sets the requested role via `repository.users.setDomainUserRoles` and invalidates the domain-user cache. The endpoint returns 403 in production.

Use this from the DevLoginTools widget in admin during local dev. Never call it from any other context.

## Per-frontend OAuth redirect URIs (production)

In production, `apps/service`, `apps/admin`, and `apps/web` ship as **three independent containers behind distinct hostnames**:

| Container      | Production hostname     | Role                                       |
| -------------- | ----------------------- | ------------------------------------------ |
| `apps/service` | (any — see below)       | Fastify + Yoga, Better Auth                |
| `apps/admin`   | `admin.ultratable.io`   | React admin UI (Vercel static)             |
| `apps/web`     | `ultratable.io`         | React consumer UI (Vercel static)          |

**The OAuth redirect URI lives on the frontend's own hostname, not on the service.** Each frontend container is expected to rewrite `/api/auth/*` to the service container (Vercel rewrites, Cloudflare workers, etc.). That keeps the user inside their SPA the whole way through Google sign-in — the address bar shows `admin.ultratable.io` (or `ultratable.io`) from start to finish, and the session cookie is set on the same origin as the SPA so `SameSite=Lax` (Better Auth's default) is correct.

To make one Better Auth deployment serve N frontends, the service is configured with:

- **`BETTER_AUTH_URL` unset in production.** Better Auth's `trustedProxyHeaders: true` (its default) causes it to derive the base URL per request from `X-Forwarded-Host` / `X-Forwarded-Proto`. The OAuth redirect URI the service sends to Google therefore matches whichever frontend started the flow.
- **`baseURL` left undefined in the `betterAuth({...})` config in prod** ([apps/service/src/api/auth.ts](../apps/service/src/api/auth.ts)). In dev a static `baseURL` is still required because Vite's default proxy does not forward `X-Forwarded-*` headers; we set it from `BETTER_AUTH_URL` env when present.
- **`ALLOWED_ORIGINS` lists every frontend origin.** The same env var feeds both Fastify's CORS allowlist and Better Auth's `trustedOrigins`, so an unlisted origin is rejected during OAuth callbackURL validation.

### Google Cloud Console config — two OAuth clients

Register **two** OAuth 2.0 Web application clients in the same Google Cloud project (one per frontend). Each gets its own consent screen, can be rotated independently, and has its own redirect URI on the frontend's own host:

**Admin client**
- Authorized JavaScript origin: `https://admin.ultratable.io` (and `http://localhost:5174` for dev)
- Authorized redirect URI: `https://admin.ultratable.io/api/auth/callback/google` (and `http://localhost:5174/api/auth/callback/google` for dev)

**Web client**
- Authorized JavaScript origin: `https://ultratable.io` (and `http://localhost:5175` for dev)
- Authorized redirect URI: `https://ultratable.io/api/auth/callback/google` (and `http://localhost:5175/api/auth/callback/google` for dev)

### Credential layout

Each OAuth client has a public `clientId` and a sensitive `clientSecret`. They live in different env files based on whether they're public or secret:

| Value                                        | Where                                  | Why                                                                  |
| -------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------- |
| Admin `clientId` (public)                    | [`apps/admin/.env`](../apps/admin/.env.example) as `VITE_GOOGLE_CLIENT_ID`   | Bundled into the admin JS so the frontend can render the Google sign-in button. Client IDs are public by design. |
| Web `clientId` (public)                      | [`apps/web/.env`](../apps/web/.env.example) as `VITE_GOOGLE_CLIENT_ID`     | Same as admin, for the web bundle.                                  |
| Admin `clientSecret` (sensitive)             | [`apps/service/.env`](../apps/service/.env.example) as `GOOGLE_CLIENT_SECRET_ADMIN` | Used by the service for the OAuth code-for-token exchange. Never reaches a browser. |
| Web `clientSecret` (sensitive)               | [`apps/service/.env`](../apps/service/.env.example) as `GOOGLE_CLIENT_SECRET_WEB`   | Same as admin, server-side only.                                    |
| Admin/Web `clientId` (also on service)       | [`apps/service/.env`](../apps/service/.env.example) as `GOOGLE_CLIENT_ID_{ADMIN,WEB}` | Pothos / Better Auth needs these on the server too — they're passed as a `clientId: string[]` array to the social provider config. Same value as the frontend env, duplicated by design. |

`npm run setup` collects both pairs once and writes them to all three .env files in the right places.

> [!IMPORTANT]
> **Anything in `apps/admin/.env` or `apps/web/.env` ships to every browser visiting the deployed site.** This is fine for `VITE_GOOGLE_CLIENT_ID` (public) but absolutely not OK for the secret. The split exists to make it impossible to accidentally bundle a secret.

### Known follow-up: per-host credential dispatch

Better Auth's social provider takes `(clientId, clientSecret)` at init time, not per request, so today the auth-code flow uses whichever pair the service picks first (admin). The two-client architecture is fully provisioned in the env layout, but **dispatching by `X-Forwarded-Host` (so admin sign-ins use the admin client and web sign-ins use the web client) requires a custom wrapper around Better Auth's `google` provider** and is tracked as a follow-up. Until that lands, both frontends share the admin OAuth client at the protocol level — they still render their own buttons from their own `VITE_GOOGLE_CLIENT_ID`, but the redirect dance terminates at the admin client. The eventual ID-token flow (frontend uses Google Identity Services to obtain a token, posts it to the service for verification) sidesteps this entirely because both client IDs are accepted as valid audiences via `clientId: string[]` already.

### Frontend edge rewrites

Each frontend container must rewrite `/api/auth/*` to the service. Vercel example (`vercel.json` in each app):

```json
{
    "rewrites": [
        {
            "source": "/api/auth/:path*",
            "destination": "https://<service-host>/api/auth/:path*"
        }
    ]
}
```

The rewrite preserves `X-Forwarded-Host`, which is what makes the per-request base URL inference work. Without it, the service would generate a redirect URI on the service's own hostname and the user would briefly leave the SPA during sign-in.

## Dev sign-in flow

| Step | Where the browser is        | What happens                                                                          |
| ---- | --------------------------- | ------------------------------------------------------------------------------------- |
| 1    | `http://localhost:5174`     | User clicks "Sign in with Google" in the admin app                                    |
| 2    | `http://localhost:5174`     | Frontend navigates to `/api/auth/sign-in/social?provider=google&callbackURL=…`        |
| 3    | (Vite proxies to 8080)      | Service redirects the browser to `accounts.google.com/o/oauth2/v2/auth` with `redirect_uri = ${BETTER_AUTH_URL}/api/auth/callback/google` |
| 4    | `accounts.google.com`       | User approves                                                                          |
| 5    | `${BETTER_AUTH_URL}/api/auth/callback/google?code=…` | Browser hits the callback; Vite proxies to the service; service exchanges the code, runs the `user.create.after` hook, sets the session cookie |
| 6    | `callbackURL` frontend path | Service 302s the browser back to the SPA; the cookie is already set                   |

## Env vars

Documented in full in [apps/service/.env.example](../apps/service/.env.example), [apps/admin/.env.example](../apps/admin/.env.example), and [apps/web/.env.example](../apps/web/.env.example). The auth-relevant ones:

**Service** (`apps/service/.env`)

| Var                          | Dev                         | Prod                                                    |
| ---------------------------- | --------------------------- | ------------------------------------------------------- |
| `BETTER_AUTH_SECRET`         | auto-generated by setup     | required, ≥32 chars                                     |
| `BETTER_AUTH_URL`            | `http://localhost:5174`     | **unset** — service derives per request from headers    |
| `ALLOWED_ORIGINS`            | localhost defaults applied  | required, comma-separated list of every frontend origin |
| `GOOGLE_CLIENT_ID_ADMIN`     | optional (skips Google)     | required for admin Google sign-in                       |
| `GOOGLE_CLIENT_SECRET_ADMIN` | optional (skips Google)     | required for admin Google sign-in                       |
| `GOOGLE_CLIENT_ID_WEB`       | optional (skips Google)     | required for web Google sign-in                         |
| `GOOGLE_CLIENT_SECRET_WEB`   | optional (skips Google)     | required for web Google sign-in                         |

**Admin frontend** (`apps/admin/.env`)

| Var                     | Notes                                                                |
| ----------------------- | -------------------------------------------------------------------- |
| `VITE_GOOGLE_CLIENT_ID` | Admin OAuth client's public ID. Same value as `GOOGLE_CLIENT_ID_ADMIN` on the service. Bundles into the JS. |

**Web frontend** (`apps/web/.env`)

| Var                     | Notes                                                                |
| ----------------------- | -------------------------------------------------------------------- |
| `VITE_GOOGLE_CLIENT_ID` | Web OAuth client's public ID. Same value as `GOOGLE_CLIENT_ID_WEB` on the service. Bundles into the JS. |

Don't hand-edit any of these — re-run `npm run setup`. The script preserves existing values as defaults and writes to all three files atomically.

## When you're changing something here

- Adding a new social provider: add its env vars (gated like Google's), wire it into `socialProviders` in [auth.ts](../apps/service/src/api/auth.ts), add its redirect URIs to Google's config (or the equivalent), and add the Google-style "leave unset in prod" doc note if applicable.
- Changing the identity model: re-read this doc's "Identity is not an account" section before touching the `auth_link` table or the hook. The "never auto-link by email" rule is load-bearing.
- Changing the viewer surface: the schema descriptions test (`schema-descriptions.test.ts`) enforces that every field has a description. Add one for any new field.
- Touching the bootstrap hook: keep [auth-bootstrap.test.ts](../apps/service/src/services/auth-bootstrap.test.ts) green. The duplicate-email-swallowing branch is intentional — do not make it throw.
