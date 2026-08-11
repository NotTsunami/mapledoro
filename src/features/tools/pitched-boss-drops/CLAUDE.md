# Drop Tracker

Display name is **"Drop Tracker"** and the route is `/tools/drop-tracker`. This feature folder keeps the older `pitched-boss-drops` naming; storage lives under `mapledoro_drop_tracker_v1`, which holds live user data, so don't rename it.

**Storage lives under its own localStorage key**, not in the shared `mapledoro_tools_v1` blob with the other global tools. The drop log is an append-only event list with no cap, so keeping it in the shared store made every Daily Tracker toggle and every Boss Crystals re-read parse the player's entire drop history. It is the only global tool that grows without bound; don't move it back.

`readStore` falls back to the legacy `pitchedBossDrops` field inside `mapledoro_tools_v1` and migrates it across on first read, clearing the old copy **only after** the new key has actually persisted (`persistStore` returns false on a swallowed quota failure, and a failed migration simply retries next mount). Keep that fallback: Settings' JSON export is a snapshot of whichever keys existed when it ran, so an old export can still be imported later and needs this path.

Drops are events (`id`, `characterId`, `characterName`, `itemId`, `channel`, `date`, `timestamp`, optional `note`) — not per-character toggles.

`characterID` isn't a reliable unique key — treat `characterName` as canonical identity for display/filtering.

Items live in `pitched-items.ts` as `DROP_ITEMS`, each tagged with a `category` from `DROP_CATEGORIES` (Pitched Boss, Armor Boxes, Ring Boxes, Brilliant Boss Accessory Set, Grindstones, Exceptional Enhancements). Category drives the grouped dropdown and the category filter. Existing pitched `id` slugs are kept stable so already-logged drops still resolve.
