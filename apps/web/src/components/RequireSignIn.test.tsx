import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { useViewer, type Viewer } from '../hooks/useViewer';
import RequireSignIn from './RequireSignIn';

vi.mock('../hooks/useViewer', () => ({ useViewer: vi.fn() }));

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
                <Route
                    path="/protected/*"
                    element={
                        <RequireSignIn>
                            <div data-testid="protected-content">SECRET</div>
                        </RequireSignIn>
                    }
                />
                <Route path="/login" element={<LocationProbe />} />
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
};

describe('RequireSignIn', () => {
    it('renders nothing while the viewer query is in flight', () => {
        mockViewer(null, true);
        const { container } = renderAt('/protected/dashboard');
        expect(container.innerHTML).toBe('');
    });

    it('redirects to /login with the current path as returnTo when signed out', () => {
        mockViewer(null);
        renderAt('/protected/dashboard?tab=stats');
        expect(screen.getByTestId('location').textContent).toBe(
            '/login?returnTo=' + encodeURIComponent('/protected/dashboard?tab=stats'),
        );
    });

    it('renders children when the viewer is present', () => {
        mockViewer(viewer);
        renderAt('/protected/dashboard');
        expect(screen.getByTestId('protected-content').textContent).toBe('SECRET');
    });
});
