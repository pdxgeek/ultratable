# 🚨 AI AGENT ARCHITECTURE GUIDE
 **NEVER TAKE CONTROL OF A BROWSER FOR VERIFYING UNLESS CLEARLY ASKED**
 
> [!IMPORTANT]
> **DIRECTORY ISOLATION RULES**
> - **🚨 CRITICAL 🚨**: THE `/src` DIRECTORY IS THE OLD LEGACY ARCHITECTURE. **NEVER TOUCH OR MODIFY `/src` FIRST**. IT IS STRICTLY FOR HISTORICAL REFERENCE ONLY!
> - **Active Development**: All new projects, backends, and frontends live EXCLUSIVELY under the `/apps/` directory.
> - **BFF (Back-end for Front-end)**: We are currently building a new GraphQL service and Postgres database in `/apps/service`.
> - **Rewriting Strategy**: When building new frontends, we use `/src` as a blueprint but rewrite it natively from scratch in a new `/apps/[app-name]` directory.
>
> **ID GENERATION RULES**
> - **EVERY ID IS A NATIVE POSTGRES UUID EXCEPT FOR DIRECT CALLS TO REMOTE APIS**. 
> - **NANOIDS WERE USED IN THE LEGACY SYSTEM BUT HAVE BEEN REPLACED BY `uuid().defaultRandom()` IN DRIZZLE ORM**.

This document is **CRITICAL** for any AI agent working on UltraTable. Read this before touching the ID system or data layer.

## 1. The ID Philosophy
UltraTable uses a **Dual-ID System**. Never assume an ID from an API is our primary key.

### Internal IDs (Postgres UUID)
- **Format**: Standard UUID v4 strings.
- **Owner**: UltraTable PostgreSQL Database.
- **Persistence**: These are the primary keys generated automatically by Drizzle ORM in our Postgres tables across all schemas.
- **Purpose**: They allow us to delete, recreate, and re-import data without colliding with old state. If a league is deleted and recreated, it MUST get a new UUID.

### External/Remote IDs
- **Format**: Provider-specific (e.g., API-Football League ID `40`).
- **Owner**: The Provider (API-Football, etc.).
- **Storage**: Stored in `source_id` columns on catalog tables.
- **Purpose**: Only used for fetching data from upstream.

---

## 2. The ID Resolution Flow
When you have a Remote ID (like `40`) and you need the internal database entities:

1. **Check Mappings**: Use `database.getInternalId(provider, type, remoteId)`.
2. **Handle Failure**: If no mapping exists, you are likely importing new data.
3. **Hierarchy**: In the new hierarchical model, `League` has an ID, and `LeagueSeason` has its own ID. Always be careful to map local UUIDs effectively to their external sources.

---

## 3. The Cache Isolation Pattern
**CRITICAL**: We maintain a strict separation between Raw API data and Mapped Domain data.

### Raw API Cache (`apiGet`)
- **Key Format**: `[endpoint]_[remoteId]_[season]` (e.g., `fixtures_40_2025`).
- **Data**: Raw JSON directly from the provider.
- **Utility**: Managed by `apiGet` in `client.ts`.

### Domain List Cache (`saveFixtures` / `saveTeams`)
- **Key Format**: `domain_[type]_[internalId]` (e.g., `domain_fixtures_123e4567-e89b-12d3-a456-426614174000`).
- **Data**: Arrays of **mapped internal objects** (with UUIDs).
- **Utility**: Managed by `database` in `db.ts`.

> [!IMPORTANT]
> **Domain Cache MUST be keyed by Internal UUIDs**. 
> This ensures that if a league/season is deleted and recreated (getting a new UUID), the domain cache is automatically "cleared" for that instance.

---

## 4. Lifecycle & Recreation
Because Domain Data is keyed by **Internal UUIDs**, recreating a league provides a 100% clean state for the UI.
However, because Raw Data is keyed by **Remote IDs**, we can still hit the `apiGet` cache and avoid unnecessary network calls if the remote data is still valid. 

This is the **Safe Isolation Pattern**:
1. `apiGet` stores what the WORLD says about league 40.
2. `db.saveFixtures` stores what YOUR APP says about internal season X.
3. They never touch. No collisions. No bullshit.

---

## 5. Architecture & Design Principles
You must strictly adhere to the following coding standards when working on this project:

- **Library over Bespoke**: Always prefer well-tested, widely-used community libraries instead of writing custom bespoke utility code (e.g., using `winston` instead of homemade logging, or standard packages for queueing/hashing).
- **Dependency Inversion**: Put data input and output operations behind cleanly defined interfaces. Storage and Database modules should be swappable with minimal churn elsewhere in the application.
- **SOLID & DRY**: Follow SOLID design principles. Do not repeat code. Write functional code wherever possible.
- **Maintainability**: Use exceptional naming conventions. Avoid creating giant code blocks or monolith files. Break complex logic into smaller, testable modules.
- **Performance**: Always be concerned about performance and memory overhead. Explicitly call out any discovered optimization opportunities to the repository owner.

---

## 6. AI Agent Operational Rules
- **Keep It Tight (Small & Modular)**: DO NOT build massive "God Components" (like a 1700-line `App.tsx`). Break your code down into small, focused, and independently testable components. This saves context memory, prevents hallucination, makes patching code much safer, and enforces strict type boundaries (via component props).
- **Token Efficiency**: Do NOT waste tokens doing massive, expensive architectural operations or gigantic refactors that simple instructions to the Owner (David) could accomplish. 
- **Ask First**: If a task requires manipulating hundreds of files or executing a convoluted process, write a short, clear prompt for the owner to run natively instead of blowing through the context window.
