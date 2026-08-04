"use client";

import { useCallback, useState } from "react";
import { useMounted } from "./useMounted";

export type ReminderId = "ursus" | "autoHarvest" | "solErda";

export type ReminderDef = {
  id: ReminderId;
  title: string;
} & ({ icon: string } | { itemId: string });

export const REMINDER_DEFS: ReminderDef[] = [
  {
    id: "ursus",
    icon: "🐻",
    title: "Ursus",
  },
  {
    id: "autoHarvest",
    icon: "🌿",
    title: "Auto-Harvest",
  },
  {
    id: "solErda",
    itemId: "04009613", // Sol Erda Fragment
    title: "Sol Erda Booster",
  },
];

interface RemindersState {
  completed: Partial<Record<ReminderId, string>>;
}

const REMINDERS_STORAGE_KEY = "mapledoro_reminders_v1";

function utcDateStr(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultRemindersState(): RemindersState {
  return { completed: {} };
}

function loadRemindersState(): RemindersState {
  if (typeof window === "undefined") return defaultRemindersState();
  try {
    const raw = localStorage.getItem(REMINDERS_STORAGE_KEY);
    if (!raw) return defaultRemindersState();
    const parsed = JSON.parse(raw) as Partial<RemindersState>;
    return { completed: parsed.completed ?? {} };
  } catch {
    return defaultRemindersState();
  }
}

function saveRemindersState(state: RemindersState) {
  try {
    // react-doctor-disable-next-line no-side-effect-in-state-updater-function -- called from inside the setState updater by project convention (see root CLAUDE.md), so the write stays atomic with the state change rather than trailing it in an effect. Writing the derived state twice on a replay is idempotent.
    localStorage.setItem(REMINDERS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function useRemindersState() {
  const mounted = useMounted();
  const [state, setState] = useState<RemindersState>(loadRemindersState);

  const today = utcDateStr();

  const isCompleted = useCallback(
    (id: ReminderId) => state.completed[id] === today,
    [state.completed, today],
  );

  const toggleCompleted = useCallback((id: ReminderId) => {
    setState((prev) => {
      const current = prev.completed[id] === utcDateStr();
      const completed = { ...prev.completed };
      if (current) {
        delete completed[id];
      } else {
        completed[id] = utcDateStr();
      }
      const next = { ...prev, completed };
      saveRemindersState(next);
      return next;
    });
  }, []);

  return { mounted, isCompleted, toggleCompleted };
}
