"use client";

import { useMemo, useState, type CSSProperties } from "react";
import type { AppTheme } from "../../../components/themes";
import { toolStyles } from "../../tools/tool-styles";
import { EMPTY_RESULT, applyGuess } from "../dailyGame";
import DailyGameWorkspace from "../DailyGameWorkspace";
import { GuessControls } from "../GuessControls";
import ResultsDialog from "../ResultsDialog";
import { GuessSlots, StatsPanel } from "../shared-ui";
import { SKILL_GUESSER_CLASSES, findSkillGuesserClass } from "./classes";
import {
  MAX_GUESSES,
  PUZZLE_CLOCK,
  allSkillNames,
  getPuzzle,
  type SkillGuesserPuzzle,
} from "./puzzles";
import PuzzleSkillIcon from "./PuzzleSkillIcon";
import {
  computeSkillGuesserStats,
  readPuzzleResults,
  writeSkillGuesserResult,
  type GameMode,
} from "./storage";

const BASE_PATH = "/games/skill-guesser";
const GAME_NAME = "Mapledle";

const modeTabBtn: CSSProperties = {
  padding: "5px 14px",
  border: "none",
  borderRadius: 8,
  fontSize: "0.75rem",
  fontWeight: 700,
  userSelect: "none",
};

const iconFrame: CSSProperties = {
  width: 96,
  height: 96,
  borderRadius: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

/* ------------------------------------------------------------------ */
/*  Mode tabs (Normal / Hard — hard locked until normal is finished)   */
/* ------------------------------------------------------------------ */

function ModeTabs({
  theme,
  mode,
  hardUnlocked,
  hardCleared,
  onChange,
}: {
  theme: AppTheme;
  mode: GameMode;
  hardUnlocked: boolean;
  hardCleared: boolean;
  onChange: (m: GameMode) => void;
}) {
  let hardLabel = "\u{1F512} Hard";
  if (hardUnlocked) hardLabel = hardCleared ? "Hard ✓" : "Hard";
  const tabs: { value: GameMode; label: string; disabled: boolean }[] = [
    { value: "normal", label: "Normal", disabled: false },
    { value: "hard", label: hardLabel, disabled: !hardUnlocked },
  ];
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        background: theme.timerBg,
        borderRadius: 10,
        padding: 3,
        border: `1px solid ${theme.border}`,
      }}
    >
      {tabs.map((t) => {
        const active = mode === t.value;
        return (
          <button
            key={t.value}
            type="button"
            className="tool-btn"
            disabled={t.disabled}
            onClick={() => onChange(t.value)}
            title={t.disabled ? "Finish Normal Mode to unlock" : undefined}
            style={{
              ...modeTabBtn,
              color: active ? "#fff" : theme.muted,
              background: active ? theme.accent : "transparent",
              opacity: t.disabled ? 0.5 : 1,
              cursor: t.disabled ? "not-allowed" : "pointer",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Hints                                                              */
/* ------------------------------------------------------------------ */

function HintCards({
  theme,
  puzzle,
  failedCount,
}: {
  theme: AppTheme;
  puzzle: SkillGuesserPuzzle;
  failedCount: number;
}) {
  const cls = findSkillGuesserClass(puzzle.className);
  if (!cls) return null;
  const hints = [
    { label: "Main Stat", value: cls.mainStat, unlockAfter: 2 },
    { label: "Secondary", value: cls.secondary, unlockAfter: 3 },
    { label: "Main Weapon", value: cls.weapon, unlockAfter: 4 },
  ];
  return (
    <div className="sg-hints" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.6rem" }}>
      <style>{`@media (max-width: 560px) { .sg-hints { grid-template-columns: 1fr !important; } }`}</style>
      {hints.map((h) => {
        const unlocked = failedCount >= h.unlockAfter;
        return (
          <div
            key={h.label}
            style={{
              border: `1px solid ${theme.border}`,
              borderRadius: 10,
              padding: "0.6rem 0.75rem",
              background: unlocked ? theme.panel : theme.timerBg,
              opacity: unlocked ? 1 : 0.75,
            }}
          >
            <div className="tool-field-label" style={{ color: theme.muted }}>
              {h.label}
            </div>
            <div style={{ fontSize: "0.82rem", fontWeight: 700, color: unlocked ? theme.text : theme.muted }}>
              {unlocked ? h.value : `\u{1F512} After ${h.unlockAfter} misses`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Single puzzle (owns both modes' results + the active mode)         */
/* ------------------------------------------------------------------ */

function PuzzleView({ theme, puzzleNumber }: { theme: AppTheme; puzzleNumber: number }) {
  const puzzle = useMemo(() => getPuzzle(puzzleNumber), [puzzleNumber]);
  const styles = toolStyles(theme);
  const [results, setResults] = useState(() => readPuzzleResults(puzzleNumber));
  const [mode, setMode] = useState<GameMode>("normal");
  const [dialogOpen, setDialogOpen] = useState(false);

  const hardUnlocked = results.normal?.done === true;
  // The skill name stays hidden until the player wins (clears) hard mode.
  const skillNameRevealed = results.hard?.won === true;
  const result = results[mode] ?? EMPTY_RESULT;

  // Normal mode scores guesses against the class; hard mode asks for the skill
  // name itself (drawn from the whole skill pool). Everything downstream — the
  // picker, guess slots, share squares — keys off this one answer.
  const answer = mode === "hard" ? puzzle.skillName : puzzle.className;
  const options = useMemo(
    () => (mode === "hard" ? allSkillNames() : SKILL_GUESSER_CLASSES.map((c) => c.name)),
    [mode],
  );

  const guessed = useMemo(() => new Set(result.guesses), [result.guesses]);
  const failedCount = result.guesses.filter((g) => g !== answer).length;

  const answerLine = skillNameRevealed
    ? `The answer was ${puzzle.className} — ${puzzle.skillName}`
    : `The answer was ${puzzle.className}`;

  function handleModeChange(next: GameMode) {
    setMode(next);
    setDialogOpen(false);
  }

  function handleSubmit(guess: string) {
    setResults((prev) => {
      const current = prev[mode] ?? EMPTY_RESULT;
      const next = applyGuess(current, guess, answer, MAX_GUESSES);
      if (next === current) return prev;
      writeSkillGuesserResult(puzzleNumber, mode, next);
      return { ...prev, [mode]: next };
    });
    if (applyGuess(result, guess, answer, MAX_GUESSES).done) {
      setTimeout(() => setDialogOpen(true), 700);
    }
  }

  return (
    <>
      <div className="fade-in panel-card" style={styles.sectionPanel}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.4rem", marginBottom: "1.1rem" }}>
          <div
            style={{ ...iconFrame, border: `1px solid ${theme.border}`, background: theme.timerBg }}
          >
            <PuzzleSkillIcon
              puzzle={puzzle}
              size={64}
              alt="Mystery skill icon"
              style={{ imageRendering: "pixelated" }}
            />
          </div>
          <div style={{ fontSize: "0.85rem", fontWeight: 700, color: theme.text }}>
            {mode === "hard" ? "What is this skill called?" : "Which class learns this skill?"}
          </div>
          <div style={{ fontSize: "0.75rem", fontWeight: 600, color: theme.muted }}>
            {result.done
              ? answerLine
              : `${MAX_GUESSES - result.guesses.length} of ${MAX_GUESSES} guesses remaining`}
          </div>
          {mode === "normal" && result.done && !skillNameRevealed && (
            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: theme.muted }}>
              Clear Hard Mode to reveal the skill name.
            </div>
          )}
          <ModeTabs
            theme={theme}
            mode={mode}
            hardUnlocked={hardUnlocked}
            hardCleared={skillNameRevealed}
            onChange={handleModeChange}
          />
        </div>

        {/* Keyed by mode so a half-typed search doesn't carry across answer pools. */}
        <GuessControls
          key={mode}
          theme={theme}
          done={result.done}
          options={options}
          placeholder={mode === "hard" ? "Search skills…" : "Search classes…"}
          ariaLabel={mode === "hard" ? "Guess a skill" : "Guess a class"}
          guessed={guessed}
          onSubmit={handleSubmit}
          onViewResults={() => setDialogOpen(true)}
        />

        <div style={{ display: "grid", gap: "1.1rem" }}>
          <GuessSlots theme={theme} guesses={result.guesses} answer={answer} maxGuesses={MAX_GUESSES} />
          <HintCards theme={theme} puzzle={puzzle} failedCount={failedCount} />
        </div>
      </div>

      <StatsPanel
        theme={theme}
        sectionPanel={styles.sectionPanel}
        label={`Your Stats — ${mode === "hard" ? "Hard" : "Normal"}`}
        stats={computeSkillGuesserStats(mode)}
        maxGuesses={MAX_GUESSES}
      />

      {dialogOpen && (
        <ResultsDialog
          theme={theme}
          gameName={GAME_NAME}
          basePath={BASE_PATH}
          puzzleNumber={puzzleNumber}
          modeTag={mode === "hard" ? " (Hard)" : ""}
          answer={answer}
          result={result}
          maxGuesses={MAX_GUESSES}
          clock={PUZZLE_CLOCK}
          revealIcon={
            <PuzzleSkillIcon
              puzzle={puzzle}
              size={44}
              alt={puzzle.skillName}
              style={{ imageRendering: "pixelated" }}
            />
          }
          revealHeading={puzzle.className}
          revealSubheading={skillNameRevealed ? puzzle.skillName : "Clear Hard Mode to reveal the skill name"}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Workspace                                                          */
/* ------------------------------------------------------------------ */

export default function SkillGuesserWorkspace({
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
      description={`Guess which class learns the daily skill in ${MAX_GUESSES} tries. Finish Normal Mode to unlock Hard Mode, and use the arrows to replay earlier days.`}
      clock={PUZZLE_CLOCK}
    >
      {(puzzleNumber) => <PuzzleView key={puzzleNumber} theme={theme} puzzleNumber={puzzleNumber} />}
    </DailyGameWorkspace>
  );
}
