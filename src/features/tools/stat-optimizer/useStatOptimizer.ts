"use client";

import { useCallback, useMemo, useState } from "react";
import { useMounted } from "../../../lib/useMounted";
import {
  readCharactersStore,
  selectCharactersList,
  selectCharacterByIgn,
  type StoredCharacterRecord,
} from "../../characters/model/charactersStore";
import { useApplyCharacterQueryParam } from "../useApplyCharacterQueryParam";
import {
  ENDGAME_BOSS_PDR,
  type ClassDamageProfile,
  type OptimizerStatInputs,
  type TripleStat,
} from "./damage-formula";
import { optimizeHyper, type HyperAllocation, type HyperResult } from "./hyper-stat-engine";
import { availableHyperPoints, type HyperLineId } from "./hyper-stat-data";
import { optimizeHexa, type HexaCore, type HexaLine, type HexaResult } from "./hexa-stat-engine";
import { emptyCharacterSeed, seedFromCharacter, type CharacterSeed } from "./stat-optimizer-character";

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

interface SelectionState {
  profile: ClassDamageProfile;
  inputs: OptimizerStatInputs;
  availablePoints: number;
  hyperAlloc: HyperAllocation;
  cores: HexaCore[];
}

/** Maps a seed (from a character or the blank standalone one) into editable state. */
function seedToState(seed: CharacterSeed): SelectionState {
  return {
    profile: seed.profile,
    inputs: seed.inputs,
    availablePoints: seed.availablePoints,
    hyperAlloc: seed.storedHyper,
    cores: seed.cores,
  };
}

export function useStatOptimizer() {
  const mounted = useMounted();
  const characters: StoredCharacterRecord[] = useMemo(
    () => (mounted ? selectCharactersList(readCharactersStore()) : []),
    [mounted],
  );

  const [mode, setMode] = useState<OptimizerMode>("hyper");
  const [selectedCharName, setSelectedCharName] = useState<string | null>(null);
  // The optimizer works standalone: state always exists (blank until a character
  // is picked, which autopopulates it). Edits stay in memory and are intentionally
  // not persisted; we could later save them per character if that proves useful.
  const [state, setState] = useState<SelectionState>(() => seedToState(emptyCharacterSeed()));
  // Boss physical defense the allocation is valued against (percent), editable
  // per boss like maplescouter. Only rescales the ignore-def bucket.
  const [bossPdrPct, setBossPdr] = useState<number>(ENDGAME_BOSS_PDR);

  const handleCharChange = useCallback((charName: string | null) => {
    setSelectedCharName(charName);
    const record = charName ? selectCharacterByIgn(readCharactersStore(), charName) : null;
    setState(seedToState(record ? seedFromCharacter(record) : emptyCharacterSeed()));
  }, []);

  useApplyCharacterQueryParam({ mounted, characters, handleCharChange });

  const setScalarInput = useCallback((key: ScalarInputKey, value: number) => {
    setState((prev) => ({ ...prev, inputs: { ...prev.inputs, [key]: value } }));
  }, []);

  const setTriplePart = useCallback((key: TripleInputKey, part: TriplePart, value: number) => {
    setState((prev) => ({
      ...prev,
      inputs: { ...prev.inputs, [key]: { ...prev.inputs[key], [part]: value } },
    }));
  }, []);

  // Only reachable in standalone mode (the level input is disabled while a
  // stored character is selected), so resetting the budget to the closed form
  // never stomps a seeded budget that deducts untracked-line spending.
  const setLevel = useCallback((level: number) => {
    setState((prev) => ({
      ...prev,
      inputs: { ...prev.inputs, level },
      availablePoints: availableHyperPoints(level),
    }));
  }, []);

  const setHyperLevel = useCallback((id: HyperLineId, level: number) => {
    setState((prev) => ({ ...prev, hyperAlloc: { ...prev.hyperAlloc, [id]: level } }));
  }, []);

  const setCoreUnlocked = useCallback((index: number, unlocked: boolean) => {
    setState((prev) => ({ ...prev, cores: prev.cores.map((c, i) => (i === index ? { ...c, unlocked } : c)) }));
  }, []);

  const setCoreLine = useCallback((index: number, line: CoreLineKey, patch: Partial<HexaLine>) => {
    setState((prev) => {
      const cores = prev.cores.map((c, i) => {
        if (i !== index) return c;
        if (line === "primary") return { ...c, primary: { ...c.primary, ...patch } };
        const altIndex = line === "alt0" ? 0 : 1;
        const additional: [HexaLine, HexaLine] = [c.additional[0], c.additional[1]];
        additional[altIndex] = { ...additional[altIndex], ...patch };
        return { ...c, additional };
      });
      return { ...prev, cores };
    });
  }, []);

  const hyperResult: HyperResult = useMemo(
    () =>
      optimizeHyper({
        profile: state.profile,
        inputs: state.inputs,
        currentHyper: state.hyperAlloc,
        availablePoints: state.availablePoints,
        bossPdrPct,
      }),
    [state.profile, state.inputs, state.hyperAlloc, state.availablePoints, bossPdrPct],
  );

  const hexaResult: HexaResult = useMemo(
    () =>
      optimizeHexa({
        profile: state.profile,
        inputs: state.inputs,
        cores: state.cores,
        bossPdrPct,
      }),
    [state.profile, state.inputs, state.cores, bossPdrPct],
  );

  return {
    mounted,
    characters,
    selectedCharName,
    handleCharChange,
    mode,
    setMode,
    state,
    bossPdrPct,
    setBossPdr,
    setScalarInput,
    setTriplePart,
    setLevel,
    setHyperLevel,
    setCoreUnlocked,
    setCoreLine,
    hyperResult,
    hexaResult,
  };
}
