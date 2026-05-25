/**
 * ApiFootballProvider error-path tests.
 *
 * The provider is the boundary between our service and a flaky third-party HTTP
 * API. The happy path is covered by normalizer.test.ts; this file pins the
 * behaviour for failure modes that *will* happen in production:
 *
 *   - 4xx / 5xx HTTP responses
 *   - request timeouts
 *   - malformed JSON / missing fields
 *   - partial batch failures in getFixturesByIds (one chunk of 20 fails)
 *
 * We mock axios.create so we never make real network calls.
 */
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios');

// The provider wraps every request in a Bottleneck limiter. Tests assert
// pre-retry behaviour (a 429 propagates as-is), so we stub the limiter to
// execute scheduled work inline with no throttling or retry hooks. The
// real limiter is exercised in integration tests.
vi.mock('bottleneck', () => {
    class MockBottleneck {
        schedule<T>(fn: () => Promise<T>): Promise<T> {
            return fn();
        }
        on(): void {}
        updateSettings(): void {}
    }
    return { default: MockBottleneck };
});

interface MockAxiosInstance {
    get: ReturnType<typeof vi.fn>;
    interceptors: { response: { use: ReturnType<typeof vi.fn> } };
}

// Build a fresh mock axios instance and have axios.create return it.
function installMockAxios(): MockAxiosInstance {
    const instance: MockAxiosInstance = {
        get: vi.fn(),
        interceptors: { response: { use: vi.fn() } },
    };
    vi.mocked(axios.create).mockReturnValue(instance as unknown as ReturnType<typeof axios.create>);
    return instance;
}

// Build a fake axios error with an HTTP status code.
function httpError(
    status: number,
    statusText = 'Error',
): Error & { response: { status: number; statusText: string } } {
    const err = new Error(`Request failed with status ${status}`) as Error & {
        response: { status: number; statusText: string };
    };
    err.response = { status, statusText };
    return err;
}

