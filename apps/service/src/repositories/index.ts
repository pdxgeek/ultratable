import { IRepository } from './repository';
import { createPostgresRepository } from './postgres';

/**
 * The active repository implementation. Consumers should always import from
 * `'../repositories'` — never from a backend-specific path. Swapping backends
 * (e.g. to DynamoDB) is a one-line change here, not a sweep through callers.
 */
export const repository: IRepository = createPostgresRepository();

export type { IRepository } from './repository';
