"use client";

/*
  Guides landing page.
  Placeholder — will display community guides and resources.
*/
import AppShell from "../../components/AppShell";
import type { AppTheme } from "../../components/themes";

function GuidesContent({ theme }: { theme: AppTheme }) {
  return (
    <div className="page-content">
      <div className="page-container">
        <div className="page-title" style={{ color: theme.text }}>
          Guides
        </div>
        <div className="page-subtitle" style={{ color: theme.muted }}>
          MapleStory guides and resources
        </div>

        <div
          className="fade-in panel-card empty-state"
          style={{
            background: theme.panel,
            border: `1px solid ${theme.border}`,
            padding: "3rem 1.5rem",
          }}
        >
          <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>📖</div>
          <div style={{ fontSize: "0.9rem", color: theme.muted, fontWeight: 600 }}>
            Guides coming soon.
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GuidesPage() {
  return (
    <AppShell currentPath="/guides">
      {({ theme }) => <GuidesContent theme={theme} />}
    </AppShell>
  );
}
