# Daily Tracker

**Storage:** the `dailies` key in the global tools store. Since v2 this is an ordered
`DailyCharacter[]` (`{ name, state }`) the user builds manually and can drag to reorder, mirroring
Boss Crystals. `migrate()` upgrades the v1 shape (unordered `Record<characterName, state>`).

**Manual-add flow:** characters come from the shared two-step dialog (`AddCharacterNameDialog` →
`DailiesSelectionDialog`), not auto-listed from the character store. Shared pieces with Boss Crystals
live in `../`: `AddCharacterNameDialog`, `AddCharacterCard`, `useCardReorder` (which also exports
`moveInArray`). A card's avatar / level / job / world are looked up **live** by name (`getStoreChar`);
a typed name with no match just shows the name.

**Selection model:** cards start empty and only selected tasks render or count toward progress.
Sections with no selections are hidden.

**World-scoped counter cap:** counter tasks have a per-character `max` and an optional shared
`worldMax` (defaulting to `max`). Monster Park is 7 per character but 14 per world; Maple Tour is 7
for both. The cap is enforced across characters sharing a world, with world identity from the live
store record; typed characters with no match get a private bucket (`worldKeyOf`). `setCounter` clamps
to the smaller of `max` and the remaining world room. `CounterRow` disables `+` at either cap and
shows the shared-world line only when the cap is genuinely shared (`worldMax > max`) and the character
maps to a store world, so typed characters show `value/max` alone.

**Daily reset:** compares `lastResetDay` against `utcDateStr()` (UTC midnight), clearing task check
state but preserving `selected`. Runs on load and every 60s.

**Reminders:** `RemindersConfigBar` writes to the shared reminders store (`src/lib/reminders.ts`) that
the home `RemindersPanel` reads.
