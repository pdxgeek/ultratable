import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/football': {
        target: 'https://v3.football.api-sports.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/football/, ''),
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            // Forward the API key from your request headers
            const apiKey = (req.headers['x-rapidapi-key'] || req.headers['x-apisports-key']) as string;
            if (apiKey) {
              proxyReq.setHeader('x-apisports-key', apiKey);
            }
          });
        },
      },
    },
  },
})
