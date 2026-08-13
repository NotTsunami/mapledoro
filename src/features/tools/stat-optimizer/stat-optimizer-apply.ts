/*
  Writes a recommendation back to the character store. The tool is otherwise
  read-only (see the feature CLAUDE.md), so this is the one path that mutates a
  character, and it has to move TWO things together:

  1. The allocation itself — the hyper preset's levels, or the HEXA nodes' stat
     types and levels.
  2. The stat window totals those levels are already baked into. A stored stat
     window is what the player's in-game tooltip reads, which includes their
     current allocation; leave it alone and every downstream figure (MapleScouter,
     Boss Clear, this tool's own next run) still describes the old allocation.

  So the store change is the allocation plus the delta each moved line grants,
  landing in exactly the bucket the kernel valued it in (damage-formula.ts's
  header): main/sub stat into "% not applied", ATT inside the base, the percent
  lines into their own fields, and Ignore Enemy DEF re-stacked multiplicatively
  through the kernel's own `applyIed`.

  Deltas are computed from the allocation tables alone, never from the stat
  fields, so a stat value the user typed to model a hypothetical doesn't leak
  into what gets written — the delta is applied to whatever the store holds.

  Pure except for `updateCharacterRecord`; no React.
*/

import {
  readCharactersStore,
  selectCharacterByIgn,
  writeCharactersStore,
  type StoredCharacterRecord,
  type StoredCharacterStats,
  type StoredHyperStat,
  type StoredTripleStatField,
} from "../../characters/model/charactersStore";
import type { HexaStatNode, HexaStatSlot, HexaStatType } from "../../characters/setup/data/hexaStatData";
import { getHexaStatValue } from "../../characters/setup/data/hexaStatData";
import {
  applyIed,
  stackIedSources,
  type ClassDamageProfile,
  type MainStatId,
  type OptimizeTarget,
} from "./damage-formula";
import {
  HYPER_DA_MAIN_VALUES,
  HYPER_LINES,
  HYPER_TARGET_LINES,
  HYPER_VALUES,
  type HyperLineId,
} from "./hyper-stat-data";
import {
  ALL_HYPER_LINE_IDS,
  hyperPresetKey,
  mapStoredHyper,
  type HyperAllocation,
} from "./hyper-stat-engine";
import {
  HEXA_CORE_COUNT,
  type HexaCore,
  type HexaCoreRecommendation,
} from "./hexa-stat-engine";

// ── Stat window arithmetic ────────────────────────────────────────────────────

/**
 * How an allocation change moves the stored stat window, one entry per bucket
 * the kernel reads. Every field is a signed amount to add, except `iedOps`
 * (Ignore Enemy DEF doesn't add — see below).
 */
interface StatWindowDelta {
  /** Main stat into the "% Value Not Applied" bucket, like the game. */
  mainFlat: number;
  /** Main stat %, which only Demon Avenger's Max HP hyper line reaches. */
  mainPct: number;
  subFlat: number;
  sub2Flat: number;
  /** ATT / Magic ATT inside the base that ATT% multiplies. */
  atkBase: number;
  damage: number;
  bossDamage: number;
  normalDamage: number;
  critDamage: number;
  critRate: number;
  /** Ignore Enemy DEF stacks multiplicatively, so it takes ordered stack
   *  operations (negative = un-stack) rather than one additive amount. Each
   *  engine's own order is mirrored — see the two builders below. */
  iedOps: number[];
}

const zeroStatWindowDelta = (): StatWindowDelta => ({
  mainFlat: 0,
  mainPct: 0,
  subFlat: 0,
  sub2Flat: 0,
  atkBase: 0,
  damage: 0,
  bossDamage: 0,
  normalDamage: 0,
  critDamage: 0,
  critRate: 0,
  iedOps: [],
});

