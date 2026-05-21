import { ApiFootballProvider } from '../../integrations/api-football';
import { IFootballProvider } from '../../integrations/types';
import { IRepository } from '../repository';
import { PostgresCatalogRepository } from './catalog.repository';
import { PostgresConfigRepository } from './config.repository';
import { PostgresFixturesRepository } from './fixtures.repository';
import { PostgresGraphicsRepository } from './graphics.repository';
import { PostgresLeaguesRepository } from './leagues.repository';
import { PostgresPlayersRepository } from './players.repository';
import { PostgresTeamsRepository } from './teams.repository';
import { PostgresUsersRepository } from './users.repository';
import { PostgresWorkersRepository } from './workers.repository';

export {
    PostgresConfigRepository,
    PostgresWorkersRepository,
    PostgresLeaguesRepository,
    PostgresTeamsRepository,
    PostgresFixturesRepository,
    PostgresCatalogRepository,
    PostgresPlayersRepository,
    PostgresGraphicsRepository,
    PostgresUsersRepository,
};

/**
 * Constructs an IRepository backed by Postgres. The provider is shared across
 * every sub-repo that calls upstream APIs, mirroring the pre-split god class.
 * Pass `providerOverride` in tests to substitute the provider; production code
 * imports the default `repository` singleton from `../index.ts`.
 */
export function createPostgresRepository(providerOverride?: IFootballProvider): IRepository {
    const provider: IFootballProvider = providerOverride ?? new ApiFootballProvider();
    const teams = new PostgresTeamsRepository(provider);
    return {
        config: new PostgresConfigRepository(),
        workers: new PostgresWorkersRepository(),
        leagues: new PostgresLeaguesRepository(provider),
        teams,
        fixtures: new PostgresFixturesRepository(provider, teams),
        catalog: new PostgresCatalogRepository(provider),
        players: new PostgresPlayersRepository(provider),
        graphics: new PostgresGraphicsRepository(),
        users: new PostgresUsersRepository(),
    };
}
