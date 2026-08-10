"use client";

import { useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import { useTheme } from "./ThemeContext";
import type { AppTheme } from "./themes";
import { statusText } from "./statusColors";
import {
  clearStorageWriteFailure,
  getStorageWriteFailureServerSnapshot,
  getStorageWriteFailureSnapshot,
  subscribeStorageWriteFailure,
} from "../lib/storageWriteFailure";

export default function StorageWriteFailureBanner() {
  const { theme } = useTheme();
  const failed = useSyncExternalStore(
    subscribeStorageWriteFailure,
    getStorageWriteFailureSnapshot,
    getStorageWriteFailureServerSnapshot,
  );

  if (!failed) return null;
  return <Banner theme={theme} onDismiss={clearStorageWriteFailure} />;
}

function Banner({ theme, onDismiss }: { theme: AppTheme; onDismiss: () => void }) {
  const containerStyle: CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 60,
    padding: "0.75rem 1.5rem",
    background: theme.panel,
    borderBottom: `2px solid ${statusText(theme, "danger")}`,
    boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "1rem",
    flexWrap: "wrap",
  };

  const dismissStyle: CSSProperties = {
    background: "none",
    border: `1px solid ${theme.border}`,
    borderRadius: "10px",
    padding: "0.4rem 0.9rem",
    font: "inherit",
    fontSize: "0.82rem",
    fontWeight: 800,
    color: theme.muted,
    cursor: "pointer",
    flexShrink: 0,
  };

  return (
    <div style={containerStyle} role="alert">
      <p style={{ margin: 0, fontSize: "0.82rem", fontWeight: 600, color: theme.text, maxWidth: 620 }}>
        <strong style={{ color: statusText(theme, "danger") }}>Your latest change was not saved.</strong>{" "}
        Browser storage is full or blocked, so recent edits will be missing next
        time you open MapleDoro. Removing characters you no longer track frees up
        space.
      </p>
      <button type="button" onClick={onDismiss} style={dismissStyle}>
        Dismiss
      </button>
    </div>
  );
}
