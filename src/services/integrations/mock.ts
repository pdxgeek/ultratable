import type { DataProvider } from './types';
import type { ApiTeam, ApiFixture, ApiStanding, ApiEvent, MatchLineup, Team, Fixture, StandingsRow, IntegrationName } from '../../types';
import { LEAGUES } from '../../config';
import { mapTeam, mapFixture, mapStanding } from './mappers';
import { database } from '../db';
import { db } from '../dao/schema';

// ─── Constants & Generators ────────────────────────────────────────────

const ONE_DAY_MS = 86400000;

const SCIFI_TEAM_NAMES = [
    'Orbital United', 'Void Wanderers', 'Nebula FC', 'Quantuum City', 'Stellar Rangers',
    'Cosmic Athletic', 'Gravity Rovers', 'Meteor Dynamo', 'Supernova SC', 'Black Hole Benz',
    'Comet Crusaders', 'Galaxy Guardians', 'Asteroid Albion', 'Pulsar United', 'Quasar Quest',
    'Aurora Borealis', 'Zenith Zephyrs', 'Eclipse Eleven', 'Horizon Hotspurs', 'Vertex Victory',
];

const TEAMS_WITH_LOGOS = new Set([
    'orbital-united', 'void-wanderers', 'nebula-fc', 'quantuum-city', 'stellar-rangers',
    'cosmic-athletic', 'gravity-rovers', 'pulsar-united', 'quasar-quest', 'aurora-borealis',
    'zenith-zephyrs',
]);

const TEAMS_WITH_STADIUMS = new Set([
    'orbital-united', 'void-wanderers', 'nebula-fc', 'quantuum-city', 'stellar-rangers',
    'cosmic-athletic', 'gravity-rovers', 'pulsar-united', 'quasar-quest', 'aurora-borealis',
    'zenith-zephyrs',
]);

const FANTASY_TEAM_NAMES = [
    'Orbital United',
    'Baldur\'s Gate Keepers', 'Waterdeep Wizards', 'Neverwinter Nights', 'Ravenloft Reapers',
    'Mithral Hall Miners', 'Rivendell Rangers', 'Shire Sheriffs', 'Mordor Marauders', 'Gondor Guards',
    'Rohan Riders', 'Isengard Iron',
];

class SeededRandom {
    private seed: number;
    constructor(seed: number) { this.seed = seed; }
    next(): number {
        this.seed = (this.seed * 9301 + 49297) % 233280;
        return this.seed / 233280;
    }
    range(min: number, max: number): number {
        return Math.floor(this.next() * (max - min) + min);
    }
}

function generateMockTeam(idBase: number, name: string, theme: 'scifi' | 'fantasy'): ApiTeam {
    const slug = name.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
    const stadiumSuffix = theme === 'scifi' ? 'Arena' : 'Castle';
    const surface = theme === 'scifi' ? 'AstroTurf' : 'Grass';
    const logoUrl = TEAMS_WITH_LOGOS.has(slug) ? `/assets/teams/${slug}-logo.png` : '';
    const stadiumUrl = TEAMS_WITH_STADIUMS.has(slug) ? `/assets/teams/${slug}-stadium.png` : '';

    return {
        team: { id: idBase, name, code: name.substring(0, 3).toUpperCase(), country: theme === 'scifi' ? 'Galactic Empire' : 'Middle Earth', founded: theme === 'scifi' ? 2050 : 1250, national: false, logo: logoUrl },
        venue: { id: idBase + 1000, name: name === 'Orbital United' ? 'Quantum City Arena' : `${name} ${stadiumSuffix}`, address: 'Unknown', city: name === 'Orbital United' ? 'Quantum City' : 'Unknown', capacity: 50000, surface, image: stadiumUrl },
    };
}

