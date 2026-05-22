/**
 * Ability provider for apps/admin.
 *
 * The admin app fetches its session imperatively via `/api/auth/me` in
 * `App.tsx`, so this provider takes the viewer as a prop rather than
 * pulling from a hook. Once the admin app moves to GraphQL viewer queries,
 * this can switch to mirror apps/web's hook-driven provider.
 *
 * Re-exports `Can` and `useAbility` from `@casl/react` so consumers only need
 * one import path. `AbilityProvider` here wraps `@casl/react`'s provider
 * with our viewer → ability builder, keeping the ability-building rules in
 * one place.
 */
import type { ReactNode } from 'react';

import { useMemo } from 'react';
import { AbilityProvider as CaslProvider } from '@casl/react';

import type { AbilityViewer } from './abilities';

import { buildAbility } from './abilities';

export function AbilityProvider({
    viewer,
    children,
}: {
    viewer: AbilityViewer | null;
    children: ReactNode;
}) {
    const ability = useMemo(() => buildAbility(viewer), [viewer]);
    return <CaslProvider value={ability}>{children}</CaslProvider>;
}
