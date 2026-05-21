import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/**/*.test.ts'],
        exclude: ['src/**/*.integration.test.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov', 'json-summary'],
            include: ['src/**/*.ts'],
            exclude: [
                'src/**/*.test.ts',
                'src/**/*.integration.test.ts',
                'src/scripts/**',
                'src/index.ts',
                'src/db/schema.ts',        // Drizzle table declarations — no logic
                'src/db/migrate.ts',        // Migration runner entrypoint
                'src/integrations/types.ts', // Pure type definitions
                'src/api/**',               // Fastify route wiring
                'src/providers/storage.provider.ts', // Interface-only file
                // Per-domain repository contracts — interface-only, no runtime code.
                // The implementations live in src/repositories/postgres/* and are measured.
                'src/repositories/catalog.ts',
                'src/repositories/config.ts',
                'src/repositories/fixtures.ts',
                'src/repositories/graphics.ts',
                'src/repositories/leagues.ts',
                'src/repositories/players.ts',
                'src/repositories/repository.ts',
                'src/repositories/shared.ts',
                'src/repositories/teams.ts',
                'src/repositories/workers.ts',
                'src/workers/**',           // Job runner infrastructure
                'src/schema/catalog.ts',    // GraphQL wiring (schema registration)
                'src/schema/config.ts',     // GraphQL wiring (schema registration)
                'src/schema/graphics.ts',   // GraphQL wiring (schema registration)
                'src/schema/workers.ts',    // GraphQL wiring (schema registration)
            ],
        },
    },
});
