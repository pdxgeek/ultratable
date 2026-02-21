import { database } from './db';
import type { ScheduleEntry, Fixture } from '../types';

/**
 * ScheduleManager - Orchestrates fixture associations and ensures 
 * schedule continuity in the database.
 */
export class ScheduleManager {
    /**
     * Ensures every team in the season has a schedule entry for every possible gameweek.
     * This "pads" the schedule so that gaps in API data are still accounted for in the UI.
     */
    async ensureScheduleSkeleton(seasonId: string, teamIds: string[], matchesPerSeason: number): Promise<void> {
        const existingSchedules = await Promise.all(
            teamIds.map(teamId => database.getSchedule(seasonId, teamId))
        );

        const newEntries: ScheduleEntry[] = [];

        for (let i = 0; i < teamIds.length; i++) {
            const teamId = teamIds[i];
            const teamSchedule = existingSchedules[i];
            const existingGws = new Set(teamSchedule.map(s => s.gameweek));

            // Populate missing gameweeks with null fixtures
            for (let gw = 1; gw <= matchesPerSeason; gw++) {
                if (!existingGws.has(gw)) {
                    newEntries.push({
                        seasonId,
                        teamId,
                        gameweek: gw,
                        fixtureId: null
                    });
                }
            }
        }

        if (newEntries.length > 0) {
            await database.saveSchedule(newEntries);
        }
    }

    /**
     * Aligns schedule associations based on a list of fixtures.
     */
    async syncScheduleFromFixtures(seasonId: string, fixtures: Fixture[]): Promise<void> {
        const entries: ScheduleEntry[] = [];
        for (const f of fixtures) {
            if (!f.homeTeamId || !f.awayTeamId) continue;

            entries.push({
                seasonId,
                teamId: f.homeTeamId,
                gameweek: f.gameweek,
                fixtureId: f.id
            });

            entries.push({
                seasonId,
                teamId: f.awayTeamId,
                gameweek: f.gameweek,
                fixtureId: f.id
            });
        }

        if (entries.length > 0) {
            await database.saveSchedule(entries);
        }
    }
}

export const scheduleManager = new ScheduleManager();
