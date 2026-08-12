# Drop Tracker

Display name is **"Drop Tracker"** and the route is `/tools/drop-tracker`. This feature folder keeps the older `pitched-boss-drops` naming; storage lives under `mapledoro_drop_tracker_v1`, which holds live user data, so don't rename it.

**Storage has its own key**, not the shared `mapledoro_tools_v1` blob. The drop log is an uncapped append-only event list, so keeping it there made every Daily Tracker toggle and Boss Crystals re-read parse the player's whole drop history. It is the only global tool that grows without bound; don't move it back.

`readStore` falls back to the legacy `pitchedBossDrops` field inside `mapledoro_tools_v1`, migrating on first read and clearing the old copy **only after** the new key persisted (`persistStore` returns false on a swallowed quota failure; a failed migration retries next mount). Keep that fallback: Settings' JSON export snapshots whichever keys existed when it ran, so an old export can still be imported later.

Drops are events (`id`, `characterId`, `characterName`, `itemId`, `channel`, `date`, `timestamp`, optional `note`) — not per-character toggles.

`characterID` isn't a reliable unique key — treat `characterName` as canonical identity for display/filtering.

Items live in `pitched-items.ts` as `DROP_ITEMS`, each tagged with a `category` from `DROP_CATEGORIES` (Pitched Boss, Armor Boxes, Ring Boxes, Brilliant Boss Accessory Set, Grindstones, Exceptional Enhancements). Category drives the grouped dropdown and the category filter. Existing pitched `id` slugs are kept stable so already-logged drops still resolve.
