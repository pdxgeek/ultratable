import { BASE_URL } from '../../config';
import { getCache, setCache } from '../cache';

export function getApiKey(): string | null {
    return localStorage.getItem('ut_api_key');
}

export function setApiKey(key: string): void {
    localStorage.setItem('ut_api_key', key);
    // Optional: emit event or reload
}

export function hasApiKey(): boolean {
    return !!getApiKey();
}

export async function checkQuota(): Promise<{
    current: number;
    limit: number;
    remaining: number;
}> {
    const apiKey = getApiKey();
    if (!apiKey) return { current: 0, limit: 0, remaining: 0 };

    const response = await fetch(`${BASE_URL}/status`, {
        method: 'GET',
        headers: {
            'x-rapidapi-host': 'v3.football.api-sports.io',
            'x-rapidapi-key': apiKey,
        },
    });
    const json = await response.json();
    const requests = json.response?.requests || {};
    // ... rest of logic
    return {
        current: requests.current || 0,
        limit: requests.limit_day || 100,
        remaining: (requests.limit_day || 100) - (requests.current || 0),
    };
}

export async function apiGet<T>(
    endpoint: string,
    params: Record<string, any> = {},
    cacheKey: string | null = null,
    forceRefresh = false
): Promise<T> {
    // 1. Check Cache
    if (cacheKey && !forceRefresh) {
        const cached = getCache<T>(cacheKey);
        if (cached) {
            console.log('Cache Hit:', cacheKey);
            return cached.data;
        }
    }

    const apiKey = getApiKey();
    if (!apiKey) {
        console.warn('No API Key provided');
        return [] as unknown as T; // Return empty array/object
    }

    // 2. Build URL
    const url = new URL(`${BASE_URL}/${endpoint}`);
    Object.keys(params).forEach((key) =>
        url.searchParams.append(key, params[key].toString())
    );

    // 3. Fetch
    console.log('Fetching:', url.toString());
    const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
            'x-rapidapi-host': 'v3.football.api-sports.io',
            'x-rapidapi-key': apiKey,
        },
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'API Error');
    }

    const json = await response.json();

    if (json.errors && Object.keys(json.errors).length > 0) {
        console.error('API Errors:', json.errors);
        // Rate limit handling
        if (json.errors.rateLimit) {
            throw new Error('API Rate Limit Exceeded');
        }
        throw new Error(Object.values(json.errors).join(', '));
    }

    // 4. Cache Result
    if (cacheKey && json.response) {
        setCache(cacheKey, json.response);
    }

    return json.response;
}