describe('ApiFootballProvider — error paths', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

    describe('4xx responses', () => {
        it('propagates 401 Unauthorized from getLeagues', async () => {
            const instance = installMockAxios();
            instance.get.mockRejectedValueOnce(httpError(401, 'Unauthorized'));

            const { ApiFootballProvider } = await import('./index');
            const provider = new ApiFootballProvider();
            await expect(provider.getLeagues()).rejects.toMatchObject({
                response: { status: 401 },
            });
        });

        it('propagates 404 Not Found from getSeasons', async () => {
            const instance = installMockAxios();
            instance.get.mockRejectedValueOnce(httpError(404, 'Not Found'));

            const { ApiFootballProvider } = await import('./index');
            const provider = new ApiFootballProvider();
            await expect(provider.getSeasons(999)).rejects.toMatchObject({
                response: { status: 404 },
            });
        });

        it('propagates 429 Rate Limited from getFixtures', async () => {
            const instance = installMockAxios();
            instance.get.mockRejectedValueOnce(httpError(429, 'Too Many Requests'));

            const { ApiFootballProvider } = await import('./index');
            const provider = new ApiFootballProvider();
            await expect(provider.getFixtures(39, 2024)).rejects.toMatchObject({
                response: { status: 429 },
            });
        });
    });

    describe('5xx responses', () => {
        it('propagates 500 from getTeams so the caller can degrade gracefully', async () => {
            const instance = installMockAxios();
            instance.get.mockRejectedValueOnce(httpError(500, 'Server Error'));

            const { ApiFootballProvider } = await import('./index');
            const provider = new ApiFootballProvider();
            await expect(provider.getTeams(39, 2024)).rejects.toMatchObject({
                response: { status: 500 },
            });
        });

        it('propagates 503 from getMatchEvents', async () => {
            const instance = installMockAxios();
            instance.get.mockRejectedValueOnce(httpError(503, 'Service Unavailable'));

            const { ApiFootballProvider } = await import('./index');
            const provider = new ApiFootballProvider();
            await expect(provider.getMatchEvents(100)).rejects.toMatchObject({
                response: { status: 503 },
            });
        });
    });

    describe('timeouts', () => {
        it('propagates ECONNABORTED (axios timeout) from getCountries', async () => {
            const instance = installMockAxios();
            const timeoutErr = new Error('timeout of 15000ms exceeded') as Error & { code: string };
            timeoutErr.code = 'ECONNABORTED';
            instance.get.mockRejectedValueOnce(timeoutErr);

            const { ApiFootballProvider } = await import('./index');
            const provider = new ApiFootballProvider();
            await expect(provider.getCountries()).rejects.toMatchObject({ code: 'ECONNABORTED' });
        });
    });

    describe('malformed responses', () => {
        it('getSeasons returns [] when /leagues responds with no items', async () => {
            const instance = installMockAxios();
            instance.get.mockResolvedValueOnce({ data: { response: [] } });

            const { ApiFootballProvider } = await import('./index');
            const provider = new ApiFootballProvider();
            await expect(provider.getSeasons(39)).resolves.toEqual([]);
        });

        it('getPlayerData returns null when player is missing', async () => {
            const instance = installMockAxios();
            instance.get.mockResolvedValueOnce({ data: { response: [] } });

            const { ApiFootballProvider } = await import('./index');
            const provider = new ApiFootballProvider();
            await expect(provider.getPlayerData(42, 2024)).resolves.toBeNull();
        });

        it('getSquad returns [] when the squad payload omits the players array', async () => {
            const instance = installMockAxios();
            instance.get.mockResolvedValueOnce({ data: { response: [{ team: { id: 1 } }] } });

            const { ApiFootballProvider } = await import('./index');
            const provider = new ApiFootballProvider();
            await expect(provider.getSquad(1)).resolves.toEqual([]);
        });

        it('throws on completely malformed response shape (no .data.response)', async () => {
            const instance = installMockAxios();
            instance.get.mockResolvedValueOnce({ data: {} });

            const { ApiFootballProvider } = await import('./index');
            const provider = new ApiFootballProvider();
            // .map on undefined → TypeError. Better that it surfaces than silently returns [].
            await expect(provider.getCountries()).rejects.toThrow();
        });
    });

    describe('getFixturesByIds partial batch failure', () => {
        // The provider splits ids into chunks of 20. One chunk failing must NOT
        // take down the whole call — successful chunks should still return.
        it('returns fixtures from the chunks that succeed, swallowing the failed chunk', async () => {
            const instance = installMockAxios();

            // 25 ids → two chunks (20 + 5). First chunk fails, second succeeds.
            const baseFixture = {
                fixture: {
                    id: 100,
                    date: '2024-08-10T15:00:00+00:00',
                    status: { short: 'FT' },
                    venue: { id: 505 },
                },
                goals: { home: 1, away: 0 },
                teams: { home: { id: 42 }, away: { id: 33 } },
                league: { round: 'Regular Season - 1' },
            };
            instance.get.mockRejectedValueOnce(httpError(500)).mockResolvedValueOnce({
                data: {
                    response: [
                        baseFixture,
                        { ...baseFixture, fixture: { ...baseFixture.fixture, id: 101 } },
                    ],
                },
            });

            const { ApiFootballProvider } = await import('./index');
            const provider = new ApiFootballProvider();

            const ids = Array.from({ length: 25 }, (_, i) => i + 1);
            const result = await provider.getFixturesByIds(ids);

            expect(result.fixtures).toHaveLength(2);
            expect(result.fixtures.map((f) => f.sourceId)).toEqual([100, 101]);
            expect(instance.get).toHaveBeenCalledTimes(2);
        });

        it('returns empty when every chunk fails', async () => {
            const instance = installMockAxios();
            instance.get.mockRejectedValue(httpError(500));

            const { ApiFootballProvider } = await import('./index');
            const provider = new ApiFootballProvider();
            const result = await provider.getFixturesByIds([1, 2, 3]);
            expect(result.fixtures).toEqual([]);
            expect(result.venues).toEqual([]);
        });

        it('handles chunks where /fixtures returns no response array (treated as empty)', async () => {
            const instance = installMockAxios();
            instance.get.mockResolvedValueOnce({ data: {} }); // response missing

            const { ApiFootballProvider } = await import('./index');
            const provider = new ApiFootballProvider();
            const result = await provider.getFixturesByIds([1]);
            expect(result.fixtures).toEqual([]);
        });
    });

    describe('constructor', () => {
        it('warns when API_FOOTBALL_KEY is not set but does not throw', async () => {
            installMockAxios();
            const prev = process.env.API_FOOTBALL_KEY;
            delete process.env.API_FOOTBALL_KEY;

            const { ApiFootballProvider } = await import('./index');
            expect(() => new ApiFootballProvider()).not.toThrow();

            if (prev !== undefined) process.env.API_FOOTBALL_KEY = prev;
        });
    });
});
