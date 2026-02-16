import type { DataProvider } from './types';
import type { ApiTeam, ApiFixture, ApiStanding, ApiEvent, MatchLineup, Team, Fixture, StandingsRow } from '../../types';
import { LEAGUES } from '../../config';
import { mapTeam, mapFixture, mapStanding } from './mappers';

// ─── Constants & Generators ────────────────────────────────────────────

const ONE_DAY_MS = 86400000;

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

// Simple deterministic random number generator
class SeededRandom {
    private seed: number;
    constructor(seed: number) {
        this.seed = seed;
    }
    // LCG
    next(): number {
        this.seed = (this.seed * 9301 + 49297) % 233280;
        return this.seed / 233280;
    }
    // Range [min, max)
    range(min: number, max: number): number {
        return Math.floor(this.next() * (max - min) + min);
    }
}

function generateMockTeam(idBase: number, name: string, theme: 'scifi' | 'fantasy'): ApiTeam {
    const slug = name.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
    const stadiumSuffix = theme === 'scifi' ? 'Arena' : 'Castle';
    const surface = theme === 'scifi' ? 'AstroTurf' : 'Grass';

    // Use root-relative paths for public assets
    // Standard handling: If file doesn't exist, frontend will show placeholder
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
            name: name === 'Orbital United' ? 'Quantum City Arena' : `${name} ${stadiumSuffix}`,
            address: 'Unknown',
            city: name === 'Orbital United' ? 'Quantum City' : 'Unknown',
            capacity: 50000,
            surface: surface,
            image: stadiumUrl,
        },
    };
}

const mockSciFiTeams = SCIFI_TEAM_NAMES.map((name, i) => generateMockTeam(1000 + i, name, 'scifi'));
const mockFantasyTeams = FANTASY_TEAM_NAMES.map((name, i) => generateMockTeam(2000 + i, name, 'fantasy'));

function generateMockLineup(teamName: string, provider: string, teamId: number): MatchLineup {
    return {
        team: { id: teamId, name: teamName, logo: '' },
        startXI: Array.from({ length: 11 }, (_, i) => ({
            player: {
                commonName: `${teamName} Player ${i + 1}`,
                id: `${provider}:player_${teamId}_${i}`,
                integrationId: `${provider}:player_${teamId}_${i}`,
                number: i + 1,
                pos: (i === 0 ? 'GK' : i < 5 ? 'DF' : i < 9 ? 'MF' : 'FW') as 'GK' | 'DF' | 'MF' | 'FW',
                // No photos for mock players - will show initials
            }
        })),
        substitutes: Array.from({ length: 7 }, (_, i) => ({
            player: {
                commonName: `${teamName} Sub ${i + 1}`,
                id: `${provider}:player_${teamId}_sub_${i}`,
                integrationId: `${provider}:player_${teamId}_sub_${i}`,
                number: 12 + i,
                pos: 'MF' as 'MF',
            }
        })),
        coach: { id: teamId + 5000, name: `${teamName} Coach`, photo: '' },
        formation: '4-4-2'
    };
}

function generateFixturesForLeague(leagueId: number, teams: ApiTeam[]): ApiFixture[] {
    const fixtures: ApiFixture[] = [];
    const teamIds = teams.map((t) => t.team.id);
    const totalRounds = (teams.length - 1) * 2;
    let fixtureIdCounter = leagueId * 10000;
    const startDate = new Date();
    // Deterministic Start Date relative to "Now" is bad if "Now" changes.
    // Should be fixed relative to Season Start (e.g. Jan 1st 2026).
    const seasonStart = new Date('2025-08-01T12:00:00Z');

    // Use a seed based on leagueId
    const rng = new SeededRandom(leagueId);

    for (let round = 1; round <= totalRounds; round++) {
        const roundDate = new Date(seasonStart.getTime() + round * 7 * ONE_DAY_MS);
        const isPast = roundDate < new Date();
        const roundTeamIds = [...teamIds];

        const workingIds = [...teamIds];
        const fixed = workingIds.shift()!;
        // Rotate workingIds by (round-1)
        const rotationCount = round - 1;
        for (let k = 0; k < rotationCount; k++) {
            workingIds.unshift(workingIds.pop()!);
        }
        const currentRoundIds = [fixed, ...workingIds];

        const half = teams.length / 2;
        for (let i = 0; i < half; i++) {
            let actualHome = currentRoundIds[i];
            let actualAway = currentRoundIds[teams.length - 1 - i];

            // Swap home/away based on round parity to balance
            if (round % 2 === 1) [actualHome, actualAway] = [actualAway, actualHome];

            const homeTeam = teams.find(t => t.team.id === actualHome)!;
            const awayTeam = teams.find(t => t.team.id === actualAway)!;

            let statusShort = 'NS';
            let homeGoals: number | null = null;
            let awayGoals: number | null = null;

            if (isPast) {
                statusShort = 'FT';
                // Deterministic scores
                // Use pair IDs and round to seed the score
                const matchSeed = actualHome * 1000 + actualAway + round;
                const matchRng = new SeededRandom(matchSeed);
                homeGoals = matchRng.range(0, 5);
                awayGoals = matchRng.range(0, 4);
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
                    venue: { id: null, name: homeTeam.venue.name, city: homeTeam.venue.city, image: homeTeam.venue.image }
                },
                league: {
                    id: leagueId,
                    name: LEAGUES[leagueId]?.name || 'Mock League',
                    country: 'Unknown',
                    logo: '',
                    flag: null,
                    season: LEAGUES[leagueId]?.season || 2025,
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
                    home: { startXI: [], substitutes: [], formation: '4-4-2' },
                    away: { startXI: [], substitutes: [], formation: '4-4-2' },
                }
            });
        }
    }
    return fixtures;
}


