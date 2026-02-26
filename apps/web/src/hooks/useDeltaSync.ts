import { useState, useCallback } from 'react';
import { useClient } from 'urql';
import { db } from '../db';
import { SYNC_DATA_QUERY } from '../api/queries';

export function useDeltaSync() {
    const client = useClient();
    const [isSyncing, setIsSyncing] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const sync = useCallback(async (leagueId: number, season: number) => {
        setIsSyncing(true);
        setError(null);

        try {
            // 1. Get last sync time from Dexie
            const syncKey = `sync:${leagueId}:${season}`;
            const state = await db.syncState.get(syncKey);
            const since = state?.lastUpdatedAt || null;

            // 2. Fetch from GQL
            const result = await client.query(SYNC_DATA_QUERY, {
                leagueId,
                season,
                since
            }).toPromise();

            if (result.error) throw result.error;

            const { teams, fixtures, venues } = result.data;

            // 3. Batch updates into Dexie
            await db.transaction('rw', [db.teams, db.fixtures, db.venues, db.syncState], async () => {
                if (teams?.length > 0) {
                    await db.teams.bulkPut(teams.map((t: any) => ({
                        id: t.id,
                        name: t.name,
                        shortName: t.shortName,
                        tla: t.tla,
                        logo: t.logo,
                        updatedAt: t.updatedAt
                    })));
                }

                if (fixtures?.length > 0) {
                    await db.fixtures.bulkPut(fixtures.map((f: any) => ({
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
                    await db.venues.bulkPut(venues.map((v: any) => ({
                        id: v.id,
                        name: v.name,
                        city: v.city || undefined,
                        image: v.image || undefined,
                        updatedAt: v.updatedAt
                    })));
                }

                // 4. Update sync state with the latest updatedAt found in batch
                const allUpdates = [...(teams || []), ...(fixtures || [])];
                if (allUpdates.length > 0) {
                    const latest = allUpdates.reduce((max, cur) =>
                        new Date(cur.updatedAt) > new Date(max) ? cur.updatedAt : max,
                        since || '1970-01-01T00:00:00Z'
                    );

                    await db.syncState.put({
                        key: syncKey,
                        lastUpdatedAt: latest
                    });
                }
            });

        } catch (err: any) {
            console.error('DeltaSync failed:', err);
            setError(err);
        } finally {
            setIsSyncing(false);
        }
    }, [client]);

    return { sync, isSyncing, error };
}