async function generateMockLineup(teamName: string, provider: IntegrationName, teamId: number): Promise<MatchLineup> {
    const mapPlayerItem = async (index: number, isSub: boolean) => {
        const remoteId = isSub ? `player_${teamId}_sub_${index}` : `player_${teamId}_${index}`;
        const playerId = await database.getInternalId(provider, 'player', remoteId);

        return {
            player: {
                commonName: isSub ? `${teamName} Sub ${index + 1}` : `${teamName} Player ${index + 1}`,
                id: playerId,
                externalReferences: [{ integrationName: provider, remoteId }],
                number: isSub ? 12 + index : index + 1,
                pos: (isSub ? 'MF' : (index === 0 ? 'GK' : index < 5 ? 'DF' : index < 9 ? 'MF' : 'FW')) as 'GK' | 'DF' | 'MF' | 'FW',
                lastRefreshed: new Date().toISOString(),
            }
        };
    };

    const [startXI, substitutes] = await Promise.all([
        Promise.all(Array.from({ length: 11 }, (_, i) => mapPlayerItem(i, false))),
        Promise.all(Array.from({ length: 7 }, (_, i) => mapPlayerItem(i, true)))
    ]);

    return {
        team: { id: teamId, name: teamName, logo: '' },
        startXI,
        substitutes,
        coach: { id: teamId + 5000, name: `${teamName} Coach`, photo: '' },
        formation: '4-4-2'
    };
}

async function generateFixturesForLeague(leagueId: string | number, teams: ApiTeam[]): Promise<ApiFixture[]> {
    const fixtures: ApiFixture[] = [];
    const teamIds = teams.map((t) => t.team.id);
    const totalRounds = (teams.length - 1) * 2;

    // Use the remote ID (numeric) as the base for stable seeds if available, 
    // otherwise fallback to a better hash than just sum
    let numericLeagueId = 0;
    if (typeof leagueId === 'number') {
        numericLeagueId = leagueId;
    } else {
        // Try to get numeric ID from DB if it's a seeded hierarchical ID
        const league = await db.leagues_v2.get(leagueId);
        const remoteId = league?.data?.externalReferences?.[0]?.remoteId;
        if (remoteId && !isNaN(parseInt(remoteId))) {
            numericLeagueId = parseInt(remoteId);
        } else {
            // Failsafe hash (position-weighted to avoid "backwards" swaps)
            numericLeagueId = leagueId.split('').reduce((acc, char, i) => acc + char.charCodeAt(0) * (i + 1), 0) % 10000;
        }
    }

    let fixtureIdCounter = (numericLeagueId || 1) * 10000;
    const seasonStart = new Date('2025-08-01T12:00:00Z');
    const rng = new SeededRandom(numericLeagueId);

    for (let round = 1; round <= totalRounds; round++) {
        const roundDate = new Date(seasonStart.getTime() + round * 7 * ONE_DAY_MS);
        const isPast = roundDate < new Date();
        const workingIds = [...teamIds];
        const fixed = workingIds.shift()!;
        const rotationCount = round - 1;
        for (let k = 0; k < rotationCount; k++) { workingIds.unshift(workingIds.pop()!); }
        const currentRoundIds = [fixed, ...workingIds];

        const half = teams.length / 2;
        for (let i = 0; i < half; i++) {
            let actualHome = currentRoundIds[i];
            let actualAway = currentRoundIds[teams.length - 1 - i];
            if (round % 2 === 1) [actualHome, actualAway] = [actualAway, actualHome];

            const homeTeam = teams.find(t => t.team.id === actualHome)!;
            const awayTeam = teams.find(t => t.team.id === actualAway)!;

            let statusShort = 'NS';
            let homeGoals: number | null = null;
            let awayGoals: number | null = null;

            if (isPast) {
                statusShort = 'FT';
                const matchSeed = actualHome * 1000 + actualAway + round;
                const matchRng = new SeededRandom(matchSeed);
                homeGoals = matchRng.range(0, 5);
                awayGoals = matchRng.range(0, 4);
            }

            fixtures.push({
                fixture: {
                    id: fixtureIdCounter++, referee: 'Robot Ref', timezone: 'UTC', date: roundDate.toISOString(), timestamp: Math.floor(roundDate.getTime() / 1000),
                    status: { long: isPast ? 'Match Finished' : 'Not Started', short: statusShort, elapsed: isPast ? 90 : null },
                    venue: { id: null, name: homeTeam.venue.name, city: homeTeam.venue.city, image: homeTeam.venue.image }
                },
                league: { id: typeof leagueId === 'number' ? leagueId : 0, name: LEAGUES[typeof leagueId === 'number' ? leagueId : 0]?.name || 'Mock League', country: 'Unknown', logo: '', flag: null, season: LEAGUES[typeof leagueId === 'number' ? leagueId : 0]?.season || 2025, round: `Regular Season - ${round}` },
                teams: {
                    home: { id: homeTeam.team.id, name: homeTeam.team.name, logo: homeTeam.team.logo, winner: homeGoals !== null && awayGoals !== null ? homeGoals > awayGoals : null },
                    away: { id: awayTeam.team.id, name: awayTeam.team.name, logo: awayTeam.team.logo, winner: homeGoals !== null && awayGoals !== null ? awayGoals > homeGoals : null },
                },
                goals: { home: homeGoals, away: awayGoals },
                score: { halftime: { home: null, away: null }, fulltime: { home: homeGoals, away: awayGoals }, extratime: { home: null, away: null }, penalty: { home: null, away: null } },
                lineups: { home: { startXI: [], substitutes: [], formation: '4-4-2' }, away: { startXI: [], substitutes: [], formation: '4-4-2' } }
            });
        }
    }
    return fixtures;
}

