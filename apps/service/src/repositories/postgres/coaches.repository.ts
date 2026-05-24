import { and, eq, inArray } from 'drizzle-orm';

import { db } from '../../db';
import * as schema from '../../db/schema';
import type { IFootballProvider, IngestedCoach } from '../../integrations/types';
import { globalLogger } from '../../services/log.service';
import type { CoachesRepository, CoachRow } from '../coaches';
import { NOW_MS } from './shared';

export class PostgresCoachesRepository implements CoachesRepository {
    constructor(private readonly provider: IFootballProvider) {}

    async getCoachesBySeasonId(seasonId: string): Promise<CoachRow[]> {
        if (!db) return [];
        const rows = await db
            .selectDistinct({ coach: schema.coaches })
            .from(schema.coaches)
            .innerJoin(
                schema.seasonsToTeams,
                eq(schema.seasonsToTeams.teamId, schema.coaches.teamId),
            )
            .where(eq(schema.seasonsToTeams.seasonId, seasonId));
        return rows.map((r) => r.coach);
    }

    async getCoachByTeamId(teamId: string): Promise<CoachRow | null> {
        if (!db) return null;
        const [row] = await db
            .select()
            .from(schema.coaches)
            .where(eq(schema.coaches.teamId, teamId))
            .limit(1);
        return row ?? null;
    }

    async upsertCoach(input: IngestedCoach): Promise<CoachRow> {
        if (!db) throw new Error('Database not configured');
        // Resolve teamId from teamSourceId (provider int → local UUID).
        let teamId: string | null = null;
        if (input.teamSourceId !== null) {
            const [teamRow] = await db
                .select({ id: schema.teams.id })
                .from(schema.teams)
                .where(
                    and(
                        eq(schema.teams.sourceName, this.provider.name),
                        eq(schema.teams.sourceId, input.teamSourceId),
                    ),
                )
                .limit(1);
            teamId = teamRow?.id ?? null;
        }

        const values = {
            name: input.name,
            firstName: input.firstName,
            lastName: input.lastName,
            age: input.age,
            birthDate: input.birthDate,
            birthPlace: input.birthPlace,
            birthCountry: input.birthCountry,
            nationality: input.nationality,
            height: input.height,
            weight: input.weight,
            photo: input.photo,
            teamId,
            sourceName: this.provider.name,
            sourceId: input.sourceId,
            career: input.career ?? null,
            rawResponse: input as unknown,
        };

        const [row] = await db
            .insert(schema.coaches)
            .values(values)
            .onConflictDoUpdate({
                target: [schema.coaches.sourceName, schema.coaches.sourceId],
                set: {
                    name: values.name,
                    firstName: values.firstName,
                    lastName: values.lastName,
                    age: values.age,
                    birthDate: values.birthDate,
                    birthPlace: values.birthPlace,
                    birthCountry: values.birthCountry,
                    nationality: values.nationality,
                    height: values.height,
                    weight: values.weight,
                    photo: values.photo,
                    teamId: values.teamId,
                    career: values.career,
                    rawResponse: values.rawResponse,
                    updatedAt: NOW_MS as unknown as Date,
                },
            })
            .returning();
        if (!row) throw new Error('Failed to upsert coach');
        return row;
    }

    async getOrSyncCoachForTeam(
        teamId: string,
        teamSourceId: number,
    ): Promise<CoachRow | null> {
        const cached = await this.getCoachByTeamId(teamId);
        if (cached) return cached;

        const fetched = await this.provider.getCoachesByTeam(teamSourceId);
        if (fetched.length === 0) return null;

        // Multiple entries can come back (caretaker + permanent). Pick the
        // one whose teamSourceId matches the team we asked about; fall
        // back to index 0 if the upstream omits the team field.
        const primary =
            fetched.find((c) => c.teamSourceId === teamSourceId) ?? fetched[0];
        try {
            return await this.upsertCoach(primary);
        } catch (err) {
            globalLogger.warn(
                { err, teamId, teamSourceId },
                'Failed to upsert synced coach',
            );
            return null;
        }
    }

    /**
     * Test helper — drop coach rows by team id list. Not part of the
     * public contract; integration tests use it for clean teardown.
     */
    async __dangerous_deleteByTeamIds(teamIds: readonly string[]): Promise<void> {
        if (!db || teamIds.length === 0) return;
        await db.delete(schema.coaches).where(inArray(schema.coaches.teamId, [...teamIds]));
    }
}
