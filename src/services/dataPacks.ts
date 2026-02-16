import type {
    SeasonRules,
    Team,
    Graphic,
    TeamDataPack,
    SeasonDataPack
} from '../types';
import { transformTeams } from './dataCompiler';
import { generateId } from './idUtils';
import { gfxRegistry } from './gfxRegistry';

// ─── Generators ────────────────────────────────────────────────────────

export function generateTeamPack(apiTeams: Team[]): TeamDataPack {
    // apiTeams is now Team[] (standardized entities)
    // We reuse the transformer from dataCompiler which does Team[] -> Map<string, Team>
    return transformTeams(apiTeams);
}

export function generateGfxPack(apiTeams: Team[]): Graphic[] {
    const pack: Graphic[] = [];
    for (const t of apiTeams) {
        // Only create graphics for non-empty URLs
        if (t.logo && t.logo.trim() !== '') {
            // Check if graphic already exists in registry (reuse existing ID)
            const existingLogoId = gfxRegistry.findId(`team:${t.id}`, 'team_logo');
            const logoId = existingLogoId || generateId();
            pack.push({
                id: logoId,
                type: 'team_logo',
                associationId: `team:${t.id}`,
                integrationId: t.integrationId,
                commonName: `${t.commonName} Logo`,
                sourceUrl: t.logo
            });
        }
        if (t.venueImage && t.venueImage.trim() !== '') {
            // Check if graphic already exists in registry (reuse existing ID)
            const existingVenueId = gfxRegistry.findId(`team:${t.id}`, 'venue_image');
            const venueId = existingVenueId || generateId();
            pack.push({
                id: venueId,
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
