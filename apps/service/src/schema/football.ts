import * as schema from '../db/schema';
import { repository } from '../repositories';
import { cacheService } from '../services/cache.service';
import { graphicsService } from '../services/graphics.service';
import { builder, requireAdmin } from './builder';

// Define object refs first
export const LeagueRef = builder.objectRef<typeof schema.leagues.$inferSelect>('League');
export const TeamRef = builder.objectRef<typeof schema.teams.$inferSelect>('Team');
export const SeasonRef = builder.objectRef<typeof schema.seasons.$inferSelect>('Season');
const FixtureRef = builder.objectRef<typeof schema.fixtures.$inferSelect>('Fixture');
const VenueRef = builder.objectRef<typeof schema.venues.$inferSelect>('Venue');
const MatchEventRef =
    builder.objectRef<import('../integrations/types').IngestedEvent>('MatchEvent');

type PlayerMeta = {
    firstname?: string | null;
    lastname?: string | null;
    age?: number | null;
    nationality?: string | null;
    photo?: string | null;
    injured?: boolean;
    height?: string | null;
    weight?: string | null;
};
type PlayerShape = Partial<typeof schema.players.$inferSelect> & {
    sourceId: number;
    name: string;
    metadata?: PlayerMeta | null;
    statistics?: unknown;
};
const PlayerRef = builder.objectRef<PlayerShape>('Player');
const playerMeta = (parent: PlayerShape): PlayerMeta => (parent.metadata as PlayerMeta) || {};
const LineupRef = builder.objectRef<import('../integrations/types').IngestedLineup>('Lineup');

type RosterEntryShape = typeof schema.teamRosters.$inferSelect & {
    player: typeof schema.players.$inferSelect;
};
const RosterEntryRef = builder.objectRef<RosterEntryShape>('RosterEntry');

/**
 * Fallback ranking-criteria order used when a season has no `metadata.rankingCriteria`
 * (e.g. seasons imported before importSeason started persisting it).
 * Mirrors the EFL hierarchy and must stay in sync with DEFAULT_RANKING_CRITERIA in repositories/postgres/shared.ts.
 */
const FALLBACK_RANKING_CRITERIA = [
    'standard_pts',
    'goal_diff',
    'goals_for',
    'head_to_head',
    'wins',
    'away_goals',
];

builder.objectType(VenueRef, {
    fields: (t) => ({
        id: t.exposeString('id', {
            description:
                'Unique internal UUID for this venue. Use this ID when referencing a venue in other queries or mutations.',
        }),
        name: t.exposeString('name', {
            description: 'Display name of the venue (e.g. "Old Trafford").',
        }),
        city: t.exposeString('city', {
            nullable: true,
            description: 'City where the venue is located. Null if unknown.',
        }),
        capacity: t.exposeInt('capacity', {
            nullable: true,
            description:
                'Maximum spectator capacity. Null if not reported by the upstream provider.',
        }),
        surface: t.exposeString('surface', {
            nullable: true,
            description:
                'Playing surface type (e.g. "grass", "artificial turf"). Null if not reported.',
        }),
        image: t.string({
            description:
                'Public URL to the venue photo. Resolved first from the graphics registry, then from the upstream provider.',
            nullable: true,
            resolve: async (parent) => {
                try {
                    const url = await graphicsService.resolveUrl(parent.id, 'venue');
                    if (url) return url;
                } catch {
                    /* fall through */
                }
                return parent.image || null;
            },
        }),
        updatedAt: t.expose('updatedAt', {
            type: 'DateTime',
            description:
                'ISO-8601 timestamp of the last update to this venue record. Used for delta sync watermarking.',
        }),
    }),
});

const SourceRef = builder.simpleObject('SourceInfo', {
    fields: (t) => ({
        sourceName: t.string({
            description: 'Name of the upstream data provider (e.g. "api-football").',
        }),
        sourceId: t.int({ description: 'Numeric identifier assigned by the upstream provider.' }),
    }),
});

