/**
 * gqlFetch — issue #52.
 *
 * Every admin GraphQL call funnels through this helper. Its job is to:
 *
 *   - POST a JSON-encoded { query, variables } payload to GRAPHQL_URL.
 *   - Throw on non-2xx HTTP (so axios-style retries higher up can decide).
 *   - Throw a single combined error when the GraphQL response includes an
 *     `errors[]` array (so callers don't have to remember to look at it).
 *   - Return `data` directly on success.
 *
 * Without these tests, a refactor that drops the errors[] check would result
 * in callers silently treating a half-broken response as a success.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { gqlFetch } from './api';

describe('gqlFetch', () => {
    const originalFetch = global.fetch;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        global.fetch = fetchMock as unknown as typeof global.fetch;
    });

    afterEach(() => {
        global.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    function jsonResponse(
        body: unknown,
        opts: { status?: number; statusText?: string } = {},
    ): Response {
        return new Response(JSON.stringify(body), {
            status: opts.status ?? 200,
            statusText: opts.statusText ?? 'OK',
            headers: { 'Content-Type': 'application/json' },
        });
    }

    it('POSTs a JSON-encoded query and returns data on success', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ data: { leagues: [{ id: '1' }] } }));

        const out = await gqlFetch<{ leagues: Array<{ id: string }> }>(`query { leagues { id } }`);

        expect(out).toEqual({ leagues: [{ id: '1' }] });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [, init] = fetchMock.mock.calls[0];
        expect(init.method).toBe('POST');
        expect(init.headers['Content-Type']).toBe('application/json');
        const body = JSON.parse(init.body as string);
        expect(body.query).toContain('leagues');
    });

    it('passes variables through on the request body', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ data: { ok: true } }));
        await gqlFetch(`query($id: String!) { thing(id: $id) { id } }`, { id: 'abc' });
        const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
        expect(body.variables).toEqual({ id: 'abc' });
    });

    it('throws on non-2xx HTTP responses without trying to read the body', async () => {
        fetchMock.mockResolvedValue(
            new Response(null, { status: 500, statusText: 'Internal Server Error' }),
        );

        await expect(gqlFetch(`query { x }`)).rejects.toThrow(/500.*Internal Server Error/);
    });

    it('throws on 401 / 403 (admin endpoint not authenticated)', async () => {
        fetchMock.mockResolvedValue(
            new Response(null, { status: 401, statusText: 'Unauthorized' }),
        );
        await expect(gqlFetch(`query { x }`)).rejects.toThrow(/401/);
    });

    it('throws a combined error when the GraphQL response includes errors[]', async () => {
        fetchMock.mockResolvedValue(
            jsonResponse({
                data: null,
                errors: [{ message: 'Forbidden: Requires Admin Role' }, { message: 'Some other' }],
            }),
        );

        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        await expect(gqlFetch(`mutation { protected }`)).rejects.toThrow(/Forbidden.*; Some other/);
        expect(consoleSpy).toHaveBeenCalledWith(
            '[gqlFetch] GraphQL errors:',
            expect.stringContaining('Forbidden'),
        );
    });

    it('does NOT throw when errors is present but empty (treated as no errors)', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ data: { something: 1 }, errors: [] }));
        const out = await gqlFetch<{ something: number }>(`query { something }`);
        expect(out).toEqual({ something: 1 });
    });

    it('propagates underlying fetch network errors', async () => {
        fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
        await expect(gqlFetch(`query { x }`)).rejects.toThrow(/ECONNREFUSED/);
    });
});
