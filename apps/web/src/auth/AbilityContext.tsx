/**
 * Ability provider for apps/web.
 *
 * Wraps the app in a CASL ability built from the live viewer. Components
 * use `<Can I="manage" a="all">…</Can>` (or `useAbility()`) instead of
 * inlining `viewer.roles.includes('admin')` checks — the rules live in
 * `auth/abilities.ts` so server and client stay in sync.
 *
 * Re-exports `Can` and `useAbility` from `@casl/react` so consumers only
 * need one import path.
 */
import type { ReactNode } from 'react';

import { useMemo } from 'react';
import { AbilityProvider as CaslProvider } from '@casl/react';

import type { AbilityViewer } from './abilities';

import { useViewer } from '../hooks/useViewer';
import { buildAbility } from './abilities';

export function AbilityProvider({ children }: { children: ReactNode }) {
    const { viewer } = useViewer();

    const ability = useMemo(() => {
        const v: AbilityViewer | null = viewer
            ? { id: viewer.id, roles: viewer.roles, myGrants: viewer.myGrants }
            : null;
        return buildAbility(v);
    }, [viewer]);

    return <CaslProvider value={ability}>{children}</CaslProvider>;
}
