import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    test: {
        environment: 'jsdom',
        globals: true,
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
        setupFiles: ['./vitest.setup.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov', 'json-summary'],
            include: ['src/**/*.ts', 'src/**/*.tsx'],
            exclude: [
                'src/**/*.test.ts',
                'src/**/*.test.tsx',
                'src/main.tsx',
                'src/App.tsx',
                'src/lib/auth-client.ts',
            ],
        },
    },
});
