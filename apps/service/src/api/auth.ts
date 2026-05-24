import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins/admin';

import { db } from '../db';
import * as schema from '../db/schema';
import { bootstrapDomainUserFromAuthUser } from '../services/auth-bootstrap';
import { globalLogger } from '../services/log.service';

const logger = globalLogger.child({ module: 'api/auth' });

// `BETTER_AUTH_URL` pins the base URL Better Auth uses when generating OAuth
// redirect URIs and signed-cookie domains. We deliberately leave it unset in
// production: apps/service, apps/admin, and apps/web ship as independent
// containers on distinct hostnames, and each frontend proxies `/api/auth/*`
// to the service via its own edge (Vercel rewrites, etc.). With this static
// value absent and `trustedProxyHeaders: true` (Better Auth's default), the
// service derives the base URL per request from `X-Forwarded-Host` /
// `X-Forwarded-Proto`. The redirect URI Google receives then matches whichever
// frontend started the flow — so the user never leaves their SPA's hostname,
// and the session cookie is set on the frontend's origin (same-site, no
// SameSite=None gymnastics).
//
// In dev the service is hit directly or through Vite's default proxy (which
// does NOT forward X-Forwarded headers), so a static base URL is required;
// `BETTER_AUTH_URL` provides it.
// SERVICE_PORT (workspace-wide override, see issue #120) wins over PORT
// (PaaS convention; what apps/service/.env writes). Falls back to 8080.
const SERVICE_PORT = Number(process.env.SERVICE_PORT) || Number(process.env.PORT) || 8080;
const ADMIN_PORT = Number(process.env.ADMIN_PORT) || 5174;
const WEB_PORT = Number(process.env.WEB_PORT) || 5175;

const betterAuthUrl = process.env.BETTER_AUTH_URL;
if (!betterAuthUrl && process.env.NODE_ENV !== 'production') {
    logger.warn(
        `BETTER_AUTH_URL not set — defaulting to http://localhost:${SERVICE_PORT}. Set this in apps/service/.env (via \`npm run setup\`).`,
    );
}

// Build trusted origins from ALLOWED_ORIGINS + localhost fallbacks for dev.
// Ports are sourced from the same env vars the rest of the stack reads (issue
// #120) so an operator override flows here without a code change.
const DEV_ORIGINS = [
    `http://localhost:${ADMIN_PORT}`,
    `http://127.0.0.1:${ADMIN_PORT}`,
    `http://localhost:${WEB_PORT}`,
    `http://127.0.0.1:${WEB_PORT}`,
    `http://127.0.0.1:${SERVICE_PORT}`,
];
const trustedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : [];
// In dev, always include localhost origins
if (process.env.NODE_ENV !== 'production') {
    trustedOrigins.push(...DEV_ORIGINS);
}

// Google OAuth is configured per-frontend. apps/admin and apps/web each have
// their own OAuth client (same Google Cloud project, different consent screens,
// independent revocation). The PUBLIC client IDs live in each frontend's env
// as VITE_GOOGLE_CLIENT_ID; the SECRETS live here, namespaced by frontend.
//
// This is Better Auth's canonical pattern for cross-platform sign-in
// (PR #9292, merged April 2026): pass an array of client IDs and the
// provider accepts ID tokens whose `aud` claim matches any of them. Each
// frontend uses its own client ID via Google Identity Services (GIS) in
// the browser to obtain an ID token, then calls
//   authClient.signIn.social({ provider: 'google', idToken: { token } })
// and the service verifies the token against the configured audiences.
// See docs/auth-architecture.md for the full flow.
//
// The single clientSecret below is kept for two reasons:
//   1. The classic auth-code redirect flow (POST /api/auth/sign-in/social
//      without an idToken) still works as a fallback. It uses the FIRST
//      client ID in the array paired with this secret. We use admin's
//      since dev BETTER_AUTH_URL points at the admin port.
//   2. Anything Better Auth might do server-side that needs the secret
//      (e.g. refresh-token exchange) has one to use.
// In the user-facing ID-token flow the secret is unused — Google's ID
// token is a JWT verified against Google's public keys.
const adminClientId = process.env.GOOGLE_CLIENT_ID_ADMIN;
const adminClientSecret = process.env.GOOGLE_CLIENT_SECRET_ADMIN;
const webClientId = process.env.GOOGLE_CLIENT_ID_WEB;
const webClientSecret = process.env.GOOGLE_CLIENT_SECRET_WEB;

const googleClientIds = [adminClientId, webClientId].filter(
    (id): id is string => Boolean(id),
);
// Admin first: matches BETTER_AUTH_URL in dev and is the documented "primary"
// frontend for the auth-code-flow fallback.
const primaryGoogleSecret = adminClientSecret ?? webClientSecret;

const socialProviders =
    googleClientIds.length > 0 && primaryGoogleSecret
        ? {
              google: {
                  clientId: googleClientIds.length === 1 ? googleClientIds[0] : googleClientIds,
                  clientSecret: primaryGoogleSecret,
              },
          }
        : undefined;
if (!socialProviders && process.env.NODE_ENV === 'production') {
    logger.warn(
        'Google OAuth client IDs/secrets not set — Google sign-in is disabled in this deployment.',
    );
}

export const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: 'pg',
        schema: {
            // Map Better Auth's standard tables to our Drizzle schema
            user: schema.authUsers,
            session: schema.authSessions,
            account: schema.authAccounts,
            verification: schema.authVerifications,
        },
    }),
    emailAndPassword: {
        enabled: true,
    },
    socialProviders,
    databaseHooks: {
        user: {
            create: {
                after: async (authUser) => {
                    await bootstrapDomainUserFromAuthUser({
                        id: authUser.id,
                        name: authUser.name,
                        email: authUser.email,
                        emailVerified: authUser.emailVerified,
                        image: authUser.image ?? null,
                    });
                },
            },
        },
    },
    // Only pin baseURL when an explicit BETTER_AUTH_URL is set (dev). When
    // unset (intended prod default), Better Auth derives the base URL per
    // request from X-Forwarded-Host — see the comment above the env read.
    baseURL:
        betterAuthUrl ||
        (process.env.NODE_ENV !== 'production' ? `http://localhost:${SERVICE_PORT}` : undefined),
    trustedOrigins,
    // The admin plugin exposes auth.api.{listUsers,getUser,banUser,unbanUser,
    // impersonateUser,removeUser,setRole} for the upcoming user-management UI
    // (sibling ticket). We deliberately do NOT call `auth.api.setRole` from
    // our code — role mutations go through repository.users.setDomainUserRoles
    // so user.roles stays the source of truth. The plugin's internal admin
    // gate reads auth_user.role, which is mirrored from user.roles by the
    // repository whenever the domain row changes (see the mirror in
    // postgres/users.repository.ts). adminRoles defaults to ['admin'] which
    // matches our domain role string.
    plugins: [admin()],
});
