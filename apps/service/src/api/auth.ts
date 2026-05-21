import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db";
import * as schema from "../db/schema";
import { globalLogger } from "../services/log.service";

const logger = globalLogger.child({ module: 'api/auth' });

const betterAuthUrl = process.env.BETTER_AUTH_URL;
if (!betterAuthUrl && process.env.NODE_ENV === 'production') {
    throw new Error('[Auth] BETTER_AUTH_URL is required in production. Set this environment variable.');
} else if (!betterAuthUrl) {
    logger.warn('BETTER_AUTH_URL not set — defaulting to http://localhost:8080. Set this in production!');
}

// Build trusted origins from ALLOWED_ORIGINS + localhost fallbacks for dev.
const DEV_ORIGINS = [
    "http://localhost:5174", "http://127.0.0.1:5174",
    "http://localhost:5175", "http://127.0.0.1:5175",
    "http://127.0.0.1:8080",
];
const trustedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : [];
// In dev, always include localhost origins
if (process.env.NODE_ENV !== 'production') {
    trustedOrigins.push(...DEV_ORIGINS);
}

export const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: "pg",
        schema: {
            // Map Better Auth's standard tables to our Drizzle schema
            user: schema.authUsers,
            session: schema.authSessions,
            account: schema.authAccounts,
            verification: schema.authVerifications
        }
    }),
    emailAndPassword: {
        enabled: true,
    },
    baseURL: betterAuthUrl || "http://localhost:8080",
    trustedOrigins
});

