import { GraphQLError } from 'graphql';

import { repository } from '../repositories';
import { builder, requireSelfOrAdmin, requireViewer } from './builder';
import { ViewerRef } from './viewer';

/**
 * Account self-service mutations.
 *
 * Every resolver here gates through `requireViewer` (or `requireSelfOrAdmin`
 * when a target user id is supplied). Clients can never pass a foreign user id
 * to a self-mutation — the viewer's identity is taken from `ctx.user.id`.
 *
 * Deletion side-effects rely on database cascades:
 *   - `auth_user`  cascades → `auth_session`, `auth_account`, `auth_link`
 *   - `user`       cascades → `user_league_follows` (and future user-owned tables)
 * The persistent half of session invalidation happens through those cascades;
 * the cookie on the caller's browser is cleared by the frontend calling
 * `authClient.signOut()` after the mutation resolves.
 */

builder.mutationField('updateMyProfile', (t) =>
    t.field({
        type: ViewerRef,
        description:
            "Update the viewer's own display name and/or avatar URL. Either field may be omitted to leave it unchanged; image=null clears the avatar.",
        args: {
            name: t.arg.string({ required: false }),
            image: t.arg.string({ required: false }),
        },
        resolve: async (_root, { name, image }, ctx) => {
            const viewer = requireViewer(ctx);
            if (name !== null && name !== undefined && name.trim().length === 0) {
                throw new GraphQLError('Display name cannot be blank', {
                    extensions: { http: { status: 400 } },
                });
            }
            const updated = await repository.users.updateDomainUserProfile(viewer.id, {
                name: name ?? undefined,
                image: image === undefined ? undefined : image,
            });
            if (!updated) {
                throw new GraphQLError('Viewer not found', {
                    extensions: { http: { status: 404 } },
                });
            }
            return updated;
        },
    }),
);

builder.mutationField('setMyLeagueFollows', (t) =>
    t.field({
        type: ['ID'],
        description:
            "Replace-set: the viewer's followed-league set becomes exactly the supplied ids (deduped). Idempotent. Returns the resulting set in follow-order.",
        args: {
            leagueIds: t.arg.idList({ required: true }),
        },
        resolve: async (_root, { leagueIds }, ctx) => {
            const viewer = requireViewer(ctx);
            return repository.users.setFollowedLeagueIds(viewer.id, leagueIds as string[]);
        },
    }),
);

builder.mutationField('deleteUserAccount', (t) =>
    t.id({
        description:
            "Permanently delete a domain user and every row tied to them. Callable by the owner (`ctx.user.id === userId`) or any admin. Cascades wipe sessions, OAuth accounts, identity links, and league follows. Returns the deleted user's id.",
        args: {
            userId: t.arg.id({ required: true }),
        },
        resolve: async (_root, { userId }, ctx) => {
            requireSelfOrAdmin(ctx, userId as string);
            const result = await repository.users.deleteDomainUser(userId as string);
            return result.deletedDomainUserId;
        },
    }),
);