builder.objectType(LeagueRef, {
    fields: (t) => ({
        id: t.exposeString('id', {
            description:
                'Unique internal UUID for this league. Use this ID when querying seasons or configuring league settings.',
        }),
        name: t.exposeString('name', {
            description: 'Display name of the league (e.g. "Premier League").',
        }),
        slug: t.exposeString('slug', {
            description: 'URL-friendly slug derived from the league name.',
        }),
        country: t.exposeString('country', {
            nullable: true,
            description:
                'Country the league operates in (e.g. "England"). Null for international competitions.',
        }),
        countryFlag: t.string({
            nullable: true,
            description:
                'Public URL to the country flag image, joined from the catalog by country name. Null when no flag is available (e.g. international competitions).',
            resolve: async (parent) => {
                if (!parent.country) return null;
                const countries = await repository.catalog.getCatalogCountries();
                const match = countries.find(
                    (c) => c.sourceName === parent.sourceName && c.name === parent.country,
                );
                return match?.flag ?? null;
            },
        }),
        logo: t.string({
            description:
                'Public URL to the league logo. Resolved from graphics registry, then upstream.',
            nullable: true,
            resolve: async (parent) => {
                try {
                    const url = await graphicsService.resolveUrl(parent.id, 'league');
                    if (url) return url;
                } catch {
                    /* fall through */
                }
                return parent.logo || null;
            },
        }),
        sourceId: t.exposeInt('sourceId', {
            description:
                'External identifier assigned by API-Football (e.g. 39 = Premier League, 40 = Championship). Stored for cross-referencing with the upstream provider but never used as a query input for read operations.',
        }),
        seasons: t.field({
            description:
                'Seasons belonging to this league that have at least one team imported. Empty seasons are filtered out.',
            type: [SeasonRef],
            resolve: async (parent) => {
                // Only return seasons that have teams imported (i.e., real data)
                const allSeasons = await repository.leagues.getInternalSeasons(
                    parent.sourceId,
                    parent.id,
                );
                const seasonIds = allSeasons.map((s) => s.id);
                if (seasonIds.length === 0) return [];

                const linkedIds = new Set(
                    await repository.leagues.getSeasonIdsWithTeamLinks(seasonIds),
                );
                return allSeasons.filter((s) => linkedIds.has(s.id));
            },
        }),
        metadata: t.field({
            description: 'Upstream provider metadata including sourceName and sourceId.',
            type: SourceRef,
            resolve: (parent) => ({
                sourceName: parent.sourceName,
                sourceId: parent.sourceId,
            }),
        }),
        configJson: t.field({
            description:
                'JSON-serialized league configuration (promotion/relegation zones, playoff slots).',
            type: 'String',
            resolve: (parent) => JSON.stringify(parent.metadata || {}),
        }),
        updatedAt: t.expose('updatedAt', {
            type: 'DateTime',
            description: 'ISO-8601 timestamp of the last update. Used for delta sync watermarking.',
        }),
    }),
});

builder.objectType(TeamRef, {
    fields: (t) => ({
        id: t.exposeString('id', {
            description:
                'Unique internal UUID for this team. Teams exist independently of seasons and may participate in multiple seasons via the seasons-to-teams junction.',
        }),
        name: t.exposeString('name', {
            description: 'Full display name of the team (e.g. "Manchester United").',
        }),
        shortName: t.exposeString('shortName', {
            nullable: true,
            description: 'Abbreviated name (e.g. "Man Utd"). Null if not provided.',
        }),
        tla: t.exposeString('tla', {
            nullable: true,
            description: 'Three-letter abbreviation (e.g. "MUN"). Null if not provided.',
        }),
        logo: t.string({
            description:
                'Public URL to the team crest. Resolved from graphics registry, then upstream.',
            nullable: true,
            resolve: async (parent) => {
                try {
                    const url = await graphicsService.resolveUrl(parent.id, 'team');
                    if (url) return url;
                } catch {
                    /* fall through */
                }
                return parent.logo || null;
            },
        }),
        sourceId: t.exposeInt('sourceId', {
            description:
                'External identifier assigned by API-Football for this team. Stored for upstream cross-referencing; internal queries use the UUID id field.',
        }),
        venue: t.field({
            description:
                'Home venue for this team, if assigned. Batched per-request via DataLoader.',
            type: VenueRef,
            nullable: true,
            resolve: (parent, _args, ctx) =>
                parent.venueId ? ctx.loaders.venueLoader.load(parent.venueId) : null,
        }),
        metadata: t.field({
            description: 'Upstream provider metadata including sourceName and sourceId.',
            type: SourceRef,
            resolve: (parent) => ({
                sourceName: parent.sourceName,
                sourceId: parent.sourceId,
            }),
        }),
        updatedAt: t.expose('updatedAt', {
            type: 'DateTime',
            description: 'ISO-8601 timestamp of the last update. Used for delta sync watermarking.',
        }),
        roster: t.field({
            description:
                'Squad roster for this team in a given season. Returns players with jersey numbers and positions from metadata.',
            type: [RosterEntryRef],
            args: {
                seasonId: t.arg.string({
                    required: true,
                    description: 'UUID of the season to retrieve the roster for.',
                }),
            },
            resolve: async (parent, { seasonId }) => {
                return repository.teams.getTeamRoster(parent.id, seasonId);
            },
        }),
    }),
});

