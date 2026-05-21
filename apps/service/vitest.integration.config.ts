import { defineConfig } from 'vitest/config';

/**
 * Integration test runner — hits the local Postgres configured via
 * `DATABASE_URL` (typically the `ultratable-postgres-1` Docker container
 * started by `docker compose up`).
 *
 * Kept separate from `vitest.config.ts` so the unit run stays fast and
 * hermetic.
 */
export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/**/*.integration.test.ts'],
        // Integration tests share a real database; run them sequentially to keep
        // setup/teardown isolated.
        fileParallelism: false,
        sequence: {
            concurrent: false,
        },
        // Each test waits for migrations + cleanup — bumped from the 5s default.
        testTimeout: 30_000,
        hookTimeout: 30_000,
    },
});
