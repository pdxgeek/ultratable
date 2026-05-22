import { asc, eq, inArray } from 'drizzle-orm';

import { db } from '../../db';
import * as schema from '../../db/schema';
import {
    AuthIdentityRow,
    DeleteDomainUserResult,
    DomainUserRow,
    UpdateDomainUserProfileInput,
    UsersRepository,
} from '../users';
import { NOW_MS } from './shared';

export class PostgresUsersRepository implements UsersRepository {
    async getDomainUserById(domainUserId: string): Promise<DomainUserRow | null> {
        if (!db) return null;
        const [row] = await db
            .select()
            .from(schema.users)
            .where(eq(schema.users.id, domainUserId))
            .limit(1);
        if (!row) return null;
        return {
            id: row.id,
            name: row.name,
            email: row.email,
            image: row.image,
            emailVerified: row.emailVerified,
            roles: Array.isArray(row.roles) ? (row.roles as string[]) : ['user'],
            createdAt: row.createdAt,
        };
    }

    async getIdentitiesForDomainUser(domainUserId: string): Promise<AuthIdentityRow[]> {
        if (!db) return [];
        const rows = await db
            .select({
                authUserId: schema.authLinks.authUserId,
                linkedAt: schema.authLinks.linkedAt,
                providerId: schema.authAccounts.providerId,
            })
            .from(schema.authLinks)
            .innerJoin(
                schema.authAccounts,
                eq(schema.authAccounts.userId, schema.authLinks.authUserId),
            )
            .where(eq(schema.authLinks.domainUserId, domainUserId));
        return rows.map((r) => ({
            authUserId: r.authUserId,
            provider: r.providerId,
            linkedAt: r.linkedAt,
        }));
    }

    async setDomainUserRoles(
        domainUserId: string,
        roles: string[],
    ): Promise<typeof schema.users.$inferSelect | null> {
        if (!db) return null;
        // NOW_MS (date_trunc to ms) matches the column precision and the
        // GraphQL DateTime scalar — see AI_README_FIRST.MD §1.
        const [row] = await db
            .update(schema.users)
            .set({ roles, updatedAt: NOW_MS as unknown as Date })
            .where(eq(schema.users.id, domainUserId))
            .returning();

        // Mirror domain admin status to every linked auth_user.role so Better
        // Auth's admin plugin recognises our admins. user.roles stays the
        // source of truth; this column is a write-only-from-here projection.
        // See docs/auth-architecture.md "Role storage".
        if (row) {
            const adminRole = roles.includes('admin') ? 'admin' : null;
            const links = await db
                .select({ authUserId: schema.authLinks.authUserId })
                .from(schema.authLinks)
                .where(eq(schema.authLinks.domainUserId, domainUserId));
            if (links.length > 0) {
                await db
                    .update(schema.authUsers)
                    .set({ role: adminRole, updatedAt: NOW_MS as unknown as Date })
                    .where(
                        inArray(
                            schema.authUsers.id,
                            links.map((l) => l.authUserId),
                        ),
                    );
            }
        }

        return row ?? null;
    }

    async updateDomainUserProfile(
        domainUserId: string,
        input: UpdateDomainUserProfileInput,
    ): Promise<DomainUserRow | null> {
        if (!db) return null;
        const patch: Partial<typeof schema.users.$inferInsert> = {
            updatedAt: NOW_MS as unknown as Date,
        };
        if (input.name !== undefined) patch.name = input.name;
        if (input.image !== undefined) patch.image = input.image;
        const [row] = await db
            .update(schema.users)
            .set(patch)
            .where(eq(schema.users.id, domainUserId))
            .returning();
        if (!row) return null;
        return {
            id: row.id,
            name: row.name,
            email: row.email,
            image: row.image,
            emailVerified: row.emailVerified,
            roles: Array.isArray(row.roles) ? (row.roles as string[]) : ['user'],
            createdAt: row.createdAt,
        };
    }

    async getFollowedLeagueIds(domainUserId: string): Promise<string[]> {
        if (!db) return [];
        const rows = await db
            .select({ leagueId: schema.userLeagueFollows.leagueId })
            .from(schema.userLeagueFollows)
            .where(eq(schema.userLeagueFollows.userId, domainUserId))
            .orderBy(asc(schema.userLeagueFollows.followedAt));
        return rows.map((r) => r.leagueId);
    }

    async setFollowedLeagueIds(domainUserId: string, leagueIds: string[]): Promise<string[]> {
        if (!db) return [];
        const deduped = Array.from(new Set(leagueIds));
        await db.transaction(async (tx) => {
            await tx
                .delete(schema.userLeagueFollows)
                .where(eq(schema.userLeagueFollows.userId, domainUserId));
            if (deduped.length > 0) {
                await tx
                    .insert(schema.userLeagueFollows)
                    .values(deduped.map((leagueId) => ({ userId: domainUserId, leagueId })));
            }
        });
        return this.getFollowedLeagueIds(domainUserId);
    }

    async deleteDomainUser(domainUserId: string): Promise<DeleteDomainUserResult> {
        if (!db) return { deletedDomainUserId: domainUserId, deletedAuthUserIds: [] };
        return await db.transaction(async (tx) => {
            const links = await tx
                .select({ authUserId: schema.authLinks.authUserId })
                .from(schema.authLinks)
                .where(eq(schema.authLinks.domainUserId, domainUserId));
            const authUserIds = links.map((l) => l.authUserId);
            if (authUserIds.length > 0) {
                // Cascades through auth_session, auth_account, auth_link.
                await tx.delete(schema.authUsers).where(inArray(schema.authUsers.id, authUserIds));
            }
            // Cascades through user_league_follows (and any future user-owned tables
            // we wire with onDelete: 'cascade' on user.id).
            await tx.delete(schema.users).where(eq(schema.users.id, domainUserId));
            return { deletedDomainUserId: domainUserId, deletedAuthUserIds: authUserIds };
        });
    }
}
