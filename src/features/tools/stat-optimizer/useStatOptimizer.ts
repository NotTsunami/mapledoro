"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMounted } from "../../../lib/useMounted";
import {
  readCharactersStore,
  selectCharactersList,
  selectCharacterByIgn,
  type StoredCharacterRecord,
} from "../../characters/model/charactersStore";
import { peekScouterCache, refreshScouterResult } from "../../characters/scouter/scouterCache";
import { useApplyCharacterQueryParam } from "../useApplyCharacterQueryParam";
import { readToolLevel, writeToolLevel } from "../toolLevel";
import {
  DEFAULT_BOSS_PDR,
  hasStatBaseline,
  zeroCalibration,
  type ClassDamageProfile,
  type KernelCalibration,
  type OptimizeTarget,
  type TripleStat,
} from "./damage-formula";
import {
  capHyperLevelToBudget,
  hyperAllocationCost,
  optimizeHyper,
  type HyperResult,
} from "./hyper-stat-engine";
import { availableHyperPoints, type HyperLineId } from "./hyper-stat-data";
import {
  capHexaLineLevel,
  optimizeHexa,
  type HexaCore,
  type HexaLine,
  type HexaResult,
} from "./hexa-stat-engine";
import {
  emptyCharacterSeed,
  seedFromCharacter,
  seedHyperPreset,
  type CalibrationNotice,
  type CharacterSeed,
  type TargetSeed,
} from "./stat-optimizer-character";
import { applyHexaToRecord, applyHyperToRecord, updateCharacterRecord } from "./stat-optimizer-apply";

export type OptimizerMode = "hyper" | "hexa";
/** Editable single-number stat inputs (the triples are edited via setTriplePart;
 *  level has its own setter because it also drives the hyper-point budget). */
export type ScalarInputKey =
  | "damagePct"
  | "bossDamagePct"
  | "critRatePct"
  | "critDamagePct"
  | "ignoreDefPct";
export type TripleInputKey = "main" | "sub" | "sub2" | "attack";
export type TriplePart = keyof TripleStat;
/** Which of a core's three lines an edit targets. */
export type CoreLineKey = "primary" | "alt0" | "alt1";
/** The active mode's optimizer output. Only one engine runs per render. */
type OptimizerResult =
  | { mode: "hyper"; hyper: HyperResult }
  | { mode: "hexa"; hexa: HexaResult };
/** Position of each line in a core's [primary, additional0, additional1] order. */
const CORE_LINE_SLOT: Record<CoreLineKey, 0 | 1 | 2> = { primary: 0, alt0: 1, alt1: 2 };

/** The tool's own key in the character store. Only the level is saved from an edit
 *  (see `setLevel`); the apply action writes the allocation itself elsewhere. */
const STAT_OPTIMIZER_TOOL_KEY = "statOptimizer";

/** Where the character's Boss 380 HEXA figure landed after an apply. It isn't ours
 *  to compute — MapleScouter derives it server-side — so the apply re-runs their
 *  lookup against the stat window it just wrote and reports what came back. */
export type ApplyOutcome =
  | { kind: "figure"; before: number | null; after: number }
  /** Written, but the character has no MapleScouter setup to recompute against. */
  | { kind: "unsupported" }
  /** Written, but the lookup failed (offline, rate limited, bad response). */
  | { kind: "failed" };

/** An apply and its result, tagged with what it applied to so a character or mode
 *  switch stops showing an answer that no longer belongs to the panel on screen. */
export interface ApplyRun {
  char: string;
  mode: OptimizerMode;
  status: "applying" | "done";
  outcome: ApplyOutcome | null;
}

async function recomputeBoss380Hexa(
  record: StoredCharacterRecord,
  before: number | null,
): Promise<ApplyOutcome> {
  const result = await refreshScouterResult(record);
  // A stale "ok" is the LAST good entry handed back after a failed refetch, so it
  // describes the allocation we just replaced -- not a recomputed figure.
  if (result.status === "ok" && !result.stale) {
    return { kind: "figure", before, after: result.entry.boss380Hexa };
  }
  return result.status === "unsupported" ? { kind: "unsupported" } : { kind: "failed" };
}

