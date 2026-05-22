import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { useMutation } from 'urql';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useViewer, type Viewer } from '../../hooks/useViewer';
import { authClient } from '../../lib/auth-client';
import SecurityPanel from './SecurityPanel';

vi.mock('../../hooks/useViewer', () => ({ useViewer: vi.fn() }));
vi.mock('../../lib/auth-client', () => ({
    authClient: { signOut: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('urql', () => ({
    gql: (strings: TemplateStringsArray) => strings.join(''),
    useMutation: vi.fn(),
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

function mockViewer(v: Viewer | null = viewer, refetch = vi.fn()) {
    vi.mocked(useViewer).mockReturnValue({ viewer: v, loading: false, refetch });
    return refetch;
}

function mockMutation(result: { error?: { message: string } } = {}): ReturnType<typeof vi.fn> {
    const exec = vi
        .fn()
        .mockResolvedValue({ data: { deleteUserAccount: 'u-1' }, error: result.error });
    vi.mocked(useMutation).mockReturnValue([
        { fetching: false, stale: false, error: undefined },
        exec,
    ] as unknown as ReturnType<typeof useMutation>);
    return exec;
}

function LocationProbe(): React.ReactElement {
    const location = useLocation();
    return <div data-testid="location">{location.pathname}</div>;
}

function renderPanel() {
    return render(
        <MemoryRouter initialEntries={['/account/security']}>
            <Routes>
                <Route path="/account/security" element={<SecurityPanel />} />
                <Route path="/" element={<LocationProbe />} />
            </Routes>
        </MemoryRouter>,
    );
}

describe('SecurityPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('keeps the confirm button disabled until the typed email matches', () => {
        mockViewer();
        mockMutation();

        renderPanel();
        fireEvent.click(screen.getByRole('button', { name: /Delete my account/i }));

        const confirmButton = screen.getByRole('button', { name: /Delete account/i });
        expect(confirmButton.hasAttribute('disabled')).toBe(true);

        fireEvent.change(screen.getByLabelText(/Type/i), {
            target: { value: 'wrong@example.com' },
        });
        expect(confirmButton.hasAttribute('disabled')).toBe(true);

        fireEvent.change(screen.getByLabelText(/Type/i), {
            target: { value: 'ada@example.com' },
        });
        expect(confirmButton.hasAttribute('disabled')).toBe(false);
    });

    it('calls deleteUserAccount with the viewer id on confirm, then signs out and navigates home', async () => {
        const refetch = mockViewer();
        const exec = mockMutation();

        renderPanel();
        fireEvent.click(screen.getByRole('button', { name: /Delete my account/i }));
        fireEvent.change(screen.getByLabelText(/Type/i), {
            target: { value: 'ada@example.com' },
        });
        fireEvent.click(screen.getByRole('button', { name: /Delete account/i }));

        await waitFor(() => expect(exec).toHaveBeenCalledWith({ userId: 'u-1' }));
        await waitFor(() => expect(authClient.signOut).toHaveBeenCalled());
        await waitFor(() => expect(refetch).toHaveBeenCalled());
        await waitFor(() =>
            expect(screen.getByTestId('location').textContent).toBe('/'),
        );
    });

    it('shows the mutation error and does not navigate when the server rejects', async () => {
        mockViewer();
        const exec = mockMutation({ error: { message: 'Forbidden' } });

        renderPanel();
        fireEvent.click(screen.getByRole('button', { name: /Delete my account/i }));
        fireEvent.change(screen.getByLabelText(/Type/i), {
            target: { value: 'ada@example.com' },
        });
        fireEvent.click(screen.getByRole('button', { name: /Delete account/i }));

        await waitFor(() => expect(exec).toHaveBeenCalled());
        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toMatch(/Forbidden/);
        expect(authClient.signOut).not.toHaveBeenCalled();
    });
});
