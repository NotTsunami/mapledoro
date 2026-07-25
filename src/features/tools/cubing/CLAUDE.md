# Cubing Calculator

Stateless probability calculator: no localStorage, no `useMounted()` gate. Results recompute live
from the form via `useDeferredValue`, so there is no Calculate button and a result can never describe
a stale form.

**Invariants:**
- **Tier options come from the rate tables** — `availableDesiredTiers()` filters `cubeRates.lookup`,
  so Desired Tier can only offer tiers the cube has data for (Occult: Rare/Epic, Master: Epic/Unique,
  Meister/Red/Black: Unique/Legendary). This keeps `getProbability` from missing its lookup,
  returning 0, and driving `geoDistrQuantile` to Infinity. Available tiers per cube are contiguous,
  so first and last bound the range; Current Tier then offers everything at or below the desired
  tier, and `TIER_RATES` covers every step in that range for every cube.
- **`geoDistrQuantile` rejects both ends** — callers must reject `p <= 0` (no finite answer); `p >= 1`
  is clamped to one cube inside, since `log(0)` is -Infinity and a summed probability can land a hair
  above 1.
- **Stat option amounts must be positive** — a `+0` target (e.g. `percAtt+0` from a Rare prime line of
  3%) matches every roll and forces `p` to 1. `get2LAtkAmounts` and `get3LAtkAmounts` filter it out.
- **Double Miracle Time is Red and Black only** (`DMT_CUBES`) and affects tier-ups only, so the toggle
  is disabled for other cubes and when current tier equals desired; the reducer clears the flag on
  cube change.
- **Desired stat survives level edits** — `withValidDesiredStat` checks the option list, never the
  level's validity, because a level typed one digit at a time passes through out-of-range values.
  Crossing level 160 legitimately invalidates exact-amount options (every line amount shifts by 1%).
- **Special-line limits** — `MAX_CATEGORY_COUNT` caps how often IED / Boss / Drop / Decent Skill can
  appear across 3 lines; the engine adjusts line 2/3 probabilities accordingly.
- **Level 160+ adjustment** — Stat/ATT/HP values get +1% at calculation time, not baked into data.
- **Item type aliases** — UI "Accessory" maps to data key `ring`, "Badge" to `heart`.

Desired Stat labels sit in a native `<select>`, which can neither wrap nor truncate: keep them terse
("Meso%" not "Mesos Obtained%") and keep the field spanning the full form row.

Rate data comes from `brendonmay.github.io`, pre-processed into `{ tables, lookup }` in
`cubing-data.ts`.
