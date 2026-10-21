// Dev-only preview drill for the Scouter figure's UI states, letting a developer eyeball every
// status and tooltip variant without triggering each one for real (a failed data load is awkward
// to reproduce on demand). This is throwaway visual-QA tooling, not a permanent feature. Every entry point is behind NODE_ENV,
// the same convention as wipeTripwire.ts's __mapledoroTestTripwire drill.

import type { ScouterFigureStatus } from "./useScouterResult";

const overrides = new Map<string, ScouterFigureStatus>();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function subscribeScouterDevOverride(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getScouterDevOverride(characterName: string): ScouterFigureStatus | null {
  return overrides.get(characterName.trim().toLowerCase()) ?? null;
}

function placeholderEntry() {
  return {
    boss300Normal: 98765,
    boss300Hexa: 96543,
    boss380Normal: 118420,
    boss380Hexa: 112984,
  };
}

function buildExampleStatuses(): Record<string, ScouterFigureStatus> {
  return {
    unsupported: { kind: "unsupported" },
    incomplete_character_info: { kind: "incomplete", gap: "characterInfo" },
    incomplete_quick_questions: { kind: "incomplete", gap: "quickQuestions" },
    loading: { kind: "loading" },
    ready: { kind: "ready", entry: placeholderEntry() },
    error_bad_response: { kind: "error", reason: "bad_response" },
    error_network: { kind: "error", reason: "network" },
  };
}

/** Dev-only drill: `__mapledoroForceScouterStatus("<character name>", "error_network")` forces
 *  that character's Scouter figure to render as if in that state, reactively, with no reload
 *  or navigation. Pass `null` as the second argument to clear the override. Valid status names
 *  are the keys of buildExampleStatuses(). Nothing is saved; this is purely an in-memory
 *  render override. */
function installScouterStatusDrill() {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return;
  const target = window as typeof window & {
    __mapledoroForceScouterStatus?: (name: string, statusName: string | null) => void;
  };
  if (target.__mapledoroForceScouterStatus) return;
  target.__mapledoroForceScouterStatus = (name, statusName) => {
    const key = name.trim().toLowerCase();
    if (statusName === null) {
      overrides.delete(key);
      console.info(`[scouter drill] cleared override for ${key}.`);
      notify();
      return;
    }
    const exampleStatuses = buildExampleStatuses();
    const status = exampleStatuses[statusName];
    if (!status) {
      console.warn(`[scouter drill] unknown status "${statusName}". Options: ${Object.keys(exampleStatuses).join(", ")}`);
      return;
    }
    overrides.set(key, status);
    console.info(`[scouter drill] forcing ${key}'s Scouter figure to "${statusName}". Nothing is saved. Call __mapledoroForceScouterStatus("${key}", null) to clear.`);
    notify();
  };
}

installScouterStatusDrill();
