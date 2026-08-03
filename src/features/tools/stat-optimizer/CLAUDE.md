# Stat Optimizer

Bossing-only optimizer with two modes (Hyper Stat, HEXA Stat) that are **exact
ports of maplescouter.com's optimizer** (algorithms, tables, and damage kernel
were reverse-engineered from its production bundle and behaviorally verified
against the live site). Works **standalone**: state is always present, blank by
default (`emptyCharacterSeed`), autopopulated when a stored character is picked.
Edits live in memory only and are intentionally **not persisted**.

## Damage kernel (`damage-formula.ts`, scouter's `A`/n8/Ng/gt/h2/_M/VQ)
`computeScouterDamage` = statFactor × attack × critBucket × dmgBucket × iedBucket.
Only ratios between two evaluations matter (final damage / skill % cancel), but
the buckets contain scouter's per-class passive constants (`scouter-class-data.ts`,
vendored from their GMS table) because additive constants inside a bucket change
marginal values and therefore recommendations.

- Stat inputs are the in-game tooltip triple; a stat's total is
  `floor(base * (1 + %/100)) + %NotApplied` (the last is a FLAT amount).
- **statFactor** `(4*main + sub)/100` (Xenon: `(4*main + (sub + sub2)*4)/100`;
  Demon Avenger: HP-based `floor(x/3.5) + 0.8*floor((HP-x)/3.5) + sub`,
  `x = 90*level + 545`). A level term `dpmMainStat*(5*level+18)` sits inside the
  main stat base.
- **attack** `(base + 20 + dpmAtk + Δatk) * (1 + (atk% + dpmAtkPer)/100) + flat` —
  the flat `+20` is always present on the live site; added ATT from hyper/HEXA
  lands inside the multiplied base. Added main/sub stat lands in the flat bucket
  (the game puts it in "% Not Applied").
- **critBucket** `(1-cr) + cr*(1.35 + critDmg%)`, **rounded to 4 decimals** like
  the site; `cr = min(1, critRate/100)`. HEXA evaluations force `cr = 1`.
- **dmgBucket** `1 + (dmg% + boss% + dpmBossDmg + Δ)/100`.
- **iedBucket** `1 - PDR%*(1 - ied)/100`; sources stack multiplicatively with
  scouter's exact stack/un-stack arithmetic (`stackIedSources`/`applyIed`,
  including their odd mixed-sign combine). `dpmIgnoreGuard` is stacked in.
- Boss PDR is an editable input (`ENDGAME_BOSS_PDR` = 300; scouter offers 50-380).

## Strip-then-optimize
Stored character stats are displayed totals that already include the current
hyper/HEXA allocation, so each optimizer strips the current (editable)
allocation via negative kernel deltas, then re-optimizes. Scouter applies the
candidate's IED stack and the strip as two sequential operations — preserved
(`KernelDelta.ied` then `.iedStrip`). If the allocation is untracked the gain is
overstated; the workspace warns and lets the user type it in.

## Hyper Stat (scouter's greedy, `hyper-stat-engine.ts`)
Candidates in scouter's order: main stat, **secondary stat**, secondary II (only
Dual Blade / Shadower / Cadena / Xenon), ATT, boss, damage, crit damage, crit
rate, ignore DEF. Each step scores +1 level per line as
`0.998*(gain/stepCost) + 0.002*gain` with heuristic discounts ×0.9 on ignore DEF
and ×0.5 on the secondary line; best affordable line wins (strict `>`, so ties go
to the earlier line in the list); cap 15. Demon Avenger's main line is HP%
(2%/level) into the % bucket, with scouter's exact strip quirk (removed from both
the % and ×21 flat buckets). If the greedy scores below the current allocation,
the current one is kept and reported as `alreadyOptimal`. Points budget seeds
from `availableHyperPoints(level)` (scouter's closed form, 1699 at 300) minus
points the stored preset spends on untracked lines (HP, Arcane Power, ...).
There is no separate budget input: the workspace's level field (disabled while
a stored character is selected) recomputes the budget from the closed form on
edit, so the untracked-line deduction survives only for stored characters.

## HEXA Stat (scouter's per-line greedy, `hexa-stat-engine.ts`)
Levels are fixed (RNG-rolled in-game); only the stat TYPE per line is assigned.
**All six types are candidates** (main stat, ATT, boss, crit damage, damage,
ignore DEF — order matters for ties). Lines from all unlocked cores are sorted by
their Boss Damage value at their level (descending, additional-before-primary on
ties) and assigned greedily: each takes the type with the highest full-kernel
damage subject to the cross-core rules (a type on ≤1 primary line, ≤2 additional
lines, once per core). Crit rate forced to 100% during evaluation (site
behavior). The greedy is **not exhaustive**: when the player's current setup is
globally optimal the greedy usually lands a hair below it, the result is
reverted, and `alreadyOptimal` is reported — this is exactly how the live site
produces its "already optimized" answer (verified with a real endgame Kanna).
Xenon: candidate evaluations convert main stat to 0.48× All Stats; the final gain
evaluation intentionally reproduces the site's bug of skipping that conversion.

## Class handling
`resolveClassDamageProfile` prefers the vendored scouter table (main/sub/sub2 +
dpm constants); unlisted classes fall back to `classSkillData` requiredStats and
zero constants. Xenon: STR main / DEX sub / LUK sub2, tri-stat hyper lines.
Demon Avenger: HP main / STR sub.