// ─── Data Store ────────────────────────────────────────────────────────

interface LeagueData { teams: ApiTeam[]; fixtures: ApiFixture[]; }

const MOCK_DB = new Map<string, LeagueData>();
const STORAGE_KEY = 'ultratable_mock_db_v2';

function getStorage(): Storage | null {
    try { if (typeof window !== 'undefined' && window.localStorage) return window.localStorage; } catch (e) { console.warn('LocalStorage access failed', e); }
    return null;
}

function loadMockDB() {
    const storage = getStorage();
    if (!storage) return;
    try {
        const raw = storage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) parsed.forEach(([key, value]) => MOCK_DB.set(String(key), value));
        }
    } catch (e) { console.warn('Failed to load mock DB', e); }
}

function saveMockDB() {
    const storage = getStorage();
    if (!storage) return;
    try { storage.setItem(STORAGE_KEY, JSON.stringify(Array.from(MOCK_DB.entries()))); } catch (e) { console.warn('Failed to save mock DB', e); }
}

export function clearMockData() {
    MOCK_DB.clear();
    const storage = getStorage();
    if (storage) storage.removeItem(STORAGE_KEY);
}

loadMockDB();

async function getProviderName(leagueId: string | number): Promise<IntegrationName> {
    if (typeof leagueId === 'number') {
        return (LEAGUES[leagueId]?.integrations?.basicTeamInfo as IntegrationName) || ('mock-scifi' as IntegrationName);
    }
    const league = await db.leagues_v2.get(leagueId);
    return (league?.data?.integrations?.basicTeamInfo as IntegrationName) || ('mock-scifi' as IntegrationName);
}

