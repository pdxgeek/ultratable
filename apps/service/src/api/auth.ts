import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

import { db } from '../db';
import * as schema from '../db/schema';
import { bootstrapDomainUserFromAuthUser } from '../services/auth-bootstrap';
import { globalLogger } from '../services/log.service';

const logger = globalLogger.child({ module: 'api/auth' });

const betterAuthUrl = process.env.BETTER_AUTH_URL;
if (!betterAuthUrl && process.env.NODE_ENV === 'production') {
    throw new Error(
        '[Auth] BETTER_AUTH_URL is required in production. Set this environment variable.',
    );
} else if (!betterAuthUrl) {
    logger.warn(
        'BETTER_AUTH_URL not set — defaulting to http://localhost:8080. Set this in production!',
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

// In production, apps/service, apps/admin, and apps/web each ship as an
// independent container behind their own hostname (see [admin & web in
// separate containers](../../../../docs/) — they don't share an origin with
// each other or with the service). For the session cookie to survive the
// cross-site fetches each frontend makes back to the service, it has to be
// SameSite=None; Secure. In dev (localhost, all-same-site) the Better Auth
// default of SameSite=Lax is correct and we keep it — Secure+None would
// silently fail on plain http.
const productionCookieAttributes =
    process.env.NODE_ENV === 'production'
        ? { sameSite: 'none' as const, secure: true, httpOnly: true }
        : undefined;

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
    advanced: productionCookieAttributes
        ? { defaultCookieAttributes: productionCookieAttributes }
        : undefined,
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
    baseURL: betterAuthUrl || 'http://localhost:8080',
    trustedOrigins,
});
