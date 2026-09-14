"use client";

import { useMemo, useState } from "react";
import { MarkIcon } from "../../../components/ResourceImage";
import type { AppTheme } from "../../../components/themes";
import { toolStyles } from "../../tools/tool-styles";
import { EMPTY_RESULT, applyGuess } from "../dailyGame";
import DailyGameWorkspace from "../DailyGameWorkspace";
import { GuessControls } from "../GuessControls";
import ResultsDialog from "../ResultsDialog";
import { GuessSlots, StatsPanel } from "../shared-ui";
import BgmPlayer from "./BgmPlayer";
import {
  BGM_GUESSER_ANSWERS,
  MAX_GUESSES,
  PUZZLE_CLOCK,
  findBgmGuesserAnswer,
  getPuzzle,
} from "./puzzles";
import { computeBgmGuesserStats, readPuzzleResult, writeBgmGuesserResult } from "./storage";

const BASE_PATH = "/games/bgm-guesser";
const GAME_NAME = "BGM Guesser";

const ANSWER_NAMES = BGM_GUESSER_ANSWERS.map((a) => a.name);

function AnswerMark({ name, size }: { name: string; size: number }) {
  const answer = findBgmGuesserAnswer(name);
  if (!answer) return null;
  return <MarkIcon id={answer.mark} size={size} alt="" style={{ imageRendering: "pixelated" }} />;
}

/* ------------------------------------------------------------------ */
/*  Single puzzle                                                      */
/* ------------------------------------------------------------------ */

function PuzzleView({ theme, puzzleNumber }: { theme: AppTheme; puzzleNumber: number }) {
  const puzzle = useMemo(() => getPuzzle(puzzleNumber), [puzzleNumber]);
  const styles = toolStyles(theme);
  const [result, setResult] = useState(() => readPuzzleResult(puzzleNumber) ?? EMPTY_RESULT);
  const [dialogOpen, setDialogOpen] = useState(false);

  const guessed = useMemo(() => new Set(result.guesses), [result.guesses]);

  function handleSubmit(guess: string) {
    setResult((prev) => {
      const next = applyGuess(prev, guess, puzzle.answer, MAX_GUESSES);
      if (next !== prev) writeBgmGuesserResult(puzzleNumber, next);
      return next;
    });
    if (applyGuess(result, guess, puzzle.answer, MAX_GUESSES).done) {
      setTimeout(() => setDialogOpen(true), 700);
    }
  }

  return (
    <>
      <div className="fade-in panel-card" style={styles.sectionPanel}>
        <div style={{ display: "grid", gap: "0.9rem", marginBottom: "1.1rem" }}>
          <BgmPlayer theme={theme} group={puzzle.group} track={puzzle.track} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "0.85rem", fontWeight: 700, color: theme.text }}>
              Which area or boss plays this music?
            </div>
            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: theme.muted, marginTop: "0.15rem" }}>
              {result.done
                ? `The answer was ${puzzle.answer} — ${puzzle.title}`
                : `${MAX_GUESSES - result.guesses.length} of ${MAX_GUESSES} guesses remaining`}
            </div>
          </div>
        </div>

        <GuessControls
          theme={theme}
          done={result.done}
          options={ANSWER_NAMES}
          placeholder="Search areas and bosses…"
          ariaLabel="Guess an area or boss"
          guessed={guessed}
          renderOptionIcon={(name) => <AnswerMark name={name} size={30} />}
          onSubmit={handleSubmit}
          onViewResults={() => setDialogOpen(true)}
        />

        <GuessSlots theme={theme} guesses={result.guesses} answer={puzzle.answer} maxGuesses={MAX_GUESSES} />
      </div>

      <StatsPanel
        theme={theme}
        sectionPanel={styles.sectionPanel}
        label="Your Stats"
        stats={computeBgmGuesserStats()}
        maxGuesses={MAX_GUESSES}
      />

      {dialogOpen && (
        <ResultsDialog
          theme={theme}
          gameName={GAME_NAME}
          basePath={BASE_PATH}
          puzzleNumber={puzzleNumber}
          answer={puzzle.answer}
          result={result}
          maxGuesses={MAX_GUESSES}
          clock={PUZZLE_CLOCK}
          revealIcon={<AnswerMark name={puzzle.answer} size={44} />}
          revealHeading={puzzle.answer}
          revealSubheading={puzzle.title}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Workspace                                                          */
/* ------------------------------------------------------------------ */

export default function BgmGuesserWorkspace({
  theme,
  urlPuzzle,
}: {
  theme: AppTheme;
  /** Archive route segment, absent on the daily route. */
  urlPuzzle?: string;
}) {
  return (
    <DailyGameWorkspace
      theme={theme}
      urlPuzzle={urlPuzzle}
      basePath={BASE_PATH}
      gameName={GAME_NAME}
      description={`Name the area or boss the daily track plays for in ${MAX_GUESSES} tries. Use the arrows to replay earlier days.`}
      clock={PUZZLE_CLOCK}
    >
      {(puzzleNumber) => <PuzzleView key={puzzleNumber} theme={theme} puzzleNumber={puzzleNumber} />}
    </DailyGameWorkspace>
  );
}
