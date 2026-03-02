import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db";
import * as schema from "../db/schema";

const betterAuthUrl = process.env.BETTER_AUTH_URL;
if (!betterAuthUrl) {
    console.warn('[Auth] BETTER_AUTH_URL not set — defaulting to http://localhost:5174. Set this in production!');
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
    baseURL: betterAuthUrl || "http://localhost:5174",
    trustedOrigins: [
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
        "http://127.0.0.1:8080"
    ]
});
