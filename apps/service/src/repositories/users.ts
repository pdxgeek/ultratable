import * as schema from '../db/schema';

export interface DomainUserRow {
    id: string;
    name: string;
    email: string;
    image: string | null;
    emailVerified: boolean;
    roles: string[];
    createdAt: Date;
}

export interface AuthIdentityRow {
    authUserId: string;
    provider: string;
    linkedAt: Date;
}

export interface UpdateDomainUserProfileInput {
    name?: string;
    image?: string | null;
}

export interface DeleteDomainUserResult {
    deletedDomainUserId: string;
    deletedAuthUserIds: string[];
}

export interface UsersRepository {
    getDomainUserById(domainUserId: string): Promise<DomainUserRow | null>;
    getIdentitiesForDomainUser(domainUserId: string): Promise<AuthIdentityRow[]>;
    setDomainUserRoles(
        domainUserId: string,
        roles: string[],
    ): Promise<typeof schema.users.$inferSelect | null>;

    updateDomainUserProfile(
        domainUserId: string,
        input: UpdateDomainUserProfileInput,
    ): Promise<DomainUserRow | null>;

    /**
     * Returns the IDs of leagues the viewer has chosen to follow.
     * Result order is by `followed_at` ascending, but callers should treat it
     * as a set.
     */
    getFollowedLeagueIds(domainUserId: string): Promise<string[]>;

    /**
     * Replace-set semantics: the resulting follow set exactly matches the
     * supplied `leagueIds` (deduped). Runs in a transaction so concurrent
     * callers can't observe a partial state.
     */
    setFollowedLeagueIds(domainUserId: string, leagueIds: string[]): Promise<string[]>;

    /**
     * Permanently delete a domain user and every row tied to them. Wraps the
     * work in a transaction:
     *   1. Read every auth_user_id linked via auth_link.
     *   2. DELETE FROM auth_user — cascades to auth_session, auth_account, auth_link.
     *   3. DELETE FROM user — cascades to user_league_follows.
     * Returns the deleted auth_user ids so the caller can log them.
     * Idempotent: returns empty `deletedAuthUserIds` and the input id even if
     * the user is already gone (callers should distinguish via getDomainUserById
     * if they care).
     */
    deleteDomainUser(domainUserId: string): Promise<DeleteDomainUserResult>;
}
