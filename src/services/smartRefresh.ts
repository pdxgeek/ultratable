import { db } from './dao/schema';
import type { League, Fixture } from '../types';

/**
 * SmartRefreshService handles automated background refreshes for entities 
 * based on their dataExpiration field and status.
 */
export class SmartRefreshService {
    private isRefreshing = false;

    /**
     * Calculate exponential backoff time in milliseconds.
     * Default: 30m, 60m, 120m, 240m...
     */
    calculateBackoff(attempts: number): number {
        const minutes = 30 * Math.pow(2, Math.max(0, attempts - 1));
        return minutes * 60 * 1000;
    }

    /**
     * Apply exponential backoff to an entity that failed to refresh or is still pending.
     */
    async applyBackoff(table: 'fixtures' | 'teams' | 'players' | 'coaches', id: string): Promise<void> {
        const record = await (db as any)[table].get(id);
        if (!record) return;

        const attempts = (record.refreshAttempts || 0) + 1;
        const delay = this.calculateBackoff(attempts);
        const nextAttemptAt = Date.now() + delay;

        await (db as any)[table].update(id, {
            refreshAttempts: attempts,
            dataExpiration: nextAttemptAt
        });

        console.log(`[SmartRefresh] ${table}:${id} refresh failed/pending. Backing off for ${Math.round(delay / 60000)}m (Attempt ${attempts})`);
    }

    /**
     * Clear refresh metadata after a successful update.
     */
    async clearRefreshMetadata(table: 'fixtures' | 'teams' | 'players' | 'coaches', id: string): Promise<void> {
        await (db as any)[table].update(id, {
            refreshAttempts: null,
            dataExpiration: null
        });
    }

    /**
     * Check if a fixture is overdue for a result update.
     * Overdue = (scheduled or live) AND (now > kickoff + buffer)
     */
    isFixtureOverdue(fixture: Fixture, bufferMinutes: number = 120): boolean {
        // We check scheduled AND live matches. 
        // Live matches are checked because they might have ended according to time but still mark as live in data.
        if (fixture.status !== 'scheduled' && fixture.status !== 'live') return false;

        const kickoffTime = fixture.timestamp * 1000;
        const now = Date.now();
        const becomesOverdueAt = kickoffTime + (bufferMinutes * 60 * 1000);

        return now > becomesOverdueAt;
    }

    /**
     * Scans for and handles expired entities in a league.
     * This can be expanded to various entity types.
     */
    async checkLeague(league: League, seasonYear: number): Promise<void> {
        if (this.isRefreshing) return;

        try {
            this.isRefreshing = true;
            const { database } = await import('./db');
            const { fetchFixtures } = await import('./apiFootball');

            const internalSeasonId = await database.getInternalSeasonId(String(league.id), seasonYear);
            if (!internalSeasonId) return;

            const fixtures = await database.getFixtures(internalSeasonId);
            if (!fixtures) return;

            const now = Date.now();
            const overdueFixtures = fixtures.filter((f: Fixture) => this.isFixtureOverdue(f));

            if (overdueFixtures.length > 0) {
                // We need the raw records to check dataExpiration
                const ids = overdueFixtures.map((f: Fixture) => f.id);
                const records = await db.fixtures.bulkGet(ids);

                const readyForRetry = records.filter(r => {
                    if (!r) return false;
                    const expiration = r.dataExpiration || 0;
                    return now >= expiration;
                });

                if (readyForRetry.length > 0) {
                    console.log(`[SmartRefresh] Triggering FORCE refresh for ${readyForRetry.length} ready overdue entities in ${league.commonName || league.id}`);
                    // BYPASS CACHE when we know something is overdue
                    await fetchFixtures(league as any, { forceRefresh: true });

                    // After fetch, check if they are still scheduled/live. If so, apply backoff.
                    const stillPending = await db.fixtures.bulkGet(readyForRetry.map(r => r!.id));
                    for (const r of stillPending) {
                        if (r && (r.data.status === 'scheduled' || r.data.status === 'live')) {
                            await this.applyBackoff('fixtures', r.id);
                        } else if (r) {
                            await this.clearRefreshMetadata('fixtures', r.id);
                        }
                    }
                }
            }
        } catch (err) {
            console.error('SmartRefresh check failed:', err);
        } finally {
            this.isRefreshing = false;
        }
    }
}

export const smartRefresh = new SmartRefreshService();
