import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import Bottleneck from 'bottleneck';

import { globalLogger } from '../../services/log.service';
import {
    IFootballProvider,
    IngestedCountry,
    IngestedEvent,
    IngestedFixture,
    IngestedLeague,
    IngestedPlayer,
    IngestedSeason,
    IngestedTeam,
    IngestedVenue,
} from '../types';
import {
    Normalizer,
    RawEventItem,
    RawFixtureItem,
    RawLeagueItem,
    RawLineupItem,
    RawSeasonItem,
    RawTeamItem,
    RawVenueItem,
} from './normalizer';

// Free tier ships 10 req/min; Pro tiers go up to 300+. Start conservative
// and let the response interceptor widen the reservoir once we observe
// the actual per-minute ceiling from `X-RateLimit-Limit`.
const INITIAL_PER_MINUTE_LIMIT = 10;
const MAX_429_RETRIES = 3;
const DEFAULT_RETRY_AFTER_SECONDS = 60;

export class ApiFootballProvider implements IFootballProvider {
    name = 'api-football';
    private client: AxiosInstance;
    private limiter: Bottleneck;
    private observedLimit: number | null = null;
    private logger = globalLogger.child({ module: 'ApiFootballProvider' });

    constructor() {
        const apiKey = process.env.API_FOOTBALL_KEY;
        if (!apiKey) {
            globalLogger.warn('API_FOOTBALL_KEY not found in environment');
        }

        this.client = axios.create({
            baseURL: 'https://v3.football.api-sports.io',
            timeout: 15_000,
            headers: {
                'x-rapidapi-key': apiKey || '',
                'x-rapidapi-host': 'v3.football.api-sports.io',
            },
        });

        this.limiter = new Bottleneck({
            reservoir: INITIAL_PER_MINUTE_LIMIT,
            reservoirRefreshAmount: INITIAL_PER_MINUTE_LIMIT,
            reservoirRefreshInterval: 60_000,
            maxConcurrent: 5,
        });

        this.client.interceptors.response.use(
            (response) => {
                this.absorbRateLimitHeaders(response.headers as Record<string, string>);
                return response;
            },
            (error) => {
                const headers = (error?.response?.headers ?? {}) as Record<string, string>;
                this.absorbRateLimitHeaders(headers);
                return Promise.reject(error);
            },
        );

        this.limiter.on('failed', async (error: unknown, jobInfo: { retryCount: number }) => {
            const status = (error as { response?: { status?: number } } | undefined)?.response
                ?.status;
            if (status !== 429 || jobInfo.retryCount >= MAX_429_RETRIES) return;
            const retryAfter = parseInt(
                (error as { response?: { headers?: Record<string, string> } } | undefined)?.response
                    ?.headers?.['retry-after'] ?? String(DEFAULT_RETRY_AFTER_SECONDS),
                10,
            );
            const delayMs =
                (isNaN(retryAfter) ? DEFAULT_RETRY_AFTER_SECONDS : retryAfter) * 1000;
            this.logger.warn(
                { retryAfterMs: delayMs, attempt: jobInfo.retryCount + 1 },
                'api-football returned 429; backing off and retrying',
            );
            return delayMs;
        });
    }

    /**
     * Reads `X-RateLimit-Limit` off any provider response and widens the
     * limiter to match the account's actual plan. Avoids the need for a
     * `/status` probe or an env var declaring the tier.
     */
    private absorbRateLimitHeaders(headers: Record<string, string>) {
        const raw = headers?.['x-ratelimit-limit'];
        if (!raw) return;
        const limit = parseInt(raw, 10);
        if (isNaN(limit) || limit === this.observedLimit) return;
        this.observedLimit = limit;
        this.limiter.updateSettings({
            reservoir: limit,
            reservoirRefreshAmount: limit,
        });
        this.logger.info(
            { perMinuteLimit: limit },
            'Adjusted api-football rate limiter from response headers',
        );
    }

    private request<T = unknown>(
        url: string,
        config?: AxiosRequestConfig,
    ): Promise<AxiosResponse<T>> {
        return this.limiter.schedule(() => this.client.get<T>(url, config));
    }

    async getCountries(): Promise<IngestedCountry[]> {
        const resp = await this.request('/countries');
        return (resp.data as { response: { name: string; code: string; flag: string }[] }).response.map(
            (c) => ({
                name: c.name,
                code: c.code,
                flag: c.flag,
            }),
        );
    }

    async getLeagues(country?: string): Promise<IngestedLeague[]> {
        const resp = await this.request(
            '/leagues',
            country ? { params: { country } } : undefined,
        );
        return (resp.data as { response: RawLeagueItem[] }).response.map((item) =>
            Normalizer.normalizeLeague(item, this.name),
        );
    }

    async getSeasons(leagueSourceId: number): Promise<IngestedSeason[]> {
        const resp = await this.request('/leagues', { params: { id: leagueSourceId } });
        const leagueData = (resp.data as { response: { seasons: RawSeasonItem[] }[] }).response[0];
        if (!leagueData) return [];
        return leagueData.seasons.map((s) => Normalizer.normalizeSeason(leagueData, s, this.name));
    }

    async getTeams(
        leagueSourceId: number,
        season: number,
    ): Promise<{ teams: IngestedTeam[]; venues: IngestedVenue[] }> {
        const resp = await this.request('/teams', {
            params: { league: leagueSourceId, season },
        });
        const response = (resp.data as { response: RawTeamItem[] }).response;

        const teams = response.map((item) => Normalizer.normalizeTeam(item, this.name));
        const venues = response.map((item) =>
            Normalizer.normalizeVenue(item as unknown as RawVenueItem, this.name),
        );

        return { teams, venues };
    }

