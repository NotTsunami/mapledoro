"use client";

import AppShell from "../../../components/AppShell";
import StatOptimizerWorkspace from "../../../features/tools/stat-optimizer/StatOptimizerWorkspace";

export default function StatOptimizerPage() {
  return (
    <AppShell currentPath="/tools">
      {({ theme }) => <StatOptimizerWorkspace theme={theme} />}
    </AppShell>
  );
}
