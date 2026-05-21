import { describe, expect, it } from 'vitest';

import { Normalizer } from './normalizer';

describe('Normalizer', () => {
    describe('normalizeLeague', () => {
        it('normalizes a standard league response', () => {
            const league = Normalizer.normalizeLeague({
                league: { id: 39, name: 'Premier League', logo: 'https://logo.png' },
                country: { name: 'England' },
            });
            expect(league.sourceId).toBe(39);
            expect(league.name).toBe('Premier League');
            expect(league.slug).toBe('premier-league');
            expect(league.country).toBe('England');
            expect(league.logo).toBe('https://logo.png');
            expect(league.sourceName).toBe('api-football');
        });

        it('handles country as a string', () => {
            const league = Normalizer.normalizeLeague({
                league: { id: 1, name: 'World Cup', logo: '' },
                country: 'World',
            });
            expect(league.country).toBe('World');
        });

        it('handles missing country', () => {
            const league = Normalizer.normalizeLeague({
                league: { id: 1, name: 'Test League', logo: '' },
            });
            expect(league.country).toBeNull();
        });

        it('generates slug from name with special characters', () => {
            const league = Normalizer.normalizeLeague({
                league: { id: 1, name: 'Süper Lig!', logo: '' },
            });
            expect(league.slug).toBe('sper-lig');
        });

        it('respects custom sourceName', () => {
            const league = Normalizer.normalizeLeague(
                { league: { id: 1, name: 'Test', logo: '' } },
                'custom-source',
            );
            expect(league.sourceName).toBe('custom-source');
        });
    });

    describe('normalizeTeam', () => {
        it('normalizes team with venue', () => {
            const team = Normalizer.normalizeTeam({
                team: { id: 42, name: 'Arsenal', code: 'ARS', logo: 'logo.png' },
                venue: {
                    id: 505,
                    name: 'Emirates',
                    city: 'London',
                    capacity: 60000,
                    surface: 'grass',
                    image: 'venue.png',
                },
            });
            expect(team.sourceId).toBe(42);
            expect(team.name).toBe('Arsenal');
            expect(team.tla).toBe('ARS');
            expect(team.venueSourceId).toBe(505);
        });

        it('handles missing venue', () => {
            const team = Normalizer.normalizeTeam({
                team: { id: 1, name: 'Test FC', code: 'TFC', logo: '' },
            });
            expect(team.venueSourceId).toBeNull();
        });
    });

    describe('normalizeVenue', () => {
        it('normalizes venue from nested structure', () => {
            const venue = Normalizer.normalizeVenue({
                venue: {
                    id: 505,
                    name: 'Emirates Stadium',
                    city: 'London',
                    capacity: 60000,
                    surface: 'grass',
                    image: 'img.png',
                },
            });
            expect(venue.sourceId).toBe(505);
            expect(venue.name).toBe('Emirates Stadium');
            expect(venue.city).toBe('London');
            expect(venue.capacity).toBe(60000);
            expect(venue.surface).toBe('grass');
        });

        it('handles missing optional venue fields', () => {
            const venue = Normalizer.normalizeVenue({
                venue: { id: 1, name: 'Unknown', city: '', capacity: 0, surface: '', image: '' },
            });
            expect(venue.city).toBeNull();
            expect(venue.capacity).toBeNull();
            expect(venue.surface).toBeNull();
            expect(venue.image).toBeNull();
        });
    });

    describe('normalizeSeason', () => {
        it('normalizes a season with league context', () => {
            const season = Normalizer.normalizeSeason(
                { league: { id: 39, name: 'PL', logo: '' } },
                { year: 2024, start: '2024-08-10', end: '2025-05-25' },
            );
            expect(season.year).toBe(2024);
            expect(season.startDate).toBe('2024-08-10');
            expect(season.endDate).toBe('2025-05-25');
            expect(season.sourceId).toBe(39);
            expect(season.sourceName).toBe('api-football');
        });
    });

    describe('normalizeFixture', () => {
        const baseFixture = {
            fixture: {
                id: 100,
                date: '2024-08-10T15:00:00+00:00',
                status: { short: 'FT' },
                venue: { id: 505 },
            },
            goals: { home: 3, away: 1 },
            teams: { home: { id: 42 }, away: { id: 33 } },
            league: { round: 'Regular Season - 5' },
        };

        it('normalizes a finished fixture', () => {
            const f = Normalizer.normalizeFixture(baseFixture);
            expect(f.sourceId).toBe(100);
            expect(f.status).toBe('played');
            expect(f.homeGoals).toBe(3);
            expect(f.awayGoals).toBe(1);
            expect(f.homeTeamSourceId).toBe(42);
            expect(f.awayTeamSourceId).toBe(33);
            expect(f.venueSourceId).toBe(505);
            expect(f.gameweek).toBe(5);
        });

        it('maps live statuses correctly', () => {
            for (const short of ['1H', 'HT', '2H', 'ET', 'P']) {
                const f = Normalizer.normalizeFixture({
                    ...baseFixture,
                    fixture: { ...baseFixture.fixture, status: { short } },
                });
                expect(f.status).toBe('live');
            }
        });

        it('maps postponed statuses correctly', () => {
            for (const short of ['PST', 'CANC', 'ABD']) {
                const f = Normalizer.normalizeFixture({
                    ...baseFixture,
                    fixture: { ...baseFixture.fixture, status: { short } },
                });
                expect(f.status).toBe('postponed');
            }
        });

        it('defaults to scheduled for unknown statuses', () => {
            const f = Normalizer.normalizeFixture({
                ...baseFixture,
                fixture: { ...baseFixture.fixture, status: { short: 'NS' } },
            });
            expect(f.status).toBe('scheduled');
        });

        it('handles AET and PEN as played', () => {
            for (const short of ['AET', 'PEN']) {
                const f = Normalizer.normalizeFixture({
                    ...baseFixture,
                    fixture: { ...baseFixture.fixture, status: { short } },
                });
                expect(f.status).toBe('played');
            }
        });

        it('maps WO (walkover) and AWD (awarded) to played — prevents stuck fixtures', () => {
            for (const short of ['WO', 'AWD']) {
                const f = Normalizer.normalizeFixture({
                    ...baseFixture,
                    fixture: { ...baseFixture.fixture, status: { short } },
                });
                expect(f.status).toBe('played');
            }
        });

        it('maps SUSP (suspended) and INT (interrupted) to postponed', () => {
            for (const short of ['SUSP', 'INT']) {
                const f = Normalizer.normalizeFixture({
                    ...baseFixture,
                    fixture: { ...baseFixture.fixture, status: { short } },
                });
                expect(f.status).toBe('postponed');
            }
        });

        it('handles missing venue', () => {
            const f = Normalizer.normalizeFixture({
                ...baseFixture,
                fixture: { ...baseFixture.fixture, venue: undefined },
            });
            expect(f.venueSourceId).toBeNull();
        });

        it('handles missing round / no gameweek number', () => {
            const f = Normalizer.normalizeFixture({
                ...baseFixture,
                league: { round: 'Qualifying Round' },
            });
            expect(f.gameweek).toBeNull();
        });

        it('handles null goals', () => {
            const f = Normalizer.normalizeFixture({
                ...baseFixture,
                goals: { home: null, away: null },
            });
            expect(f.homeGoals).toBeNull();
            expect(f.awayGoals).toBeNull();
        });
    });

    describe('normalizeEvent', () => {
        it('normalizes a goal event', () => {
            const event = Normalizer.normalizeEvent(
                {
                    team: { id: 42 },
                    player: { id: 10, name: 'Bukayo Saka' },
                    assist: { id: 8, name: 'Martin Ødegaard' },
                    type: 'Goal',
                    detail: 'Normal Goal',
                    comments: '',
                    time: { elapsed: 23, extra: null },
                },
                999,
            );
            expect(event.fixtureId).toBe(999);
            expect(event.teamId).toBe(42);
            expect(event.playerName).toBe('Bukayo Saka');
            expect(event.assistName).toBe('Martin Ødegaard');
            expect(event.assistSourceId).toBe(8);
            expect(event.minute).toBe(23);
            expect(event.extraMinute).toBeNull();
        });

        it('handles event without assist', () => {
            const event = Normalizer.normalizeEvent(
                {
                    team: { id: 1 },
                    player: { id: 5, name: 'Test' },
                    type: 'Card',
                    detail: 'Yellow Card',
                    comments: 'Rough play',
                    time: { elapsed: 45, extra: 2 },
                },
                100,
            );
            expect(event.assistName).toBeNull();
            expect(event.assistSourceId).toBeNull();
            expect(event.extraMinute).toBe(2);
        });
    });

    describe('normalizePlayer', () => {
        it('normalizes player data', () => {
            const player = Normalizer.normalizePlayer({
                player: {
                    id: 276,
                    name: 'Neymar',
                    firstname: 'Neymar',
                    lastname: 'da Silva',
                    age: 31,
                    nationality: 'Brazil',
                    height: '175 cm',
                    weight: '68 kg',
                    injured: false,
                    photo: 'https://photo.png',
                },
                statistics: [{ games: { rating: '7.5' } }],
            });
            expect(player.sourceId).toBe(276);
            expect(player.name).toBe('Neymar');
            expect(player.firstname).toBe('Neymar');
            expect(player.nationality).toBe('Brazil');
            expect(player.height).toBe('175 cm');
            expect(player.injured).toBe(false);
            expect(player.statistics).toHaveLength(1);
        });
    });

    describe('normalizeLineup', () => {
        it('normalizes lineup with startXI and substitutes', () => {
            const lineup = Normalizer.normalizeLineup({
                team: { id: 42, name: 'Arsenal', logo: 'logo.png' },
                coach: { name: 'Arteta', photo: 'coach.png' },
                formation: '4-3-3',
                startXI: [
                    { player: { id: 1, name: 'Ramsdale', number: 1, pos: 'G' } },
                    { player: { id: 2, name: 'White', number: 4, pos: 'D' } },
                ],
                substitutes: [{ player: { id: 3, name: 'Nketiah', number: 14, pos: 'F' } }],
            });
            expect(lineup.teamSourceId).toBe(42);
            expect(lineup.teamName).toBe('Arsenal');
            expect(lineup.formation).toBe('4-3-3');
            expect(lineup.coachName).toBe('Arteta');
            expect(lineup.startXI).toHaveLength(2);
            expect(lineup.substitutes).toHaveLength(1);
            expect(lineup.startXI[0].sourceId).toBe(1);
        });

        it('handles missing coach', () => {
            const lineup = Normalizer.normalizeLineup({
                team: { id: 1, name: 'Test', logo: '' },
                formation: '4-4-2',
            });
            expect(lineup.coachName).toBeNull();
            expect(lineup.coachPhoto).toBeNull();
            expect(lineup.startXI).toEqual([]);
            expect(lineup.substitutes).toEqual([]);
        });
    });
});