builder.objectType(SeasonRef, {
    fields: (t) => ({
        id: t.exposeString('id', {
            description:
                'Unique internal UUID for this season. Pass this to the fixtures, teams, or venues queries to retrieve data scoped to this season.',
        }),
        leagueId: t.exposeString('leagueId', {
            description:
                'UUID of the league this season belongs to. Each season is parented to exactly one league (e.g. Premier League 2025).',
        }),
        year: t.exposeInt('year', {
            description: 'Calendar year when the season starts (e.g. 2025 for the 2025-26 season).',
        }),
        startDate: t.expose('startDate', {
            type: 'DateTime',
            nullable: true,
            description: 'Official start date of the season. Null if not reported.',
        }),
        endDate: t.expose('endDate', {
            type: 'DateTime',
            nullable: true,
            description: 'Official end date of the season. Null if not reported.',
        }),
        configJson: t.field({
            description: 'JSON-serialized season configuration (deductions, zone overrides).',
            type: 'String',
            resolve: (parent) => JSON.stringify(parent.metadata || {}),
        }),
        fixtureCount: t.int({
            description: 'Live count of fixtures in this season (computed from the database).',
            resolve: (parent) => repository.fixtures.countFixturesInSeason(parent.id),
        }),
        teamCount: t.int({
            description:
                'Live count of teams participating in this season (from seasons_to_teams junction).',
            resolve: (parent) => repository.teams.countTeamsInSeason(parent.id),
        }),
        teams: t.field({
            description: 'All teams linked to this season via the seasons-to-teams junction table.',
            type: [TeamRef],
            resolve: (parent) => repository.teams.getTeamsBySeasonId(parent.id),
        }),
        rankingCriteria: t.field({
            description:
                'Ordered list of RankingFormula objects defining how the standings table is sorted for this season.',
            type: [RankingFormulaRef],
            resolve: async (parent) => {
                const metadata = parent.metadata as Record<string, unknown> | null;
                const criteria =
                    (metadata?.rankingCriteria as string[]) || FALLBACK_RANKING_CRITERIA;
                const all = await repository.leagues.getRankingFormulas();
                const byId = new Map(all.map((f) => [f.id, f]));
                // Preserve the order defined in the criteria array — the repo returns formulas ORDER BY id
                // so a naive filter would silently break tiebreaker precedence.
                return criteria
                    .map((id) => byId.get(id))
                    .filter((f): f is (typeof all)[number] => f !== undefined);
            },
        }),
        updatedAt: t.expose('updatedAt', {
            type: 'DateTime',
            description: 'ISO-8601 timestamp of the last update. Used for delta sync watermarking.',
        }),
    }),
});

