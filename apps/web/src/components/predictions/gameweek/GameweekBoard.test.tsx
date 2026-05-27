import type { Team } from '../../../db';
import type { RowState } from './GameweekBoard';
import type { GameweekFixture, GameweekPredictionPick } from './queries';

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import GameweekBoard from './GameweekBoard';

const teams: Team[] = [
    { id: 't-1', name: 'Liverpool', logo: '' } as Team,
    { id: 't-2', name: 'Brentford', logo: '' } as Team,
    { id: 't-3', name: 'Arsenal', logo: '' } as Team,
];
const teamsMap = new Map(teams.map((t) => [t.id, t]));

const buildFixture = (overrides: Partial<GameweekFixture> = {}): GameweekFixture => ({
    id: 'f-1',
    seasonId: 's-1',
    homeTeamId: 't-1',
    awayTeamId: 't-2',
    scheduledAt: '2026-08-15T15:00:00.000Z',
    status: 'scheduled',
    gameweek: 1,
    ...overrides,
});

const buildPick = (overrides: Partial<GameweekPredictionPick> = {}): GameweekPredictionPick => ({
    id: 'p-1',
    fixtureId: 'f-1',
    homeGoals: 2,
    awayGoals: 1,
    note: null,
    manuallyAdded: false,
    createdAt: '2026-08-14T10:00:00.000Z',
    ...overrides,
});

const buildRow = (overrides: Partial<RowState> = {}): RowState => ({
    fixture: buildFixture(),
    currentPick: null,
    history: [],
    draft: null,
    ...overrides,
});

const noopZone = () => '';

function renderBoard(props: Partial<React.ComponentProps<typeof GameweekBoard>> = {}) {
    return render(
        <GameweekBoard
            gameweek={1}
            rows={[]}
            manualRows={[]}
            teamsMap={teamsMap}
            currentPositions={new Map()}
            zoneClassForPosition={noopZone}
            onOpenAddDialog={null}
            onDraftChange={vi.fn()}
            onClearDraft={vi.fn()}
            onRemoveManualRow={vi.fn()}
            failedFixtureIds={new Set()}
            {...props}
        />,
    );
}

describe('GameweekBoard', () => {
    it('renders position numbers when both teams are in currentPositions', () => {
        const row = buildRow();
        const currentPositions = new Map([
            ['t-1', 1],
            ['t-2', 17],
        ]);
        renderBoard({ rows: [row], currentPositions });

        const items = screen.getAllByRole('listitem');
        const li = items[0];
        expect(within(li).getByText('1')).toBeTruthy();
        expect(within(li).getByText('17')).toBeTruthy();
    });

    it('omits the position badge when the team is missing from currentPositions', () => {
        // Manually-added cup fixture against a team that isn't in this
        // season's standings — position badge should simply not render.
        const row = buildRow({ fixture: buildFixture({ awayTeamId: 't-3' }) });
        const currentPositions = new Map([['t-1', 5]]);
        renderBoard({ rows: [row], currentPositions });

        const items = screen.getAllByRole('listitem');
        const li = items[0];
        // Home team position is present
        expect(within(li).getByText('5')).toBeTruthy();
        // Arsenal (away) has no position number rendered.
        // The team name renders, but no tabular-nums position badge does.
        expect(within(li).getByText('Arsenal')).toBeTruthy();
        // There should only be one element with tabular-nums position class.
        const positionBadges = li.querySelectorAll('span[title^="Currently"]');
        expect(positionBadges.length).toBe(1);
    });

    it('applies zone class to position badges via zoneClassForPosition', () => {
        const row = buildRow();
        const currentPositions = new Map([
            ['t-1', 1],
            ['t-2', 18],
        ]);
        const zoneClassForPosition = (pos: number): string => {
            if (pos === 1) return 'border-l-2 border-accent-blue';
            if (pos === 18) return 'border-l-2 border-accent-red';
            return '';
        };
        renderBoard({ rows: [row], currentPositions, zoneClassForPosition });

        const promoBadge = screen.getByTitle('Currently 1 in the table');
        expect(promoBadge.className).toContain('border-accent-blue');
        const relBadge = screen.getByTitle('Currently 18 in the table');
        expect(relBadge.className).toContain('border-accent-red');
    });

    it('greys out non-scheduled fixtures and disables score inputs', () => {
        const row = buildRow({ fixture: buildFixture({ status: 'played' }) });
        renderBoard({ rows: [row] });

        const li = screen.getAllByRole('listitem')[0];
        expect(li.className).toContain('opacity-60');
        expect(within(li).getByText('Played')).toBeTruthy();
        const inputs = within(li).getAllByRole('textbox');
        for (const input of inputs) {
            expect((input as HTMLInputElement).disabled).toBe(true);
        }
    });

    it('toggles the note textarea via the sticky-note button', () => {
        const row = buildRow();
        renderBoard({ rows: [row] });

        // Closed by default — no textarea rendered.
        expect(screen.queryByRole('textbox', { name: /Add a note/i })).toBeNull();

        const toggle = screen.getByRole('button', { name: /Toggle note/i });
        fireEvent.click(toggle);
        expect(screen.getByPlaceholderText(/Add a note for this fixture/i)).toBeTruthy();

        fireEvent.click(toggle);
        expect(screen.queryByPlaceholderText(/Add a note for this fixture/i)).toBeNull();
    });

    it('hides the history popover trigger when the chain length is ≤ 1', () => {
        const row = buildRow({ history: [buildPick()] });
        renderBoard({ rows: [row] });
        expect(screen.queryByRole('button', { name: /Pick history/i })).toBeNull();
    });

    it('shows the history popover trigger once the chain has multiple picks', () => {
        const row = buildRow({
            history: [
                buildPick({ id: 'p-2', homeGoals: 3 }),
                buildPick({ id: 'p-1', homeGoals: 2 }),
            ],
        });
        renderBoard({ rows: [row] });
        expect(screen.getByRole('button', { name: /Pick history/i })).toBeTruthy();
    });

    it('styles the dirty chip as ready when both scores are filled', () => {
        const row = buildRow({
            draft: { homeGoals: 2, awayGoals: 1, note: null, manuallyAdded: false },
        });
        renderBoard({ rows: [row] });

        const chip = screen.getByText(/ready · discard/);
        expect(chip.className).toContain('text-accent-green');
    });

    it('styles the dirty chip as unsaved when only one score is filled', () => {
        const row = buildRow({
            draft: { homeGoals: 2, awayGoals: null, note: null, manuallyAdded: false },
        });
        renderBoard({ rows: [row] });

        const chip = screen.getByText(/unsaved · discard/);
        expect(chip.className).not.toContain('text-accent-green');
    });

    it('shows a "failed to lock" marker when the row is in failedFixtureIds', () => {
        const row = buildRow({
            draft: { homeGoals: 2, awayGoals: 1, note: null, manuallyAdded: false },
        });
        renderBoard({ rows: [row], failedFixtureIds: new Set(['f-1']) });
        expect(screen.getByText(/failed to lock/)).toBeTruthy();
    });
});
