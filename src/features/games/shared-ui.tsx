import type { CSSProperties } from "react";
import { STATUS, statusText } from "../../components/statusColors";
import type { AppTheme } from "../../components/themes";
import type { GuessStats } from "./dailyGame";

const guessSlot: CSSProperties = {
  borderRadius: 10,
  padding: "0.5rem 0.85rem",
  display: "flex",
  alignItems: "center",
  gap: "0.6rem",
  fontSize: "0.85rem",
  fontWeight: 700,
  minHeight: 24,
};

/** One row per allowed guess, filled in as the player goes. */
export function GuessSlots({
  theme,
  guesses,
  answer,
  maxGuesses,
}: {
  theme: AppTheme;
  guesses: string[];
  answer: string;
  maxGuesses: number;
}) {
  return (
    <div style={{ display: "grid", gap: "0.45rem" }}>
      {Array.from({ length: maxGuesses }, (_, i) => {
        const guess = guesses[i];
        const correct = guess === answer;
        const verdict = statusText(theme, correct ? "success" : "danger");
        const filled: CSSProperties = guess
          ? { border: `1px solid ${verdict}`, background: theme.panel, color: theme.text }
          : { border: `1px dashed ${theme.border}`, background: theme.timerBg, color: theme.muted };
        return (
          <div key={i} style={{ ...filled, ...guessSlot }}>
            {guess ? (
              <>
                <span aria-hidden="true" style={{ color: verdict, fontWeight: 800 }}>
                  {correct ? "✓" : "✗"}
                </span>
                <span>{guess}</span>
              </>
            ) : (
              <span style={{ fontSize: "0.78rem" }}>Guess {i + 1}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

const distBar: CSSProperties = {
  borderRadius: 4,
  fontSize: "0.75rem",
  fontWeight: 800,
  padding: "1px 6px",
  textAlign: "right",
  boxSizing: "border-box",
};

/** Played / win rate / average guesses, plus a guess-count histogram once anything is played. */
export function StatsPanel({
  theme,
  sectionPanel,
  label,
  stats,
  maxGuesses,
}: {
  theme: AppTheme;
  sectionPanel: CSSProperties;
  label: string;
  stats: GuessStats;
  maxGuesses: number;
}) {
  const maxCount = Math.max(1, ...stats.distribution);
  const summary = [
    { label: "Played", value: String(stats.played) },
    { label: "Win Rate", value: `${stats.winRate}%` },
    { label: "Avg Guesses", value: stats.avgGuesses !== null ? stats.avgGuesses.toFixed(2) : "—" },
  ];

  return (
    <div className="fade-in panel-card" style={sectionPanel}>
      <div className="tool-field-label" style={{ color: theme.muted, marginBottom: "0.6rem" }}>
        {label}
      </div>
      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", marginBottom: stats.played > 0 ? "0.9rem" : 0 }}>
        {summary.map((s) => (
          <div key={s.label}>
            <div style={{ fontSize: "1.2rem", fontWeight: 800, color: theme.text }}>{s.value}</div>
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: theme.muted }}>{s.label}</div>
          </div>
        ))}
      </div>
      {stats.played > 0 && (
        <div style={{ display: "grid", gap: "0.3rem" }}>
          {stats.distribution.map((count, i) => {
            const label = i < maxGuesses ? String(i + 1) : "X";
            return (
              // react-doctor-disable-next-line no-array-index-as-key -- `label` is the row's identity, not its position: a fixed-length guess histogram (1..maxGuesses then X) that never reorders or filters
              <div key={label} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ width: 14, fontSize: "0.75rem", fontWeight: 800, color: theme.muted }}>{label}</span>
                <div
                  style={{
                    ...distBar,
                    width: `${(count / maxCount) * 100}%`,
                    minWidth: count > 0 ? 26 : 8,
                    background: i < maxGuesses ? theme.accent : STATUS.danger.fill,
                    color: i < maxGuesses ? theme.accentOn : STATUS.danger.on,
                    opacity: count > 0 ? 1 : 0.25,
                  }}
                >
                  {count}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
