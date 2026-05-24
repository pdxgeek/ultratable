/**
 * GraphQL operations + matching TS types for the Tier Lists feature
 * (umbrella #110, editor UI #113). Mirrors the predictions queries
 * conventions — hand-authored types and `gql` template strings live
 * side by side, no codegen.
 */
import { gql } from 'urql';

export interface Tier {
    key: string;
    name: string;
}

export interface TierListDisplayConfig {
    showTeamNames: boolean;
}

export interface TierRankableTypeRef {
    id: string;
    name: string;
}

export interface TierListTeam {
    id: string;
    name: string;
    logo: string | null;
}

export interface TierRankableItem {
    id: string;
    tierKey: string | null;
    position: number;
    naturalKey: string;
    name: string;
    imageUrl: string | null;
    team: TierListTeam | null;
    sourceType: string | null;
    sourceId: string | null;
    nameOverride: string | null;
    imageUrlOverride: string | null;
    subtitle: string | null;
    displayName: string;
    displayImageUrl: string | null;
    addedAt: string;
}

export interface TierListOverviewRow {
    id: string;
    userId: string;
    seasonId: string;
    title: string;
    isLocked: boolean;
    updatedAt: string;
    tierRankableType: TierRankableTypeRef | null;
    items: TierRankableItem[];
}

export interface TierListEditorRow {
    id: string;
    userId: string;
    seasonId: string;
    title: string;
    tiers: Tier[];
    displayConfig: TierListDisplayConfig;
    isLocked: boolean;
    updatedAt: string;
    tierRankableTypeId: string;
    tierRankableType: TierRankableTypeRef | null;
    items: TierRankableItem[];
}

export const TIER_RANKABLE_TYPES_QUERY = gql`
    query TierRankableTypes {
        tierRankableTypes {
            id
            name
        }
    }
`;

export const MY_TIER_LISTS_QUERY = gql`
    query MyTierLists($seasonId: ID!) {
        myTierLists(seasonId: $seasonId) {
            id
            userId
            seasonId
            title
            isLocked
            updatedAt
            tierRankableType {
                id
                name
            }
            items {
                id
            }
        }
    }
`;

const ITEM_FIELDS = `
    id
    tierKey
    position
    naturalKey
    name
    imageUrl
    team {
        id
        name
        logo
    }
    sourceType
    sourceId
    nameOverride
    imageUrlOverride
    subtitle
    displayName
    displayImageUrl
    addedAt
`;

export const TIER_LIST_QUERY = gql`
    query TierList($id: ID!) {
        tierList(id: $id) {
            id
            userId
            seasonId
            title
            tiers { key name }
            displayConfig { showTeamNames }
            isLocked
            updatedAt
            tierRankableTypeId
            tierRankableType { id name }
            items { ${ITEM_FIELDS} }
        }
    }
`;

export const CREATE_TIER_LIST_MUTATION = gql`
    mutation CreateTierList(
        $seasonId: ID!
        $tierRankableTypeId: String!
        $title: String!
    ) {
        createTierList(
            seasonId: $seasonId
            tierRankableTypeId: $tierRankableTypeId
            title: $title
        ) {
            id
        }
    }
`;

export const UPDATE_TIER_LIST_TITLE_MUTATION = gql`
    mutation UpdateTierListTitle($id: ID!, $title: String!) {
        updateTierListTitle(id: $id, title: $title) {
            id
            title
            updatedAt
        }
    }
`;

export const UPDATE_TIER_LIST_TIERS_MUTATION = gql`
    mutation UpdateTierListTiers($id: ID!, $tiers: [TierInput!]!) {
        updateTierListTiers(id: $id, tiers: $tiers) {
            id
            tiers { key name }
            updatedAt
            items { ${ITEM_FIELDS} }
        }
    }
`;

export const UPDATE_TIER_LIST_DISPLAY_CONFIG_MUTATION = gql`
    mutation UpdateTierListDisplayConfig(
        $id: ID!
        $displayConfig: TierListDisplayConfigInput!
    ) {
        updateTierListDisplayConfig(id: $id, displayConfig: $displayConfig) {
            id
            displayConfig { showTeamNames }
            updatedAt
        }
    }
`;

export const SET_TIER_LIST_LOCKED_MUTATION = gql`
    mutation SetTierListLocked($id: ID!, $locked: Boolean!) {
        setTierListLocked(id: $id, locked: $locked) {
            id
            isLocked
            updatedAt
        }
    }
`;

export const DELETE_TIER_LIST_MUTATION = gql`
    mutation DeleteTierList($id: ID!) {
        deleteTierList(id: $id)
    }
`;

export const ADD_TIER_RANKABLE_ITEM_MUTATION = gql`
    mutation AddTierRankableItem($input: AddTierRankableItemInput!) {
        addTierRankableItem(input: $input) {
            ${ITEM_FIELDS}
        }
    }
`;

export const UPDATE_TIER_RANKABLE_ITEM_OVERRIDES_MUTATION = gql`
    mutation UpdateTierRankableItemOverrides(
        $input: UpdateTierRankableItemOverridesInput!
    ) {
        updateTierRankableItemOverrides(input: $input) {
            id
            nameOverride
            imageUrlOverride
            subtitle
            displayName
            displayImageUrl
        }
    }
`;

export const REMOVE_TIER_RANKABLE_ITEM_MUTATION = gql`
    mutation RemoveTierRankableItem($itemId: ID!) {
        removeTierRankableItem(itemId: $itemId)
    }
`;

export const MOVE_TIER_RANKABLE_ITEM_MUTATION = gql`
    mutation MoveTierRankableItem(
        $itemId: ID!
        $tierKey: String
        $position: Float!
    ) {
        moveTierRankableItem(itemId: $itemId, tierKey: $tierKey, position: $position) {
            id
            tierKey
            position
        }
    }
`;

// ----------------------------------------------------------------------
// Pool source queries — feed the recipe-driven add drawers
// ----------------------------------------------------------------------

export interface CoachDrawerLineup {
    teamSourceId: number;
    coachName: string | null;
    coachPhoto: string | null;
}

export interface CoachDrawerFixture {
    id: string;
    lineups: CoachDrawerLineup[];
}

export interface CoachDrawerTeam {
    id: string;
    name: string;
    logo: string | null;
    sourceId: number;
    metadata: { sourceName: string } | null;
}

/**
 * Coach drawer source. Pulls every fixture in the active season with
 * lineups + the season's teams (so the client can resolve
 * `lineup.teamSourceId` → local `team.id`). Coach uniqueness is
 * computed client-side as `(teamId, lowercased name)` to mirror the
 * server's coach recipe natural key.
 */
export const COACH_DRAWER_SOURCES_QUERY = gql`
    query CoachDrawerSources($seasonId: String!) {
        fixtures(seasonId: $seasonId) {
            id
            lineups {
                teamSourceId
                coachName
                coachPhoto
            }
        }
        teams(seasonId: $seasonId) {
            id
            name
            logo
            sourceId
            metadata { sourceName }
        }
    }
`;

export interface VenueDrawerVenue {
    id: string;
    name: string;
    city: string | null;
    capacity: number | null;
    image: string | null;
}

/** Venue drawer source. Returns every venue used by a fixture in the season. */
export const VENUE_DRAWER_SOURCES_QUERY = gql`
    query VenueDrawerSources($seasonId: String!) {
        venues(seasonId: $seasonId) {
            id
            name
            city
            capacity
            image
        }
    }
`;
