import { builder } from './builder';
import { repository } from '../repositories/supabase.repository';

const ConfigStatusRef = builder.objectRef<{
    isDatabaseConnected: boolean;
    apiFootballKeyMasked: string | null;
    databaseUrlMasked: string | null;
    supabaseUrlMasked: string | null;
    supabaseAnonKeyMasked: string | null;
}>('ConfigStatus');

builder.objectType(ConfigStatusRef, {
    fields: (t) => ({
        isDatabaseConnected: t.exposeBoolean('isDatabaseConnected'),
        apiFootballKeyMasked: t.exposeString('apiFootballKeyMasked', { nullable: true }),
        databaseUrlMasked: t.exposeString('databaseUrlMasked', { nullable: true }),
        supabaseUrlMasked: t.exposeString('supabaseUrlMasked', { nullable: true }),
        supabaseAnonKeyMasked: t.exposeString('supabaseAnonKeyMasked', { nullable: true }),
    }),
});

builder.queryField('configStatus', (t) =>
    t.field({
        type: ConfigStatusRef,
        resolve: async () => {
            return {
                isDatabaseConnected: await repository.config.getDatabaseUrlMasked() !== null,
                apiFootballKeyMasked: await repository.config.getApiFootballKeyMasked(),
                databaseUrlMasked: await repository.config.getDatabaseUrlMasked(),
                supabaseUrlMasked: await repository.config.getSupabaseUrl(),
                supabaseAnonKeyMasked: await repository.config.getSupabaseAnonKeyMasked(),
            };
        },
    })
);

builder.mutationField('configureDatabase', (t) =>
    t.boolean({
        args: {
            url: t.arg.string({ required: true }),
        },
        resolve: async (_, { url }) => {
            return repository.config.updateDatabaseUrl(url);
        },
    })
);

builder.mutationField('configureApiKey', (t) =>
    t.boolean({
        args: {
            key: t.arg.string({ required: true }),
        },
        resolve: async (_, { key }) => {
            return repository.config.updateApiFootballKey(key);
        },
    })
);

builder.mutationField('configureSupabase', (t) =>
    t.boolean({
        args: {
            url: t.arg.string({ required: true }),
            anonKey: t.arg.string({ required: true }),
        },
        resolve: async (_, { url, anonKey }) => {
            return repository.config.updateSupabaseConfig(url, anonKey);
        },
    })
);
