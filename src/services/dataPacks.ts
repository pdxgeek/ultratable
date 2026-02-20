import type {
    SeasonRules,
    Team,
    Graphic,
    TeamDataPack,
    SeasonDataPack
} from '../types';
import { transformTeams } from './dataCompiler';
import { gfxRegistry } from './gfxRegistry';

// ─── Generators ────────────────────────────────────────────────────────

export function generateTeamPack(apiTeams: Team[]): TeamDataPack {
    // apiTeams is now Team[] (standardized entities)
    // We reuse the transformer from dataCompiler which does Team[] -> Map<string, Team>
    return transformTeams(apiTeams);
}

export function generateGfxPack(apiTeams: Team[]): (Partial<Graphic> & { sourceUrl: string; tag?: string })[] {
    const pack: (Partial<Graphic> & { sourceUrl: string; tag?: string })[] = [];
    for (const t of apiTeams) {
        if (!t || !t.id) continue;
        // Only create graphics for non-empty URLs
        if (t.logo && t.logo.trim() !== '') {
            // Deterministic Slot ID calculation
            const logoId = gfxRegistry.calculateSlotId(t.id, 'team_logo');
            pack.push({
                id: logoId,
                type: 'team_logo',
                associationId: t.id,
                commonName: `${t.commonName} Logo`,
                sourceUrl: t.logo,
                externalReferences: t.externalReferences
            });
        }
        if (t.venueImage && t.venueImage.trim() !== '') {
            // Deterministic Slot ID calculation
            const venueId = gfxRegistry.calculateSlotId(t.id, 'venue_image');
            pack.push({
                id: venueId,
                type: 'venue_image',
                associationId: t.id, // Venue is associated with the team
                commonName: `${t.venue || t.commonName} Venue`,
                sourceUrl: t.venueImage,
                externalReferences: t.externalReferences
            });
        }
    }
    return pack;
}

export function generateSeasonPack(
    leagueId: string,
    season: number,
    teams: Team[],
    _fixtures: any[], // Type as Fixture[] or generic, not used for mapping here really
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
        teams: (teams || []).filter(t => t && t.id).map((t) => t.id),
        rules: rules,
    };
}
