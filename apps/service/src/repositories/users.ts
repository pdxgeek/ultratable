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

export interface UsersRepository {
    getDomainUserById(domainUserId: string): Promise<DomainUserRow | null>;
    getIdentitiesForDomainUser(domainUserId: string): Promise<AuthIdentityRow[]>;
    setDomainUserRoles(
        domainUserId: string,
        roles: string[],
    ): Promise<typeof schema.users.$inferSelect | null>;
}
