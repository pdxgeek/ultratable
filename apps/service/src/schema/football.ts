import { builder } from './builder';
import { repository } from '../repositories/supabase.repository';

// Define object refs first
const LeagueRef = builder.objectRef<any>('League');
const TeamRef = builder.objectRef<any>('Team');

builder.objectType(LeagueRef, {
    fields: (t) => ({
        id: t.exposeString('id'),
        name: t.exposeString('name'),
        slug: t.exposeString('slug'),
        country: t.exposeString('country', { nullable: true }),
        logo: t.exposeString('logo', { nullable: true }),
    }),
});

builder.objectType(TeamRef, {
    fields: (t) => ({
        id: t.exposeString('id'),
        name: t.exposeString('name'),
        shortName: t.exposeString('shortName', { nullable: true }),
        logo: t.exposeString('logo', { nullable: true }),
    }),
});

builder.queryField('leagues', (t) =>
    t.field({
        type: [LeagueRef],
        resolve: async () => {
            return repository.football.getLeagues();
        },
    })
);

builder.mutationField('ingestLeagues', (t) =>
    t.field({
        type: [LeagueRef],
        resolve: async () => {
            return repository.football.getLeagues();
        },
    })
);

builder.mutationField('ingestTeams', (t) =>
    t.field({
        type: [TeamRef],
        args: {
            leagueId: t.arg.int({ required: true }),
            season: t.arg.int({ required: true }),
        },
        resolve: async (_, { leagueId, season }) => {
            return repository.football.getTeams(leagueId, season);
        },
    })
);
