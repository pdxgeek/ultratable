import { cacheExchange, createClient, fetchExchange } from 'urql';

// In production (Vercel), VITE_API_URL points to the service (e.g. https://api.ultratable.io).
// In dev, Vite proxies /graphql to the local service automatically.
const API_URL = import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL}/graphql`
    : '/graphql';

export const client = createClient({
    url: API_URL,
    exchanges: [cacheExchange, fetchExchange],
    fetchOptions: () => {
        return {
            credentials: 'include',
        };
    },
});
