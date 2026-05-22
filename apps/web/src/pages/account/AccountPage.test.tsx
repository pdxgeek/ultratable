import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { useViewer, type Viewer } from '../../hooks/useViewer';
import AccountPage from './AccountPage';

vi.mock('../../hooks/useViewer', () => ({ useViewer: vi.fn() }));
vi.mock('./LeagueFollowsPanel', () => ({
    default: () => <div data-testid="leagues-panel">leagues</div>,
}));
vi.mock('./ProfilePanel', () => ({
    default: () => <div data-testid="profile-panel">profile</div>,
}));
vi.mock('./SecurityPanel', () => ({
    default: () => <div data-testid="security-panel">security</div>,
}));

const viewer: Viewer = {
    id: 'u-1',
    name: 'Ada',
    email: 'ada@example.com',
    image: null,
    emailVerified: true,
    roles: ['user'],
    createdAt: '2026-01-01T00:00:00.000Z',
    identities: [],
    followedLeagueIds: [],
    myGrants: [],
};

function mockViewer(v: Viewer | null): void {
    vi.mocked(useViewer).mockReturnValue({ viewer: v, loading: false, refetch: vi.fn() });
}

function renderAt(path: string) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="/account/*" element={<AccountPage />} />
                <Route path="/login" element={<div data-testid="login">login</div>} />
            </Routes>
        </MemoryRouter>,
    );
}

describe('AccountPage', () => {
    it('redirects /account → /account/profile', () => {
        mockViewer(viewer);
        renderAt('/account');
        expect(screen.getByTestId('profile-panel')).not.toBeNull();
    });

    it('renders LeagueFollowsPanel at /account/leagues', () => {
        mockViewer(viewer);
        renderAt('/account/leagues');
        expect(screen.getByTestId('leagues-panel')).not.toBeNull();
    });

    it('renders SecurityPanel at /account/security', () => {
        mockViewer(viewer);
        renderAt('/account/security');
        expect(screen.getByTestId('security-panel')).not.toBeNull();
    });

    it('renders ProfilePanel at /account/profile', () => {
        mockViewer(viewer);
        renderAt('/account/profile');
        expect(screen.getByTestId('profile-panel')).not.toBeNull();
    });

    it('does not render panels for a signed-out viewer (RequireSignIn redirects)', () => {
        mockViewer(null);
        renderAt('/account/profile');
        expect(screen.queryByTestId('profile-panel')).toBeNull();
    });
});
