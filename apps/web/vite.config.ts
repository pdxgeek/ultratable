import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const target = env.VITE_API_TARGET || 'http://127.0.0.1:8080';
    // Resolution order (issue #120):
    //   1. WEB_PORT in process env — workspace-wide ad-hoc override
    //   2. PORT in apps/web/.env (via Vite's loadEnv) — what setup.mjs writes
    //   3. 5175 — historical default
    const port = Number(process.env.WEB_PORT) || Number(env.PORT) || 5175;

    return {
        plugins: [react(), tailwindcss()],
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
                '/graphql': {
                    target,
                    changeOrigin: true,
                },
                '/api': {
                    target,
                    changeOrigin: true,
                },
            },
        },
    };
});
