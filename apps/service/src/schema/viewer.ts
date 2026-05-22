import type { DomainUserRow } from '../repositories/users';

import { repository } from '../repositories';
import { builder } from './builder';

const ViewerRef = builder.objectRef<DomainUserRow>('Viewer');

const AuthIdentity = builder.simpleObject('AuthIdentity', {
    description:
        'One auth_user/provider pair linked to the viewer. A single domain account may have many identities (e.g. credential + Google) once linking is enabled.',
    fields: (t) => ({
        authUserId: t.id({
            description: 'Better Auth user ID for this identity.',
        }),
        provider: t.string({
            description: 'Provider that owns the identity (e.g. "google", "credential").',
        }),
        linkedAt: t.field({
            type: 'DateTime',
            description: 'Timestamp when this identity was linked to the domain account.',
        }),
    }),
});

builder.objectType(ViewerRef, {
    description:
        'The currently signed-in domain user. Identity (Google, credential, …) is separate — see `identities` for the auth_user rows linked to this account.',
    fields: (t) => ({
        id: t.exposeID('id', { description: 'Domain user UUID.' }),
        name: t.exposeString('name', { description: 'Display name on the domain account.' }),
        email: t.exposeString('email', { description: 'Primary email on the domain account.' }),
        image: t.exposeString('image', {
            nullable: true,
            description: 'Avatar URL on the domain account.',
        }),
        emailVerified: t.exposeBoolean('emailVerified', {
            description: 'Whether the primary email has been verified by at least one identity.',
        }),
        roles: t.field({
            type: ['String'],
            description: 'Domain roles assigned to this account (e.g. "admin", "user").',
            resolve: (parent) => parent.roles,
        }),
        createdAt: t.expose('createdAt', {
            type: 'DateTime',
            description: 'Timestamp when the domain account was created.',
        }),
        identities: t.field({
            type: [AuthIdentity],
            description:
                'Every auth_user linked to this account, with the provider that owns each.',
            resolve: (parent) => repository.users.getIdentitiesForDomainUser(parent.id),
        }),
    }),
});

builder.queryField('viewer', (t) =>
    t.field({
        type: ViewerRef,
        nullable: true,
        description:
            'The currently signed-in domain user, or null when unauthenticated. Returning null (rather than throwing) lets callers render a signed-out state without error handling.',
        resolve: async (_root, _args, ctx) => {
            if (!ctx.user) return null;
            return repository.users.getDomainUserById(ctx.user.id);
        },
    }),
);
