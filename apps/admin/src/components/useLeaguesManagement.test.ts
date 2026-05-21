/**
 * useLeaguesManagement — issue #52.
 *
 * The central hook for the LeaguesManagementView. It orchestrates a sequence
 * of GraphQL calls (countries → catalogLeagues per country → seasons →
 * config save) and tracks UI state for selection, action loading, and the
 * config editor. The tests here pin:
 *
 *   - Initial load fetches both top-level data and ranking formulas.
 *   - Selecting a country triggers a cached-then-network catalog fetch.
 *   - Selecting a config league loads its seasons.
 *   - saveConfig refuses bad JSON for the season tab and refuses non-object
 *     JSON.
 *   - saveConfig in league mode parses comma-separated zone inputs into
 *     number arrays before calling the API.
 *   - removeSeason aborts when the user declines the window.confirm.
 *
 * What we don't test here: the lower-level api module (covered by its own
 * tests) or the formatting helpers (small enough to be visible in the diff).
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as api from './leagues-api';
import { useLeaguesManagement } from './useLeaguesManagement';

vi.mock('./leagues-api');

const mockedApi = vi.mocked(api);

describe('useLeaguesManagement', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Sensible defaults so the hook's initial effects don't blow up.
        mockedApi.fetchCatalogAndManagedLeagues.mockResolvedValue({
            catalogCountries: [
                { id: 'gbr', name: 'England', code: 'GB', flag: '' },
                { id: 'esp', name: 'Spain', code: 'ES', flag: '' },
            ],
            leagues: [
                {
                    id: 'l1',
                    name: 'Premier League',
                    sourceId: 39,
                    country: 'England',
                    configJson: '{"promotion":[1,2]}',
                },
            ],
        } as Awaited<ReturnType<typeof api.fetchCatalogAndManagedLeagues>>);
        mockedApi.fetchRankingFormulas.mockResolvedValue({
            rankingFormulas: [
                { id: 'standard_pts', name: 'Points', description: null, logicType: 'pts' },
            ],
        } as Awaited<ReturnType<typeof api.fetchRankingFormulas>>);
        mockedApi.fetchSeasons.mockResolvedValue({
            seasons: [],
        } as Awaited<ReturnType<typeof api.fetchSeasons>>);
        mockedApi.fetchCachedCatalogLeagues.mockResolvedValue({
            catalogLeagues: [],
        } as Awaited<ReturnType<typeof api.fetchCachedCatalogLeagues>>);
        mockedApi.syncCountryLeagues.mockResolvedValue({
            syncCountryLeagues: [],
        } as Awaited<ReturnType<typeof api.syncCountryLeagues>>);
        mockedApi.fetchCatalogLeagueBySourceId.mockResolvedValue({
            catalogLeagues: [],
        } as Awaited<ReturnType<typeof api.fetchCatalogLeagueBySourceId>>);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('on mount, fetches top-level data + ranking formulas and ends loading', async () => {
        const { result } = renderHook(() => useLeaguesManagement());

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(mockedApi.fetchCatalogAndManagedLeagues).toHaveBeenCalledTimes(1);
        expect(mockedApi.fetchRankingFormulas).toHaveBeenCalledTimes(1);
        expect(result.current.countries).toHaveLength(2);
        expect(result.current.managedLeagues).toHaveLength(1);
        expect(result.current.rankingFormulas[0].id).toBe('standard_pts');
    });

    it('selecting a country uses the cache when populated, skipping the network sync', async () => {
        mockedApi.fetchCachedCatalogLeagues.mockResolvedValueOnce({
            catalogLeagues: [
                {
                    id: 'cat-1',
                    name: 'Championship',
                    type: 'League',
                    logo: '',
                    sourceId: 40,
                    seasons: [],
                },
            ],
        } as Awaited<ReturnType<typeof api.fetchCachedCatalogLeagues>>);

        const { result } = renderHook(() => useLeaguesManagement());
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => {
            result.current.setSelectedCountry('gbr');
        });

        await waitFor(() => expect(result.current.catalogLeagues).toHaveLength(1));
        expect(mockedApi.fetchCachedCatalogLeagues).toHaveBeenCalledWith('gbr');
        expect(mockedApi.syncCountryLeagues).not.toHaveBeenCalled();
    });

    it('selecting a country falls back to syncCountryLeagues when the cache is empty', async () => {
        mockedApi.fetchCachedCatalogLeagues.mockResolvedValueOnce({
            catalogLeagues: [],
        } as Awaited<ReturnType<typeof api.fetchCachedCatalogLeagues>>);
        mockedApi.syncCountryLeagues.mockResolvedValueOnce({
            syncCountryLeagues: [
                {
                    id: 'cat-99',
                    name: 'New',
                    type: 'League',
                    logo: '',
                    sourceId: 99,
                    seasons: [],
                },
            ],
        } as Awaited<ReturnType<typeof api.syncCountryLeagues>>);

        const { result } = renderHook(() => useLeaguesManagement());
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => {
            result.current.setSelectedCountry('gbr');
        });

        await waitFor(() => expect(mockedApi.syncCountryLeagues).toHaveBeenCalledWith('gbr'));
        expect(result.current.catalogLeagues[0].sourceId).toBe(99);
    });

    it('selecting a config league loads its seasons', async () => {
        mockedApi.fetchSeasons.mockResolvedValueOnce({
            seasons: [
                {
                    id: 's1',
                    year: 2024,
                    configJson: '{}',
                    fixtureCount: 380,
                    teamCount: 20,
                    rankingCriteria: [],
                },
            ],
        } as unknown as Awaited<ReturnType<typeof api.fetchSeasons>>);

        const { result } = renderHook(() => useLeaguesManagement());
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => {
            result.current.setSelectedConfigLeagueId('l1');
        });

        await waitFor(() => expect(result.current.configSeasons).toHaveLength(1));
        expect(mockedApi.fetchSeasons).toHaveBeenCalledWith('l1');
    });

    it('filteredManagedLeagues narrows to the selected country', async () => {
        const { result } = renderHook(() => useLeaguesManagement());
        await waitFor(() => expect(result.current.loading).toBe(false));

        // No country selected → empty
        expect(result.current.filteredManagedLeagues).toEqual([]);

        act(() => {
            result.current.setSelectedCountry('gbr');
        });
        await waitFor(() => expect(result.current.filteredManagedLeagues).toHaveLength(1));

        act(() => {
            result.current.setSelectedCountry('esp');
        });
        await waitFor(() => expect(result.current.filteredManagedLeagues).toEqual([]));
    });

    describe('saveConfig — season tab', () => {
        it('rejects malformed JSON without calling the API and shows an alert', async () => {
            mockedApi.fetchSeasons.mockResolvedValueOnce({
                seasons: [
                    {
                        id: 's1',
                        year: 2024,
                        configJson: '{}',
                        fixtureCount: 0,
                        teamCount: 0,
                        rankingCriteria: [],
                    },
                ],
            } as unknown as Awaited<ReturnType<typeof api.fetchSeasons>>);
            mockedApi.fetchTeamsForSeason.mockResolvedValue({
                teams: [],
            } as Awaited<ReturnType<typeof api.fetchTeamsForSeason>>);

            const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

            const { result } = renderHook(() => useLeaguesManagement());
            await waitFor(() => expect(result.current.loading).toBe(false));

            act(() => {
                result.current.setSelectedConfigLeagueId('l1');
            });
            await waitFor(() => expect(result.current.configSeasons).toHaveLength(1));
            act(() => {
                result.current.setSelectedConfigSeasonId('s1');
                result.current.setConfigTab('season');
            });
            await waitFor(() => expect(result.current.seasonConfigJson).toBe('{}'));
            act(() => {
                result.current.setSeasonConfigJson('this is not json');
            });

            await act(async () => {
                await result.current.saveConfig();
            });

            expect(alertSpy).toHaveBeenCalledWith(expect.stringMatching(/Invalid JSON/));
            expect(mockedApi.saveSeasonConfig).not.toHaveBeenCalled();
        });

        it('rejects array / null JSON (must be an object)', async () => {
            // Pre-load a season so the config-derive effect doesn't reset
            // seasonConfigJson before we override it.
            mockedApi.fetchSeasons.mockResolvedValueOnce({
                seasons: [
                    {
                        id: 's1',
                        year: 2024,
                        configJson: '{}',
                        fixtureCount: 0,
                        teamCount: 0,
                        rankingCriteria: [],
                    },
                ],
            } as unknown as Awaited<ReturnType<typeof api.fetchSeasons>>);
            mockedApi.fetchTeamsForSeason.mockResolvedValue({
                teams: [],
            } as Awaited<ReturnType<typeof api.fetchTeamsForSeason>>);

            const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
            const { result } = renderHook(() => useLeaguesManagement());
            await waitFor(() => expect(result.current.loading).toBe(false));

            act(() => {
                result.current.setSelectedConfigLeagueId('l1');
            });
            await waitFor(() => expect(result.current.configSeasons).toHaveLength(1));
            act(() => {
                result.current.setSelectedConfigSeasonId('s1');
                result.current.setConfigTab('season');
            });
            await waitFor(() => expect(result.current.seasonConfigJson).toBe('{}'));
            act(() => {
                result.current.setSeasonConfigJson('[1, 2, 3]');
            });

            await act(async () => {
                await result.current.saveConfig();
            });

            expect(alertSpy).toHaveBeenCalledWith(
                expect.stringMatching(/Season config must be a JSON object/),
            );
            expect(mockedApi.saveSeasonConfig).not.toHaveBeenCalled();
        });

        it('strips a stray rankingCriteria in the JSON to avoid drift from the dual-list', async () => {
            mockedApi.fetchSeasons.mockResolvedValueOnce({
                seasons: [
                    {
                        id: 's1',
                        year: 2024,
                        configJson: '{}',
                        fixtureCount: 0,
                        teamCount: 0,
                        rankingCriteria: [],
                    },
                ],
            } as unknown as Awaited<ReturnType<typeof api.fetchSeasons>>);
            mockedApi.fetchTeamsForSeason.mockResolvedValue({
                teams: [],
            } as Awaited<ReturnType<typeof api.fetchTeamsForSeason>>);
            mockedApi.saveSeasonConfig.mockResolvedValue(
                {} as unknown as Awaited<ReturnType<typeof api.saveSeasonConfig>>,
            );

            const { result } = renderHook(() => useLeaguesManagement());
            await waitFor(() => expect(result.current.loading).toBe(false));

            act(() => {
                result.current.setSelectedConfigLeagueId('l1');
            });
            await waitFor(() => expect(result.current.configSeasons).toHaveLength(1));
            act(() => {
                result.current.setSelectedConfigSeasonId('s1');
                result.current.setConfigTab('season');
            });
            await waitFor(() => expect(result.current.seasonConfigJson).toBe('{}'));
            act(() => {
                result.current.setSeasonConfigJson('{"deductions":[],"rankingCriteria":["ghost"]}');
                result.current.setAppliedCriteria(['standard_pts']);
            });

            await act(async () => {
                await result.current.saveConfig();
            });

            expect(mockedApi.saveSeasonConfig).toHaveBeenCalledTimes(1);
            const [, json, applied] = mockedApi.saveSeasonConfig.mock.calls[0];
            expect(JSON.parse(json)).toEqual({ deductions: [] });
            expect(applied).toEqual(['standard_pts']);
        });

        it('passes undefined rankingCriteria when no criteria were applied', async () => {
            mockedApi.fetchSeasons.mockResolvedValueOnce({
                seasons: [
                    {
                        id: 's1',
                        year: 2024,
                        configJson: '{}',
                        fixtureCount: 0,
                        teamCount: 0,
                        rankingCriteria: [],
                    },
                ],
            } as unknown as Awaited<ReturnType<typeof api.fetchSeasons>>);
            mockedApi.fetchTeamsForSeason.mockResolvedValue({
                teams: [],
            } as Awaited<ReturnType<typeof api.fetchTeamsForSeason>>);
            mockedApi.saveSeasonConfig.mockResolvedValue(
                {} as unknown as Awaited<ReturnType<typeof api.saveSeasonConfig>>,
            );

            const { result } = renderHook(() => useLeaguesManagement());
            await waitFor(() => expect(result.current.loading).toBe(false));

            act(() => {
                result.current.setSelectedConfigLeagueId('l1');
            });
            await waitFor(() => expect(result.current.configSeasons).toHaveLength(1));
            act(() => {
                result.current.setSelectedConfigSeasonId('s1');
                result.current.setConfigTab('season');
            });
            await waitFor(() => expect(result.current.seasonConfigJson).toBe('{}'));

            await act(async () => {
                await result.current.saveConfig();
            });

            const [, , applied] = mockedApi.saveSeasonConfig.mock.calls[0];
            expect(applied).toBeUndefined();
        });
    });

    describe('saveConfig — league tab', () => {
        // Selecting the league + tab triggers a useEffect that re-derives
        // promoInput / playoffInput / relInput from the league's configJson.
        // Tests must select the league FIRST, wait for that effect, and only
        // then set the input strings — otherwise the effect overwrites them.
        it('parses comma-separated zone inputs into number arrays before posting', async () => {
            mockedApi.saveLeagueConfig.mockResolvedValue(
                {} as unknown as Awaited<ReturnType<typeof api.saveLeagueConfig>>,
            );

            const { result } = renderHook(() => useLeaguesManagement());
            await waitFor(() => expect(result.current.loading).toBe(false));

            act(() => {
                result.current.setSelectedConfigLeagueId('l1');
                result.current.setConfigTab('league');
            });
            // Let the effect that primes input strings from league.configJson run.
            await waitFor(() => expect(result.current.promoInput).toBe('1, 2'));

            act(() => {
                result.current.setPromoInput('1, 2');
                result.current.setPlayoffInput('3, 4 ,5');
                result.current.setRelInput('18,19,20');
            });

            await act(async () => {
                await result.current.saveConfig();
            });

            expect(mockedApi.saveLeagueConfig).toHaveBeenCalledTimes(1);
            const [, json] = mockedApi.saveLeagueConfig.mock.calls[0];
            expect(JSON.parse(json)).toEqual({
                promotion: [1, 2],
                playoffs: [3, 4, 5],
                relegation: [18, 19, 20],
            });
        });

        it('omits empty zone keys from the saved config', async () => {
            mockedApi.saveLeagueConfig.mockResolvedValue(
                {} as unknown as Awaited<ReturnType<typeof api.saveLeagueConfig>>,
            );

            const { result } = renderHook(() => useLeaguesManagement());
            await waitFor(() => expect(result.current.loading).toBe(false));

            act(() => {
                result.current.setSelectedConfigLeagueId('l1');
                result.current.setConfigTab('league');
            });
            await waitFor(() => expect(result.current.promoInput).toBe('1, 2'));

            act(() => {
                result.current.setPromoInput('1, 2');
                result.current.setPlayoffInput('');
                result.current.setRelInput('');
            });

            await act(async () => {
                await result.current.saveConfig();
            });

            const [, json] = mockedApi.saveLeagueConfig.mock.calls[0];
            expect(JSON.parse(json)).toEqual({ promotion: [1, 2] });
        });
    });

    describe('removeSeason', () => {
        it('aborts when the user declines the confirm dialog and does not call the API', async () => {
            const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
            const { result } = renderHook(() => useLeaguesManagement());
            await waitFor(() => expect(result.current.loading).toBe(false));

            await act(async () => {
                await result.current.removeSeason('l1', 's1', 2024);
            });

            expect(confirmSpy).toHaveBeenCalled();
            expect(mockedApi.removeSeasonById).not.toHaveBeenCalled();
        });

        it('proceeds when the user confirms and reloads the seasons for the active config league', async () => {
            vi.spyOn(window, 'confirm').mockReturnValue(true);
            mockedApi.removeSeasonById.mockResolvedValue(
                {} as unknown as Awaited<ReturnType<typeof api.removeSeasonById>>,
            );

            const { result } = renderHook(() => useLeaguesManagement());
            await waitFor(() => expect(result.current.loading).toBe(false));

            act(() => {
                result.current.setSelectedConfigLeagueId('l1');
            });

            await act(async () => {
                await result.current.removeSeason('l1', 's1', 2024);
            });

            expect(mockedApi.removeSeasonById).toHaveBeenCalledWith('s1');
            // The hook reloads the season list for the active league.
            expect(mockedApi.fetchSeasons).toHaveBeenCalledWith('l1');
        });
    });
});
