# Mystic Frontier Solver

Calculator for the Mystic Frontier dice event: one calculator, no roster / optimizer / OCR scanner.

**Waves:** a character has 3 waves (lineup presets) picked from a dropdown, each with its own 3 slots
and target score (up to 9 familiars per character). The active wave drives all scoring and reroll
output. Bonus items are per character and shared across waves.

**Lineup:** each slot is a familiar (`familiarId`), a **rarity**, **one** Mystic Frontier potential
line, and a rolled **die**. The MF potential is separate from the two regular potential lines in the
character setup flow. Rarity is the familiar's inventory grade, independent of the familiar, and sets
die size: Common d3, Rare d4, Epic d5, Unique/Legendary d6 (`MF_RARITY_DICE`). The potential pool is
rarity-specific, so changing rarity clears a line that the new rarity can't hold.

**Prepatch Epic lines:** familiars obtained before the Mystic Frontier patch could roll Epic
potential lines at Unique grade, and such a line survives an upgrade to Legendary, so the
Unique/Legendary pools include the Epic lines as well (`poolRarities` in `potentialEngine.ts`, which
also keeps an Epic line alive across a Unique ↔ Legendary switch). The game flags that combination
with a purple corner notch; `isPrepatchEpicLine` drives the matching notch on the slot card.

**Type & element are never stored** — always derived from `FAMILIAR_TRAITS[familiarId]`
(`familiarTraits.ts`, re-exported through `familiars.ts`).

**Bonus items** (`bonusItemsData.ts`): stored as a flat list of item ids, with no per-family limit
(you can hold a White and a Blue Swift-Rolling Dice at once). All equipped items apply to every roll
and stack. Legacy one-color-per-family saves migrate in `parseBonus`.

**Scoring (`calc.ts`):** `finalResult = floor((diceSum + totalFlat) x totalMult)` where **`totalMult`
is the SUM of all active multiplier components** (`+1.2x` and `+1.4x` give x2.6, additive not
chained). No active multiplier means an implicit x1.

**Potentials (`potentialsData.ts` + `potentialEngine.ts`):** a potential's effect is fully determined
by its `params` (`add`/`sub` to flat dice total, `mul` to an additive Final Multiplier component).
The **condition** is the leading clause of the template, up to the first comma, matched by a flat
matcher table. Two special cases:
- **"+x% chance to roll ..." lines are informational** — they change roll odds, not the score of a
  fixed roll, so they contribute 0/0 and never show as active. Still selectable.
- **"Prevents dice from rolling over N"** always applies its multiplier and caps every die at N. The
  cap is computed in the hook and clamps both stored die values and the reroll search range
  (`globalDiceCap` / `effectiveMaxDie`).

**Generated data:** `familiarsData.ts`, `familiarTraits.ts`, `potentialsData.ts`, and
`bonusItemsData.ts` come from `manifests/v269/{familiar,familiar-potentials,item}.json`. Re-derive
with a script if the manifest version changes; never hand-edit the entry lists. `MfPotentialDef`
deliberately widens `rarity` to `string` and `params` to an index signature (see that file's header
for why); consumers narrow `rarity` back to `MfRarity`. Manifest familiar types are normalized to MF
wording at generation time: `Fish → Aquatic`, `Nymph → Fairy`, `Machine → Mechanical`, matching the
potential condition text. Elements are unchanged.

**Persistence (per-character):** the full solver state (`waves[]`, shared `bonus`, `activeWave`) is
stored under the `mysticFrontier` key via `usePerCharacterToolState` (`../usePerCharacterToolState.ts`),
which owns the character list, the load/save wiring, and the `?character=` / world-Main seed. The
workspace exposes it through a `CharacterSyncPanel`. With no character selected, edits are ephemeral. Legacy pre-wave saves (`{slots, target}`) migrate into
wave 1 via `parseState`.
