import { CatalogRepository } from './catalog';
import { CoachesRepository } from './coaches';
import { ConfigRepository } from './config';
import { FixturesRepository } from './fixtures';
import { GameweekPredictionsRepository } from './gameweek-predictions';
import { GraphicsRepository } from './graphics';
import { LeaguesRepository } from './leagues';
import { PlayersRepository } from './players';
import { PredictionsRepository } from './predictions';
import { TeamsRepository } from './teams';
import { TierListsRepository } from './tier-lists';
import { UsersRepository } from './users';
import { WorkersRepository } from './workers';

/**
 * Storage-agnostic repository contract. The Postgres implementation lives in
 * `./postgres/`, but consumers should never name a backend in their imports —
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
    users: UsersRepository;
    predictions: PredictionsRepository;
    gameweekPredictions: GameweekPredictionsRepository;
    tierLists: TierListsRepository;
    coaches: CoachesRepository;
}
