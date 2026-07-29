"use client";

import type { AppTheme } from "../../../components/themes";
import { ItemIcon } from "../../../components/ResourceImage";
import {
  REMINDER_DEFS,
  useRemindersState,
  type ReminderDef,
} from "../../../lib/reminders";

// Colors only; shape comes from the shared `.tool-check-item` class.
function reminderItemStyle(
  theme: AppTheme,
  done: boolean,
): React.CSSProperties {
  return {
    background: done ? theme.accentSoft : theme.timerBg,
    border: `1px solid ${done ? theme.accent : theme.border}`,
    color: done ? theme.accentText : theme.text,
  };
}

function ReminderCheckItem({
  theme,
  def,
  done,
  onToggle,
}: {
  theme: AppTheme;
  def: ReminderDef;
  done: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="tool-check-item" style={reminderItemStyle(theme, done)}>
      <input
        type="checkbox"
        checked={done}
        onChange={onToggle}
        style={{ accentColor: theme.accent, cursor: "pointer", flexShrink: 0 }}
      />
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, minWidth: 0 }}>
        {"itemId" in def ? (
          <ItemIcon id={def.itemId} size={16} />
        ) : (
          <span style={{ fontSize: "0.82rem" }}>{def.icon}</span>
        )}
        <span style={{ textDecoration: done ? "line-through" : "none" }}>
          {def.title}
        </span>
      </span>
    </label>
  );
}

export default function RemindersConfigBar({ theme }: { theme: AppTheme }) {
  const { mounted, isCompleted, toggleCompleted } = useRemindersState();

  if (!mounted) return null;

  return (
    <>
      <style>{`
        .reminders-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; }
        .reminders-bar-items { display: flex; flex-wrap: wrap; gap: 0.5rem; }
        /* The label alone runs ~180px, so below this it can no longer share a
           line with a check and leave room for the rest. */
        @media (max-width: 700px) {
          .reminders-bar { display: block; }
          .reminders-bar-label { display: block; margin-bottom: 0.5rem; }
        }
        /* Narrow enough that the three checks stop fitting on one line, which
           would strand one of them; full-width rows instead of a ragged wrap. */
        @media (max-width: 560px) {
          .reminders-bar-items { display: grid; grid-template-columns: 1fr; }
          .reminders-bar-items .tool-check-item { min-height: 44px; padding: 5px 12px; }
        }
      `}</style>

      <div
        className="fade-in panel-card"
        style={{
          background: theme.panel,
          border: `1px solid ${theme.border}`,
          borderRadius: 14,
          padding: "0.9rem 1rem",
          marginBottom: "1.25rem",
        }}
      >
        <div className="reminders-bar">
          <span
            className="reminders-bar-label"
            style={{
              fontSize: "0.75rem",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: theme.muted,
            }}
          >
            Account-wide Dailies
          </span>
          <div className="reminders-bar-items">
            {REMINDER_DEFS.map((def) => (
              <ReminderCheckItem
                key={def.id}
                theme={theme}
                def={def}
                done={isCompleted(def.id)}
                onToggle={() => toggleCompleted(def.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
