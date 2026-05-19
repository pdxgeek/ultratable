import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        exclude: ['**/dist/**', '**/node_modules/**'],
        projects: [
            'apps/*'
        ],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov', 'json-summary'],
            exclude: [
                '**/*.test.ts',
                '**/*.test.tsx',
                '**/*.integration.test.ts',
                // Entrypoints & config
                '**/main.tsx',
                '**/index.ts',
                '**/vite-env.d.ts',
                // Service: schema declarations, wiring, infra
                '**/db/schema.ts',
                '**/db/migrate.ts',
                '**/integrations/types.ts',
                '**/api/**',
                '**/providers/storage.provider.ts',
                '**/repositories/interfaces.ts',
                '**/workers/**',
                '**/schema/catalog.ts',
                '**/schema/config.ts',
                '**/schema/graphics.ts',
                '**/schema/workers.ts',
                '**/scripts/**',
                // Admin: auth client (window.location at module level)
                '**/lib/auth-client.ts',
                // Web/Admin: root App components (routing shells)
                '**/App.tsx',
                '**/context/**',
            ],
        },
    },
});
