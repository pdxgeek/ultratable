import type { AppAbility } from '../auth/abilities';

import React from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { useAbility } from '../auth/abilities';
import SectionNav, { type SectionItem } from './predictions/SectionNav';

/**
 * Cross-page left-rail nav for the Predictions & Rankings family.
 *
 * Lives at the app level (not under `components/predictions/`) because both
 * `PredictionsPage` and `TierListsPage` render it. Owns three concerns the
 * pages used to duplicate inconsistently:
 *
 *   1. The item list — one source of truth so adding a fourth section (e.g.
 *      "Top Scorers") doesn't require touching both pages.
 *   2. CASL gating — Gameweek and Tier Lists only show when the viewer has
 *      the matching role.
 *   3. Active-section + navigation — derived from the URL so the highlight
 *      is correct regardless of which page mounted the nav, and so clicking
 *      a section from any page lands the viewer on that exact section
 *      (rather than the destination page's default).
 *
 * Sections inside `PredictionsPage` are encoded as `?section=gameweek` etc.
 * `PredictionsPage` reads the same query param to pick which board to mount.
 * `TierListsPage` is its own route — selected when the path starts with
 * `/tier-lists`.
 */

export type RankingsSection = 'PROJECTED_FINISH' | 'GAMEWEEK' | 'TIER_LISTS';

interface SectionDef {
    id: RankingsSection;
    label: string;
    /** Path to navigate to when the section is clicked. */
    path: string;
    /** Optional search string (e.g. `?section=gameweek`). */
    search?: string;
    /** Returns true if the section should appear in the nav for `ability`. */
    isVisible: (ability: AppAbility) => boolean;
    /**
     * Returns true if the current location matches this section. Used to set
     * the active highlight. The function takes `pathname` + `searchParams`
     * (rather than reading them itself) so the visibility + match logic
     * stays a pure function.
     */
    isActive: (pathname: string, searchParams: URLSearchParams) => boolean;
}

const SECTIONS: SectionDef[] = [
    {
        id: 'PROJECTED_FINISH',
        label: 'Projected Finish',
        path: '/predictions',
        isVisible: () => true,
        isActive: (pathname, search) =>
            pathname.startsWith('/predictions') && !search.has('section'),
    },
    {
        id: 'GAMEWEEK',
        label: 'Gameweek',
        path: '/predictions',
        search: '?section=gameweek',
        isVisible: (ability) => ability.can('create', 'GameweekPrediction'),
        isActive: (pathname, search) =>
            pathname.startsWith('/predictions') && search.get('section') === 'gameweek',
    },
    {
        id: 'TIER_LISTS',
        label: 'Tier Lists',
        path: '/tier-lists',
        isVisible: (ability) => ability.can('create', 'TierList'),
        isActive: (pathname) => pathname.startsWith('/tier-lists'),
    },
];

const RankingsNav: React.FC = () => {
    const ability = useAbility<AppAbility>();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const visible = SECTIONS.filter((s) => s.isVisible(ability));
    const active =
        visible.find((s) => s.isActive(location.pathname, searchParams))?.id ??
        visible[0]?.id ??
        'PROJECTED_FINISH';

    const items: SectionItem<RankingsSection>[] = visible.map((s) => ({
        id: s.id,
        label: s.label,
    }));

    const handleSelect = (id: RankingsSection) => {
        const target = SECTIONS.find((s) => s.id === id);
        if (!target) return;
        navigate(`${target.path}${target.search ?? ''}`);
    };

    return (
        <SectionNav
            items={items}
            selected={active}
            onSelect={handleSelect}
            ariaLabel="Predictions and rankings sections"
        />
    );
};

export default RankingsNav;
