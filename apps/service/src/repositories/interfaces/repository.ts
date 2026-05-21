import { ConfigRepository } from './config';
import { WorkersRepository } from './workers';
import { LeaguesRepository } from './leagues';
import { TeamsRepository } from './teams';
import { FixturesRepository } from './fixtures';
import { CatalogRepository } from './catalog';
import { PlayersRepository } from './players';
import { GraphicsRepository } from './graphics';

/**
 * Storage-agnostic repository contract. The Postgres implementation lives in
 * `../postgres/`, but consumers should never name a backend in their imports —
 * import the active `repository` from the package index instead.
 */
export interface IRepository {
    config: ConfigRepository;
    workers: WorkersRepository;
    leagues: LeaguesRepository;
    teams: TeamsRepository;
    fixtures: FixturesRepository;
    catalog: CatalogRepository;
    players: PlayersRepository;
    graphics: GraphicsRepository;
}