async function getOrGenerateLeagueData(leagueId: string | number): Promise<LeagueData> {
    const key = String(leagueId);
    if (MOCK_DB.has(key)) return MOCK_DB.get(key)!;

    // Resolve hierarchical context
    let rootLeague: any = null;
    if (typeof leagueId === 'string') {
        rootLeague = await db.leagues_v2.get(leagueId);
    }

    // Resolve theme
    let theme: 'scifi' | 'fantasy' = 'scifi';
    if (rootLeague) {
        if (rootLeague.data?.integrations?.basicTeamInfo?.includes('fantasy')) theme = 'fantasy';
    } else if (typeof leagueId === 'number') {
        const league = LEAGUES[leagueId];
        if (league?.integrations?.basicTeamInfo?.includes('fantasy')) theme = 'fantasy';
    }

    console.log(`[MockProvider] Resolved theme "${theme}" for leagueId:`, leagueId);

    // Determine Seed ID for generation
    let seedId = 0;
    if (typeof leagueId === 'number') {
        seedId = leagueId;
    } else if (rootLeague) {
        const remote = rootLeague.data?.externalReferences?.[0]?.remoteId;
        seedId = remote ? parseInt(remote) : 0;
    }
    if (isNaN(seedId)) seedId = 0;

    const names = theme === 'fantasy' ? FANTASY_TEAM_NAMES : SCIFI_TEAM_NAMES;
    const baseId = theme === 'fantasy' ? 2000 : 1000;
    const teams = names.map((name, i) => generateMockTeam(baseId + i, name, theme));
    // Pass the seedId to generateFixtures to ensure stability
    const fixtures = await generateFixturesForLeague(seedId || leagueId, teams);
    const data = { teams, fixtures };
    MOCK_DB.set(key, data);
    saveMockDB();
    return data;
}

// ─── Provider Implementation ───────────────────────────────────────────

export class MockProvider implements DataProvider {
    async getTeams(leagueId: string | number, season: number): Promise<Team[]> {
        const data = await getOrGenerateLeagueData(leagueId);
        const provider = await getProviderName(leagueId);
        return Promise.all(data.teams.map(t => mapTeam(provider, t)));
    }

    async getFixtures(leagueId: string | number, season: number): Promise<Fixture[]> {
        const data = await getOrGenerateLeagueData(leagueId);
        const provider = await getProviderName(leagueId);
        return Promise.all(data.fixtures.map(f => mapFixture(provider, f)));
    }

    async getStandings(leagueId: string | number, season: number): Promise<StandingsRow[]> { return []; }

    async getFixtureDetails(fixtureId: string): Promise<Fixture> {
        let externalIdStr = fixtureId.split(':').pop() || fixtureId;

        // Resolve internal NanoID if needed
        if (!fixtureId.includes(':')) {
            const record = await db.mappings.where('internalId').equals(fixtureId).first();
            if (record) externalIdStr = record.externalId;
        }

        const externalId = parseInt(externalIdStr, 10);
        const leagueId = Math.floor(externalId / 10000);
        const data = await getOrGenerateLeagueData(leagueId);
        const cached = data.fixtures.find(f => f.fixture.id === externalId);
        const provider = await getProviderName(leagueId);
        if (cached) return mapFixture(provider, cached);
        throw new Error('Fixture not found');
    }

    async getEvents(fixtureId: number): Promise<ApiEvent[]> { return []; }

    async getLineups(fixtureId: string): Promise<MatchLineup[]> {
        let externalIdStr = fixtureId.split(':').pop() || '0';

        // Resolve internal NanoID if needed
        if (!fixtureId.includes(':')) {
            const record = await db.mappings.where('internalId').equals(fixtureId).first();
            if (record) externalIdStr = record.externalId;
        }

        const externalId = parseInt(externalIdStr, 10);
        const leagueId = Math.floor(externalId / 10000);
        const data = await getOrGenerateLeagueData(leagueId);
        const provider = await getProviderName(leagueId);
        const fixture = data.fixtures.find(f => f.fixture.id === externalId);
        if (fixture) {
            return Promise.all([
                generateMockLineup(fixture.teams.home.name, provider, fixture.teams.home.id),
                generateMockLineup(fixture.teams.away.name, provider, fixture.teams.away.id)
            ]);
        }
        const teams = data.teams.slice(0, 2);
        return Promise.all([
            generateMockLineup(teams[0]?.team.name || 'Home', provider, teams[0]?.team.id || 0),
            generateMockLineup(teams[1]?.team.name || 'Away', provider, teams[1]?.team.id || 0)
        ]);
    }
}

export const mockProvider = new MockProvider();
