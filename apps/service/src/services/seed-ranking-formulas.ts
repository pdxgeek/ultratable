import { repository } from '../repositories';
import { cacheService } from './cache.service';
import { globalLogger } from './log.service';

/**
 * Default formula rows the standings sorter relies on. IDs must match the
 * fallback in football.ts (FALLBACK_RANKING_CRITERIA) and repositories/postgres/shared.ts
 * (DEFAULT_RANKING_CRITERIA). logicType values must match a key in the web app's
 * FORMULA_REGISTRY (apps/web/src/logic/formulas.ts).
 */
const DEFAULT_FORMULAS = [
    { id: 'standard_pts', name: 'Points', description: 'Total league points (3 for a win, 1 for a draw).', logicType: 'points' },
    { id: 'goal_diff', name: 'Goal Difference', description: 'Goals scored minus goals conceded.', logicType: 'goalDiff' },
    { id: 'goals_for', name: 'Goals For', description: 'Total goals scored across all matches.', logicType: 'goalsFor' },
    { id: 'head_to_head', name: 'Head-to-Head', description: 'EFL head-to-head: points, then goal difference, then goals scored in matches between the tied clubs.', logicType: 'headToHead' },
    { id: 'wins', name: 'Wins', description: 'Total matches won.', logicType: 'wins' },
    { id: 'away_goals', name: 'Away Goals', description: 'Goals scored in away matches.', logicType: 'awayGoalsFor' },
];

export async function seedRankingFormulas(): Promise<void> {
    try {
        for (const formula of DEFAULT_FORMULAS) {
            await repository.leagues.saveRankingFormula(formula);
        }
        cacheService.invalidate('formulas');
        globalLogger.info({ count: DEFAULT_FORMULAS.length }, 'Seeded ranking_formulas defaults');
    } catch (err) {
        globalLogger.warn({ err }, 'Failed to seed ranking_formulas (continuing startup)');
    }
}
