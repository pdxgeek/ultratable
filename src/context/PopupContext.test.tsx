import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PopupProvider, usePopup } from '../context/PopupContext';
import type { Fixture } from '../types';

// Test Component to trigger popup
const TestComponent = ({ id, label }: { id: number; label: string }) => {
    const { showPopup } = usePopup();

    return (
        <button
            onClick={(e) => {
                showPopup({
                    fixture: { id } as Fixture,
                    teams: new Map(),
                    anchorRect: e.currentTarget.getBoundingClientRect(),
                });
            }}
        >
            {label}
        </button>
    );
};

// Mock MatchPopup to avoid rendering complex children
vi.mock('../components/MatchPopup', () => ({
    default: ({ fixture }: { fixture: Fixture }) => (
        <div data-testid="match-popup">Popup for Fixture {fixture.id}</div>
    ),
}));

describe('PopupContext', () => {
    it('shows popup when triggered', async () => {
        render(
            <PopupProvider>
                <TestComponent id={1} label="Trigger 1" />
            </PopupProvider>
        );

        expect(screen.queryByTestId('match-popup')).not.toBeInTheDocument();

        fireEvent.click(screen.getByText('Trigger 1'));

        expect(screen.getByTestId('match-popup')).toHaveTextContent('Popup for Fixture 1');
    });

    it('switches popup content when another trigger is activated (Singleton Logic)', async () => {
        render(
            <PopupProvider>
                <TestComponent id={1} label="Trigger 1" />
                <TestComponent id={2} label="Trigger 2" />
            </PopupProvider>
        );

        // Click first
        fireEvent.click(screen.getByText('Trigger 1'));
        expect(screen.getByTestId('match-popup')).toHaveTextContent('Popup for Fixture 1');

        // Click second - should replace first
        fireEvent.click(screen.getByText('Trigger 2'));
        expect(screen.getByTestId('match-popup')).toHaveTextContent('Popup for Fixture 2');

        // Ensure only one exists
        expect(screen.getAllByTestId('match-popup')).toHaveLength(1);
    });
});