## Matching maplescouter exactly
Given identical inputs, recommendations match the live site. The `dpm*` class
constants must be refreshed if scouter rebalances its class data.

Both modes need this equally. Scouter's HEXA optimizer (`async function G` in the
optimizer chunk) is called as `G(userStat, calculatedData.myClassData, ...)` and
evaluates candidates through the same kernel `A` the hyper path uses, differing
only by the mode string (`"Hexa"` vs `"Hyper"`). `specEfficiency` appears nowhere
in that chunk: it's a *derived* table computed in the store module from the same
buffed state, which is exactly why inverting it recovers the buckets. So neither
optimizer reads the efficiency table, and both need the same calibration; the
kernel is shared, so `optimizeHexa` takes the same `KernelCalibration`.

**Buffed-state calibration (`scouter-calibration.ts`).** Our stat inputs are the
in-game stat window, which is unbuffed, while scouter optimizes a fully-buffed
bossing state (link skills, noblesse/potion settings, Champion's Renown, seed-ring
uptime). Those are all additive constants inside the same buckets, so the entire
gap is one offset per bucket, and each bucket's size is exactly what one field of
scouter's own `specEfficiency` table reports (`eff = d(bucket)/bucket` inverts to
the bucket). `calibrateFromSpecEfficiency` solves those offsets from the character's
cached Scouter entry (`peekScouterCache`, cache-only, no network call) into a
`KernelCalibration` the kernel adds alongside `dpm*`. All-zero = the raw stat
window, which is also the fallback whenever there's no cached entry — the panel
says so, since results then won't line up with scouter.

When calibration doesn't happen the seed carries a `CalibrationNotice` naming the
reason, so the panel can point at the fix instead of only disclaiming: `"setup"`
(Scouter setup unfinished, the actionable case), `"refresh"` (set up, but no cached
figure matches the character's current stats), `"unavailable"` (class scouter doesn't
cover, or a Demon Avenger). Standalone entry gets `null` — typed stats are taken at
face value, so there's nothing to warn about.

Left uncalibrated on purpose: **Demon Avenger** (its stat factor isn't `4*main + sub`,
so `mainStatAbseff1` doesn't invert to a stat sum) and any character whose table has
a non-positive field or 0% crit rate. Calibration is solved once at seed time from
the seeded inputs, so later edits to the stat fields move the buckets *from* the
calibrated baseline rather than re-deriving it.

Verified end to end against a real endgame Kanna: uncalibrated the greedy returned
main 5 / sub 3 / ATT 7 / boss 15 / dmg 14 / crit dmg 14 / IED 8, calibrated it
returns scouter's live answer exactly (ATT 8 / dmg 13 / crit dmg 15 / IED 6), at
both 300 and 380 PDR.

## Now/Best table
The hyper lines are a real `<table>` (`HYPER_TABLE_CSS`), not a CSS grid: each stat is
a `<th scope="row">` whose text is the `<label htmlFor>` for that row's input, which
both names the input and lets a screen reader place the recommended value
("Critical Damage, Best, 15"). Consequences worth keeping:
- The header cells must NOT use `.tool-field-label` — its `display: block` collapses
  the header row. Their typography is duplicated in `HYPER_TABLE_CSS` instead.
- Row cards need `border-collapse: separate` + `border-spacing` for the gap, so the
  border and radius are painted per cell (`th` left, `td.hyper-best` right).
- The changed/unchanged split is carried by weight AND color, plus an `.sr-only`
  suffix. Don't reintroduce a `→` glyph; screen readers announce it inconsistently.

The HEXA core cards follow the same rules in their own shape: each line's role text
is the `<label htmlFor>` for its stat `<select>` and "Lv" is the one for its level
input, each completing its accessible name with an `.sr-only` span (the visible
words alone don't say which core they belong to). The recommendation line reads
"Best: ..." for the same reason the arrow went: a `★` announced inconsistently.

## Point budget
Typed-in current levels are clamped so an allocation can never cost more than
`availableHyperPoints(level)` (`capHyperLevelToBudget` against what the other lines
already spend, in `setHyperLevel`). The panel's counter reports what the **current**
levels cost (`hyperAllocationCost`), not the recommendation's, so hitting the cap
reads as "1608 / 1608" rather than an unexplained snap-back.

HEXA has the same rule per core: `capHexaLineLevel` clamps a typed level against
what the core's other two lines spend, so the three can't exceed `HEXA_CORE_TOTAL`.
Scouter enforces this by refusing to run (`main + additional1 + additional2 > 20`
aborts with "입력값을 다시 확인해주세요"); clamping keeps the recommendation live instead.

## Empty stat window
With no main or secondary stat the kernel's stat factor is 0, so every candidate
evaluates to 0, the greedy ranks nothing, and both engines fall out at a 0% gain.
That is not "already optimal", so the panels gate their banner on `hasStatBaseline`
and say there's nothing to work from yet. Don't fold this into `alreadyOptimal`:
the engines mirror scouter, and this is our own reporting concern.

## Data sources
Hyper tables/costs: `hyper-stat-data.ts` (== scouter's tD/ve/hR; == wiki). HEXA
per-level values reuse `setup/data/hexaStatData.ts` (== scouter's NZ/oF tables).
Class constants: `scouter-class-data.ts` (vendored, GMS region table).
