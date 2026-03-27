"use client";

/*
  Settings page.
  Placeholder — will allow users to configure preferences.
*/
import AppShell from "../../components/AppShell";
import type { AppTheme } from "../../components/themes";

function SettingsContent({ theme }: { theme: AppTheme }) {
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
          className="fade-in panel-card empty-state"
          style={{
            background: theme.panel,
            border: `1px solid ${theme.border}`,
            padding: "3rem 1.5rem",
          }}
        >
          <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>⚙️</div>
          <div style={{ fontSize: "0.9rem", color: theme.muted, fontWeight: 600 }}>
            Settings coming soon.
          </div>
        </div>
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
