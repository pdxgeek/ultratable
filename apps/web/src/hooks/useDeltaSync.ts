import { useState, useCallback } from 'react';
import { useClient } from 'urql';
import { db, type Team, type Fixture, type Venue } from '../db';
import { SYNC_DATA_QUERY } from '../api/queries';

const TERMINAL_STATUSES = ['played', 'postponed', 'cancelled'];

export function useDeltaSync() {
    const client = useClient();
    const [isSyncing, setIsSyncing] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const sync = useCallback(async (seasonId: string) => {
        setIsSyncing(true);
        setError(null);

        try {
            const syncKey = `sync:season:${seasonId}`;
            const state = await db.syncState.get(syncKey);
            let since = state?.lastUpdatedAt || null;

            const syncLabel = `season#${seasonId.slice(0, 8)}`;

            // Check Dexie for past-due fixtures that aren't resolved.
            // If any exist, clear the watermark to force a full re-pull so
            // the server's live polling can update them.
            let staleRemediation = false;

            if (since) {
                const now = new Date().toISOString();

                const seasonFixtures = await db.fixtures.where('seasonId').equals(seasonId).toArray();
                const staleFixtures = seasonFixtures.filter(
                    f => f.scheduledAt < now && !TERMINAL_STATUSES.includes(f.status)
                );

                console.log(
                    `[DeltaSync] ${syncLabel}: ` +
                    `${seasonFixtures.length} fixtures in Dexie, ` +
                    `${staleFixtures.length} stale (past-due, non-terminal)`
                );

                if (staleFixtures.length > 0) {
                    // Build team name lookup for readable stale entries
                    const teamIds = new Set(staleFixtures.flatMap(f => [f.homeTeamId, f.awayTeamId]));
                    const teamRecords = await db.teams.where('id').anyOf([...teamIds]).toArray();
                    const teamName = (id: string) => teamRecords.find(t => t.id === id)?.name || id.slice(0, 8);

                    console.log(`[DeltaSync] === STALE ENTRIES ===`);
                    staleFixtures.forEach(f => {
                        console.log(
                            `  [STALE] ${teamName(f.homeTeamId)} vs ${teamName(f.awayTeamId)} ` +
                            `status=${f.status} sched=${f.scheduledAt} ` +
                            `goals=${f.goalsHome ?? '?'}-${f.goalsAway ?? '?'} gw=${f.gameweek}`
                        );
                    });
                    since = null;
                    staleRemediation = true;
                    await db.syncState.delete(syncKey);
                }
            }

            // 2. Fetch from GQL.
            // Bypass urql's document cache only for stale remediation re-pulls;
            // normal delta syncs benefit from the cache.
            const result = await client.query(SYNC_DATA_QUERY, {
                seasonId,
                since
            }, staleRemediation ? { requestPolicy: 'network-only' } : {}).toPromise();

            if (result.error) throw result.error;

            const { teams, fixtures, venues } = result.data;

            console.log(
                `[DeltaSync] ${syncLabel}: Server returned ${teams?.length ?? 0} teams, ` +
                `${fixtures?.length ?? 0} fixtures, ${venues?.length ?? 0} venues ` +
                `(since=${since ?? 'FULL'}, staleRemediation=${staleRemediation})`
            );

            // Log any fixtures in the server response that are STILL stale
            if (fixtures?.length > 0) {
                const now = new Date().toISOString();
                const stillStale = fixtures.filter(
                    (f: Fixture) => f.scheduledAt < now && !TERMINAL_STATUSES.includes(f.status)
                );
                if (stillStale.length > 0) {
                    console.log(`[DeltaSync] ${syncLabel}: ${stillStale.length} STILL-STALE fixtures returned by server`);
                }
            }

            // 3. Batch updates into Dexie
            await db.transaction('rw', [db.teams, db.fixtures, db.venues, db.syncState], async () => {
                if (teams?.length > 0) {
                    await db.teams.bulkPut(teams.map((t: Team) => ({
                        id: t.id,
                        name: t.name,
                        shortName: t.shortName,
                        tla: t.tla,
                        logo: t.logo,
                        updatedAt: t.updatedAt
                    })));
                }

                if (fixtures?.length > 0) {
                    await db.fixtures.bulkPut(fixtures.map((f: Fixture) => ({
                        id: f.id,
                        seasonId: f.seasonId,
                        homeTeamId: f.homeTeamId,
                        awayTeamId: f.awayTeamId,
                        venueId: f.venueId || undefined,
                        scheduledAt: f.scheduledAt,
                        status: f.status,
                        goalsHome: f.goalsHome,
                        goalsAway: f.goalsAway,
                        gameweek: f.gameweek,
                        updatedAt: f.updatedAt
                    })));
                }

                if (venues?.length > 0) {
                    await db.venues.bulkPut(venues.map((v: Venue) => ({
                        id: v.id,
                        name: v.name,
                        city: v.city || undefined,
                        image: v.image || undefined,
                        updatedAt: v.updatedAt
                    })));
                }

                // 4. Update sync state with the latest updatedAt found in batch
                const allUpdates = [...(teams || []), ...(fixtures || []), ...(venues || [])];
                if (allUpdates.length > 0) {
                    const latest = allUpdates.reduce((max, cur) =>
                        new Date(cur.updatedAt) > new Date(max) ? cur.updatedAt : max,
                        since || '1970-01-01T00:00:00Z'
                    );

                    await db.syncState.put({
                        key: syncKey,
                        lastUpdatedAt: latest,
                    });
                }
            });

        } catch (err: unknown) {
            console.error('DeltaSync failed:', err);
            setError(err instanceof Error ? err : new Error(String(err)));
        } finally {
            setIsSyncing(false);
        }
    }, [client]);

    return { sync, isSyncing, error };
}