builder.objectType(FixtureRef, {
    fields: (t) => ({
        id: t.exposeString('id', {
            description:
                'Unique internal UUID for this fixture. Use this ID with the fixture(id) query to fetch full match details including events and lineups.',
        }),
        seasonId: t.exposeString('seasonId', {
            description:
                'UUID of the season this fixture belongs to. Joins back to the Season type to resolve league, year, and configuration.',
        }),
        season: t.int({
            description:
                'Calendar year of the parent season (resolved from the Season record). Convenience field.',
            resolve: async (parent, _args, ctx) => {
                if (!parent.seasonId) return 0;
                const s = await ctx.loaders.seasonLoader.load(parent.seasonId);
                return s?.year ?? 0;
            },
        }),
        leagueSourceId: t.int({
            description:
                'External API-Football league ID, resolved by walking fixture → season → league. Useful for the web app to group fixtures by provider league without an extra round-trip.',

            nullable: true,
            resolve: async (parent, _args, ctx) => {
                if (!parent.seasonId) return null;
                const s = await ctx.loaders.seasonLoader.load(parent.seasonId);
                if (!s) return null;
                const l = await ctx.loaders.leagueLoader.load(s.leagueId);
                return l?.sourceId ?? null;
            },
        }),
        homeTeamId: t.exposeString('homeTeamId', {
            description:
                'UUID of the home team. Resolves to a Team with name, logo, and source metadata.',
        }),
        awayTeamId: t.exposeString('awayTeamId', {
            description:
                'UUID of the away team. Resolves to a Team with name, logo, and source metadata.',
        }),
        venueId: t.exposeString('venueId', {
            nullable: true,
            description:
                'UUID of the venue where this fixture is played. Null if the venue has not been assigned or is unknown.',
        }),
        scheduledAt: t.expose('scheduledAt', {
            type: 'DateTime',
            description:
                'ISO-8601 kickoff timestamp. Used to sort match days and detect stale (past-due, non-terminal) fixtures.',
        }),
        status: t.exposeString('status', {
            description:
                'Current match status: "scheduled", "live", "played", "postponed", "cancelled", or "suspended".',
        }),
        gameweek: t.exposeInt('gameweek', {
            nullable: true,
            description: 'Matchday/round number. Null for cup or unscheduled fixtures.',
        }),
        goalsHome: t.int({
            description: 'Goals scored by the home team. Null before kickoff.',
            nullable: true,
            resolve: (parent) => parent.homeGoals,
        }),
        goalsAway: t.int({
            description: 'Goals scored by the away team. Null before kickoff.',
            nullable: true,
            resolve: (parent) => parent.awayGoals,
        }),
        updatedAt: t.expose('updatedAt', {
            type: 'DateTime',
            description: 'ISO-8601 timestamp of the last update. Used for delta sync watermarking.',
        }),
        homeTeam: t.field({
            description:
                'Resolved home Team object with name, logo, metadata. Batched per-request via DataLoader.',
            type: TeamRef,
            resolve: (parent, _args, ctx) => ctx.loaders.teamLoader.load(parent.homeTeamId),
        }),
        awayTeam: t.field({
            description:
                'Resolved away Team object with name, logo, metadata. Batched per-request via DataLoader.',
            type: TeamRef,
            resolve: (parent, _args, ctx) => ctx.loaders.teamLoader.load(parent.awayTeamId),
        }),
        venue: t.field({
            description:
                'Resolved Venue object for where this match is played. Null if venueId is null. Batched per-request via DataLoader.',
            type: VenueRef,
            nullable: true,
            resolve: (parent, _args, ctx) =>
                parent.venueId ? ctx.loaders.venueLoader.load(parent.venueId) : null,
        }),
        metadata: t.field({
            description:
                'Upstream provider metadata including sourceName and sourceId for this fixture.',
            type: SourceRef,
            resolve: (parent) => ({
                sourceName: parent.sourceName as string,
                sourceId: parent.sourceId as number,
            }),
        }),
        events: t.field({
            description:
                'Match events (goals, cards, substitutions) fetched from the upstream provider by fixture sourceId.',
            type: [MatchEventRef],
            resolve: async (parent) => {
                return repository.fixtures.getMatchEvents(parent.sourceId);
            },
        }),
        lineups: t.field({
            description:
                'Team lineups (starting XI + substitutes) fetched from the upstream provider by fixture sourceId.',
            type: [LineupRef],
            resolve: async (parent) => {
                return repository.fixtures.getLineups(parent.sourceId);
            },
        }),
    }),
});

