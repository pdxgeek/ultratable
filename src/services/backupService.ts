import JSZip from 'jszip';
import { db } from './dao/schema';
import { database } from './db';
import type { LeagueConfig } from '../types';

export interface BackupMetadata {
    version: number;
    timestamp: string;
    leagueId: string;
    season: number;
    leagueName: string;
}

export class BackupService {
    /**
     * Export a specific league and season to a ZIP archive.
     */
    async exportToZip(leagueId: string, season: number): Promise<Blob> {
        const zip = new JSZip();

        // 1. Get League and Season Config
        const league = await database.getLeagueV2(leagueId);
        if (!league) throw new Error(`League ${leagueId} not found`);

        const seasonRecord = await database.getLeagueSeason(leagueId, season);
        if (!seasonRecord) throw new Error(`Season ${season} for league ${leagueId} not found`);

        // 2. Fetch all relevant entities
        const fixtures = await db.fixtures.toArray();
        // Fixtures in hierarchical model don't have a direct league/season index yet,
        // they are linked by team IDs or we can find them via some other means.
        // Actually, the simplest way is to check the participating teams.

        const teamIds = new Set<string>(seasonRecord.teamIds || []);
        const leagueFixtures = fixtures.filter(f => teamIds.has(f.data.homeTeamId) || teamIds.has(f.data.awayTeamId));

        const playerIds = new Set<string>();
        const graphicIds = new Set<string>();

        leagueFixtures.forEach(f => {
            teamIds.add(f.data.homeTeamId);
            teamIds.add(f.data.awayTeamId);
            if (f.data.venueImage) graphicIds.add(f.data.venueImage);

            if (f.data.lineups) {
                const collect = (p: any) => {
                    playerIds.add(p.player.id);
                    if (p.player.photo) graphicIds.add(p.player.photo);
                };
                f.data.lineups.home.startXI.forEach(collect);
                f.data.lineups.home.substitutes.forEach(collect);
                f.data.lineups.away.startXI.forEach(collect);
                f.data.lineups.away.substitutes.forEach(collect);
            }
        });

        const leagueTeams = await database.getTeamsByIDs(Array.from(teamIds));

        // 3. Build the structure
        zip.file('manifest.json', JSON.stringify({
            version: 2, // Bump version for hierarchical model
            timestamp: new Date().toISOString(),
            leagueId,
            season,
            leagueName: league.commonName
        } as BackupMetadata, null, 2));

        const leagueFolder = zip.folder('league')!;
        leagueFolder.file('config.json', JSON.stringify(league, null, 2));
        leagueFolder.file('season.json', JSON.stringify(seasonRecord, null, 2));

        const teamsFolder = zip.folder('teams')!;
        leagueTeams.forEach(t => {
            teamsFolder.file(`${t.id}.json`, JSON.stringify(t, null, 2));
            if (t.logo) graphicIds.add(t.logo);
        });

        const fixturesFolder = zip.folder('fixtures')!;
        leagueFixtures.forEach(f => {
            fixturesFolder.file(`${f.data.id}.json`, JSON.stringify(f.data, null, 2));
        });

        const playersFolder = zip.folder('players')!;
        const playerRecords = await db.players.bulkGet(Array.from(playerIds));
        playerRecords.forEach(p => {
            if (p) playersFolder.file(`${p.id}.json`, JSON.stringify(p.data, null, 2));
        });

        // 4. Export Assets (Blobs)
        const assetsFolder = zip.folder('assets')!;
        const graphics = await db.graphics.bulkGet(Array.from(graphicIds));
        const blobPromises = graphics.filter(g => g !== undefined).map(async g => {
            const blobRecord = await db.blobs.get(g!.id);
            if (blobRecord) {
                assetsFolder.file(`${g!.id}.bin`, blobRecord.blob);
            }
        });
        await Promise.all(blobPromises);

        return await zip.generateAsync({ type: 'blob' });
    }

    /**
     * Import data from a ZIP archive.
     */
    async importFromZip(file: File): Promise<BackupMetadata> {
        const zip = await JSZip.loadAsync(file);

        // 1. Read Manifest
        const manifestStr = await zip.file('manifest.json')?.async('string');
        if (!manifestStr) throw new Error('Invalid backup: Missing manifest.json');
        const manifest: BackupMetadata = JSON.parse(manifestStr);

        // 2. Import League and Season Config
        if (manifest.version === 2) {
            const leagueStr = await zip.file('league/config.json')?.async('string');
            if (leagueStr) {
                const league = JSON.parse(leagueStr);
                await database.saveLeagueV2(league);
            }
            const seasonStr = await zip.file('league/season.json')?.async('string');
            if (seasonStr) {
                const season = JSON.parse(seasonStr);
                await database.saveLeagueSeason(season);
            }
        } else {
            // Legacy version 1 fallback (already handled by old code partially)
            const leagueConfigStr = await zip.file('league/config.json')?.async('string');
            if (leagueConfigStr) {
                const config: LeagueConfig = JSON.parse(leagueConfigStr);
                await database.saveLeague(config);
            }
        }

        // 3. Import Entities (Bulk)
        const importFolder = async (folderName: string, table: any) => {
            const folder = zip.folder(folderName);
            if (!folder) return;
            const records: any[] = [];

            const filePromises: Promise<void>[] = [];
            folder.forEach((relativePath, file) => {
                if (!file.dir && relativePath.endsWith('.json')) {
                    filePromises.push(file.async('string').then(str => {
                        const data = JSON.parse(str);
                        // In version 2, we saved data objects. In version 1, we saved the full records.
                        // We need to wrap them in records if they are just data.
                        const record = data.id && data.referenceKeys ? data : {
                            id: data.id,
                            referenceKeys: data.externalReferences?.map((r: any) => `${r.integrationName}:${folderName === 'teams' ? 'team' : folderName === 'fixtures' ? 'fixture' : 'player'}:${r.remoteId}`) || [],
                            data: data,
                            updatedAt: Date.now()
                        };
                        records.push(record);
                    }));
                }
            });
            await Promise.all(filePromises);
            if (records.length > 0) {
                await table.bulkPut(records);
            }
        };

        await importFolder('teams', db.teams);
        await importFolder('fixtures', db.fixtures);
        await importFolder('players', db.players);

        // 4. Import Assets
        const assetsFolder = zip.folder('assets');
        if (assetsFolder) {
            const blobPromises: Promise<void>[] = [];
            assetsFolder.forEach((relativePath, file) => {
                if (!file.dir && relativePath.endsWith('.bin')) {
                    const id = relativePath.replace('.bin', '');
                    blobPromises.push(file.async('blob').then(async blob => {
                        await db.blobs.put({ id, blob, timestamp: Date.now() });
                    }));
                }
            });
            await Promise.all(blobPromises);
        }

        return manifest;
    }
}

export const backupService = new BackupService();
