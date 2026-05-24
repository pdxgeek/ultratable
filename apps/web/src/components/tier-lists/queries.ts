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
// Pool-candidate query — feeds the recipe-driven add drawer
// ----------------------------------------------------------------------

export interface TierRankableItemCandidate {
    tierRankableTypeId: string;
    naturalKey: string;
    name: string;
    imageUrl: string | null;
    teamId: string | null;
    sourceType: string | null;
    sourceId: string | null;
    sourcePath: unknown | null;
    subtitle: string | null;
    team: {
        id: string;
        name: string;
        logo: string | null;
    } | null;
}

/**
 * Server-side discovery for pool candidates. The server walks the
 * recipe's source data (lineups for coach, venues for venue) and
 * returns ready-to-submit projections — the drawer doesn't need to
 * fetch fixtures + lineups + teams and stitch them together. Bounded
 * upstream calls + result caching live on the server.
 */
export const TIER_RANKABLE_ITEM_CANDIDATES_QUERY = gql`
    query TierRankableItemCandidates(
        $seasonId: ID!
        $tierRankableTypeId: String!
    ) {
        tierRankableItemCandidates(
            seasonId: $seasonId
            tierRankableTypeId: $tierRankableTypeId
        ) {
            tierRankableTypeId
            naturalKey
            name
            imageUrl
            teamId
            sourceType
            sourceId
            sourcePath
            subtitle
            team {
                id
                name
                logo
            }
        }
    }
`;