builder.objectType(MatchEventRef, {
    fields: (t) => ({
        fixtureId: t.exposeInt('fixtureId', {
            description:
                'External API-Football fixture ID this event belongs to. Used to correlate events fetched directly from the upstream provider.',
        }),
        teamId: t.exposeInt('teamId', {
            description:
                'External API-Football team ID for the team involved in this event. Cross-reference with Team.sourceId to resolve the internal team.',
        }),
        playerName: t.exposeString('playerName', {
            nullable: true,
            description:
                'Display name of the player involved (e.g. "M. Salah"). Null for impersonal events.',
        }),
        playerSourceId: t.exposeInt('playerSourceId', {
            nullable: true,
            description:
                'External API-Football player ID for the player who performed this event (goal, card, sub). Null for events without a specific player.',
        }),
        playerId: t.exposeString('playerId', {
            nullable: true,
            description:
                'Internal UUID of the player, if resolved from the players table. May be null if the player has not been imported yet.',
        }),
        assistName: t.exposeString('assistName', {
            nullable: true,
            description: 'Display name of the assisting player, if applicable.',
        }),
        assistSourceId: t.exposeInt('assistSourceId', {
            nullable: true,
            description:
                'External API-Football player ID for the player who provided the assist, if applicable.',
        }),
        type: t.exposeString('type', {
            description: 'Event category: "Goal", "Card", "subst", "Var".',
        }),
        detail: t.exposeString('detail', {
            description:
                'Event sub-type. For goals: "Normal Goal", "Penalty", "Own Goal". For cards: "Yellow Card", "Red Card".',
        }),
        comments: t.exposeString('comments', {
            nullable: true,
            description: 'Additional notes from the provider (e.g. "penalty confirmed by VAR").',
        }),
        minute: t.exposeInt('minute', {
            description: 'Match minute when the event occurred (1-indexed from kickoff).',
        }),
        extraMinute: t.exposeInt('extraMinute', {
            nullable: true,
            description: 'Added time minute, if in stoppage time. Null for events in regular time.',
        }),
    }),
});

builder.objectType(PlayerRef, {
    fields: (t) => ({
        id: t.string({
            description:
                'Internal UUID if the player has been imported into the database. Null for on-demand API-fetched players not yet persisted.',
            nullable: true,
            resolve: (parent) => parent.id || null,
        }),
        sourceId: t.exposeInt('sourceId', {
            description:
                'External API-Football player ID. Used to fetch player data on demand via the player query and to resolve match event participants.',
        }),
        name: t.exposeString('name', { description: 'Full display name of the player.' }),
        firstname: t.string({
            nullable: true,
            description: 'Player first name. Null if not reported.',
            resolve: (parent) => playerMeta(parent).firstname ?? null,
        }),
        lastname: t.string({
            nullable: true,
            description: 'Player last name. Null if not reported.',
            resolve: (parent) => playerMeta(parent).lastname ?? null,
        }),
        age: t.int({
            nullable: true,
            description: 'Player age in years. Null if not reported.',
            resolve: (parent) => playerMeta(parent).age ?? null,
        }),
        nationality: t.string({
            nullable: true,
            description: 'Player nationality (e.g. "Egypt"). Null if not reported.',
            resolve: (parent) => playerMeta(parent).nationality ?? null,
        }),
        height: t.string({
            description: 'Player height as a string (e.g. "175 cm"). Null if not reported.',
            nullable: true,
            resolve: (parent) => playerMeta(parent).height ?? null,
        }),
        weight: t.string({
            description: 'Player weight as a string (e.g. "71 kg"). Null if not reported.',
            nullable: true,
            resolve: (parent) => playerMeta(parent).weight ?? null,
        }),
        injured: t.boolean({
            description:
                'Whether the player is currently flagged as injured by the upstream provider.',
            resolve: (parent) => playerMeta(parent).injured ?? false,
        }),
        photo: t.string({
            description:
                'Public URL to the player headshot. Resolved from graphics registry, then upstream.',
            nullable: true,
            resolve: async (parent) => {
                if (parent.id) {
                    try {
                        const url = await graphicsService.resolveUrl(parent.id, 'player');
                        if (url) return url;
                    } catch {
                        /* fall through */
                    }
                }
                return playerMeta(parent).photo ?? null;
            },
        }),
        statistics: t.expose('statistics', {
            type: 'JSON',
            nullable: true,
            description:
                'Season-specific player statistics as raw JSON from the upstream provider (appearances, goals, assists, etc.).',
        }),
    }),
});

builder.objectType(LineupRef, {
    fields: (t) => ({
        teamSourceId: t.exposeInt('teamSourceId', {
            description:
                'External API-Football team ID for this lineup entry. Cross-reference with Team.sourceId to resolve the full team record.',
        }),
        teamName: t.exposeString('teamName', {
            description: 'Display name of the team in this lineup.',
        }),
        teamLogo: t.exposeString('teamLogo', {
            nullable: true,
            description: 'URL to the team logo for this lineup entry.',
        }),
        formation: t.exposeString('formation', {
            nullable: true,
            description: 'Tactical formation string (e.g. "4-3-3"). Null if not reported.',
        }),
        coachName: t.exposeString('coachName', {
            nullable: true,
            description: 'Name of the head coach / manager. Null if not reported.',
        }),
        coachPhoto: t.exposeString('coachPhoto', {
            nullable: true,
            description: 'URL to the coach headshot photo. Null if not available.',
        }),
        startXI: t.expose('startXI', {
            type: [PlayerRef],
            description: 'List of 11 Player objects in the starting lineup.',
        }),
        substitutes: t.expose('substitutes', {
            type: [PlayerRef],
            description: 'List of Player objects on the bench.',
        }),
    }),
});