// ─── Data Store ────────────────────────────────────────────────────────

interface LeagueData {
    teams: ApiTeam[];
    fixtures: ApiFixture[];
}

// Global in-memory store
const MOCK_DB = new Map<number, LeagueData>();
const STORAGE_KEY = 'ultratable_mock_db_v1';

// Safe Storage Access
function getStorage(): Storage | null {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            return window.localStorage;
        }
    } catch (e) {
        console.warn('LocalStorage access failed', e);
    }
    return null;
}

function loadMockDB() {
    const storage = getStorage();
    if (!storage) return;

    try {
        const raw = storage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                parsed.forEach(([key, value]) => {
                    MOCK_DB.set(Number(key), value);
                });
            }
        }
    } catch (e) {
        console.warn('Failed to load mock DB', e);
    }
}

function saveMockDB() {
    const storage = getStorage();
    if (!storage) return;

    try {
        const entries = Array.from(MOCK_DB.entries());
        storage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (e) {
        console.warn('Failed to save mock DB', e);
    }
}

// Initialize once
loadMockDB();

// Helper to determine theme from league config
function getLeagueTheme(leagueId: number): 'scifi' | 'fantasy' {
    const league = LEAGUES[leagueId];
    if (!league) return 'scifi'; // Default

    const integrationType = league.integrations?.basicTeamInfo || 'mock-scifi';
    return integrationType.includes('fantasy') ? 'fantasy' : 'scifi';
}

// Helper to get provider name from league
function getProviderName(leagueId: number): string {
    const league = LEAGUES[leagueId];
    return league?.integrations?.basicTeamInfo || 'mock-scifi';
}

function getOrGenerateLeagueData(leagueId: number): LeagueData {
    if (MOCK_DB.has(leagueId)) {
        return MOCK_DB.get(leagueId)!;
    }

    const theme = getLeagueTheme(leagueId);
    const names = theme === 'fantasy' ? FANTASY_TEAM_NAMES : SCIFI_TEAM_NAMES;
    const baseId = theme === 'fantasy' ? 2000 : 1000;

    // Generate Teams
    const teams = names.map((name, i) => generateMockTeam(baseId + i, name, theme));

    // Generate Fixtures
    const fixtures = generateFixturesForLeague(leagueId, teams);

    const data = { teams, fixtures };
    MOCK_DB.set(leagueId, data);
    saveMockDB(); // Persist
    return data;
}

// ─── Provider Implementation ───────────────────────────────────────────

export class MockProvider implements DataProvider {
    async getTeams(leagueId: number, season: number): Promise<Team[]> {
        return new Promise(resolve => {
            setTimeout(() => {
                const data = getOrGenerateLeagueData(leagueId);
                const provider = getProviderName(leagueId);
                resolve(data.teams.map(t => mapTeam(provider, t)));
            }, 300);
        });
    }

    async getFixtures(leagueId: number, season: number): Promise<Fixture[]> {
        return new Promise(resolve => {
            setTimeout(() => {
                const data = getOrGenerateLeagueData(leagueId);
                const provider = getProviderName(leagueId);
                resolve(data.fixtures.map(f => mapFixture(provider, f)));
            }, 300);
        });
    }

    async getStandings(leagueId: number, season: number): Promise<StandingsRow[]> {
        return []; // Handled by DataCompiler
    }

    async getFixtureDetails(fixtureId: string): Promise<Fixture> {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                const externalId = parseInt(fixtureId.split(':').pop() || fixtureId, 10);
                const leagueId = Math.floor(externalId / 10000);

                // Ensure data exists
                const data = getOrGenerateLeagueData(leagueId);
                const cached = data.fixtures.find(f => f.fixture.id === externalId);
                const provider = getProviderName(leagueId);

                if (cached) {
                    resolve(mapFixture(provider, cached));
                } else {
                    console.error(`Fixture ${fixtureId} not found in mock DB`);
                    reject(new Error('Fixture not found'));
                }
            }, 300);
        });
    }

    async getEvents(fixtureId: number): Promise<ApiEvent[]> {
        // Mock provider doesn't generate events
        return [];
    }

    async getLineups(fixtureId: string): Promise<MatchLineup[]> {
        // Deterministic lineup generation based on fixture
        const externalId = parseInt(fixtureId.split(':').pop() || '0', 10);
        const leagueId = Math.floor(externalId / 10000);
        const data = getOrGenerateLeagueData(leagueId);
        const provider = getProviderName(leagueId);

        // Find the specific fixture to get correct team names and IDs
        const fixture = data.fixtures.find(f => f.fixture.id === externalId);
        if (fixture) {
            return [
                generateMockLineup(fixture.teams.home.name, provider, fixture.teams.home.id),
                generateMockLineup(fixture.teams.away.name, provider, fixture.teams.away.id)
            ];
        }

        // Fallback if fixture not found (shouldn't happen)
        const teams = data.teams.slice(0, 2);
        return [
            generateMockLineup(teams[0]?.team.name || 'Home', provider, teams[0]?.team.id || 0),
            generateMockLineup(teams[1]?.team.name || 'Away', provider, teams[1]?.team.id || 0)
        ];
    }
}
