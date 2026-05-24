/**
 * Direct rule-level coverage for the ability builder. Pins the three slices
 * the rest of the system depends on (guest gets nothing, user gets self-
 * service, admin gets `manage all`) plus the seams that prediction groups
 * will plug into (owner rule, grant translation). No GraphQL surface — these
 * assertions break only if someone changes the rule shape.
 */
import { subject } from '@casl/ability';
import { describe, expect, it } from 'vitest';

import { buildAbility } from './abilities';

describe('abilityFor — guest', () => {
    it('grants no rules', () => {
        const ability = buildAbility(undefined);
        expect(ability.can('manage', 'all')).toBe(false);
        expect(ability.can('read', 'Viewer')).toBe(false);
        expect(ability.can('follow', 'League')).toBe(false);
        expect(ability.can('delete', subject('Account', { id: 'anyone' }))).toBe(false);
    });
});

describe('abilityFor — user (no admin role)', () => {
    const viewer = { id: 'user-1', roles: ['user'] };

    it('can read its own viewer surface', () => {
        const ability = buildAbility(viewer);
        expect(ability.can('read', 'Viewer')).toBe(true);
    });

    it('can manage its own Account and only its own', () => {
        const ability = buildAbility(viewer);
        expect(ability.can('delete', subject('Account', { id: 'user-1' }))).toBe(true);
        expect(ability.can('update', subject('Account', { id: 'user-1' }))).toBe(true);
        expect(ability.can('delete', subject('Account', { id: 'someone-else' }))).toBe(false);
    });

    it('can follow/unfollow any League', () => {
        const ability = buildAbility(viewer);
        expect(ability.can('follow', 'League')).toBe(true);
        expect(ability.can('unfollow', 'League')).toBe(true);
    });

    it('cannot manage globally', () => {
        const ability = buildAbility(viewer);
        expect(ability.can('manage', 'all')).toBe(false);
    });

    it('can manage owned resources matching its id', () => {
        const ability = buildAbility(viewer);
        expect(ability.can('manage', subject('OwnedResource', { ownerId: 'user-1' }))).toBe(true);
        expect(ability.can('manage', subject('OwnedResource', { ownerId: 'someone-else' }))).toBe(
            false,
        );
    });
});

describe('abilityFor — admin', () => {
    it('grants manage on every subject (the `manage all` wildcard)', () => {
        const ability = buildAbility({ id: 'admin-1', roles: ['admin'] });
        expect(ability.can('manage', 'all')).toBe(true);
        expect(ability.can('delete', subject('Account', { id: 'someone-else' }))).toBe(true);
        expect(ability.can('read', 'Viewer')).toBe(true);
    });
});

describe('abilityFor — predictions role', () => {
    it('viewer with predictions role can create predictions', () => {
        const ability = buildAbility({ id: 'user-1', roles: ['user', 'predictions'] });
        expect(ability.can('create', 'Prediction')).toBe(true);
    });

    it('viewer with predictions role can read/delete only their own predictions', () => {
        const ability = buildAbility({ id: 'user-1', roles: ['user', 'predictions'] });
        expect(ability.can('read', subject('Prediction', { userId: 'user-1' }))).toBe(true);
        expect(ability.can('delete', subject('Prediction', { userId: 'user-1' }))).toBe(true);
        expect(ability.can('read', subject('Prediction', { userId: 'someone-else' }))).toBe(false);
        expect(ability.can('delete', subject('Prediction', { userId: 'someone-else' }))).toBe(
            false,
        );
    });

    it('viewer without predictions role gets nothing on Prediction', () => {
        const ability = buildAbility({ id: 'user-1', roles: ['user'] });
        expect(ability.can('create', 'Prediction')).toBe(false);
        expect(ability.can('read', subject('Prediction', { userId: 'user-1' }))).toBe(false);
    });

    it('guest role gets nothing on Prediction', () => {
        const ability = buildAbility({ id: 'guest-1', roles: ['guest'] });
        expect(ability.can('create', 'Prediction')).toBe(false);
        expect(ability.can('read', subject('Prediction', { userId: 'guest-1' }))).toBe(false);
    });

    it('admin bypasses prediction ownership scope via manage all', () => {
        const ability = buildAbility({ id: 'admin-1', roles: ['admin'] });
        expect(ability.can('create', 'Prediction')).toBe(true);
        expect(ability.can('delete', subject('Prediction', { userId: 'someone-else' }))).toBe(
            true,
        );
    });
});

describe('abilityFor — tier-lists role', () => {
    it('viewer with tier-lists role can create tier lists', () => {
        const ability = buildAbility({ id: 'user-1', roles: ['user', 'tier-lists'] });
        expect(ability.can('create', 'TierList')).toBe(true);
    });

    it('viewer with tier-lists role can read/update/delete only their own tier lists', () => {
        const ability = buildAbility({ id: 'user-1', roles: ['user', 'tier-lists'] });
        expect(ability.can('read', subject('TierList', { userId: 'user-1' }))).toBe(true);
        expect(ability.can('update', subject('TierList', { userId: 'user-1' }))).toBe(true);
        expect(ability.can('delete', subject('TierList', { userId: 'user-1' }))).toBe(true);
        expect(ability.can('read', subject('TierList', { userId: 'someone-else' }))).toBe(false);
        expect(ability.can('update', subject('TierList', { userId: 'someone-else' }))).toBe(false);
        expect(ability.can('delete', subject('TierList', { userId: 'someone-else' }))).toBe(false);
    });

    it('viewer without tier-lists role gets nothing on TierList', () => {
        const ability = buildAbility({ id: 'user-1', roles: ['user'] });
        expect(ability.can('create', 'TierList')).toBe(false);
        expect(ability.can('read', subject('TierList', { userId: 'user-1' }))).toBe(false);
    });

    it('guest role gets nothing on TierList', () => {
        const ability = buildAbility({ id: 'guest-1', roles: ['guest'] });
        expect(ability.can('create', 'TierList')).toBe(false);
        expect(ability.can('read', subject('TierList', { userId: 'guest-1' }))).toBe(false);
    });

    it('admin bypasses tier-list ownership scope via manage all', () => {
        const ability = buildAbility({ id: 'admin-1', roles: ['admin'] });
        expect(ability.can('create', 'TierList')).toBe(true);
        expect(ability.can('delete', subject('TierList', { userId: 'someone-else' }))).toBe(true);
    });
});

describe('abilityFor — grant translation seam', () => {
    it('owner/admin role → manage on the specific resource id', () => {
        const ability = buildAbility({ id: 'user-1', roles: ['user'] }, [
            { resourceType: 'PredictionGroup', resourceId: 'pg-1', role: 'owner' },
        ]);
        expect(ability.can('manage', subject('PredictionGroup', { id: 'pg-1' }))).toBe(true);
        expect(ability.can('manage', subject('PredictionGroup', { id: 'pg-other' }))).toBe(false);
    });

    it('member role → read-only on the specific resource id', () => {
        const ability = buildAbility({ id: 'user-1', roles: ['user'] }, [
            { resourceType: 'PredictionGroup', resourceId: 'pg-1', role: 'member' },
        ]);
        expect(ability.can('read', subject('PredictionGroup', { id: 'pg-1' }))).toBe(true);
        expect(ability.can('manage', subject('PredictionGroup', { id: 'pg-1' }))).toBe(false);
    });
});
