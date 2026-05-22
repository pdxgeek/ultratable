import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

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
const betterAuthUrl = process.env.BETTER_AUTH_URL;
if (!betterAuthUrl && process.env.NODE_ENV !== 'production') {
    logger.warn(
        'BETTER_AUTH_URL not set — defaulting to http://localhost:8080. Set this in apps/service/.env (via `npm run setup`).',
    );
}

// Build trusted origins from ALLOWED_ORIGINS + localhost fallbacks for dev.
const DEV_ORIGINS = [
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://localhost:5175',
    'http://127.0.0.1:5175',
    'http://127.0.0.1:8080',
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
// different redirect URIs). The PUBLIC client IDs live in each frontend's env
// as VITE_GOOGLE_CLIENT_ID; the SECRETS live here, namespaced by frontend.
//
// Better Auth's `socialProviders.google` accepts `clientId: string[]`, which
// makes the provider accept ID tokens whose audience matches any of the listed
// client IDs (used by the upcoming frontend-driven ID-token sign-in). For the
// auth-code flow that runs today, Better Auth uses the first client ID and the
// (single) clientSecret it was configured with.
//
// KNOWN FOLLOW-UP: per-host dispatch of (clientId, clientSecret) so the
// auth-code flow uses admin's pair when the request comes from admin and
// web's pair when it comes from web. Better Auth captures these at init,
// not per-request, so this needs a custom social provider wrapper. Until
// then, both frontends share whichever pair is picked here (admin first).
const adminClientId = process.env.GOOGLE_CLIENT_ID_ADMIN;
const adminClientSecret = process.env.GOOGLE_CLIENT_SECRET_ADMIN;
const webClientId = process.env.GOOGLE_CLIENT_ID_WEB;
const webClientSecret = process.env.GOOGLE_CLIENT_SECRET_WEB;

const googleClientIds = [adminClientId, webClientId].filter(
    (id): id is string => Boolean(id),
);
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
    baseURL: betterAuthUrl || (process.env.NODE_ENV !== 'production' ? 'http://localhost:8080' : undefined),
    trustedOrigins,
});