    async getFixtures(
        leagueSourceId: number,
        season: number,
    ): Promise<{ fixtures: IngestedFixture[]; venues: IngestedVenue[] }> {
        this.logger.debug({ leagueSourceId, season }, 'API: fetching fixtures');
        const resp = await this.request('/fixtures', {
            params: { league: leagueSourceId, season },
        });
        const response = (resp.data as { response: RawFixtureItem[] }).response;

        const fixtures = response.map((item) => Normalizer.normalizeFixture(item, this.name));
        const venues = response
            .filter((item) => item.fixture.venue?.id)
            .map((item) =>
                Normalizer.normalizeVenue(item.fixture.venue as RawVenueItem, this.name),
            );

        this.logger.debug(
            { leagueSourceId, season, fixtureCount: fixtures.length, venueCount: venues.length },
            'API: fixtures fetched',
        );
        return { fixtures, venues };
    }

    async getFixturesByIds(
        sourceIds: number[],
    ): Promise<{ fixtures: IngestedFixture[]; venues: IngestedVenue[] }> {
        const fixtures: IngestedFixture[] = [];
        const venues: IngestedVenue[] = [];

        // API-Football allows max 20 ids per request via the `ids` parameter
        const CHUNK_SIZE = 20;
        this.logger.debug(
            { count: sourceIds.length, chunks: Math.ceil(sourceIds.length / CHUNK_SIZE) },
            'API: fetching fixtures by IDs',
        );

        for (let i = 0; i < sourceIds.length; i += CHUNK_SIZE) {
            const chunk = sourceIds.slice(i, i + CHUNK_SIZE);
            const idsList = chunk.join('-');

            try {
                const resp = await this.request('/fixtures', { params: { ids: idsList } });
                const response = (resp.data as { response: RawFixtureItem[] }).response || [];

                const chunkFixtures = response.map((item) =>
                    Normalizer.normalizeFixture(item, this.name),
                );
                const chunkVenues = response
                    .filter((item) => item.fixture.venue?.id)
                    .map((item) =>
                        Normalizer.normalizeVenue(item.fixture.venue as RawVenueItem, this.name),
                    );

                fixtures.push(...chunkFixtures);
                venues.push(...chunkVenues);
            } catch (err) {
                this.logger.error(
                    { ids: idsList, error: (err as Error).message },
                    `Error fetching proxy fixtures for ids ${idsList}`,
                );
            }
        }

        this.logger.debug(
            { fixtureCount: fixtures.length, venueCount: venues.length },
            'API: fixtures by IDs complete',
        );
        return { fixtures, venues };
    }

    async getMatchEvents(fixtureId: number): Promise<IngestedEvent[]> {
        const resp = await this.request('/fixtures/events', { params: { fixture: fixtureId } });
        return (resp.data as { response: RawEventItem[] }).response.map((item) =>
            Normalizer.normalizeEvent(item, fixtureId),
        );
    }

    async getPlayerData(playerId: number, season: number): Promise<IngestedPlayer | null> {
        const resp = await this.request('/players', { params: { id: playerId, season } });
        const player = (
            resp.data as { response: Parameters<typeof Normalizer.normalizePlayer>[0][] }
        ).response[0];
        if (!player) return null;
        return Normalizer.normalizePlayer(player);
    }

    async getLineups(fixtureId: number): Promise<import('../types').IngestedLineup[]> {
        const resp = await this.request('/fixtures/lineups', {
            params: { fixture: fixtureId },
        });
        return (resp.data as { response: RawLineupItem[] }).response.map((item) =>
            Normalizer.normalizeLineup(item),
        );
    }

    async getCoachesByTeam(teamSourceId: number): Promise<import('../types').IngestedCoach[]> {
        this.logger.debug({ teamSourceId }, 'API: fetching coaches');
        const resp = await this.request('/coachs', { params: { team: teamSourceId } });
        const rows = ((resp.data as { response?: unknown[] })?.response ?? []) as Array<{
            id: number;
            name: string;
            firstname?: string | null;
            lastname?: string | null;
            age?: number | null;
            birth?: {
                date?: string | null;
                place?: string | null;
                country?: string | null;
            } | null;
            nationality?: string | null;
            height?: string | null;
            weight?: string | null;
            photo?: string | null;
            team?: { id?: number | null } | null;
            career?: unknown;
        }>;
        return rows.map((r) => ({
            sourceId: r.id,
            name: r.name,
            firstName: r.firstname ?? null,
            lastName: r.lastname ?? null,
            age: r.age ?? null,
            birthDate: r.birth?.date ?? null,
            birthPlace: r.birth?.place ?? null,
            birthCountry: r.birth?.country ?? null,
            nationality: r.nationality ?? null,
            height: r.height ?? null,
            weight: r.weight ?? null,
            photo: r.photo ?? null,
            teamSourceId: r.team?.id ?? null,
            career: r.career ?? null,
        }));
    }

    async getSquad(teamSourceId: number): Promise<import('../types').IngestedSquadPlayer[]> {
        this.logger.debug({ teamSourceId }, 'API: fetching squad');
        const resp = await this.request('/players/squads', { params: { team: teamSourceId } });
        const teamData = (
            resp.data as {
                response: {
                    players?: {
                        id: number;
                        name: string;
                        age: number;
                        number: number;
                        position: string;
                        photo: string;
                    }[];
                }[];
            }
        ).response[0];
        if (!teamData?.players) return [];
        return teamData.players.map((p) => ({
            sourceId: p.id,
            name: p.name,
            age: p.age || null,
            number: p.number || null,
            position: p.position || null,
            photo: p.photo || null,
        }));
    }
}
