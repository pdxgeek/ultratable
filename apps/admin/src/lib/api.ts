// Centralized API base URL for the admin app.
// In production (Vercel), VITE_API_URL points to the service (e.g. https://api.ultratable.io).
// In dev, Vite proxies /graphql and /api to the local service automatically.
export const API_BASE = import.meta.env.VITE_API_URL || '';

export const GRAPHQL_URL = `${API_BASE}/graphql`;

/**
 * Shared GraphQL fetch helper with error handling.
 * Checks both HTTP status and GraphQL-level errors.
 * Returns `data` directly, throws on failure.
 */
export async function gqlFetch<T = Record<string, unknown>>(
    query: string,
    variables?: Record<string, unknown>
): Promise<T> {
    const response = await fetch(GRAPHQL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
        throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();

    if (json.errors?.length) {
        const messages = json.errors.map((e: { message: string }) => e.message).join('; ');
        console.error('[gqlFetch] GraphQL errors:', messages);
        throw new Error(`GraphQL errors: ${messages}`);
    }

    return json.data as T;
}
