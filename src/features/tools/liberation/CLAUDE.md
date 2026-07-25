# Liberation

**Four tabs:** Genesis, Destiny Part 1, Destiny Part 2, Astra Secondary.

**Shared UI (don't re-fork):** `BossCard.tsx` and `ResultsPanel.tsx` serve both the Genesis/Destiny
view and `AstraSection`. Astra passes a `VoucherInput` as `children` into `BossCard`'s bottom row; the
results differ only in the `metrics` / `milestones` / `breakdown` / `totals` arrays. These were two
near-identical copies before; keep them as one. `CLEARED_HINT` in `copy.ts` is the single source for
the "cleared delays, doesn't reduce" explanation, shown once under each boss grid rather than as a
per-chip `title` (hover-only, unreachable on touch). The card grid is the global `.tool-card-grid`
class in `globals.css`, not a workspace `<style>` block, so `AstraSection` styles correctly alone.

**Reset cadence (simulator correctness):**
- **Weekly bosses** reset **Thursday 00:00 UTC**, which the simulator iterates as the reset day. The
  first iterated Thursday is *strictly after* the start date (a start landing on a Thursday counts
  that week's income as immediate, not as a reset event), and every reset including the first pays
  the **full** weekly income.
- **Monthly bosses** (Black Mage) land on the **1st UTC**; the next monthly reset is always the 1st of
  the following month.
- `clearedThisWeek` does **not** reduce any reset payout. It only decides whether a boss's income
  counts as **immediate** (earnable before the next reset), so an uncleared boss can push completion
  onto the start date itself. This matches masonym.dev's model.

**Genesis Pass:** flat +10% trace multiplier on Genesis bosses, no effect on Destiny.

**Destiny Part 1 vs Part 2:** same 8-boss pool (including Radiant Malefic Star and Jupiter); Part 2
has higher quest requirements (10k/12.5k/15k vs 2k/2.5k/3k). Internal type keys are `"destiny"` for
Part 1 (backward compat) and `"destiny2"` for Part 2.

**Astra Secondary:** tracks Fierce Battle Traces (capped at 1000) and Erion's Fragments across three
sequential missions needing both. Fragments come from daily quests and boss vouchers. Stored under the
`astra` tool key, separate from `liberation`.

Both tabs get their character wiring from `../usePerCharacterToolState.ts`; date display goes through
`formatLongDate` in `../date.ts`.
