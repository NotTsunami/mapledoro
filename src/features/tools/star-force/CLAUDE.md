# Star Force

Post-revamp (November 2025 NEXT update) cost calculator.

**Revamp rules:** stars no longer drop on failure (maintain at current star). `restorePoint(star)` is
the boom landing: 12 (<20), 15 (=20), 17 (21-22), 19 (23-25), 20 (26-29). Safeguard is 15-17 only and
triples cost.

**Enhancement Mode** (`StarForceOpts.boomTier`, 1-4; default/undefined = 1 = baseline): Tespia
boom-reduction for stars 15-21. Tier > 1 overrides base success/boom from `BOOM_TIER_SUCCESS_RATES` /
`BOOM_TIER_DESTROY_RATES` (applied first in `adjustedRates`, before safeguard/event/star-catch) and
multiplies cost by `1 + BOOM_TIER_COST_MULT_INCREASE`. Tier 1 reproduces the default tables exactly.
The 30% off / 30% boom-reduction events **stack** with it: events apply to the base cost/boom first,
then Enhancement Mode (cost multiplies the discounted base; boom resolves to `base x 0.7 x tier
factor`). Only `safeguard` is forced off (and disabled) when tier > 1, since we don't assume that one
stacks. The event planner exposes the same slider under the same rules.

**Simulation cost is superlinear in target star.** Reaching 30★ needs ~15M attempts *per trial*,
because a boom at 29★ (19.8% against a 1% success rate) drops the item to 20★. `expectedAttempts(opts)`
is the closed-form price tag for one trial, which the workspace multiplies by trial count to warn
before an expensive run. Don't try to make the inner loop hide this: collapsing maintain runs with a
geometric sample measured 0.9x (the `Math.log` costs more than the iterations saved), and typed arrays
plus a precomputed `keep` threshold bought only 1.1-1.2x.

**`startSimulation()` is resumable, not one-shot.** `step(budgetMs)` advances the run and returns
whether it finished, checking the clock every 4096 attempts so it can suspend *mid-trial* (one 30★
trial alone exceeds any frame budget). The workspace drives it from `requestAnimationFrame`, which is
what makes progress, ETA, and a Stop button possible without a worker. Aggregate only after `step`
returns true.

**`star-force-data.ts` is reused by `../event-planner`** (`computeExpectedCosts`, `StarForceOpts`,
`MvpTier`, `BOOM_TIER_COUNT`) — keep it pure: no React, no localStorage, no persistence.

The trial-count input deliberately keeps a raw string rather than using `ToolNumberInput`, so an empty
field is representable: that empty state is what disables Run and shows the range hint.
