"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import ModalShell from "../../components/ModalShell";
import type { AppTheme } from "../../components/themes";
import { toolStyles } from "../tools/tool-styles";
import type { GuessResult, PuzzleClock } from "./dailyGame";

// Shares link straight to the day that was played, via the archive route.
const SITE_ORIGIN = "https://www.mapledoro.com";

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function NextPuzzleCountdown({ theme, clock }: { theme: AppTheme; clock: PuzzleClock }) {
  const [remaining, setRemaining] = useState(() => clock.msUntilNextPuzzle());

  useEffect(() => {
    const id = setInterval(() => setRemaining(clock.msUntilNextPuzzle()), 1000);
    return () => clearInterval(id);
  }, [clock]);

  return (
    <div style={{ fontSize: "0.8rem", fontWeight: 700, color: theme.muted }}>
      Next puzzle in{" "}
      <span style={{ color: theme.accentText, fontVariantNumeric: "tabular-nums" }}>
        {formatCountdown(remaining)}
      </span>
    </div>
  );
}

const revealIconFrame: CSSProperties = {
  width: 64,
  height: 64,
  borderRadius: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const revealCard: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.85rem",
  margin: "1.1rem 0",
  padding: "0.85rem 1rem",
  borderRadius: 12,
  textAlign: "left",
};

/** End-of-game dialog: outcome, answer reveal, share squares, next-puzzle countdown. */
export default function ResultsDialog({
  theme,
  gameName,
  basePath,
  puzzleNumber,
  modeTag = "",
  answer,
  result,
  maxGuesses,
  clock,
  revealIcon,
  revealHeading,
  revealSubheading,
  onClose,
}: {
  theme: AppTheme;
  /** Player-facing name, used in the heading and share text. */
  gameName: string;
  /** Route base, e.g. "/games/bgm-guesser"; the share link appends the puzzle number. */
  basePath: string;
  puzzleNumber: number;
  /** Appended after the puzzle number, e.g. " (Hard)". */
  modeTag?: string;
  /** The value guesses were scored against. */
  answer: string;
  result: GuessResult;
  maxGuesses: number;
  clock: PuzzleClock;
  revealIcon: ReactNode;
  revealHeading: string;
  revealSubheading: string;
  onClose: () => void;
}) {
  const styles = toolStyles(theme);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const score = result.won ? `${result.guesses.length}/${maxGuesses}` : `X/${maxGuesses}`;
  const squares = result.guesses.map((g) => (g === answer ? "\u{1F7E9}" : "\u{1F7E5}"));

  async function handleShare() {
    const link = `${SITE_ORIGIN}${basePath}/${puzzleNumber}`;
    const text = `${gameName} #${puzzleNumber}${modeTag} ${score}\n${squares.join("")}\n${link}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch { /* clipboard unavailable */ }
  }

  return (
    <ModalShell
      theme={theme}
      ariaLabel={`${gameName} results`}
      onClose={onClose}
      style={{ width: "min(420px, calc(100% - 2rem))", padding: "1.5rem" }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: "1.2rem", color: theme.text }}>
          {result.won ? "You got it!" : "Out of guesses!"}
        </div>
        <div style={{ fontSize: "0.8rem", fontWeight: 700, color: theme.muted, marginTop: "0.2rem" }}>
          {gameName} #{puzzleNumber}{modeTag} — {score}
        </div>

        <div
          style={{ ...revealCard, border: `1px solid ${theme.border}`, background: theme.timerBg }}
        >
          <div style={{ ...revealIconFrame, background: theme.panel, border: `1px solid ${theme.border}` }}>
            {revealIcon}
          </div>
          <div>
            <div style={{ fontSize: "0.92rem", fontWeight: 800, color: theme.text }}>
              {revealHeading}
            </div>
            <div style={{ fontSize: "0.78rem", fontWeight: 600, color: theme.muted }}>
              {revealSubheading}
            </div>
          </div>
        </div>

        <div style={{ fontSize: "1.3rem", letterSpacing: "0.15em", marginBottom: "1.1rem" }} aria-hidden="true">
          {squares.map((sq, i) => (
            <span key={i}>{sq}</span>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginBottom: "1rem" }}>
          <button
            type="button"
            className="tool-btn tool-dialog-btn"
            onClick={handleShare}
            style={styles.dialogPrimaryBtnStyle}
          >
            {copied ? "Copied!" : "Share Result"}
          </button>
          <button
            type="button"
            className="tool-btn tool-dialog-btn"
            onClick={onClose}
            style={styles.dialogBtnStyle}
          >
            Close
          </button>
        </div>

        <NextPuzzleCountdown theme={theme} clock={clock} />
      </div>
    </ModalShell>
  );
}
