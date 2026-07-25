# EXP Calculator

Each tab persists per-character under its own tool key via `characterToolStorage.ts`; Resources
stays in memory.

- `expFarming` (`SavedExpState`): buff selections, target level, hourly kill count.
- `expDailyWeekly` (`SavedAllInOne`): the Daily / Weekly / Monster Park / Epic Dungeon panels, plus
  target level, burning, and the date window.

**Never persist derived values.** Character level and current EXP percent come from the character
record; monster level and base EXP come from the monster. `expFarming` saves the monster's `key`
only (`monsterKey`) and rehydrates level/EXP from `EXP_MONSTERS`. Event tickets, growth potions,
Punch King, and Double Up reset each visit by design.

**Writes go through the `updateBuffs` / `updateSavedMonsterField` / `updateInput` wrappers**, which
write inside the state updater and no-op with no character selected (Manual Level is never saved).
Calling raw `setBuffs` / `setMonster` / `setInput` from a handler silently skips the write.

**Character selection** flushes the outgoing character, then loads the incoming one through
`mergeSavedExpState` / `mergeSavedAllInOne` so ids added after a save still get a default. Both tabs
open on the roster main (`selectMainCharacter`), falling back to Manual Level.
`loadCharacterState` / `loadCharacterAllInOne` serve both the mount seed and the dropdown so the
paths can't drift; the seed runs in a lazy `useState` initializer and **must not write**. Selecting a
character auto-fills level and EXP percent and disables those inputs. `mergeSavedAllInOne` drops a
saved date window whose end has passed, falling back to today +27 days.

**Farming → Daily/Weekly import** is a one-shot handoff through `imported` (an `ImportedFarmingRate`)
on the workspace, because tabs unmount when hidden. Farming stashes its hourly rate, Daily/Weekly
seeds `customDailyMode: "hourly"` from it, and `changeTab` **spends it on the way out**. Skipping the spend re-seeds on a
later visit and stomps the player's setting. The handoff carries the Farming tab's `charName` (null
for Manual Level, a real selection that must not fall back to the main) and Daily/Weekly opens on
that character. `importHourlyExp` also writes the rate through `persistImportedHourlyExp`, which
cannot move into the lazy seed. Custom Daily is either a flat figure (`customDailyExp`) or a rate
(`customHourlyExp` x `customHoursPerDay`), resolved by `customDailyExp()` in the data module.

**Monster search is local-only** — use `exp-monsters.ts`, never a runtime API. Rows are
`[id, name, level, exp, mapId]`; `id` must render through `MobSprite`, `name` is the GMS display
name. `ExpMonster.key` comes from row position because several source mobs intentionally collapse to
one display mob. Unsearched, the dropdown orders by distance from the player's level; **search
results stay in source order**.

**Buff rules:**
- Tile-rendered select buffs (`TILE_SELECT_IDS`) store the option *value* in `buffs.selects` like
  every other select buff; only the input surface maps level to value. The two EXP nodestone tiles (Mapae +33%,
  Roro +10%) are exclusive toggles over one shared `exp-node` value.
- `IconLevelTile` is the shared icon + stepper tile; `SelectLevelTile` wraps it for select buffs, and
  Daily/Weekly uses it directly for weekly run counts (0-3).
- Mutually exclusive: EXP Accumulation Potion vs Small Concentrated; MVP 50% vs MVP 70%.
- Rune inputs are deliberately simplified to Rune Persistence (Evan link) plus Rune Day. Don't add
  full-uptime rune scenarios.
- Roll of the Dice shows only with no character selected or a job in `ROLL_OF_THE_DICE_JOBS` (all
  pirates); selecting a non-pirate zeroes and saves the buff so a stale value can't survive.

**EXP tables:** `BASE_MONSTER_EXP_ARCANE` / `BASE_MONSTER_EXP_GRANDIS` are base monster EXP per character
level (200-259, 260-299). Champion Double Up (3.5x), Haste Fever Time (7x), and Express Booster all
derive from them, so keep them as one shared pair. Express Booster steps by level band off Grandis
and stops scaling past Lv. 294; the Lv. 265 value is measured, not band-fit, and the post-294 flatten
is real. These event resources take no EXP buffs, which is why they live in `RESOURCE_TABLES` and
apply through `applyResourceUnits`. Haste Fever Time is reference-only, with no Daily/Weekly input
yet.

**Monster Park / Epic Dungeon:** `MONSTER_PARK_OPTIONS` is ordered by EXP, so the dungeon a player
would actually run is the last entry whose `minLevel` they meet. `monsterParkId` is a pin and `""`
means that auto-pick; `resolveMonsterPark` falls back to auto when a pin is out of reach so a stale
save can't zero out the EXP. Entry levels are the game's real gates (Arcana is 230). Epic Dungeon EXP
is `base x dungeon.baseMultiplier x reward multiplier x epicDungeonExpMultiplier`, the last being the
event rate (1x to 4x) typed as a number because it changes every event.

**`effectiveInput` overrides are never written back**, since the same plan is reused across
characters and clobbering a stored pick would lose it: Heroic worlds pin `epicDungeonMultiplier` to 1
(world class from `worldServerType`, which counts Solis as Heroic), and level 270+ blanks
`burningType`.

**Daily content tiles are deliberately not level-gated** — a plan can carry the character past an
unlock inside the window, so tiles stay selectable and `selectedDailyExp` skips a daily per simulated
day until the level is reached.

GMS naming: Penance Ring → Ring of Torment, Ring of Clan → Kinship Ring (keep Ring of Clan
semantics), Authentic → Sacred Symbols, Grand Authentic → Grand Sacred Symbols, Champion's Protection
→ Champion's Renown, Lucky Dice → Roll of the Dice. Penance/Cash Shop modifiers sit under Reg Server
Modifiers; the only Cash Shop coupon is 2x, applying through level 250.
