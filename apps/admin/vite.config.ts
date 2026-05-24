import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const target = env.VITE_API_TARGET || 'http://127.0.0.1:8080';
    // Resolution order (issue #120):
    //   1. ADMIN_PORT in process env — workspace-wide ad-hoc override
    //   2. PORT in apps/admin/.env (via Vite's loadEnv) — what setup.mjs writes
    //   3. 5174 — historical default
    const port = Number(process.env.ADMIN_PORT) || Number(env.PORT) || 5174;

    return {
        plugins: [react()],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src'),
            },
        },
        server: {
            host: true,
            port,
            strictPort: true,
            proxy: {
                '/graphql': target,
                '/api': target,
            },
        },
    };
});
