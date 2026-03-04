import { builder, requireAdmin } from './builder';
import { repository } from '../repositories/supabase.repository';
import { cacheService } from '../services/cache.service';

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

const CacheStatsRef = builder.objectRef<{
    size: number;
    maxSize: number;
    hitRate: string;
    hits: number;
    misses: number;
}>('CacheStats');

builder.objectType(CacheStatsRef, {
    fields: (t) => ({
        size: t.exposeInt('size'),
        maxSize: t.exposeInt('maxSize'),
        hitRate: t.exposeString('hitRate'),
        hits: t.exposeInt('hits'),
        misses: t.exposeInt('misses'),
    }),
});

builder.queryField('configStatus', (t) =>
    t.field({
        type: ConfigStatusRef,
        resolve: async (_root, _args, ctx) => {
            requireAdmin(ctx);
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

builder.queryField('cacheStats', (t) =>
    t.field({
        type: CacheStatsRef,
        resolve: async (_root, _args, ctx) => {
            requireAdmin(ctx);
            return cacheService.stats();
        },
    })
);

builder.mutationField('clearCache', (t) =>
    t.boolean({
        resolve: async (_root, _args, ctx) => {
            requireAdmin(ctx);
            cacheService.clear();
            return true;
        },
    })
);

builder.mutationField('configureDatabase', (t) =>
    t.boolean({
        args: {
            url: t.arg.string({ required: true }),
        },
        resolve: async (_, { url }, ctx) => {
            requireAdmin(ctx);
            return repository.config.updateDatabaseUrl(url);
        },
    })
);

builder.mutationField('configureApiKey', (t) =>
    t.boolean({
        args: {
            key: t.arg.string({ required: true }),
        },
        resolve: async (_, { key }, ctx) => {
            requireAdmin(ctx);
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
        resolve: async (_, { url, anonKey }, ctx) => {
            requireAdmin(ctx);
            return repository.config.updateSupabaseConfig(url, anonKey);
        },
    })
);