builder.objectType(RosterEntryRef, {
    description:
        'A player membership in a team for a specific season, with display metadata (jersey number, position) stored in JSONB.',
    fields: (t) => ({
        id: t.exposeString('id', { description: 'UUID of this roster entry.' }),
        teamId: t.exposeString('teamId', {
            description: 'UUID of the team this roster entry belongs to.',
        }),
        playerId: t.exposeString('playerId', { description: 'UUID of the player.' }),
        seasonId: t.exposeString('seasonId', {
            description: 'UUID of the season this roster entry applies to.',
        }),
        squadNumber: t.int({
            nullable: true,
            description: 'Jersey/squad number. Null if not known. Sourced from metadata.',
            resolve: (parent) => {
                const meta = parent.metadata as Record<string, unknown> | null;
                return (meta?.squadNumber as number) ?? null;
            },
        }),
        position: t.string({
            nullable: true,
            description:
                'Position category ("Goalkeeper", "Defender", "Midfielder", "Attacker"). Null if not known. Sourced from metadata.',
            resolve: (parent) => {
                const meta = parent.metadata as Record<string, unknown> | null;
                return (meta?.position as string) ?? null;
            },
        }),
        player: t.field({
            description: 'Full player record for this roster entry.',
            type: PlayerRef,
            resolve: (parent) => ({
                ...parent.player,
                metadata: parent.player.metadata as PlayerMeta | null,
                statistics: undefined,
            }),
        }),
        createdAt: t.expose('createdAt', {
            type: 'DateTime',
            description: 'When this roster entry was first created.',
        }),
        updatedAt: t.expose('updatedAt', {
            type: 'DateTime',
            description: 'When this roster entry was last updated.',
        }),
    }),
});

builder.queryField('leagues', (t) =>
    t.field({
        description: 'Returns all promoted (managed) leagues with their seasons.',
        type: [LeagueRef],
        resolve: async () => {
            return repository.leagues.getLeagues();
        },
    }),
);

builder.queryField('seasons', (t) =>
    t.field({
        description:
            'Returns seasons for a given league, or all seasons if no leagueId is provided. Only returns seasons with imported teams.',
        type: [SeasonRef],
        args: {
            leagueId: t.arg.string({
                required: false,
                description:
                    'Optional UUID of a league. When provided, only returns seasons belonging to that league. Omit to retrieve all seasons across all leagues.',
            }),
        },
        resolve: async (_, { leagueId }) => {
            if (!leagueId) {
                return repository.leagues.getAllInternalSeasons();
            }
            const league = await repository.leagues.getLeagueById(leagueId);
            if (!league) return [];
            return repository.leagues.getInternalSeasons(league.sourceId);
        },
    }),
);

builder.queryField('allSeasons', (t) =>
    t.field({
        description: 'Returns all seasons across all leagues, regardless of team import status.',
        type: [SeasonRef],
        resolve: async () => {
            return repository.leagues.getAllInternalSeasons();
        },
    }),
);

const RankingFormulaRef =
    builder.objectRef<typeof schema.rankingFormulas.$inferSelect>('RankingFormula');

builder.objectType(RankingFormulaRef, {
    fields: (t) => ({
        id: t.exposeString('id', {
            description: 'Unique identifier for this formula (e.g. "standard_pts", "goal_diff").',
        }),
        name: t.exposeString('name', {
            description: 'Human-readable name (e.g. "Points", "Goal Difference").',
        }),
        description: t.exposeString('description', {
            nullable: true,
            description:
                'Optional human-readable explanation of what this ranking formula measures.',
        }),
        logicType: t.exposeString('logicType', {
            description:
                'Machine identifier for the sorting logic (maps to the dataCompiler sort comparators).',
        }),
    }),
});

builder.queryField('rankingFormulas', (t) =>
    t.field({
        description:
            'Returns all available ranking formulas that can be assigned to seasons for standings sorting.',
        type: [RankingFormulaRef],
        resolve: () => repository.leagues.getRankingFormulas(),
    }),
);

