"use client";

/*
  Drop Tracker route shell. The feature folder stays `pitched-boss-drops` and so
  does the `pitchedBossDrops` localStorage key, which holds live user data; only
  the URL follows the display name.
*/
import AppShell from "../../../components/AppShell";
import PitchedBossDropsWorkspace from "../../../features/tools/pitched-boss-drops/PitchedBossDropsWorkspace";

export default function PitchedBossDropsPage() {
  return (
    <AppShell currentPath="/tools">
      {({ theme }) => <PitchedBossDropsWorkspace theme={theme} />}
    </AppShell>
  );
}
