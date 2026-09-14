/*
  Mapledle results, stored in the `skillGuesser` section of `mapledoro_games_v1`.

  Each puzzle keeps a separate result per mode: `normal` and `hard`. Hard mode
  only becomes playable once the normal game is finished, and clearing it is what
  reveals the skill name.

  Section reads/writes go through gamesStore, which owns the key, preserves every
  other game's section, and handles the v1 -> v2 schema migration (v1 stored a
  single result per puzzle plus a global hard-mode toggle). This module must never
  read or write the key directly: doing that is what previously let one game
  overwrite another's history.
*/

import { computeGuessStats, type GuessResult, type GuessStats } from "../dailyGame";
import { readGameSection, writeGameSection } from "../gamesStore";
import { MAX_GUESSES } from "./puzzles";

const SECTION = "skillGuesser";

export type GameMode = "normal" | "hard";

/** Per-puzzle results, one slot per mode. */
export interface PuzzleResults {
  normal?: GuessResult;
  hard?: GuessResult;
}

interface SkillGuesserSection {
  results: Record<string, PuzzleResults>;
}

function readResults(): Record<string, PuzzleResults> {
  return readGameSection<SkillGuesserSection>(SECTION)?.results ?? {};
}

export function readPuzzleResults(puzzleNumber: number): PuzzleResults {
  return readResults()[String(puzzleNumber)] ?? {};
}

export function writeSkillGuesserResult(
  puzzleNumber: number,
  mode: GameMode,
  result: GuessResult,
): void {
  const results = readResults();
  const key = String(puzzleNumber);
  writeGameSection(SECTION, {
    results: { ...results, [key]: { ...results[key], [mode]: result } },
  } satisfies SkillGuesserSection);
}

export function computeSkillGuesserStats(mode: GameMode): GuessStats {
  const results = Object.values(readResults())
    .map((r) => r[mode])
    .filter((r): r is GuessResult => r !== undefined);
  return computeGuessStats(results, MAX_GUESSES);
}
