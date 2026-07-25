# Drop Tracker

Display name is **"Drop Tracker"** and the route is `/tools/drop-tracker`. This feature folder and the `pitchedBossDrops` localStorage key keep the older `pitched-boss-drops` naming — the key holds live user data, so don't rename it.

Drops are events (`id`, `characterId`, `characterName`, `itemId`, `channel`, `date`, `timestamp`, optional `note`) — not per-character toggles.

`characterID` isn't a reliable unique key — treat `characterName` as canonical identity for display/filtering.

Items live in `pitched-items.ts` as `DROP_ITEMS`, each tagged with a `category` from `DROP_CATEGORIES` (Pitched Boss, Armor Boxes, Ring Boxes, Brilliant Boss Accessory Set, Grindstones, Exceptional Enhancements). Category drives the grouped dropdown and the category filter. Existing pitched `id` slugs are kept stable so already-logged drops still resolve.
