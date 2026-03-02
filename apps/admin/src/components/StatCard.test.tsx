import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatCard from './StatCard';

describe('StatCard', () => {
    it('renders label and value', () => {
        render(<StatCard label="Leagues" value={5} subValue="Active" isError={false} />);

        expect(screen.getByText('Leagues')).toBeInTheDocument();
        expect(screen.getByText('5')).toBeInTheDocument();
        expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('applies error styling when isError is true', () => {
        const { container } = render(
            <StatCard label="Status" value="Error" subValue="Connection failed" isError={true} />
        );

        const card = container.firstElementChild;
        expect(card?.className).toContain('red');
    });

    it('does not render icon when none provided', () => {
        const { container } = render(
            <StatCard label="Count" value={0} subValue="None" isError={false} />
        );

        // The icon wrapper div should exist but have no SVG child
        const iconWrapper = container.querySelector('.rounded-lg');
        expect(iconWrapper?.querySelector('svg')).toBeNull();
    });
});
