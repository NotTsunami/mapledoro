"use client";

/*
  Settings page.
  TODO: Add user preferences here (e.g. default world selection — hook into
  mapledoro_pref_default_world to set the default directory world filter).
*/
import { createPortal } from "react-dom";
import { useState } from "react";
import AppShell from "../../components/AppShell";
import type { AppTheme } from "../../components/themes";

function hardReset() {
  const keys = Object.keys(localStorage).filter((k) => k.startsWith("mapledoro_"));
  keys.forEach((k) => localStorage.removeItem(k));
  window.location.reload();
}

function SettingsContent({ theme }: { theme: AppTheme }) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  return (
    <div className="page-content">
      <div className="page-container">
        <div className="page-title" style={{ color: theme.text }}>
          Settings
        </div>
        <div className="page-subtitle" style={{ color: theme.muted }}>
          Customize your MapleDoro experience
        </div>

        <div
          className="fade-in panel-card"
          style={{
            background: theme.panel,
            border: `1px solid ${theme.border}`,
            borderRadius: "14px",
            padding: "1.25rem 1.5rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
            flexWrap: "wrap",
            marginTop: "1rem",
          }}
        >
          <div>
            <p style={{ margin: 0, fontWeight: 800, fontSize: "0.95rem", color: theme.text }}>
              Reset all data
            </p>
            <p style={{ margin: 0, marginTop: "0.2rem", fontSize: "0.82rem", color: theme.muted, fontWeight: 700 }}>
              Clears all characters, settings, and saved state from this browser.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            style={{
              border: "1px solid #ef4444",
              borderRadius: "999px",
              background: "#fef2f2",
              color: "#991b1b",
              fontFamily: "inherit",
              fontWeight: 800,
              fontSize: "0.82rem",
              padding: "0.4rem 0.9rem",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            🗑 Reset all data
          </button>
        </div>

        {showResetConfirm && createPortal(
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15, 23, 42, 0.42)",
              display: "grid",
              placeItems: "center",
              zIndex: 60,
              padding: "1rem",
            }}
          >
            <div
              style={{
                width: "min(420px, 100%)",
                borderRadius: "14px",
                border: `1px solid ${theme.border}`,
                background: theme.panel,
                color: theme.text,
                padding: "1rem",
                boxShadow: "0 16px 48px rgba(0,0,0,0.24)",
                display: "grid",
                gap: "0.75rem",
              }}
            >
              <p style={{ margin: 0, fontSize: "1rem", fontWeight: 800 }}>
                Reset all data?
              </p>
              <p style={{ margin: 0, color: theme.muted, fontSize: "0.86rem", fontWeight: 700 }}>
                This will delete all your characters, world settings, and saved state from this browser. There is no undo.
              </p>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.55rem" }}>
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(false)}
                  style={{
                    border: `1px solid ${theme.border}`,
                    borderRadius: "10px",
                    background: theme.bg,
                    color: theme.text,
                    fontFamily: "inherit",
                    fontWeight: 800,
                    fontSize: "0.86rem",
                    padding: "0.5rem 0.75rem",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={hardReset}
                  style={{
                    border: "1px solid #fca5a5",
                    borderRadius: "10px",
                    background: "#ef4444",
                    color: "#fff",
                    fontFamily: "inherit",
                    fontWeight: 800,
                    fontSize: "0.86rem",
                    padding: "0.5rem 0.8rem",
                    cursor: "pointer",
                  }}
                >
                  Reset everything
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <AppShell currentPath="/settings">
      {({ theme }) => <SettingsContent theme={theme} />}
    </AppShell>
  );
}
