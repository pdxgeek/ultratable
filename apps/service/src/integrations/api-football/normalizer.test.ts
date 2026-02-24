import { describe, it, expect } from 'vitest';
import { Normalizer } from './normalizer';

describe('Normalizer', () => {
    it('should normalize team with venue info', () => {
        const mockTeamResponse = {
            team: {
                id: 135,
                side: "home",
                name: "Blackburn",
                logo: "https://media.api-sports.io/football/teams/135.png"
            },
            venue: {
                id: 505,
                name: "Ewood Park",
                city: "Blackburn, Lancashire",
                capacity: 31367,
                surface: "grass",
                image: "https://media.api-sports.io/football/venues/505.png"
            }
        };

        const team = Normalizer.normalizeTeam(mockTeamResponse, 'api-football');
        expect(team.sourceId).toBe(135);
        expect(team.name).toBe('Blackburn');
        expect(team.venueSourceId).toBe(505);

        const venue = Normalizer.normalizeVenue(mockTeamResponse, 'api-football');
        expect(venue.sourceId).toBe(505);
        expect(venue.name).toBe('Ewood Park');
        expect(venue.city).toBe('Blackburn, Lancashire');
        expect(venue.capacity).toBe(31367);
    });

    it('should normalize fixture with goals and status', () => {
        const mockFixtureResponse = {
            fixture: {
                id: 1208035,
                date: "2024-08-09T19:00:00+00:00",
                status: {
                    short: "FT"
                },
                venue: {
                    id: 505
                }
            },
            teams: {
                home: { id: 135 },
                away: { id: 141 }
            },
            goals: {
                home: 4,
                away: 2
            }
        };

        const fixture = Normalizer.normalizeFixture(mockFixtureResponse, 'api-football');
        expect(fixture.sourceId).toBe(1208035);
        expect(fixture.status).toBe('played');
        expect(fixture.homeGoals).toBe(4);
        expect(fixture.awayGoals).toBe(2);
        expect(fixture.venueSourceId).toBe(505);
    });
});
