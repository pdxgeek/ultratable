import { betterAuth } from 'better-auth';

// Better Auth server-side configuration
// This will be used in API routes for handling OAuth flows

export const auth = betterAuth({
    database: {
        // Better Auth needs a database adapter
        // For now, we'll use in-memory or localStorage adapter for local dev
        // In production, this should connect to a real database
        provider: 'memory',
    },
    socialProviders: {
        github: {
            clientId: import.meta.env.VITE_GITHUB_CLIENT_ID || '',
            clientSecret: import.meta.env.VITE_GITHUB_CLIENT_SECRET || '',
        },
        google: {
            clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
            clientSecret: import.meta.env.VITE_GOOGLE_CLIENT_SECRET || '',
        },
        discord: {
            clientId: import.meta.env.VITE_DISCORD_CLIENT_ID || '',
            clientSecret: import.meta.env.VITE_DISCORD_CLIENT_SECRET || '',
        },
    },
    secret: import.meta.env.VITE_AUTH_SECRET || 'dev-secret-change-in-production',
});
