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
                'src/repositories/interfaces.ts',    // Interface-only file
                'src/workers/**',           // Job runner infrastructure
                'src/schema/catalog.ts',    // GraphQL wiring (schema registration)
                'src/schema/config.ts',     // GraphQL wiring (schema registration)
                'src/schema/graphics.ts',   // GraphQL wiring (schema registration)
                'src/schema/workers.ts',    // GraphQL wiring (schema registration)
            ],
        },
    },
});
