import { z } from 'zod';

const tableRow = z.number().int().positive();

/**
 * Validated shape of a season's `configJson` payload (stored in the
 * `seasons.metadata` JSONB column). Unknown keys are stripped so the season
 * cannot be poisoned with arbitrary nested objects.
 */
export const SeasonConfigSchema = z
    .object({
        promotion: z.array(tableRow).max(50).optional(),
        playoffs: z.array(tableRow).max(50).optional(),
        relegation: z.array(tableRow).max(50).optional(),
        deductions: z
            .array(
                z.object({
                    teamId: z.string().min(1).max(64),
                    points: z.number().int().min(-100).max(100),
                    reason: z.string().min(1).max(500),
                }),
            )
            .max(100)
            .optional(),
        rankingCriteria: z.array(z.string().min(1).max(64)).max(20).optional(),
    })
    .strict();

export type SeasonConfig = z.infer<typeof SeasonConfigSchema>;
