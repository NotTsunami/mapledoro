# Daily Games

Shared chrome for the daily games: Mapledle (`skill-guesser/`) and BGM Guesser (`bgm-guesser/`).
Each game's own doc covers only what differs from this one.

**Shared modules:** `DailyGameWorkspace` (header arrows, date, UTC rollover, archive routing, mount
gate), `GuessControls` (searchable picker + Guess button, or View Results once done), `shared-ui.tsx`
(`GuessSlots`, `StatsPanel`), `ResultsDialog` (share text, squares, countdown) and `dailyGame.ts`
(`GuessResult`, `applyGuess`, `computeGuessStats`, `makePuzzleClock`). A game supplies the player or
hints, the answer pool, and the reveal card contents.

**Puzzle numbering:** the puzzle advances at **00:00:00 UTC**; puzzle #1 is each game's
`EPOCH_UTC_MS` day in its `puzzles.ts`, and day N maps to payload index `(N-1) % length`. Players
replay earlier days via the header arrows, clamped between #1 and today; the workspace keys the
puzzle view by number so each day re-reads its own results.

**Archive routing** (`usePuzzleRoute.ts`): each game has two routes, the bare path (always today)
and `<base>/<n>` for one earlier day, both rendering the same workspace with the segment only
seeding `puzzleNumber`. Validation is necessarily client-side, since `today` comes from `Date.now()`
and the workspace is `useMounted`-gated; a non-numeric or out-of-range segment silently falls back
to today rather than 404ing. Moving between days rewrites the URL with `history.replaceState`,
**not** a router navigation: the route is fully client-rendered, so navigating would remount the
workspace and every arrow press would stack a back-button entry. Today's puzzle canonicalises back
to the bare path. Each `[puzzle]/layout.tsx` sets `robots: { index: false }` because the archive is
an unbounded number space; the daily page stays indexable. Share text links to `<base>/<n>` so a
copied result opens the day it describes.

**The guess picker portals its menu to `<body>`** via `usePickerCoords` (from the character setup
hooks), matching the character-setup and Mystic Frontier pickers. It has to: `.panel-card` sets
`overflow: hidden`, so an absolutely-positioned menu gets cut off by the panel's bottom edge, and
the BGM panel is short enough (no hint cards, 3 guess slots) that the menu never fits below the
input. Menu width is measured off the input when it opens, and the outside-click handler checks the
portal too, since the menu is no longer a DOM descendant of the anchor.

**Puzzle payloads** (each game's `puzzle-data.generated.ts`) are AUTO-GENERATED — never hand-edit.
They are base64(XOR(json)) so the answer isn't readable in devtools; the XOR key in each
`puzzles.ts` must match its script's. **Don't change a generator's `SEED` or reorder its inputs** —
that reshuffles the daily order and breaks streaks mid-run. A game version bump is not a reason to
regenerate either (see `scripts/CLAUDE.md`).

**Results** live in `mapledoro_games_v1` (its own key, NOT `mapledoro_tools_v1`), one section per
game, schema **version 2**. Reads/writes go through `gamesStore.ts`
(`readGameSection`/`writeGameSection`), which owns the key and preserves other games' sections.
**Never touch `mapledoro_games_v1` directly from a game module** — when both modules owned the whole
key, each rebuilt it from the sections it knew, so the second game played erased the other's
history. Migrations live in `gamesStore.ts` too, because `version` describes the whole key: bumping
it without reshaping every section in the same step would make old results read as never played.
