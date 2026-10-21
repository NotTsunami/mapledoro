"use client";

import { useSyncExternalStore, type CSSProperties } from "react";
import type { AppTheme } from "../../../components/themes";
import { statusText } from "../../../components/statusColors";
import { SCOUTER_ENGINE_NOTICE } from "./ScouterFigure";

// Owned here only: a per-browser "seen it" flag for the notice below, nothing else.
const DISMISSED_KEY = "mapledoro_scouter_engine_notice_dismissed";

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}
function dismiss() {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch { /* blocked storage: the notice just comes back next visit */ }
  for (const listener of listeners) listener();
}

function noticeStyle(theme: AppTheme): CSSProperties {
  return {
    display: "flex", alignItems: "flex-start", gap: 8, margin: 0, padding: "8px 10px",
    fontSize: 12, lineHeight: 1.45, color: theme.text, background: theme.panel,
    border: `1px solid ${theme.border}`, borderLeft: `3px solid ${statusText(theme, "info")}`, borderRadius: 8,
  };
}

const dismissStyle: CSSProperties = {
  background: "none", border: "none", padding: 0, font: "inherit", cursor: "pointer", lineHeight: 1, marginLeft: "auto",
};

/** Slim, dismissible strip above the Scouter and Stat Efficiency bookmarks, saying the figures now
 *  come from MapleDoro's own engine. Hidden during server render and once dismissed. */
export default function ScouterEngineNotice({ theme }: { theme: AppTheme }) {
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => true);
  if (dismissed) return null;
  return (
    <div role="note" style={noticeStyle(theme)}>
      <span>{SCOUTER_ENGINE_NOTICE}</span>
      <button type="button" className="tap-target-44" aria-label="Dismiss notice" onClick={dismiss} style={{ ...dismissStyle, color: theme.muted }}>✕</button>
    </div>
  );
}
