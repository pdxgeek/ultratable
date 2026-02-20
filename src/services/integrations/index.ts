import { ApiFootballProvider } from './apiFootball';
import { MockProvider } from './mock';
import type { DataProvider } from './types';
import type { IntegrationName, LeagueConfig } from '../../types';

const apiProvider = new ApiFootballProvider();
const mockProvider = new MockProvider();

export const providerRegistry: Record<IntegrationName, DataProvider> = {
    'api-football': apiProvider,
    'mock-scifi': mockProvider,
    'mock-fantasy': mockProvider,
};

export function getProvider(league: Partial<LeagueConfig>, type: keyof LeagueConfig['integrations']): DataProvider {
    const providerName = league.integrations?.[type];
    return (providerName && providerRegistry[providerName as IntegrationName]) || apiProvider;
}

export { ApiFootballProvider, MockProvider };
