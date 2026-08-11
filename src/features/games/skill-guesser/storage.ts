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

import { readGameSection, writeGameSection } from "../gamesStore";

const SECTION = "skillGuesser";

export type GameMode = "normal" | "hard";

export interface SkillGuesserResult {
  guesses: string[];
  won: boolean;
  done: boolean;
}

/** Per-puzzle results, one slot per mode. */
export interface PuzzleResults {
  normal?: SkillGuesserResult;
  hard?: SkillGuesserResult;
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
  result: SkillGuesserResult,
): void {
  const results = readResults();
  const key = String(puzzleNumber);
  writeGameSection(SECTION, {
    results: { ...results, [key]: { ...results[key], [mode]: result } },
  } satisfies SkillGuesserSection);
}

export interface SkillGuesserStats {
  played: number;
  /** Whole percent, 0-100. */
  winRate: number;
  /** Average guesses across wins, or null before the first win. */
  avgGuesses: number | null;
  /** Wins by guess count (indexes 0-4 = 1-5 guesses), index 5 = losses. */
  distribution: number[];
}

export function computeSkillGuesserStats(mode: GameMode): SkillGuesserStats {
  const results = Object.values(readResults())
    .map((r) => r[mode])
    .filter((r): r is SkillGuesserResult => r !== undefined && r.done);
  const distribution = [0, 0, 0, 0, 0, 0];
  let wins = 0;
  let winGuessTotal = 0;
  for (const r of results) {
    if (r.won) {
      wins += 1;
      winGuessTotal += r.guesses.length;
      distribution[Math.min(r.guesses.length, 5) - 1] += 1;
    } else {
      distribution[5] += 1;
    }
  }
  return {
    played: results.length,
    winRate: results.length > 0 ? Math.round((wins / results.length) * 100) : 0,
    avgGuesses: wins > 0 ? winGuessTotal / wins : null,
    distribution,
  };
}
