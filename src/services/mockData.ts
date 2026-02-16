import type { ApiTeam, ApiFixture } from '../types';
import { LEAGUES } from '../config';

// ─── Constants ─────────────────────────────────────────────────────────

const ONE_DAY_MS = 86400000;

// LEAGUES moved to src/config.ts

// LEAGUES moved to src/config.ts

const SCIFI_TEAM_NAMES = [
    'Orbital United', 'Void Wanderers', 'Nebula FC', 'Quantuum City', 'Stellar Rangers',
    'Cosmic Athletic', 'Gravity Rovers', 'Meteor Dynamo', 'Supernova SC', 'Black Hole Benz',
    'Comet Crusaders', 'Galaxy Guardians', 'Asteroid Albion', 'Pulsar United', 'Quasar Quest',
    'Aurora Borealis', 'Zenith Zephyrs', 'Eclipse Eleven', 'Horizon Hotspurs', 'Vertex Victory',
];

const FANTASY_TEAM_NAMES = [
    'Orbital United', // Shared Team!
    'Baldur\'s Gate Keepers', 'Waterdeep Wizards', 'Neverwinter Nights', 'Ravenloft Reapers',
    'Mithral Hall Miners', 'Rivendell Rangers', 'Shire Sheriffs', 'Mordor Marauders', 'Gondor Guards',
    'Rohan Riders', 'Isengard Iron',
];

// ─── Generators ────────────────────────────────────────────────────────

function generateMockTeam(idBase: number, name: string, theme: 'scifi' | 'fantasy'): ApiTeam {
    const slug = name.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
    const stadiumSuffix = theme === 'scifi' ? 'Arena' : 'Castle';
    const surface = theme === 'scifi' ? 'AstroTurf' : 'Grass';

    // Use fallback logic for images if they don't exist, app handles 404s gracefully via TeamLogo
    const logoUrl = `/assets/teams/${slug}-logo.png`;
    const stadiumUrl = `/assets/teams/${slug}-stadium.png`;

    return {
        team: {
            id: idBase,
            name,
            code: name.substring(0, 3).toUpperCase(),
            country: theme === 'scifi' ? 'Galactic Empire' : 'Middle Earth',
            founded: theme === 'scifi' ? 2050 : 1250,
            national: false,
            logo: logoUrl,
        },
        venue: {
            id: idBase + 1000,
            name: `${name} ${stadiumSuffix}`,
            address: 'Unknown',
            city: 'Unknown',
            capacity: 50000,
            surface: surface,
            image: stadiumUrl,
        },
    };
}

export const mockSciFiTeams = SCIFI_TEAM_NAMES.map((name, i) => generateMockTeam(1000 + i, name, 'scifi'));
export const mockFantasyTeams = FANTASY_TEAM_NAMES.map((name, i) => generateMockTeam(2000 + i, name, 'fantasy'));

function generateFixturesForLeague(leagueId: number, teams: ApiTeam[]): ApiFixture[] {
    const fixtures: ApiFixture[] = [];
    const teamIds = teams.map((t) => t.team.id);
    const totalRounds = (teams.length - 1) * 2;

    let fixtureIdCounter = leagueId * 10000; // Unique IDs per league
    const startDate = new Date();

    // Calculate start date based on league
    // D&D League (8888): Week 4 (approx 28 days ago)
    // SciFi League (9999): Week 19.5 (approx 137 days ago)
    const daysAgo = leagueId === 8888 ? 28 : 137;
    startDate.setDate(startDate.getDate() - daysAgo);

    for (let round = 1; round <= totalRounds; round++) {
        const roundDate = new Date(startDate.getTime() + round * 7 * ONE_DAY_MS);
        const isPast = roundDate < new Date();

        const roundTeamIds = [...teamIds];
        const rotation = (round - 1) % (teams.length - 1);

        if (rotation > 0) {
            const sub = roundTeamIds.splice(1);
            for (let i = 0; i < rotation; i++) {
                sub.push(sub.shift()!);
            }
            roundTeamIds.push(...sub);
        }

        const half = teams.length / 2;
        for (let i = 0; i < half; i++) {
            let actualHome = roundTeamIds[i];
            let actualAway = roundTeamIds[teams.length - 1 - i];

            if (round % 2 === 1) {
                [actualHome, actualAway] = [actualAway, actualHome];
            }

            const homeTeam = teams.find(t => t.team.id === actualHome)!;
            const awayTeam = teams.find(t => t.team.id === actualAway)!;

            let statusShort = 'NS';
            let homeGoals: number | null = null;
            let awayGoals: number | null = null;

            if (isPast) {
                statusShort = 'FT';
                homeGoals = Math.floor(Math.random() * 4);
                awayGoals = Math.floor(Math.random() * 3);
            }

            fixtures.push({
                fixture: {
                    id: fixtureIdCounter++,
                    referee: 'Robot Ref',
                    timezone: 'UTC',
                    date: roundDate.toISOString(),
                    timestamp: Math.floor(roundDate.getTime() / 1000),
                    status: {
                        long: isPast ? 'Match Finished' : 'Not Started',
                        short: statusShort,
                        elapsed: isPast ? 90 : null,
                    },
                    venue: {
                        id: null,
                        name: homeTeam.venue.name,
                        city: homeTeam.venue.city,
                    }
                },
                league: {
                    id: leagueId,
                    name: LEAGUES[leagueId].name,
                    country: 'Unknown',
                    logo: '',
                    flag: null,
                    season: LEAGUES[leagueId].season,
                    round: `Regular Season - ${round}`,
                },
                teams: {
                    home: { id: homeTeam.team.id, name: homeTeam.team.name, logo: homeTeam.team.logo, winner: homeGoals !== null && awayGoals !== null ? homeGoals > awayGoals : null },
                    away: { id: awayTeam.team.id, name: awayTeam.team.name, logo: awayTeam.team.logo, winner: homeGoals !== null && awayGoals !== null ? awayGoals > homeGoals : null },
                },
                goals: { home: homeGoals, away: awayGoals },
                score: {
                    halftime: { home: null, away: null },
                    fulltime: { home: homeGoals, away: awayGoals },
                    extratime: { home: null, away: null },
                    penalty: { home: null, away: null },
                },
                lineups: {
                    home: generateMockLineup(homeTeam.team.name),
                    away: generateMockLineup(awayTeam.team.name),
                }
            });
        }
    }

    // Inject Scenarios (Only for SciFi League for now to keep it simple, or reused logic)
    if (leagueId === 9999) {
        injectScenarios(fixtures);
    }

    return fixtures;
}