builder.queryField('fixtures', (t) =>
    t.field({
        description:
            'Returns all fixtures for the given season. Automatically triggers live polling for any past-due fixtures that have not yet reached a terminal status (played, postponed, cancelled).',
        type: [FixtureRef],
        args: {
            seasonId: t.arg.string({
                required: true,
                description:
                    'UUID of the season whose fixtures to retrieve. Obtain this from the seasons query or from a Season object.',
            }),
            since: t.arg({
                type: 'DateTime',
                required: false,
                description:
                    'ISO-8601 timestamp for delta sync. When provided, only fixtures updated after this timestamp are returned, reducing payload size for incremental refreshes.',
            }),
            forceRefresh: t.arg.boolean({
                required: false,
                description:
                    'When true, bypasses the 5-minute live polling cooldown to immediately re-check past-due fixtures against the upstream API. The atomic lock still prevents concurrent polls.',
            }),
        },
        resolve: async (_, { seasonId, since, forceRefresh }) => {
            return repository.fixtures.getFixturesBySeasonId(
                seasonId,
                since || undefined,
                forceRefresh || undefined,
            );
        },
    }),
);

builder.queryField('fixture', (t) =>
    t.field({
        description:
            'Returns a single fixture by UUID, with full match details available (events, lineups) when requested.',
        type: FixtureRef,
        nullable: true,
        args: {
            id: t.arg.string({
                required: true,
                description:
                    'UUID of the fixture to retrieve. Returns the full fixture record including nested match events and lineups when requested.',
            }),
        },
        resolve: async (_, { id }) => {
            return repository.fixtures.getFixtureById(id);
        },
    }),
);

builder.queryField('venues', (t) =>
    t.field({
        description:
            'Returns all venues that are referenced by at least one fixture in the given season. Venues without any fixtures in the season are excluded.',
        type: [VenueRef],
        args: {
            seasonId: t.arg.string({
                required: true,
                description:
                    'UUID of the season. Only venues linked to fixtures within this season are returned.',
            }),
            since: t.arg({
                type: 'DateTime',
                required: false,
                description:
                    'ISO-8601 timestamp for delta sync. When provided, only venues updated after this timestamp are returned.',
            }),
        },
        resolve: (_, { seasonId, since }) =>
            repository.teams.getVenuesBySeasonId(seasonId, since || undefined),
    }),
);

builder.queryField('teams', (t) =>
    t.field({
        description:
            'Returns teams that participated in a given season by joining through the seasons-to-teams table. If no seasonId is provided, returns all teams in the database regardless of season.',
        type: [TeamRef],
        args: {
            seasonId: t.arg.string({
                required: false,
                description:
                    'Optional UUID of a season. When provided, only teams that participated in that season are returned (via the seasons-to-teams junction table). Omit to retrieve all teams across all seasons.',
            }),
            since: t.arg({
                type: 'DateTime',
                required: false,
                description:
                    'ISO-8601 timestamp for delta sync. When provided, only teams updated after this timestamp are returned, reducing payload size for incremental refreshes.',
            }),
        },
        resolve: async (_, { seasonId, since }) => {
            if (seasonId) {
                return repository.teams.getTeamsBySeasonId(seasonId, since || undefined);
            }
            return repository.teams.getAllTeams();
        },
    }),
);

builder.mutationField('ingestLeagues', (t) =>
    t.field({
        description:
            'Admin only. Refreshes the managed leagues list from the database and invalidates the cache.',
        type: [LeagueRef],
        resolve: async (_root, _args, ctx) => {
            requireAdmin(ctx);
            const result = await repository.leagues.getLeagues();
            cacheService.invalidate('leagues');
            return result;
        },
    }),
);

builder.queryField('player', (t) =>
    t.field({
        description:
            'Fetches a player profile and season statistics. Accepts either an internal UUID (id) or an external API-Football ID (sourceId). If id is provided, the sourceId is resolved from the database.',
        type: PlayerRef,
        nullable: true,
        args: {
            id: t.arg.string({
                required: false,
                description:
                    'Internal UUID of the player. When provided, the external sourceId is resolved automatically from the players table.',
            }),
            sourceId: t.arg.int({
                required: false,
                description:
                    'External API-Football player ID. Required if id is not provided. Used to fetch player data on demand from the external API.',
            }),
            season: t.arg.int({
                required: true,
                description:
                    'Calendar year of the season to retrieve statistics for (e.g. 2025). Player stats vary by season.',
            }),
        },
        resolve: async (_, { id, sourceId, season }) => {
            let resolvedSourceId = sourceId;
            if (id && !resolvedSourceId) {
                const player = await repository.players.getPlayerById(id);
                if (!player) return null;
                resolvedSourceId = player.sourceId;
            }
            if (!resolvedSourceId) return null;
            const data = await repository.players.getPlayerData(resolvedSourceId, season);
            if (!data) return null;
            return { ...data, metadata: data.metadata as PlayerMeta | null };
        },
    }),
);

