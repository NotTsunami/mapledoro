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
Given identical inputs, recommendations match the live site. Differences can
still appear for a looked-up character on scouter because the site additionally
folds that character's link skills, noblesse/potion settings, and seed-ring
uptime into the same buckets (session data we don't collect). Those are additive
constants; a user can reproduce them by adding the equivalent % into the
damage/crit-damage fields. The `dpm*` class constants must be refreshed if
scouter rebalances its class data.

## Data sources
Hyper tables/costs: `hyper-stat-data.ts` (== scouter's tD/ve/hR; == wiki). HEXA
per-level values reuse `setup/data/hexaStatData.ts` (== scouter's NZ/oF tables).
Class constants: `scouter-class-data.ts` (vendored, GMS region table).