interface SelectionState {
  profile: ClassDamageProfile;
  cores: HexaCore[];
  presetCount: number;
  calibration: KernelCalibration;
  calibrationNotice: CalibrationNotice | null;
  /** Bossing and mobbing each keep their own inputs, allocation and preset. */
  targets: Record<OptimizeTarget, TargetSeed>;
}

/** Maps a seed (from a character or the blank standalone one) into editable state. */
function seedToState(seed: CharacterSeed): SelectionState {
  return {
    profile: seed.profile,
    cores: seed.cores,
    presetCount: seed.presetCount,
    calibration: seed.calibration,
    calibrationNotice: seed.calibrationNotice,
    targets: seed.targets,
  };
}

export function useStatOptimizer() {
  const mounted = useMounted();
  const characters: StoredCharacterRecord[] = useMemo(
    () => (mounted ? selectCharactersList(readCharactersStore()) : []),
    [mounted],
  );

  const [mode, setMode] = useState<OptimizerMode>("hyper");
  const applyModeParam = useCallback(() => {
    if (new URLSearchParams(window.location.search).get("mode") === "hexa") setMode("hexa");
  }, []);
  // Reads `?mode=hexa` (e.g. a link from the Stats bookmark's HEXA Stat view) once after
  // mount, same as useApplyCharacterQueryParam below -- the mode toggle renders outside
  // the mounted skeleton gate (StatOptimizerWorkspace), so seeding this from the query
  // string in useState's initializer would read "hexa" on the client but "hyper" during
  // SSR (no window there), a hydration mismatch. Applying it as a post-mount effect keeps
  // both renders starting from the same "hyper" default.
  const appliedModeParamRef = useRef(false);
  useEffect(() => {
    if (appliedModeParamRef.current || !mounted) return;
    appliedModeParamRef.current = true;
    applyModeParam();
  }, [mounted, applyModeParam]);
  // Bossing or mobbing. Hyper Stat only: HEXA Stat is a bossing decision, so it
  // always reads the bossing slice (`activeTarget`) whatever this is set to.
  const [target, setTarget] = useState<OptimizeTarget>("bossing");
  const activeTarget: OptimizeTarget = mode === "hyper" ? target : "bossing";
  const [selectedCharName, setSelectedCharName] = useState<string | null>(null);
  // The optimizer works standalone: state always exists (blank until a character is picked, which
  // autopopulates it). Edits stay in memory, with the sole exception of the level (see `setLevel`).
  const [state, setState] = useState<SelectionState>(() => seedToState(emptyCharacterSeed()));
  // Boss physical defense the allocation is valued against (percent), picked
  // per boss like maplescouter. Only rescales the ignore-def bucket.
  const [bossPdrPct, setBossPdr] = useState<number>(DEFAULT_BOSS_PDR);

  // Mirrors `selectedCharName` for the post-await guard in applyRecommendation,
  // which can't read the state it closed over. This is the only setter of it.
  const selectedCharRef = useRef<string | null>(null);

  const handleCharChange = useCallback((charName: string | null) => {
    selectedCharRef.current = charName;
    setSelectedCharName(charName);
    const record = charName ? selectCharacterByIgn(readCharactersStore(), charName) : null;
    // Cache-only read (no network call, see peekScouterCache): a hit calibrates the
    // kernel onto scouter's buffed footing, a miss leaves the raw stat window.
    const seed = record
      ? seedFromCharacter(
          record,
          peekScouterCache(record)?.specEfficiency,
          readToolLevel(record, STAT_OPTIMIZER_TOOL_KEY),
        )
      : emptyCharacterSeed();
    setState(seedToState(seed));
  }, []);

  useApplyCharacterQueryParam({ mounted, characters, handleCharChange });

  /** Rewrites just the active target's slice, leaving the other one untouched. */
  const patchTarget = useCallback(
    (fn: (slice: TargetSeed) => TargetSeed) => {
      setState((prev) => ({
        ...prev,
        targets: { ...prev.targets, [activeTarget]: fn(prev.targets[activeTarget]) },
      }));
    },
    [activeTarget],
  );

  const setScalarInput = useCallback(
    (key: ScalarInputKey, value: number) => {
      patchTarget((t) => ({ ...t, inputs: { ...t.inputs, [key]: value } }));
    },
    [patchTarget],
  );

  const setTriplePart = useCallback(
    (key: TripleInputKey, part: TriplePart, value: number) => {
      patchTarget((t) => ({ ...t, inputs: { ...t.inputs, [key]: { ...t.inputs[key], [part]: value } } }));
    },
    [patchTarget],
  );

  // The level stays editable with a character selected, since the record's level only refreshes on
  // a lookup and a player who levelled since still needs the tool. It is the one edit that
  // persists (under the tool's own key, floored by the record's level on the way back in), and the
  // budget is recomputed from the closed form less the same untracked-line spending the seed
  // deducted, so typing a level never silently hands those points back. Applied to both targets:
  // the level is a fact about the character, not a per-target value.
  const setLevel = useCallback((level: number) => {
    const applyLevel = (t: TargetSeed): TargetSeed => ({
      ...t,
      inputs: { ...t.inputs, level },
      availablePoints: Math.max(0, availableHyperPoints(level) - t.untrackedPoints),
    });
    setState((prev) => {
      if (selectedCharName) writeToolLevel(selectedCharName, STAT_OPTIMIZER_TOOL_KEY, level);
      return {
        ...prev,
        targets: { bossing: applyLevel(prev.targets.bossing), mobbing: applyLevel(prev.targets.mobbing) },
      };
    });
  }, [selectedCharName]);

  // Clamped against what the other lines already spend, so a typed-in allocation can
  // never cost more hyper points than the character actually has.
  const setHyperLevel = useCallback(
    (id: HyperLineId, level: number) => {
      patchTarget((t) => {
        const spentElsewhere = hyperAllocationCost({ ...t.storedHyper, [id]: 0 });
        const capped = capHyperLevelToBudget(level, t.availablePoints - spentElsewhere);
        return { ...t, storedHyper: { ...t.storedHyper, [id]: capped } };
      });
    },
    [patchTarget],
  );

  // Swaps in another of the character's in-game Hyper Stat presets as the "now"
  // allocation, which also re-derives the budget (a different preset locks a
  // different amount into lines this target doesn't reallocate). Re-derived off
  // the level on screen, not the record's, so switching presets after typing a
  // level doesn't roll the budget back to the last lookup.
  const setPresetIndex = useCallback(
    (presetIndex: number) => {
      const record = selectedCharName
        ? selectCharacterByIgn(readCharactersStore(), selectedCharName)
        : null;
      if (!record) return;
      setState((prev) => ({
        ...prev,
        targets: {
          ...prev.targets,
          [activeTarget]: {
            ...prev.targets[activeTarget],
            presetIndex,
            ...seedHyperPreset(
              record,
              prev.profile,
              activeTarget,
              presetIndex,
              prev.targets[activeTarget].inputs.level,
            ),
          },
        },
      }));
    },
    [activeTarget, selectedCharName],
  );

  const setCoreUnlocked = useCallback((index: number, unlocked: boolean) => {
    setState((prev) => ({ ...prev, cores: prev.cores.map((c, i) => (i === index ? { ...c, unlocked } : c)) }));
  }, []);

  // A typed level is clamped against what the core's other two lines already
  // spend, so a core can never exceed the HEXA_CORE_TOTAL levels the game rolls.
  const setCoreLine = useCallback((index: number, line: CoreLineKey, patch: Partial<HexaLine>) => {
    setState((prev) => {
      const cores = prev.cores.map((c, i): HexaCore => {
        if (i !== index) return c;
        const lines: [HexaLine, HexaLine, HexaLine] = [c.primary, c.additional[0], c.additional[1]];
        const slot = CORE_LINE_SLOT[line];
        const others = lines[0].level + lines[1].level + lines[2].level - lines[slot].level;
        const applied =
          patch.level === undefined ? patch : { ...patch, level: capHexaLineLevel(patch.level, others) };
        lines[slot] = { ...lines[slot], ...applied };
        return { unlocked: c.unlocked, primary: lines[0], additional: [lines[1], lines[2]] };
      });
      return { ...prev, cores };
    });
  }, []);

  // Only the mode on screen is optimized. Both engines re-ran on every keystroke
  // before, and the inactive one's result was never rendered; switching modes now
  // costs the one pass that mode actually needs. Discriminated on `mode` so the
  // panel branch reads the result it can use without a null check.
  const active = state.targets[activeTarget];
  // Mobbing is valued off the typed stat window alone: the buffed-state
  // calibration folds in bossing links, potions and seed rings, which is exactly
  // the state a mobbing run isn't in.
  const calibration = useMemo(
    () => (activeTarget === "bossing" ? state.calibration : zeroCalibration()),
    [activeTarget, state.calibration],
  );

  const result: OptimizerResult = useMemo(
    () =>
      mode === "hyper"
        ? {
            mode,
            hyper: optimizeHyper({
              profile: state.profile,
              inputs: active.inputs,
              currentHyper: active.storedHyper,
              availablePoints: active.availablePoints,
              target: activeTarget,
              bossPdrPct,
              calibration,
            }),
          }
        : {
            mode,
            hexa: optimizeHexa({
              profile: state.profile,
              inputs: active.inputs,
              cores: state.cores,
              bossPdrPct,
              calibration,
            }),
          },
    [
      mode,
      state.profile,
      active.inputs,
      active.storedHyper,
      active.availablePoints,
      state.cores,
      activeTarget,
      bossPdrPct,
      calibration,
    ],
  );

  // Both optimizers return a 0% gain against an empty stat window; that means
  // "nothing to work from", not "already optimal", so the panels gate on it.
  const hasStats = useMemo(
    () => hasStatBaseline(state.profile, active.inputs),
    [state.profile, active.inputs],
  );

  // The tool's one write to the character store, and the only one that touches a
  // character's real data: it swaps in the recommended allocation AND moves the
  // stat window by what those lines grant, since a stored stat window is the
  // in-game tooltip and already includes the allocation being replaced (see
  // stat-optimizer-apply.ts). The panel gates it behind a confirm for that reason:
  // it only describes reality once the player has really respecced in-game.
  const [applyRun, setApplyRun] = useState<ApplyRun | null>(null);

  const applyRecommendation = useCallback(async () => {
    const char = selectedCharName;
    if (!char) return;
    const previous = selectCharacterByIgn(readCharactersStore(), char);
    if (!previous) return;
    // Read before the write: afterwards the payload hash has moved and this
    // entry is no longer the character's current one.
    const before = peekScouterCache(previous)?.boss380Hexa ?? null;
    setApplyRun({ char, mode, status: "applying", outcome: null });
    const written = updateCharacterRecord(char, (record) =>
      result.mode === "hyper"
        ? applyHyperToRecord(record, {
            profile: state.profile,
            target: activeTarget,
            presetIndex: active.presetIndex,
            level: active.inputs.level,
            current: active.storedHyper,
            best: result.hyper.allocation,
          })
        : applyHexaToRecord(record, {
            profile: state.profile,
            level: active.inputs.level,
            cores: state.cores,
            recommended: result.hexa.cores,
          }),
    );
    if (!written) {
      setApplyRun(null);
      return;
    }
    const outcome = await recomputeBoss380Hexa(written, before);
    // Re-seed last: the store is the truth now, so the Now column, the gain and
    // the calibration should all describe what was just written -- and the
    // lookup above is what left a matching Scouter entry for the calibration to
    // read (without it every apply would drop the panel to "uncalibrated").
    // Skipped if the picker moved on during that lookup (a real network round
    // trip), which would otherwise pull the panel back to the applied character.
    if (selectedCharRef.current === char) handleCharChange(char);
    setApplyRun({ char, mode, status: "done", outcome });
  }, [selectedCharName, mode, result, state.profile, state.cores, activeTarget, active.presetIndex, active.inputs.level, active.storedHyper, handleCharChange]);

  return {
    mounted,
    characters,
    selectedCharName,
    handleCharChange,
    mode,
    setMode,
    target,
    setTarget,
    activeTarget,
    state,
    /** The active target's editable slice (inputs, allocation, budget, preset). */
    active,
    bossPdrPct,
    setBossPdr,
    setScalarInput,
    setTriplePart,
    setLevel,
    setHyperLevel,
    setPresetIndex,
    setCoreUnlocked,
    setCoreLine,
    result,
    hasStats,
    applyRecommendation,
    /** The last apply, or null once it no longer belongs to the panel on screen. */
    applyRun:
      applyRun && applyRun.char === selectedCharName && applyRun.mode === mode ? applyRun : null,
  };
}
