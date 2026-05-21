import type {
    CatalogLeague,
    Country,
    ManagedLeague,
    RankingFormula,
    Season,
} from './leagues.types';

import { gqlFetch } from '../lib/api';

export const fetchCatalogAndManagedLeagues = () =>
    gqlFetch<{
        catalogCountries: Country[];
        leagues: ManagedLeague[];
    }>(
        `query { catalogCountries { id name code flag } leagues { id name sourceId country configJson } }`,
    );

export const fetchRankingFormulas = () =>
    gqlFetch<{ rankingFormulas: RankingFormula[] }>(
        `query { rankingFormulas { id name description logicType } }`,
    );

export const fetchCachedCatalogLeagues = (countryId: string) =>
    gqlFetch<{ catalogLeagues: CatalogLeague[] }>(
        `query($id: String!) { catalogLeagues(countryId: $id) { id name type logo sourceId seasons { year current } } }`,
        { id: countryId },
    );

export const syncCountryLeagues = (countryId: string) =>
    gqlFetch<{ syncCountryLeagues: CatalogLeague[] }>(
        `mutation($id: String!) { syncCountryLeagues(countryId: $id) { id name type logo sourceId seasons { year current } } }`,
        { id: countryId },
    );

export const fetchSeasons = (leagueId: string) =>
    gqlFetch<{ seasons: Season[] }>(
        `query($id: String!) { seasons(leagueId: $id) { id year configJson fixtureCount teamCount rankingCriteria { id name description logicType } } }`,
        { id: leagueId },
    );

export const fetchCatalogLeagueBySourceId = (sourceId: number) =>
    gqlFetch<{ catalogLeagues: CatalogLeague[] }>(
        `query($sourceId: Int!) { catalogLeagues(sourceId: $sourceId) { id seasons { year current } } }`,
        { sourceId },
    );

export const fetchTeamsForSeason = (seasonId: string) =>
    gqlFetch<{ teams: Record<string, unknown>[] }>(
        `query($seasonId: String) { teams(seasonId: $seasonId) { id name } }`,
        { seasonId },
    );

export const initCatalog = () =>
    gqlFetch<{ syncCatalog: { success: boolean; processedCount: number } }>(
        `mutation { syncCatalog { success processedCount } }`,
    );

export const promoteLeague = (catalogId: string) =>
    gqlFetch(`mutation($id: String!) { promoteLeague(catalogId: $id) { id name } }`, {
        id: catalogId,
    });

export const refreshCatalogSeasonsByCatalogId = (catalogId: string) =>
    gqlFetch(
        `mutation($id: String!) { refreshCatalogSeasons(catalogId: $id) { id seasons { year current } } }`,
        { id: catalogId },
    );

export const importSeasonForLeague = (leagueId: string, year: number) =>
    gqlFetch(
        `mutation($id: String!, $year: Int!) { importSeason(leagueId: $id, year: $year) { id year } }`,
        { id: leagueId, year },
    );

export const syncSeasonFixtures = (leagueSourceId: number, year: number) =>
    gqlFetch(
        `mutation($id: Int!, $year: Int!) { syncFixtures(leagueSourceId: $id, seasonYear: $year) { id } }`,
        { id: leagueSourceId, year },
    );

export const removeSeasonById = (seasonId: string) =>
    gqlFetch(`mutation($id: String!) { removeSeason(seasonId: $id) }`, { id: seasonId });

export const saveSeasonConfig = (seasonId: string, json: string, rankingCriteria?: string[]) =>
    gqlFetch(
        `mutation($id: String!, $json: String!, $rankingCriteria: [String!]) { saveSeasonConfig(id: $id, configJson: $json, rankingCriteria: $rankingCriteria) { id } }`,
        { id: seasonId, json, rankingCriteria: rankingCriteria ?? null },
    );

export const saveLeagueConfig = (leagueId: string, json: string) =>
    gqlFetch(
        `mutation($id: String!, $json: String!) { saveLeagueConfig(id: $id, configJson: $json) { id } }`,
        { id: leagueId, json },
    );
