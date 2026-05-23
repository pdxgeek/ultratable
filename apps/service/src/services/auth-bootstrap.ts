import type { Logger } from 'pino';

import { db } from '../db';
import * as schema from '../db/schema';
import { globalLogger } from './log.service';

const logger: Logger = globalLogger.child({ module: 'services/auth-bootstrap' });

export interface NewAuthUser {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image?: string | null;
}

/**
 * Hook target for Better Auth's `databaseHooks.user.create.after`.
 *
 * Every new auth identity (credential, google, …) gets its own fresh domain
 * user + auth_link binding. Auto-linking by email would let anyone who knows
 * your address create a Google account and merge into your domain account —
 * explicit linking is the account-page flow.
 *
 * If the insert fails (e.g. duplicate email collides with an existing domain
 * user), the auth_user stays un-linked. The GraphQL context falls back to a
 * default `user` role for orphan auth_users, and the account-page flow is the
 * path to explicit linking.
 */
export async function bootstrapDomainUserFromAuthUser(authUser: NewAuthUser): Promise<void> {
    try {
        const [domainUser] = await db
            .insert(schema.users)
            .values({
                name: authUser.name,
                email: authUser.email,
                emailVerified: authUser.emailVerified,
                image: authUser.image ?? null,
                roles: ['user', 'predictions'],
            })
            .returning();
        await db.insert(schema.authLinks).values({
            authUserId: authUser.id,
            domainUserId: domainUser.id,
        });
        logger.info(
            { authUserId: authUser.id, domainUserId: domainUser.id },
            'Bootstrapped domain user + auth_link for new identity',
        );
    } catch (err) {
        logger.error(
            { err, authUserId: authUser.id, email: authUser.email },
            'Failed to bootstrap domain user for new identity — auth_user stays unlinked',
        );
    }
}
