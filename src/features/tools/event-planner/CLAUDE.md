# Event Planner

Depends on `../star-force/star-force-data` for the cost model — don't duplicate formulas. The boomTier / safeguard / event **stacking rules live in `../star-force/CLAUDE.md`**; this tool only feeds inputs into that model.

Storage is **global, not per-character** — stored in the global tools store (`mapledoro_tools_v1`) under the `eventPlanner` key. Each entry carries its own `characterName` — renaming a character elsewhere won't migrate entries.

**Global vs per-entry options:** the cost/boom events and MVP are global settings applied to every entry; `safeguard` and `boomTier` (Enhancement Mode) are stored **per-entry**, captured from the settings controls at add time (the table shows both as read-only status columns). Saves predating per-entry options stored `boomTier` globally; the load path folds that value into each entry. Star catching has no option since v271 removed the minigame: the cost model always applies it, and older entries may still carry an ignored `starCatch` field.