builder.mutationField('saveLeagueConfig', (t) =>
    t.field({
        description:
            'Admin only. Saves league-level configuration JSON (promotion/relegation/playoff zones).',
        type: LeagueRef,
        args: {
            id: t.arg.string({
                required: true,
                description: 'UUID of the league to update configuration for.',
            }),
            configJson: t.arg.string({
                required: true,
                description:
                    'JSON string containing league-level configuration (e.g. promotion/relegation slot numbers, playoff positions). Replaces the existing metadata entirely.',
            }),
        },
        resolve: async (_, { id, configJson }, ctx) => {
            requireAdmin(ctx);
            let metadata: Record<string, unknown>;
            try {
                metadata = JSON.parse(configJson);
            } catch {
                throw new Error('Invalid JSON configuration');
            }
            const updated = await repository.leagues.updateLeagueConfig(id, metadata);
            cacheService.invalidate('leagues');
            return updated;
        },
    }),
);

builder.mutationField('saveSeasonConfig', (t) =>
    t.field({
        description:
            'Admin only. Saves season-level configuration JSON and optional ranking criteria for standings sorting.',
        type: SeasonRef,
        args: {
            id: t.arg.string({
                required: true,
                description: 'UUID of the season to update configuration for.',
            }),
            configJson: t.arg.string({
                required: true,
                description:
                    'JSON string containing season-level configuration (e.g. promotion zones, deductions). Replaces the existing metadata entirely.',
            }),
            rankingCriteria: t.arg.stringList({
                required: false,
                description:
                    'Ordered list of RankingFormula IDs that define how the standings table is sorted (e.g. ["standard_pts", "goal_diff", "goals_for"]). When provided, stored in the season metadata.',
            }),
        },
        resolve: async (_, { id, configJson, rankingCriteria }, ctx) => {
            requireAdmin(ctx);
            let metadata: Record<string, unknown>;
            try {
                metadata = JSON.parse(configJson);
            } catch {
                throw new Error('Invalid JSON configuration');
            }

            if (rankingCriteria && rankingCriteria.length > 0) {
                metadata.rankingCriteria = rankingCriteria;
            }

            const updated = await repository.leagues.updateSeasonConfig(id, metadata);
            cacheService.invalidate('seasons');
            return updated;
        },
    }),
);

builder.queryField('teamRoster', (t) =>
    t.field({
        description:
            'Returns the squad roster for a team in a given season, including player details and metadata (jersey number, position).',
        type: [RosterEntryRef],
        args: {
            teamId: t.arg.string({ required: true, description: 'UUID of the team.' }),
            seasonId: t.arg.string({ required: true, description: 'UUID of the season.' }),
        },
        resolve: async (_, { teamId, seasonId }) => {
            return repository.teams.getTeamRoster(teamId, seasonId);
        },
    }),
);

builder.mutationField('importSquad', (t) =>
    t.field({
        description:
            'Admin only. Fetches the current squad for a team from the upstream provider and populates roster entries, player records, and source mappings.',
        type: [RosterEntryRef],
        args: {
            teamId: t.arg.string({
                required: true,
                description: 'UUID of the team to import the squad for.',
            }),
            seasonId: t.arg.string({
                required: true,
                description: 'UUID of the season to associate the roster with.',
            }),
        },
        resolve: async (_, { teamId, seasonId }, ctx) => {
            requireAdmin(ctx);
            // Look up the team's sourceId for the provider call
            const team = await repository.teams.getTeamById(teamId);
            if (!team) throw new Error(`Team not found: ${teamId}`);
            await repository.teams.importSquad(teamId, team.sourceId, seasonId);
            // Return the full roster with player joins
            return repository.teams.getTeamRoster(teamId, seasonId);
        },
    }),
);
