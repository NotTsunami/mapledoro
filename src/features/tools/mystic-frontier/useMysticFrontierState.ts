"use client";

import { useMemo } from "react";
import { usePerCharacterToolState } from "../usePerCharacterToolState";
import { getMfFamiliar } from "./familiars";
import {
  getBonusItem, getBonusItemById, type MfBonusColor, type MfBonusFamily, type MfBonusItem,
} from "./bonusItemsData";
import {
  calculateScore,
  effectiveMaxDie,
  globalDiceCap,
  rerollSuggestions,
  type CalcSlot,
  type RerollSuggestion,
  type ScoreResult,
} from "./calc";
import { isLineSelectableFor } from "./potentialEngine";
import { MF_RARITY_DICE, type MfRarity } from "./types";

const STORAGE_KEY = "mysticFrontier";
const SLOT_COUNT = 3;
export const WAVE_COUNT = 3;

export interface SlotState {
  familiarId: number | null;
  rarity: MfRarity;
  // The familiar's single Mystic Frontier potential line (must belong to the slot's
  // rarity). This is separate from the two regular familiar potential lines.
  line: number | null;
  die: number; // rolled value, 0 when no familiar
}

// A wave is a saved lineup preset: 3 familiar slots plus that wave's target score.
// A character keeps WAVE_COUNT waves (so up to 9 familiars saved per character).
interface WaveState {
  slots: SlotState[];
  target: number;
}

interface SavedState {
  waves: WaveState[];
  // Bonus dice items are equipped on the character, so they're shared across waves.
  // A flat list of item ids: any mix stacks, including several colors of the same
  // family (a White and a Blue Swift-Rolling Dice together).
  bonus: string[];
  activeWave: number;
}

function emptySlot(): SlotState {
  return { familiarId: null, rarity: "legendary", line: null, die: 0 };
}

function emptyWave(): WaveState {
  return { slots: Array.from({ length: SLOT_COUNT }, emptySlot), target: 0 };
}

function defaultState(): SavedState {
  return { waves: Array.from({ length: WAVE_COUNT }, emptyWave), bonus: [], activeWave: 0 };
}

// Legacy saves held at most one color per family ({ Swift: "Blue" }); fold them into
// the flat id list, dropping ids that no longer exist in the item data.
function parseBonus(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((id): id is string => typeof id === "string" && getBonusItemById(id) !== undefined);
  }
  if (!raw || typeof raw !== "object") return [];
  return Object.entries(raw as Record<string, unknown>).flatMap(([family, color]) => {
    const item =
      typeof color === "string"
        ? getBonusItem(family as MfBonusFamily, color as MfBonusColor)
        : undefined;
    return item ? [item.id] : [];
  });
}

function parseSlot(raw: unknown): SlotState {
  const base = emptySlot();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const rarity = typeof r.rarity === "string" && r.rarity in MF_RARITY_DICE ? (r.rarity as MfRarity) : base.rarity;
  return {
    familiarId: typeof r.familiarId === "number" ? r.familiarId : null,
    rarity,
    line: typeof r.line === "number" ? r.line : null,
    die: typeof r.die === "number" ? r.die : 0,
  };
}

function parseWave(raw: unknown): WaveState {
  if (!raw || typeof raw !== "object") return emptyWave();
  const r = raw as Record<string, unknown>;
  const slots = Array.isArray(r.slots) ? r.slots : [];
  return {
    slots: Array.from({ length: SLOT_COUNT }, (_, i) => parseSlot(slots[i])),
    target: typeof r.target === "number" ? r.target : 0,
  };
}

function parseState(raw: unknown): SavedState {
  if (!raw || typeof raw !== "object") return defaultState();
  const r = raw as Record<string, unknown>;
  // Legacy saves (pre-waves) held a single `slots`/`target` — fold them into wave 1.
  const waveSource = Array.isArray(r.waves) ? r.waves : [{ slots: r.slots, target: r.target }];
  const activeWave =
    typeof r.activeWave === "number" ? Math.min(Math.max(0, Math.floor(r.activeWave)), WAVE_COUNT - 1) : 0;
  return {
    waves: Array.from({ length: WAVE_COUNT }, (_, i) => parseWave(waveSource[i])),
    bonus: parseBonus(r.bonus),
    activeWave,
  };
}

function toCalcSlot(slot: SlotState): CalcSlot {
  const fam = getMfFamiliar(slot.familiarId);
  const present = fam !== undefined;
  return {
    present,
    rarity: slot.rarity,
    type: fam?.type ?? "Human",
    element: fam?.element ?? "None",
    potentialIds: slot.line !== null ? [slot.line] : [],
    die: present ? slot.die : 0,
  };
}

// Immutable edits scoped to the active wave (kept at module scope so the setters
// below don't nest closures too deeply).
function updateActiveWave(prev: SavedState, fn: (w: WaveState) => WaveState): SavedState {
  return { ...prev, waves: prev.waves.map((w, i) => (i === prev.activeWave ? fn(w) : w)) };
}

