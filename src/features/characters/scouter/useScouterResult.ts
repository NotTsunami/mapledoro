"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { StoredCharacterRecord } from "../model/charactersStore";
import { findScouterSetupGap, isScouterSupportedClass, type ScouterSetupGap } from "./scouterApi";
import { scouterResultFor, type ScouterErrorReason, type ScouterResultEntry } from "./scouterResult";
import { ensureScouterEngine, getScouterEngineState, subscribeScouterEngine } from "./engine/scouterLocal";
import { getScouterDevOverride, subscribeScouterDevOverride } from "./scouterDevDrill";

export type { ScouterErrorReason };

export type ScouterFigureStatus =
  | { kind: "unsupported" }
  | { kind: "incomplete"; gap: ScouterSetupGap }
  // The engine's class data is still loading (once per page load).
  | { kind: "loading" }
  | { kind: "ready"; entry: ScouterResultEntry }
  | { kind: "error"; reason: ScouterErrorReason };

function statusFor(character: StoredCharacterRecord, engineFailed: boolean): ScouterFigureStatus {
  if (!isScouterSupportedClass(character.jobName)) return { kind: "unsupported" };
  const gap = findScouterSetupGap(character);
  if (gap) return { kind: "incomplete", gap };
  if (engineFailed) return { kind: "error", reason: "network" };
  const result = scouterResultFor(character);
  if (!result) return { kind: "loading" };
  return result.ok ? { kind: "ready", entry: result.entry } : { kind: "error", reason: result.reason };
}

/** The character's Scouter status, always for its current data: there is no refresh step, since
 *  the local engine computes a result in milliseconds (and remembers it by input hash, so
 *  re-renders cost nothing). The only wait is the engine's class data loading once per page. */
export function useScouterResult(character: StoredCharacterRecord): ScouterFigureStatus {
  const engineState = useSyncExternalStore(subscribeScouterEngine, getScouterEngineState, () => "idle" as const);
  // Starts the one-time data load, or retries a failed one when a Scouter view mounts again.
  useEffect(() => {
    void ensureScouterEngine();
  }, []);

  // Dev-only visual QA override (scouterDevDrill.ts), reactive via useSyncExternalStore so
  // calling __mapledoroForceScouterStatus in the console updates the figure immediately.
  const devOverride = useSyncExternalStore(
    subscribeScouterDevOverride,
    () => getScouterDevOverride(character.characterName),
    () => null,
  );
  return devOverride ?? statusFor(character, engineState === "failed");
}
