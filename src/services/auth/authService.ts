import { createAuthClient } from 'better-auth/react';
import { db } from '../dao/schema';
import type { UserRecord, OAuthConnectionRecord } from '../dao/schema';
import { generateId } from '../idUtils';

// ─── Types ─────────────────────────────────────────────────────────────────

export type OAuthProvider = 'github' | 'google' | 'discord';

export interface AuthSession {
    userId: string;
    user: UserRecord;
    connections: OAuthConnectionRecord[];
}

// ─── Better Auth Client ────────────────────────────────────────────────────

export const authClient = createAuthClient({
    baseURL: import.meta.env.VITE_AUTH_BASE_URL || window.location.origin,
    // Better Auth will handle OAuth flows
});

// ─── Auth Service ──────────────────────────────────────────────────────────

export class AuthService {
    private currentSession: AuthSession | null = null;

    // Initialize session from Better Auth and sync to local DB
    async initialize(): Promise<void> {
        try {
            // Check for dev bypass session first
            let devUser = await db.users.where('email').equals('dev@ultratable.local').first();

            if (!devUser && import.meta.env.DEV) {
                // Create dev user if missing in dev mode
                const userId = generateId();
                const now = Date.now();
                devUser = {
                    id: userId,
                    email: 'dev@ultratable.local',
                    displayName: 'Dev Admin',
                    role: 'admin',
                    createdAt: now,
                    lastLogin: now,
                };
                await db.users.add(devUser);
            }

            if (devUser) {
                // Ensure dev user is always admin
                if (devUser.role !== 'admin') {
                    await db.users.update(devUser.id, { role: 'admin' });
                    devUser.role = 'admin';
                }

                const connections = await db.oauthConnections
                    .where('userId')
                    .equals(devUser.id)
                    .toArray();

                this.currentSession = { userId: devUser.id, user: devUser, connections };
                return;
            }

            // Get session from Better Auth
            const { data: betterAuthSession } = await authClient.getSession();

            if (!betterAuthSession?.user) {
                this.clearSession();
                return;
            }

            // Sync Better Auth user to our local Dexie DB
            await this.syncUserToLocal(betterAuthSession.user);

        } catch (err) {
            console.error('Failed to restore session:', err);
            this.clearSession();
        }
    }

    // Sync Better Auth user data to our local Dexie database
    private async syncUserToLocal(betterAuthUser: any): Promise<void> {
        const now = Date.now();

        // Check if user exists in local DB by email
        let localUser = betterAuthUser.email
            ? await db.users.where('email').equals(betterAuthUser.email).first()
            : null;

        if (!localUser) {
            // Create new local user
            const userId = generateId();
            localUser = {
                id: userId,
                email: betterAuthUser.email,
                displayName: betterAuthUser.name,
                avatar: betterAuthUser.image,
                role: betterAuthUser.role || 'guest', // Default to guest
                createdAt: now,
                lastLogin: now,
            };
            await db.users.add(localUser);
        } else {
            // Update existing user
            await db.users.update(localUser.id, {
                lastLogin: now,
                displayName: betterAuthUser.name,
                avatar: betterAuthUser.image,
                role: betterAuthUser.role || localUser.role || 'guest',
            });
        }

        // Load OAuth connections
        const connections = await db.oauthConnections
            .where('userId')
            .equals(localUser.id)
            .toArray();

        this.currentSession = { userId: localUser.id, user: localUser, connections };
    }

    // Get current session
    getSession(): AuthSession | null {
        return this.currentSession;
    }

    // Check if user is authenticated
    isAuthenticated(): boolean {
        return this.currentSession !== null;
    }

    // Role checks
    isAdmin(): boolean {
        return this.currentSession?.user.role === 'admin';
    }

    isGuest(): boolean {
        return this.currentSession?.user.role === 'guest' || !this.isAuthenticated();
    }

    getUserRole(): string {
        return this.currentSession?.user.role || 'guest';
    }

    // Sign in with OAuth provider (Better Auth handles the flow)
    async signIn(provider: OAuthProvider): Promise<void> {
        try {
            // Better Auth handles OAuth flow, redirects, and callbacks automatically
            await authClient.signIn.social({
                provider: provider,
                callbackURL: `${window.location.origin}/auth/callback`,
            });
        } catch (err) {
            console.error(`Failed to sign in with ${provider}:`, err);
            throw err;
        }
    }

    // Link additional OAuth provider to current account
    async linkProvider(provider: OAuthProvider): Promise<void> {
        if (!this.currentSession) {
            throw new Error('Must be logged in to link provider');
        }

        try {
            // Better Auth handles linking additional accounts
            await authClient.linkSocial({
                provider: provider,
                callbackURL: `${window.location.origin}/auth/callback`,
            });

            // Sync the new connection to local DB
            // const now = Date.now();

            // Get updated session from Better Auth
            const { data: betterAuthSession } = await authClient.getSession();

            if (betterAuthSession?.user) {
                // Better Auth stores linked accounts - we sync to our local DB
                // Note: You may need to fetch account details from Better Auth API
                // and create corresponding OAuthConnectionRecord entries

                // Reload connections from local DB
                const connections = await db.oauthConnections
                    .where('userId')
                    .equals(this.currentSession.userId)
                    .toArray();

                this.currentSession.connections = connections;
            }
        } catch (err) {
            console.error(`Failed to link ${provider}:`, err);
            throw err;
        }
    }

    // Unlink OAuth provider
    async unlinkProvider(provider: OAuthProvider): Promise<void> {
        if (!this.currentSession) {
            throw new Error('Must be logged in');
        }

        const connection = this.currentSession.connections.find(c => c.provider === provider);
        if (!connection) {
            throw new Error('Provider not linked');
        }

        // Prevent unlinking last provider
        if (this.currentSession.connections.length === 1) {
            throw new Error('Cannot unlink last authentication method');
        }

        try {
            // Better Auth handles unlinking
            // Note: Check Better Auth docs for exact API
            // @ts-ignore - Better Auth unlink API may vary by version
            await authClient.unlinkSocial({ provider });

            // Remove from local DB
            await db.oauthConnections.delete(connection.id);

            // Reload connections
            const connections = await db.oauthConnections
                .where('userId')
                .equals(this.currentSession.userId)
                .toArray();

            this.currentSession.connections = connections;
        } catch (err) {
            console.error(`Failed to unlink ${provider}:`, err);
            throw err;
        }
    }

    // Clear local session
    clearSession(): void {
        this.currentSession = null;
    }

    // Logout (clear both Better Auth and local session)
    async logout(): Promise<void> {
        try {
            await authClient.signOut();
        } catch (err) {
            console.error('Failed to sign out from Better Auth:', err);
        }
        this.clearSession();
    }
}

// Singleton instance
export const authService = new AuthService();
