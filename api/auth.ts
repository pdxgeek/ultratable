import { betterAuth } from 'better-auth';
import type { IncomingMessage, ServerResponse } from 'http';

// Better Auth instance
export const auth = betterAuth({
    database: {
        // For local dev, use in-memory storage
        // In production, connect to a real database
        provider: 'memory',
    },
    socialProviders: {
        github: {
            clientId: process.env.VITE_GITHUB_CLIENT_ID || '',
            clientSecret: process.env.VITE_GITHUB_CLIENT_SECRET || '',
            enabled: !!(process.env.VITE_GITHUB_CLIENT_ID && process.env.VITE_GITHUB_CLIENT_SECRET),
        },
        google: {
            clientId: process.env.VITE_GOOGLE_CLIENT_ID || '',
            clientSecret: process.env.VITE_GOOGLE_CLIENT_SECRET || '',
            enabled: !!(process.env.VITE_GOOGLE_CLIENT_ID && process.env.VITE_GOOGLE_CLIENT_SECRET),
        },
        discord: {
            clientId: process.env.VITE_DISCORD_CLIENT_ID || '',
            clientSecret: process.env.VITE_DISCORD_CLIENT_SECRET || '',
            enabled: !!(process.env.VITE_DISCORD_CLIENT_ID && process.env.VITE_DISCORD_CLIENT_SECRET),
        },
    },
    secret: process.env.VITE_AUTH_SECRET || 'dev-secret-change-in-production',
    baseURL: process.env.VITE_AUTH_BASE_URL || 'http://localhost:5174',
});

// Export handler for Vite middleware
export default async function handler(req: IncomingMessage, res: ServerResponse) {
    return auth.handler(req, res);
}
