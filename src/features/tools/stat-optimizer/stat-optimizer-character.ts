/*
  Reads a stored character into the optimizer's editable form: the displayed
  stat totals (tooltip triples), the hyper-point budget, and the current hyper
  / HEXA allocations. The HEXA cores keep each line's stored type and level
  (0-10) verbatim so the optimizer can strip them and re-assign types over the
  real per-line levels. Pure, no React.
*/

import type { StoredCharacterRecord } from "../../characters/model/charactersStore";
import type { HexaStatNode, HexaStatType } from "../../characters/setup/data/hexaStatData";
import {
  prefillFromStats,
  resolveClassDamageProfile,
  zeroTriple,
  type ClassDamageProfile,
  type OptimizerStatInputs,
} from "./damage-formula";
import { availableHyperPoints, HYPER_COST_CUMULATIVE, HYPER_MAX_LEVEL } from "./hyper-stat-data";
import { mapStoredHyper, zeroHyperAllocation, type HyperAllocation } from "./hyper-stat-engine";
import { HEXA_CORE_COUNT, HEXA_MAX_LINE_LEVEL, type HexaCore, type HexaLine } from "./hexa-stat-engine";

/** Character levels at which HEXA Stat cores I / II / III unlock. */
const HEXA_UNLOCK_LEVELS = [260, 265, 270];

const VALID_TYPES: HexaStatType[] = [
  "mainStat",
  "attackPower",
  "damage",
  "bossDamage",
  "ignoreDefense",
  "criticalDamage",
];

export interface CharacterSeed {
  profile: ClassDamageProfile;
  inputs: OptimizerStatInputs;
  availablePoints: number;
  storedHyper: HyperAllocation;
  cores: HexaCore[];
}

function readHexaNodes(record: StoredCharacterRecord): HexaStatNode[] {
  const data = record.tools?.hexaStat as { nodes?: unknown } | undefined;
  const nodes = data?.nodes;
  return Array.isArray(nodes) ? (nodes as HexaStatNode[]) : [];
}

/** A stored entry into an editable line, keeping its type (any of the 6) and clamped level. */
function readLine(entry: { type?: string; level?: number } | undefined): HexaLine {
  const type = entry?.type && (VALID_TYPES as string[]).includes(entry.type) ? (entry.type as HexaStatType) : "";
  const level = Math.max(0, Math.min(HEXA_MAX_LINE_LEVEL, Math.round(Number(entry?.level)) || 0));
  return { type, level };
}

function readCore(record: StoredCharacterRecord, node: HexaStatNode | undefined, index: number): HexaCore {
  const slot = node?.presets?.[node.activePreset] ?? node?.presets?.[0];
  return {
    unlocked: record.level >= HEXA_UNLOCK_LEVELS[index] || Boolean(node),
    primary: readLine(slot?.main),
    additional: [readLine(slot?.alt?.[0]), readLine(slot?.alt?.[1])],
  };
}

/**
 * Points spent on hyper lines the optimizer doesn't model (HP, Arcane Power,
 * Status Resistance, ...). Deducted from the level budget so the recommendation
 * reallocates only the damage lines, like scouter's reserved-points input.
 */
function pointsSpentOnUntrackedLines(
  record: StoredCharacterRecord,
  profile: ClassDamageProfile,
): number {
  const stored = record.stats.hyperStat;
  const preset = stored?.presets?.[stored.activePreset];
  if (!preset) return 0;
  const trackedKeys = new Set<string>(
    [
      profile.mainStat,
      profile.subStat,
      profile.subStat2,
      "attackMagicAtt",
      "bossDamage",
      "damage",
      "criticalDamage",
      "criticalRate",
      "ignoreDefense",
    ].filter((k): k is string => k !== null),
  );
  let spent = 0;
  for (const [key, rawLevel] of Object.entries(preset)) {
    if (trackedKeys.has(key)) continue;
    const level = Math.min(Math.max(Math.floor(Number(rawLevel) || 0), 0), HYPER_MAX_LEVEL);
    if (level > 0) spent += HYPER_COST_CUMULATIVE[level - 1];
  }
  return spent;
}

export function seedFromCharacter(record: StoredCharacterRecord): CharacterSeed {
  const profile = resolveClassDamageProfile(record.jobName, record.stats);
  const nodes = readHexaNodes(record);
  return {
    profile,
    inputs: prefillFromStats(record.stats, profile, record.level),
    availablePoints: Math.max(
      0,
      availableHyperPoints(record.level) - pointsSpentOnUntrackedLines(record, profile),
    ),
    storedHyper: mapStoredHyper(record.stats.hyperStat, profile),
    cores: Array.from({ length: HEXA_CORE_COUNT }, (_, i) => readCore(record, nodes[i], i)),
  };
}

const emptyLine = (): HexaLine => ({ type: "", level: 0 });

/**
 * A blank seed so the optimizer works standalone (no character selected): a
 * generic main + secondary + ATT profile, zeroed inputs, and three locked cores
 * the user unlocks and fills in by hand. A picked character overwrites this.
 */
export function emptyCharacterSeed(): CharacterSeed {
  return {
    profile: {
      classId: undefined,
      mainStat: "str",
      subStat: "dex",
      subStat2: null,
      usesMagic: false,
      isHpBased: false,
      isXenon: false,
      constants: { dpmMainStat: 0, dpmAtk: 0, dpmAtkPer: 0, dpmBossDmg: 0, dpmIgnoreGuard: 0, dpmCritDmg: 0 },
    },
    inputs: {
      level: 0,
      main: zeroTriple(),
      sub: zeroTriple(),
      sub2: zeroTriple(),
      attack: zeroTriple(),
      damagePct: 0,
      bossDamagePct: 0,
      critRatePct: 0,
      critDamagePct: 0,
      ignoreDefPct: 0,
    },
    availablePoints: 0,
    storedHyper: zeroHyperAllocation(),
    cores: Array.from({ length: HEXA_CORE_COUNT }, () => ({
      unlocked: false,
      primary: emptyLine(),
      additional: [emptyLine(), emptyLine()],
    })),
  };
}
