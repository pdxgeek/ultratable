import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const target = env.VITE_API_TARGET || 'http://127.0.0.1:8080';

    return {
        plugins: [react()],
        server: {
            host: true,
            port: 5175,
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
