"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import type { AppTheme } from "../../components/themes";
import { useMounted } from "../../lib/useMounted";
import type { PuzzleClock } from "./dailyGame";
import { usePuzzleRoute } from "./usePuzzleRoute";

/* Puzzles roll over at 00:00 UTC, so the date label is formatted in UTC too. */
const PUZZLE_DATE_FMT = new Intl.DateTimeFormat(undefined, {
  timeZone: "UTC",
  month: "long",
  day: "numeric",
  year: "numeric",
});

const dateLabelStyle: CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: "0.85rem",
  fontWeight: 600,
  textAlign: "center",
  marginTop: "0.2rem",
};

/**
 * Shell for a daily game: the header with day arrows and date, the UTC
 * rollover timer, archive routing, and the mount gate in front of localStorage
 * reads. `children` renders the puzzle for the day being viewed; key it by the
 * puzzle number so each day re-reads its own results.
 */
export default function DailyGameWorkspace({
  theme,
  urlPuzzle,
  basePath,
  gameName,
  description,
  clock,
  children,
}: {
  theme: AppTheme;
  /** Archive route segment, absent on the daily route. */
  urlPuzzle?: string;
  basePath: string;
  gameName: string;
  description: string;
  clock: PuzzleClock;
  children: (puzzleNumber: number) => ReactNode;
}) {
  const mounted = useMounted();
  const [today, setToday] = useState(() => clock.currentPuzzleNumber());
  const [puzzleNumber, setPuzzleNumber] = usePuzzleRoute(basePath, urlPuzzle, today);

  // Advance to the next puzzle when the UTC day rolls over while the page is
  // open; carry the viewer along only if they're looking at the latest day.
  useEffect(() => {
    const t = setTimeout(() => {
      const next = clock.currentPuzzleNumber();
      setToday(next);
      setPuzzleNumber((p) => (p === today ? next : p));
    }, clock.msUntilNextPuzzle() + 250);
    return () => clearTimeout(t);
  }, [clock, today, setPuzzleNumber]);

  if (!mounted) return null;

  const canPrev = puzzleNumber > 1;
  const canNext = puzzleNumber < today;
  // react-doctor-disable-next-line no-locale-format-in-render -- unreachable during SSR: sits below the `if (!mounted) return null` gate above
  const dateLabel = PUZZLE_DATE_FMT.format(clock.puzzleDateMs(puzzleNumber));
  const arrowStyle = (enabled: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "none",
    border: "none",
    padding: "0 0.3rem",
    font: "inherit",
    lineHeight: 1,
    color: enabled ? theme.accent : theme.border,
    cursor: enabled ? "pointer" : "not-allowed",
  });

  return (
    <div className="page-content">
      <div className="tool-container" style={{ maxWidth: 560 }}>
        <div className="tool-header">
          <Link href="/games" className="tool-header-back" style={{ color: theme.accentText }}>
            ← Back to Games
          </Link>
          <div className="tool-header-title" style={{ color: theme.text }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem", lineHeight: 1 }}>
              <button
                type="button"
                aria-label="Previous puzzle"
                disabled={!canPrev}
                onClick={() => setPuzzleNumber((p) => p - 1)}
                style={arrowStyle(canPrev)}
              >
                ‹
              </button>
              <span>{gameName} #{puzzleNumber}</span>
              <button
                type="button"
                aria-label="Next puzzle"
                disabled={!canNext}
                onClick={() => setPuzzleNumber((p) => p + 1)}
                style={arrowStyle(canNext)}
              >
                ›
              </button>
            </div>
            <div style={{ ...dateLabelStyle, color: theme.muted }}>{dateLabel}</div>
          </div>
          <div className="tool-header-desc" style={{ color: theme.muted }}>
            {description}
          </div>
        </div>

        {children(puzzleNumber)}
      </div>
    </div>
  );
}