function injectScenarios(fixtures: ApiFixture[]) {
    // Scenario 2: Cancelled Match in Round 12
    const round12Match = fixtures.find(f => f.league.round === 'Regular Season - 12');
    if (round12Match) {
        round12Match.fixture.status.short = 'CANC';
        round12Match.fixture.status.long = 'Match Cancelled';
    }

    // Scenario 3: Postponed Match with NO New Date (Round 15)
    // Note: We are using PST to test the system mapping it to Cancelled
    const round15Match = fixtures.find(f => f.league.round === 'Regular Season - 15');
    if (round15Match) {
        round15Match.fixture.status.short = 'PST';
        round15Match.fixture.status.long = 'Match Postponed';
        round15Match.goals = { home: null, away: null };
        round15Match.score.fulltime = { home: null, away: null };
    }
}

function generateMockLineup(teamName: string) {
    const formations = ['4-4-2', '4-3-3', '3-5-2'];
    const formation = formations[Math.floor(Math.random() * formations.length)];
    const startXI = Array.from({ length: 11 }, (_, i) => ({
        id: Math.floor(Math.random() * 10000),
        name: `${teamName.split(' ')[0]} Player ${i + 1}`,
        number: i + 1,
        pos: i === 0 ? 'GK' : i < 5 ? 'DF' : i < 9 ? 'MF' : 'FW',
        grid: '1:1',
    })) as any[];
    const substitutes = Array.from({ length: 7 }, (_, i) => ({
        id: Math.floor(Math.random() * 10000),
        name: `${teamName.split(' ')[0]} Sub ${i + 1}`,
        number: 12 + i,
        pos: 'MF',
        grid: null,
    })) as any[];
    return { startXI, substitutes, formation };
}


// ─── Exports ───────────────────────────────────────────────────────────

export const getMockTeams = async (leagueId: number = 9999) => {
    return new Promise<ApiTeam[]>(resolve => {
        setTimeout(() => {
            if (leagueId === 8888) resolve(mockFantasyTeams);
            else resolve(mockSciFiTeams);
        }, 300);
    });
};

export const getMockFixtures = async (leagueId: number = 9999) => {
    return new Promise<ApiFixture[]>(resolve => {
        setTimeout(() => {
            const teams = leagueId === 8888 ? mockFantasyTeams : mockSciFiTeams;
            resolve(generateFixturesForLeague(leagueId, teams));
        }, 300);
    });
};

export const getMockFixtureDetails = async (fixtureId: number) => {
    return new Promise<ApiFixture>((resolve) => {
        setTimeout(() => {
            // For now, simpler generator or try to reproduce consistent data
            // Since we don't have a persistent store, we'll generate a fresh one
            // This works for deep links, but might mismatch list view (score etc)
            // But initialData in MatchPage solves the transition case.

            // Heuristic to guess league from ID (e.g. 9999xxxx)
            const leagueId = Math.floor(fixtureId / 10000);
            const teams = leagueId === 8888 ? mockFantasyTeams : mockSciFiTeams;

            // Randomly pick two teams for this mock detail
            const home = teams[0];
            const away = teams[1];

            resolve({
                fixture: {
                    id: fixtureId,
                    referee: 'Robot Ref',
                    timezone: 'UTC',
                    date: new Date().toISOString(),
                    timestamp: Math.floor(Date.now() / 1000),
                    status: { long: 'Match Finished', short: 'FT', elapsed: 90 },
                    venue: { id: null, name: home.venue.name, city: home.venue.city }
                },
                league: {
                    id: leagueId,
                    name: 'Mock League',
                    country: 'Unknown',
                    logo: '',
                    flag: null,
                    season: 2024,
                    round: 'Regular Season - 1',
                },
                teams: {
                    home: { ...home.team, winner: true },
                    away: { ...away.team, winner: false },
                },
                goals: { home: 2, away: 1 },
                score: {
                    halftime: { home: 1, away: 0 },
                    fulltime: { home: 2, away: 1 },
                    extratime: { home: null, away: null },
                    penalty: { home: null, away: null },
                },
                lineups: {
                    home: generateMockLineup(home.team.name),
                    away: generateMockLineup(away.team.name),
                }
            });
        }, 300);
    });
};
