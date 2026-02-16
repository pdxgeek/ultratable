import type {
    SeasonRules,
    Team,
    Graphic,
    TeamDataPack,
    SeasonDataPack
} from '../types';
import { transformTeams } from './dataCompiler';
import { generateId } from './idUtils';

// ─── Generators ────────────────────────────────────────────────────────

export function generateTeamPack(apiTeams: Team[]): TeamDataPack {
    // apiTeams is now Team[] (standardized entities)
    // We reuse the transformer from dataCompiler which does Team[] -> Map<string, Team>
    return transformTeams(apiTeams);
}

export function generateGfxPack(apiTeams: Team[]): Graphic[] {
    const pack: Graphic[] = [];
    for (const t of apiTeams) {
        if (t.logo) {
            pack.push({
                id: generateId(), // Pure Base32 NanoID
                type: 'team_logo',
                associationId: `team:${t.id}`,
                integrationId: t.integrationId,
                commonName: `${t.commonName} Logo`,
                sourceUrl: t.logo
            });
        }
        if (t.venueImage) {
            pack.push({
                id: generateId(), // Pure Base32 NanoID
                type: 'venue_image',
                associationId: `team:${t.id}`, // Venue is associated with the team
                integrationId: t.integrationId,
                commonName: `${t.venue || t.commonName} Venue`,
                sourceUrl: t.venueImage
            });
        }
    }
    return pack;
}

export function generateSeasonPack(
    leagueId: number,
    season: number,
    teams: Team[],
    fixtures: any[], // Type as Fixture[] or generic, not used for mapping here really
    _standings: any[],
    rules: SeasonRules
): SeasonDataPack {
    // Determine league name from somewhere? Or just pass it in?
    // In App.tsx we pass league.rules.
    // We can infer name from league config in App.tsx but here we don't have it.
    // Maybe we just return a placeholder or update the type to not need name?
    // For now, "League Season" or similar.

    return {
        leagueId,
        season,
        name: 'League Season',
        teams: teams.map((t) => t.id),
        rules: rules,
    };
}
