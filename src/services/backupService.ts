import JSZip from 'jszip';
import { db } from './dao/schema';
import { database } from './db';
import type { LeagueConfig } from '../types';

export interface BackupMetadata {
    version: number;
    timestamp: string;
    leagueId: number;
    season: number;
    leagueName: string;
}

export class BackupService {
    /**
     * Export a specific league and season to a ZIP archive.
     */
    async exportToZip(leagueId: number, season: number): Promise<Blob> {
        const zip = new JSZip();
        const leagueKey = `${leagueId}_${season}`;

        // 1. Get League Config
        const leagueRecord = await db.leagues.get(leagueKey);
        if (!leagueRecord) throw new Error(`League ${leagueKey} not found`);
        const leagueConfig: LeagueConfig = leagueRecord.config;

        // 2. Fetch all relevant entities
        const fixtures = await db.fixtures.where('referenceKeys').startsWith(`api-football:fixture:`).toArray();
        // Filter fixtures for this league. 
        // Note: In our current schema, fixtures don't have a direct leagueId/season index in the domain table yet.
        // We usually filter by referenceKeys or by searching inside the data object.
        const leagueFixtures = fixtures.filter(f => f.data.league.id === leagueId && f.data.league.season === season);

        const teamIds = new Set<string>();
        const playerIds = new Set<string>();
        const graphicIds = new Set<string>();

        leagueFixtures.forEach(f => {
            teamIds.add(f.data.homeTeamId);
            teamIds.add(f.data.awayTeamId);
            if (f.data.venueImage) graphicIds.add(f.data.venueImage);

            // Collect players from lineups if loaded
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

        // Add teams participating in the league (even if no fixtures yet)
        const allTeams = await db.teams.toArray();
        const leagueTeams = allTeams.filter(t => teamIds.has(t.id));

        // 3. Build the structure
        zip.file('manifest.json', JSON.stringify({
            version: 1,
            timestamp: new Date().toISOString(),
            leagueId,
            season,
            leagueName: leagueConfig.name
        } as BackupMetadata, null, 2));

        const leagueFolder = zip.folder('league')!;
        leagueFolder.file('config.json', JSON.stringify(leagueConfig, null, 2));

        const teamsFolder = zip.folder('teams')!;
        leagueTeams.forEach(t => {
            teamsFolder.file(`${t.id}.json`, JSON.stringify(t, null, 2));
            if (t.data.logo) graphicIds.add(t.data.logo);
        });

        const fixturesFolder = zip.folder('fixtures')!;
        leagueFixtures.forEach(f => {
            fixturesFolder.file(`${f.id}.json`, JSON.stringify(f, null, 2));
        });

        const playersFolder = zip.folder('players')!;
        const allPlayers = await db.players.bulkGet(Array.from(playerIds));
        allPlayers.forEach(p => {
            if (p) playersFolder.file(`${p.id}.json`, JSON.stringify(p, null, 2));
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

        // Generate final blob
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

        // 2. Import League Config
        const leagueConfigStr = await zip.file('league/config.json')?.async('string');
        if (leagueConfigStr) {
            const config: LeagueConfig = JSON.parse(leagueConfigStr);
            await database.saveLeague(config);
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
                        records.push(JSON.parse(str));
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
