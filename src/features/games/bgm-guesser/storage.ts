/*
  BGM Guesser results, stored in the `bgmGuesser` section of `mapledoro_games_v1`.

  Section reads/writes go through gamesStore, which owns the key and preserves
  every other game's section. This module must never read or write the key
  directly: doing that is what previously let one game overwrite another's
  history.
*/

import { readGameSection, writeGameSection } from "../gamesStore";

const SECTION = "bgmGuesser";

export interface BgmGuesserResult {
  guesses: string[];
  won: boolean;
  done: boolean;
}

interface BgmGuesserSection {
  results: Record<string, BgmGuesserResult>;
}

function readResults(): Record<string, BgmGuesserResult> {
  return readGameSection<BgmGuesserSection>(SECTION)?.results ?? {};
}

export function readPuzzleResult(puzzleNumber: number): BgmGuesserResult | undefined {
  return readResults()[String(puzzleNumber)];
}

export function writeBgmGuesserResult(puzzleNumber: number, result: BgmGuesserResult): void {
  writeGameSection(SECTION, {
    results: { ...readResults(), [String(puzzleNumber)]: result },
  } satisfies BgmGuesserSection);
}

export interface BgmGuesserStats {
  played: number;
  /** Whole percent, 0-100. */
  winRate: number;
  /** Average guesses across wins, or null before the first win. */
  avgGuesses: number | null;
  /** Wins by guess count (indexes 0-2 = 1-3 guesses), last index = losses. */
  distribution: number[];
}

export function computeBgmGuesserStats(maxGuesses: number): BgmGuesserStats {
  const results = Object.values(readResults()).filter((r) => r.done);
  const distribution = Array.from({ length: maxGuesses + 1 }, () => 0);
  let wins = 0;
  let winGuessTotal = 0;
  for (const r of results) {
    if (r.won) {
      wins += 1;
      winGuessTotal += r.guesses.length;
      distribution[Math.min(r.guesses.length, maxGuesses) - 1] += 1;
    } else {
      distribution[maxGuesses] += 1;
    }
  }
  return {
    played: results.length,
    winRate: results.length > 0 ? Math.round((wins / results.length) * 100) : 0,
    avgGuesses: wins > 0 ? winGuessTotal / wins : null,
    distribution,
  };
}
