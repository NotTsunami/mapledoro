/*
  Reads a stored character into the optimizer's editable form: the displayed
  stat totals (tooltip triples), the hyper-point budget, and the current hyper
  / HEXA allocations. The HEXA cores keep each line's stored type and level
  (0-10) verbatim so the optimizer can strip them and re-assign types over the
  real per-line levels. Pure, no React.
*/

import type { StoredCharacterRecord } from "../../characters/model/charactersStore";
import type { HexaStatNode, HexaStatType } from "../../characters/setup/data/hexaStatData";
import { hasMinimalScouterSetup, isScouterSupportedClass } from "../../characters/scouter/scouterApi";
import type { ScouterSpecEfficiency } from "../../characters/scouter/scouterCache";
import {
  prefillFromStats,
  resolveClassDamageProfile,
  zeroCalibration,
  zeroTriple,
  type ClassDamageProfile,
  type KernelCalibration,
  type OptimizerStatInputs,
} from "./damage-formula";
import { calibrateFromSpecEfficiency } from "./scouter-calibration";
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

/**
 * Why the kernel is running uncalibrated, so the panel can name the fix instead
 * of just disclaiming. `null` = calibrated (or standalone entry, where the typed
 * stats are taken at face value and there's nothing to calibrate against).
 */
export type CalibrationNotice =
  /** Scouter setup isn't finished for this character — the actionable case. */
  | "setup"
  /** Set up, but no cached figure matches the character's current stats yet. */
  | "refresh"
  /** Calibration can't apply here at all (class scouter doesn't cover, or a
   *  Demon Avenger, whose HP-based stat factor the table can't invert). */
  | "unavailable";

export interface CharacterSeed {
  profile: ClassDamageProfile;
  inputs: OptimizerStatInputs;
  availablePoints: number;
  storedHyper: HyperAllocation;
  cores: HexaCore[];
  /** Buffed-state corrections solved from the character's cached Scouter data. */
  calibration: KernelCalibration;
  calibrationNotice: CalibrationNotice | null;
}

/** Which notice a failed calibration earns. Ordered most-actionable first, so a
 *  character that could be calibrated is always told the specific step to take. */
function noticeFor(record: StoredCharacterRecord, profile: ClassDamageProfile): CalibrationNotice {
  if (profile.isHpBased || !isScouterSupportedClass(record.jobName)) return "unavailable";
  return hasMinimalScouterSetup(record) ? "refresh" : "setup";
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

export function seedFromCharacter(
  record: StoredCharacterRecord,
  specEfficiency?: ScouterSpecEfficiency,
): CharacterSeed {
  const profile = resolveClassDamageProfile(record.jobName, record.stats);
  const nodes = readHexaNodes(record);
  const inputs = prefillFromStats(record.stats, profile, record.level);
  const calibration = calibrateFromSpecEfficiency(specEfficiency, profile, inputs);
  return {
    profile,
    inputs,
    availablePoints: Math.max(
      0,
      availableHyperPoints(record.level) - pointsSpentOnUntrackedLines(record, profile),
    ),
    storedHyper: mapStoredHyper(record.stats.hyperStat, profile),
    cores: Array.from({ length: HEXA_CORE_COUNT }, (_, i) => readCore(record, nodes[i], i)),
    calibration: calibration ?? zeroCalibration(),
    calibrationNotice: calibration ? null : noticeFor(record, profile),
  };
}

const emptyLine = (): HexaLine => ({ type: "", level: 0 });

/**
 * Level standalone entry opens at. It cannot be 0: the hyper-point budget comes
 * from the level, and a 0 budget makes `capHyperLevelToBudget` clamp every typed
 * Hyper Stat level back to 0, so the panel refuses the levels its own warning
 * asks for. 290 is a real endgame level rather than the 300 cap, and it stays
 * editable, so it reads as a starting point instead of a claim about the user.
 */
const STANDALONE_LEVEL = 290;

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
      level: STANDALONE_LEVEL,
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
    availablePoints: availableHyperPoints(STANDALONE_LEVEL),
    storedHyper: zeroHyperAllocation(),
    cores: Array.from({ length: HEXA_CORE_COUNT }, () => ({
      unlocked: false,
      primary: emptyLine(),
      additional: [emptyLine(), emptyLine()],
    })),
    // Standalone mode has no character to calibrate against; the typed-in stats are
    // taken at face value, so no "uncalibrated" warning is warranted either.
    calibration: zeroCalibration(),
    calibrationNotice: null,
  };
}
