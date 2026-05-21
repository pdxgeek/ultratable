export type ConfigTab = 'league' | 'season';

export interface Country {
  id: string;
  name: string;
  code?: string;
  flag?: string;
}

export interface CatalogLeague {
  id: string;
  sourceId: number;
  name: string;
  type: string;
  logo?: string;
  country: string;
  seasons?: Season[];
}

export interface ManagedLeague {
  id: string;
  sourceId: number;
  name: string;
  country?: string | null;
  logo?: string;
  configJson?: string;
  metadata?: Record<string, unknown>;
}

export interface RankingFormula {
  id: string;
  name: string;
  description?: string | null;
  logicType?: string;
}

export interface Season {
  id: string;
  year: number;
  configJson?: string;
  fixtureCount?: number;
  teamCount?: number;
  current?: boolean;
  rankingCriteria?: RankingFormula[];
}
