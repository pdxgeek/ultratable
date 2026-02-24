# 🚨 AI AGENT ARCHITECTURE GUIDE
 **NEVER TAKE CONTROL OF A BROWSER FOR VERIFYING UNLESS CLEARLY ASKED**
 
> [!IMPORTANT]
> **DIRECTORY ISOLATION RULES**
> - **Legacy Reference**: `/src` contains the original demo/reference implementation. **NEVER TOUCH OR MODIFY /src**. It is for reference only.
> - **Active Development**: All new projects, backends, and frontends live under `/apps/`.
> - **BFF (Back-end for Front-end)**: We are building a new GraphQL service in `/apps/service`.
> - **Rewriting Strategy**: When building new frontends, we use `/src` as a blueprint but rewrite it from scratch in a new `/apps/[app-name]` directory.
>
> **ID GENERATION RULES**
> - **EVERY ID IS A NANOID EXCEPT FOR DIRECT CALLS TO REMOTE APIS**
> - **IF YOU ARE NOT DOING NANO IDS AND YOU ARE NOT CALLING A REMOTE API YOU ARE DOING IT WRONG**

This document is **CRITICAL** for any AI agent working on UltraTable. Read this before touching the ID system or data layer.

## 1. The ID Philosophy
UltraTable uses a **Dual-ID System**. Never assume an ID from an API is our primary key.

### Internal IDs (NanoID)
- **Format**: Random strings (e.g., `OoUys7Gd0dwZcz8QfKdKK`).
- **Owner**: UltraTable Domain Store.
- **Persistence**: These are the primary keys in `db.teams`, `db.fixtures`, and `db.leagues_v2`.
- **Purpose**: They allow us to delete, recreate, and re-import data without colliding with old state. If a league is deleted and recreated, it MUST get a new NanoID.

### External/Remote IDs
- **Format**: Provider-specific (e.g., API-Football League ID `40`).
- **Owner**: The Provider (API-Football, etc.).
- **Storage**: Stored in `externalReferences` arrays on entities and in the `mappings` table.
- **Purpose**: Only used for fetching data from upstream.

---

## 2. The ID Resolution Flow
When you have a Remote ID (like `40`) and you need the internal database entities:

1. **Check Mappings**: Use `database.getInternalId(provider, type, remoteId)`.
2. **Handle Failure**: If no mapping exists, you are likely importing new data.
3. **Hierarchy**: In the new hierarchical model, `League` has an ID, and `LeagueSeason` has its own ID. Always check `RESOLVE_LEAGUE_ID` in `apiFootball.ts` to see how we pivot from NanoIDs to real API IDs.

---

## 3. The Cache Isolation Pattern
**CRITICAL**: We maintain a strict separation between Raw API data and Mapped Domain data.

### Raw API Cache (`apiGet`)
- **Key Format**: `[endpoint]_[remoteId]_[season]` (e.g., `fixtures_40_2025`).
- **Data**: Raw JSON directly from the provider.
- **Utility**: Managed by `apiGet` in `client.ts`.

### Domain List Cache (`saveFixtures` / `saveTeams`)
- **Key Format**: `domain_[type]_[internalId]` (e.g., `domain_fixtures_OoUys7Gd0dwZcz8QfKdKK`).
- **Data**: Arrays of **mapped internal objects** (with NanoIDs).
- **Utility**: Managed by `database` in `db.ts`.

> [!IMPORTANT]
> **Domain Cache MUST be keyed by Internal NanoIDs**. 
> This ensures that if a league/season is deleted and recreated (getting a new NanoID), the domain cache is automatically "cleared" for that instance.

---

## 4. Lifecycle & Recreation
Because Domain Data is keyed by **Internal IDs**, recreating a league provides a 100% clean state for the UI.
However, because Raw Data is keyed by **Remote IDs**, we can still hit the `apiGet` cache and avoid unnecessary network calls if the remote data is still valid. 

This is the **Safe Isolation Pattern**:
1. `apiGet` stores what the WORLD says about league 40.
2. `db.saveFixtures` stores what YOUR APP says about internal season X.
3. They never touch. No collisions. No bullshit.
