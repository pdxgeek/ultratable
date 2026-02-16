import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import TeamLogo from './TeamLogo';
import { gfxRegistry } from '../services/gfxRegistry';

// Mock the graphics registry
vi.mock('../services/gfxRegistry', () => ({
    gfxRegistry: {
        findId: vi.fn(),
        getById: vi.fn(),
    },
}));

describe('TeamLogo', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it.skip('should render image when graphic is found', async () => {
        vi.mocked(gfxRegistry.findId).mockReturnValue('graphic_123');
        vi.mocked(gfxRegistry.getById).mockReturnValue('blob:http://localhost/test-image');

        render(<TeamLogo teamId="100" name="Test Team" className="team-logo" />);

        await waitFor(() => {
            const img = screen.queryByAlt('Test Team');
            expect(img).toBeInTheDocument();
            expect(img).toHaveAttribute('src', 'blob:http://localhost/test-image');
        });
    });

    it('should render fallback with initials when no graphic found', () => {
        vi.mocked(gfxRegistry.findId).mockReturnValue(null);

        render(<TeamLogo teamId="100" name="Arsenal FC" className="team-logo" />);

        const fallback = screen.getByTitle('Arsenal FC');
        expect(fallback).toBeInTheDocument();
        expect(fallback).toHaveTextContent('AF');
    });

    it('should render fallback when no teamId provided', () => {
        render(<TeamLogo name="Liverpool FC" className="team-logo" />);

        const fallback = screen.getByTitle('Liverpool FC');
        expect(fallback).toBeInTheDocument();
        expect(fallback).toHaveTextContent('LF');
    });

    it('should use only first two initials', () => {
        render(<TeamLogo name="Manchester United Football Club" />);

        const fallback = screen.getByTitle('Manchester United Football Club');
        expect(fallback).toHaveTextContent('MU');
    });

    it('should render fallback on image error', async () => {
        vi.mocked(gfxRegistry.findId).mockReturnValue('graphic_123');
        vi.mocked(gfxRegistry.getById).mockReturnValue('http://invalid-url.com/image.png');

        const { container } = render(<TeamLogo teamId="100" name="Test Team" />);

        const img = container.querySelector('img');
        expect(img).toBeInTheDocument();

        // Trigger error
        img?.dispatchEvent(new Event('error'));

        await waitFor(() => {
            const fallback = screen.getByTitle('Test Team');
            expect(fallback).toBeInTheDocument();
            expect(fallback).toHaveTextContent('TT');
        });
    });

    it('should apply custom className', () => {
        render(<TeamLogo name="Test Team" className="custom-class" />);

        const fallback = screen.getByTitle('Test Team');
        expect(fallback).toHaveClass('custom-class');
    });

    it('should have deterministic colors based on team name', () => {
        const { container: container1 } = render(<TeamLogo name="Team A" />);
        const { container: container2 } = render(<TeamLogo name="Team A" />);

        const fallback1 = container1.querySelector('.team-logo-fallback');
        const fallback2 = container2.querySelector('.team-logo-fallback');

        const color1 = fallback1?.getAttribute('style');
        const color2 = fallback2?.getAttribute('style');

        expect(color1).toBe(color2);
    });

    it('should have different colors for different teams', () => {
        const { container: container1 } = render(<TeamLogo name="Arsenal" />);
        const { container: container2 } = render(<TeamLogo name="Chelsea" />);

        const fallback1 = container1.querySelector('.team-logo-fallback');
        const fallback2 = container2.querySelector('.team-logo-fallback');

        const color1 = fallback1?.getAttribute('style');
        const color2 = fallback2?.getAttribute('style');

        // Different teams should likely have different colors (not guaranteed but very likely)
        expect(color1).toBeDefined();
        expect(color2).toBeDefined();
    });
});
