import { eq } from 'drizzle-orm';

import { db } from '../../db';
import * as schema from '../../db/schema';
import { AuthIdentityRow, DomainUserRow, UsersRepository } from '../users';
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
        return row ?? null;
    }
}