function editActiveSlot(prev: SavedState, index: number, fn: (s: SlotState) => SlotState): SavedState {
  return updateActiveWave(prev, (w) => ({
    ...w,
    slots: w.slots.map((s, i) => (i === index ? fn(s) : s)),
  }));
}

function serializeMysticFrontier(state: SavedState): SavedState {
  return state;
}

export function useMysticFrontierState() {
  const { mounted, characters, selectedCharName, handleCharChange, state, update } =
    usePerCharacterToolState({
      toolKey: STORAGE_KEY,
      parse: parseState,
      serialize: serializeMysticFrontier,
    });

  // ── setters (all scoped to the active wave) ────────────────────────────────
  const patchSlot = (index: number, patch: Partial<SlotState>) =>
    update((prev) => editActiveSlot(prev, index, (s) => ({ ...s, ...patch })));

  function setFamiliar(index: number, familiarId: number | null): void {
    update((prev) =>
      editActiveSlot(prev, index, (s) =>
        familiarId === null ? emptySlot() : { ...s, familiarId, die: s.die === 0 ? 1 : s.die },
      ),
    );
  }

  function setRarity(index: number, rarity: MfRarity): void {
    // The selectable potential pool is rarity-specific, so drop a line that no longer
    // belongs (an Epic line survives a Unique ↔ Legendary switch), and clamp the die
    // to the new face count.
    update((prev) =>
      editActiveSlot(prev, index, (s) => ({
        ...s,
        rarity,
        line: s.line !== null && isLineSelectableFor(s.line, rarity) ? s.line : null,
        die: Math.min(s.die, MF_RARITY_DICE[rarity]),
      })),
    );
  }

  const setLine = (index: number, id: number | null) => patchSlot(index, { line: id });
  const setDie = (index: number, die: number) => patchSlot(index, { die });

  function addBonus(family: MfBonusFamily, color: MfBonusColor): void {
    const item = getBonusItem(family, color);
    if (!item) return;
    update((prev) => ({ ...prev, bonus: [...prev.bonus, item.id] }));
  }

  const removeBonus = (index: number) =>
    update((prev) => ({ ...prev, bonus: prev.bonus.filter((_, i) => i !== index) }));

  const setTarget = (target: number) => update((prev) => updateActiveWave(prev, (w) => ({ ...w, target })));
  const setActiveWave = (i: number) =>
    update((prev) => ({ ...prev, activeWave: Math.min(Math.max(0, i), WAVE_COUNT - 1) }));
  const reset = () => update((prev) => updateActiveWave(prev, emptyWave));

  // ── derived (active wave) ──────────────────────────────────────────────────
  const activeWave = state.waves[state.activeWave];
  const slots = activeWave.slots;
  const target = activeWave.target;

  // A "Prevents dice from rolling over N" line caps every die; clamp the stored
  // roll values so an out-of-range die can't survive after such a line is added.
  const calcSlots = useMemo(() => {
    const base = slots.map(toCalcSlot);
    const cap = globalDiceCap(base);
    if (cap === null) return base;
    return base.map((s) => ({ ...s, die: Math.min(s.die, effectiveMaxDie(s.rarity, cap)) }));
  }, [slots]);

  const bonusItems = useMemo<MfBonusItem[]>(
    () =>
      state.bonus.flatMap((id) => {
        const item = getBonusItemById(id);
        return item ? [item] : [];
      }),
    [state.bonus],
  );

  const result = useMemo<ScoreResult>(() => calculateScore(calcSlots, bonusItems), [calcSlots, bonusItems]);

  const rerolls = useMemo<RerollSuggestion[]>(
    () => (target > 0 ? rerollSuggestions(calcSlots, bonusItems, target) : []),
    [calcSlots, bonusItems, target],
  );

  const diceCap = useMemo(() => globalDiceCap(calcSlots), [calcSlots]);

  const waveFilledCounts = useMemo(
    () => state.waves.map((w) => w.slots.filter((s) => s.familiarId !== null).length),
    [state.waves],
  );

  const hasLineup = calcSlots.some((s) => s.present);
  const passed = target > 0 && hasLineup && result.finalResult >= target;

  return {
    mounted,
    characters,
    selectedCharName,
    handleCharChange,
    activeWave: state.activeWave,
    setActiveWave,
    waveCount: WAVE_COUNT,
    waveFilledCounts,
    slots,
    target,
    bonusItems,
    setFamiliar,
    setRarity,
    setLine,
    setDie,
    addBonus,
    removeBonus,
    setTarget,
    reset,
    result,
    rerolls,
    diceCap,
    hasLineup,
    passed,
    maxDieFor: (rarity: MfRarity) => effectiveMaxDie(rarity, diceCap),
  };
}
