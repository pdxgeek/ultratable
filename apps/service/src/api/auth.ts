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

// Google OAuth is wired in only when both env vars are present. Leaving it
// configured-but-empty makes Better Auth advertise the provider with broken
// credentials, which breaks the sign-in UI; absent is the correct dev default.
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const socialProviders =
    googleClientId && googleClientSecret
        ? { google: { clientId: googleClientId, clientSecret: googleClientSecret } }
        : undefined;
if (!socialProviders && process.env.NODE_ENV === 'production') {
    logger.warn(
        'GOOGLE_CLIENT_ID/SECRET not set — Google sign-in is disabled in this deployment.',
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
