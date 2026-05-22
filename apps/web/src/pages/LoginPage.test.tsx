import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { useViewer, type Viewer } from '../hooks/useViewer';
import { authClient } from '../lib/auth-client';
import LoginPage from './LoginPage';

vi.mock('../hooks/useViewer', () => ({ useViewer: vi.fn() }));
vi.mock('../lib/auth-client', () => ({
    authClient: { signIn: { social: vi.fn() } },
}));

function mockViewer(viewer: Viewer | null, loading = false): void {
    vi.mocked(useViewer).mockReturnValue({ viewer, loading, refetch: vi.fn() });
}

function LocationProbe(): React.ReactElement {
    const location = useLocation();
    return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderAt(initialPath: string) {
    return render(
        <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/" element={<LocationProbe />} />
                <Route path="/back-here" element={<LocationProbe />} />
            </Routes>
        </MemoryRouter>,
    );
}

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

describe('LoginPage', () => {
    it('renders the Continue with Google CTA when signed out', () => {
        mockViewer(null);
        renderAt('/login');
        expect(screen.getByText('Sign in to UltraTable').tagName).toBe('DIV');
        expect(screen.getByRole('button', { name: /continue with google/i }).tagName).toBe(
            'BUTTON',
        );
    });

    it('redirects to the returnTo path when already signed in', () => {
        mockViewer(viewer);
        renderAt('/login?returnTo=/back-here');
        expect(screen.getByTestId('location').textContent).toBe('/back-here');
    });

    it('redirects to / when signed in with no returnTo param', () => {
        mockViewer(viewer);
        renderAt('/login');
        expect(screen.getByTestId('location').textContent).toBe('/');
    });

    it('calls authClient.signIn.social with an absolute callbackURL pinned to this origin', () => {
        mockViewer(null);
        renderAt('/login?returnTo=/back-here');
        fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));
        expect(authClient.signIn.social).toHaveBeenCalledWith({
            provider: 'google',
            callbackURL: window.location.origin + '/back-here',
        });
    });
});
