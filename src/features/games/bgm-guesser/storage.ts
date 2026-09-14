/*
  BGM Guesser results, stored in the `bgmGuesser` section of `mapledoro_games_v1`.

  Section reads/writes go through gamesStore, which owns the key and preserves
  every other game's section. This module must never read or write the key
  directly: doing that is what previously let one game overwrite another's
  history.
*/

import { computeGuessStats, type GuessResult, type GuessStats } from "../dailyGame";
import { readGameSection, writeGameSection } from "../gamesStore";
import { MAX_GUESSES } from "./puzzles";

const SECTION = "bgmGuesser";

interface BgmGuesserSection {
  results: Record<string, GuessResult>;
}

function readResults(): Record<string, GuessResult> {
  return readGameSection<BgmGuesserSection>(SECTION)?.results ?? {};
}

export function readPuzzleResult(puzzleNumber: number): GuessResult | undefined {
  return readResults()[String(puzzleNumber)];
}

export function writeBgmGuesserResult(puzzleNumber: number, result: GuessResult): void {
  writeGameSection(SECTION, {
    results: { ...readResults(), [String(puzzleNumber)]: result },
  } satisfies BgmGuesserSection);
}

export function computeBgmGuesserStats(): GuessStats {
  return computeGuessStats(Object.values(readResults()), MAX_GUESSES);
}