function num(value: string | undefined): number {
  if (!value) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Stat fields are strings in the store. Whole numbers stay whole; the IED
 *  re-stack is the only source of a fraction, and two places is what the in-game
 *  window itself shows. */
function fmt(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function addTo(
  field: StoredTripleStatField,
  part: keyof StoredTripleStatField,
  amount: number,
): StoredTripleStatField {
  if (amount === 0) return field;
  const next = { ...field };
  next[part] = fmt(num(field[part]) + amount);
  return next;
}

/** Ignore Enemy DEF after the change: each source stacked (or un-stacked) onto
 *  the stored total in order, through the kernel's own combiner. */
function restackIed(storedPct: string | undefined, ops: number[]): number {
  let frac = num(storedPct) / 100;
  for (const op of ops) frac = applyIed(op, frac);
  return frac * 100;
}

function applyStatWindowDelta(
  stats: StoredCharacterStats,
  profile: ClassDamageProfile,
  d: StatWindowDelta,
): StoredCharacterStats {
  const next = { ...stats };
  const bump = (id: MainStatId | null, part: keyof StoredTripleStatField, amount: number): void => {
    if (!id || amount === 0) return;
    next[id] = addTo(next[id], part, amount);
  };
  bump(profile.mainStat, "percentUnapplied", d.mainFlat);
  bump(profile.mainStat, "percent", d.mainPct);
  bump(profile.subStat, "percentUnapplied", d.subFlat);
  bump(profile.subStat2, "percentUnapplied", d.sub2Flat);

  if (profile.usesMagic) next.magicAtt = addTo(next.magicAtt, "base", d.atkBase);
  else next.attackPower = addTo(next.attackPower, "base", d.atkBase);

  if (d.damage !== 0) next.damage = fmt(num(next.damage) + d.damage);
  if (d.bossDamage !== 0) next.bossDamage = fmt(num(next.bossDamage) + d.bossDamage);
  if (d.normalDamage !== 0) next.normalEnemyDamage = fmt(num(next.normalEnemyDamage) + d.normalDamage);
  if (d.critDamage !== 0) next.criticalDamage = fmt(num(next.criticalDamage) + d.critDamage);
  if (d.critRate !== 0) next.criticalRate = fmt(num(next.criticalRate) + d.critRate);
  if (d.iedOps.some((op) => op !== 0)) {
    next.ignoreDefense = fmt(restackIed(next.ignoreDefense, d.iedOps));
  }
  return next;
}

// ── Hyper Stat ────────────────────────────────────────────────────────────────

/** Cumulative value a hyper line grants at a level (Demon Avenger's main line is
 *  Max HP %), matching the engine's own `lineValue`. */
function hyperLineValue(id: HyperLineId, level: number, isHpBased: boolean): number {
  if (level <= 0) return 0;
  if (id === "mainStat" && isHpBased) return HYPER_DA_MAIN_VALUES[level - 1];
  return HYPER_VALUES[id][level - 1];
}

/**
 * What the panel believes is allocated right now, across every line: the
 * editable "Now" column for the lines this target reallocates, and the stored
 * preset for the ones it doesn't. Those unshown lines matter because applying
 * zeroes them — the point budget already counted their points as free (see
 * `trackedPresetKeys` in stat-optimizer-character.ts), so a mobbing run really
 * does spend the Boss Damage and Ignore Defense points, and a bossing run really
 * does spend the Normal Damage ones.
 */
function currentFullAllocation(
  record: StoredCharacterRecord,
  profile: ClassDamageProfile,
  presetIndex: number,
  target: OptimizeTarget,
  edited: HyperAllocation,
): HyperAllocation {
  const stored = mapStoredHyper(record.stats.hyperStat, profile, ALL_HYPER_LINE_IDS, presetIndex);
  for (const id of HYPER_TARGET_LINES[target]) stored[id] = edited[id];
  return stored;
}

function hyperStatWindowDelta(
  profile: ClassDamageProfile,
  current: HyperAllocation,
  best: HyperAllocation,
): StatWindowDelta {
  const d = zeroStatWindowDelta();
  const moved = (id: HyperLineId): number =>
    hyperLineValue(id, best[id], profile.isHpBased) - hyperLineValue(id, current[id], profile.isHpBased);

  // Demon Avenger's Max HP line is a percent; every other class's main line is
  // flat stat. (The engine also strips it from a x21 flat bucket, which is a
  // scouter quirk inside their kernel, not a stat the game window carries.)
  if (profile.isHpBased) d.mainPct = moved("mainStat");
  else d.mainFlat = moved("mainStat");
  d.subFlat = moved("subStat");
  d.sub2Flat = moved("subStat2");
  d.atkBase = moved("attack");
  d.bossDamage = moved("bossDamage");
  d.damage = moved("damage");
  d.normalDamage = moved("normalDamage");
  d.critDamage = moved("critDamage");
  d.critRate = moved("critRate");
  // Two ordered operations, matching how the engine builds `ied` then `iedStrip`.
  d.iedOps = [
    stackIedSources(hyperLineValue("ignoreDefense", best.ignoreDefense, false)),
    -stackIedSources(hyperLineValue("ignoreDefense", current.ignoreDefense, false)),
  ];
  return d;
}

/** The recommendation written into one of the character's in-game presets. Every
 *  line the store can hold is set, so the lines this target freed go to 0 rather
 *  than staying spent on top of a budget that already gave their points away.
 *  The applied preset also becomes the active one: the stat window written
 *  alongside it is only the character's real window with that preset equipped,
 *  which is exactly what the confirm dialog asked the player to have done. */
function writeHyperPreset(
  stored: StoredHyperStat | undefined,
  profile: ClassDamageProfile,
  presetIndex: number,
  best: HyperAllocation,
): StoredHyperStat {
  const presets = (stored?.presets ?? []).map((p) => ({ ...p }));
  while (presets.length <= presetIndex) presets.push({});
  for (const line of HYPER_LINES) {
    const key = hyperPresetKey(line.id, profile);
    if (key) presets[presetIndex][key] = best[line.id];
  }
  return { presets, activePreset: presetIndex };
}

export interface ApplyHyperInput {
  profile: ClassDamageProfile;
  target: OptimizeTarget;
  presetIndex: number;
  /** The panel's editable "Now" column. */
  current: HyperAllocation;
  /** The recommended allocation (`HyperResult.allocation`). */
  best: HyperAllocation;
}

export function applyHyperToRecord(
  record: StoredCharacterRecord,
  { profile, target, presetIndex, current, best }: ApplyHyperInput,
): StoredCharacterRecord {
  const full = currentFullAllocation(record, profile, presetIndex, target, current);
  return {
    ...record,
    stats: {
      ...applyStatWindowDelta(record.stats, profile, hyperStatWindowDelta(profile, full, best)),
      hyperStat: writeHyperPreset(record.stats.hyperStat, profile, presetIndex, best),
    },
  };
}

// ── HEXA Stat ─────────────────────────────────────────────────────────────────

type HexaTypeTotals = Partial<Record<HexaStatType, number>>;

/** What each stat type is worth across the cores, at the levels on screen. */
function hexaTotals(cores: HexaCore[], types: (HexaCoreRecommendation | undefined)[]): HexaTypeTotals {
  const totals: HexaTypeTotals = {};
  const add = (type: HexaStatType | "" | undefined, level: number, isPrimary: boolean): void => {
    if (!type) return;
    totals[type] = (totals[type] ?? 0) + getHexaStatValue(type, level, isPrimary);
  };
  cores.forEach((core, i) => {
    const t = types[i];
    if (!t) return;
    add(t.primary, core.primary.level, true);
    add(t.additional[0], core.additional[0].level, false);
    add(t.additional[1], core.additional[1].level, false);
  });
  return totals;
}

/** The types currently on each core, in the shape the recommendation uses. */
const coreTypes = (core: HexaCore): HexaCoreRecommendation => ({
  primary: core.primary.type,
  additional: [core.additional[0].type, core.additional[1].type],
});

function hexaStatWindowDelta(
  profile: ClassDamageProfile,
  cores: HexaCore[],
  best: (HexaCoreRecommendation | undefined)[],
): StatWindowDelta {
  const before = hexaTotals(cores, cores.map(coreTypes));
  const after = hexaTotals(cores, best);
  const moved = (type: HexaStatType): number => (after[type] ?? 0) - (before[type] ?? 0);

  const d = zeroStatWindowDelta();
  const mainStat = moved("mainStat");
  if (profile.isXenon) {
    // Xenon's Main Stat line is All Stats at 0.48x, the same rounding the setup
    // flow prints. INT is left alone: no Xenon stat the kernel or MapleScouter
    // reads is INT-based, so writing it would only add noise.
    const all = Math.round(mainStat * 0.48);
    d.mainFlat = all;
    d.subFlat = all;
    d.sub2Flat = all;
  } else if (profile.isHpBased) {
    d.mainFlat = 21 * mainStat;
  } else {
    d.mainFlat = mainStat;
  }
  d.atkBase = moved("attackPower");
  d.damage = moved("damage");
  d.bossDamage = moved("bossDamage");
  d.critDamage = moved("criticalDamage");
  // One net operation, matching how the engine accumulates the HEXA lines'
  // ignore-DEF into a single delta before stacking it.
  d.iedOps = [stackIedSources(moved("ignoreDefense"))];
  return d;
}

const emptySlot = (): HexaStatSlot => ({
  main: { type: "", level: 0 },
  alt: [
    { type: "", level: 0 },
    { type: "", level: 0 },
  ],
});
const emptyNode = (): HexaStatNode => ({ presets: [emptySlot(), emptySlot()], activePreset: 0 });

/** Each unlocked core's recommended types written over its active preset, at the
 *  levels on screen (which are the player's real rolls, typed in here when the
 *  store had none). A locked core is left exactly as stored. */
function writeHexaNodes(
  stored: HexaStatNode[],
  cores: HexaCore[],
  best: (HexaCoreRecommendation | undefined)[],
): HexaStatNode[] {
  const nodes = Array.from({ length: HEXA_CORE_COUNT }, (_, i) => stored[i] ?? emptyNode());
  return nodes.map((node, i) => {
    const core = cores[i];
    const types = best[i];
    if (!core?.unlocked || !types) return node;
    const active = node.activePreset === 1 ? 1 : 0;
    const presets: [HexaStatSlot, HexaStatSlot] = [node.presets[0] ?? emptySlot(), node.presets[1] ?? emptySlot()];
    presets[active] = {
      main: { type: types.primary, level: core.primary.level },
      alt: [
        { type: types.additional[0], level: core.additional[0].level },
        { type: types.additional[1], level: core.additional[1].level },
      ],
    };
    return { ...node, presets, activePreset: active };
  });
}

export interface ApplyHexaInput {
  profile: ClassDamageProfile;
  /** The panel's editable cores (levels and current types). */
  cores: HexaCore[];
  /** `HexaResult.cores`, which is aligned to the UNLOCKED cores in order. */
  recommended: HexaCoreRecommendation[];
}

export function applyHexaToRecord(
  record: StoredCharacterRecord,
  { profile, cores, recommended }: ApplyHexaInput,
): StoredCharacterRecord {
  // Re-align the engine's unlocked-only list onto all three core slots.
  let cursor = 0;
  const best = cores.map((core) => (core.unlocked ? recommended[cursor++] : undefined));
  const storedNodes = (record.tools?.hexaStat as { nodes?: HexaStatNode[] } | undefined)?.nodes ?? [];
  return {
    ...record,
    stats: applyStatWindowDelta(record.stats, profile, hexaStatWindowDelta(profile, cores, best)),
    tools: { ...record.tools, hexaStat: { nodes: writeHexaNodes(storedNodes, cores, best) } },
  };
}

// ── Store write ───────────────────────────────────────────────────────────────

/**
 * Swaps one character's record for an updated one and persists the store,
 * returning what was written (or null if the character has since gone). Same
 * contract as characterToolStorage's writer: `readCharactersStore` hands out a
 * shared cached object, so this mutates the cache and is only sound because the
 * write lands in the same tick.
 */
export function updateCharacterRecord(
  charName: string,
  update: (record: StoredCharacterRecord) => StoredCharacterRecord,
): StoredCharacterRecord | null {
  const store = readCharactersStore();
  const existing = selectCharacterByIgn(store, charName);
  if (!existing) return null;
  const key = store.order.find((id) => store.charactersById[id] === existing);
  if (!key) return null;
  const next = update(existing);
  store.charactersById[key] = next;
  writeCharactersStore(store);
  return next;
}
