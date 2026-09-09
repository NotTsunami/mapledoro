/*
  Parses the JSON MapleScouter lets you export for a character ("Save preset" ->
  downloads a `scouter-preset-*.json`) and turns it back into MapleDoro setup-step
  drafts, so a player can paste their export, review every value in the normal setup
  steps, and finish setup without retyping.

  This is the INVERSE of scouterApi.ts's buildScouterPayload (which builds MapleScouter's
  request body FROM a MapleDoro character). The export's `data` object is the same
  ScouterUserStat shape that file documents field-by-field -- read its comments as the
  dictionary for what each field means and how it's encoded.

  MapleScouter's export dumps stale default-template values for inputs you can't actually
  edit in the GMS UI (statThird/statFourth, the non-GMS seed rings, etc.). Those are on a
  hard denylist here -- never surfaced, never mapped. See TEMPLATE_JUNK_NOTE.
*/

import type { ScouterUserStat } from "../../scouter/scouterApi";
import { SCOUTER_CLASS_KOREAN_NAMES } from "../../scouter/scouterClassNames";
import { CLASS_SKILL_DATA } from "./classSkillData";
import type { SetupStepInputById } from "../types";

/** The wrapper MapleScouter's "Save preset" download writes around the ScouterUserStat. */
export interface MapleScouterExportFile {
  type: string;
  v: number;
  savedAt: string;
  label: string;
  data: ScouterUserStat;
}

/** What the export's `type` field must equal for us to accept it. */
const EXPORT_FILE_TYPE = "maplescouter-manual-preset";

/*
  TEMPLATE_JUNK_NOTE: fields MapleScouter's export always populates with default-template
  values regardless of what the player actually set (they're not editable in the GMS UI, or
  were removed in the v271 Special Skill Ring consolidation). Parsing these back would
  silently inject numbers the player never chose. Never read them.

    special.statThird / special.statFourth      - removed off-stat ring inputs
    special.ringOfSum / special.riskTaker       - Totalling / Risk Taker ring (not GMS)
    seedRing.riskTakerRing / .criDamageRing     - not GMS rings
    seedRing.levelRing / .ultiRing / .ringOfSum
    seedRing.durabilityRing
    seedRing.*.efficiency                       - API-computed, not an input
    entireStat / power                          - MapleScouter's own derived snapshots
    stat.classForce                             - unreleased tribe-force stat
    stat.tms_* / doping.criDmgRing              - non-GMS
    hexa.skillCore3-6 / hexa.generalCore3-4     - unreleased GMS content
    huntSkill.erdaShower                        - no MapleDoro field
*/

// ── Reverse class-name lookup ────────────────────────────────────────────────

const KOREAN_NAME_TO_CLASS_ID: Record<string, string> = Object.fromEntries(
  Object.entries(SCOUTER_CLASS_KOREAN_NAMES).map(([classId, koreanName]) => [koreanName, classId]),
);

/** MapleDoro classId for a MapleScouter Korean class name, or null if unrecognized. */
export function classIdFromKoreanName(koreanName: string): string | null {
  return KOREAN_NAME_TO_CLASS_ID[koreanName.trim()] ?? null;
}

// ── Parse result ────────────────────────────────────────────────────────────

export type MapleScouterImportError =
  | "not-json"
  | "wrong-file-type"
  | "no-data"
  | "unknown-class"
  | "class-mismatch";

/** One reviewable chunk of the import, for the step's summary card. `present` means the
 *  export actually carries usable data for it (vs. all-zero / empty). */
export interface ImportSectionSummary {
  id: "stats" | "buffs" | "linkSkills" | "hexa" | "ozRings" | "wildHunter" | "legionArtifact" | "innerAbility" | "soul";
  label: string;
  present: boolean;
  detail?: string;
}

/** A non-blocking "this preset may be out of date" notice shown in the summary card.
 *  The import still goes through -- the point of the step is review-then-finish. */
export interface ImportStalenessWarning {
  id: "level-behind" | "level-ahead" | "old-export";
  message: string;
}

export interface MapleScouterImportResult {
  ok: true;
  /** The export's own label ("Lv 295 Kanna"), for display only. */
  label: string;
  /** MapleDoro classId resolved from stat.myClass. */
  classId: string;
  /** Human class name for display. */
  className: string;
  level: number;
  sections: ImportSectionSummary[];
  /** "This preset looks stale" notices -- level mismatch vs. the live character, an old
   *  savedAt. Never blocks the import. */
  warnings: ImportStalenessWarning[];
  /** The raw parsed payload, kept for the mapping pass (Phase 2). */
  payload: ScouterUserStat;
}

export interface MapleScouterImportFailure {
  ok: false;
  error: MapleScouterImportError;
  /** For "class-mismatch"/"unknown-class": the class name we read out of the export. */
  foundClassName?: string;
}

// ── Section detection ───────────────────────────────────────────────────────

const nonZero = (v: string | undefined): boolean => v !== undefined && v !== "" && v !== "0" && Number(v) !== 0;

/** Any doping flag on, or any nobless/champion value above zero. */
function hasBuffData(doping: ScouterUserStat["doping"]): boolean {
  return Object.entries(doping).some(([key, value]) => {
    if (key === "criDmgRing") return false; // denylisted
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return nonZero(value);
    if (Array.isArray(value)) return value.some(nonZero);
    return false;
  });
}

function hasLinkSkillData(linkSkill: Record<string, string>): boolean {
  return Object.values(linkSkill).some(nonZero);
}

function hasHexaData(hexa: ScouterUserStat["hexa"]): boolean {
  return nonZero(hexa.skillCore1) || nonZero(hexa.skillCore2)
    || [hexa.masteryCore1, hexa.masteryCore2, hexa.masteryCore3, hexa.masteryCore4].some(nonZero)
    || [hexa.reinCore1, hexa.reinCore2, hexa.reinCore3, hexa.reinCore4].some(nonZero)
    || nonZero(hexa.generalCore2);
}

function hasOzRingData(special: ScouterUserStat["special"]): boolean {
  return nonZero(special.restraintRing) || nonZero(special.weaponRing) || nonZero(special.continuosRing);
}

function hasStatData(stat: ScouterUserStat["stat"]): boolean {
  return nonZero(stat.mainStatBase) || nonZero(stat.atkBase) || nonZero(stat.weaponAtk);
}

function soulDetail(special: ScouterUserStat["special"]): string | null {
  if (nonZero(special.mugongSoul)) return `Mu Gong soul Lv. ${special.mugongSoul}`;
  if (nonZero(special.epiSoul)) return `Ephenia soul Lv. ${special.epiSoul}`;
  return null;
}

function innerAbilityDetail(stat: ScouterUserStat["stat"]): string | null {
  if (stat.passiveSkillLevelUp) return "+1 Passive Skill Level";
  if (stat.increaseTarget) return "+1 Attack Target";
  return null;
}

// ── Staleness detection ─────────────────────────────────────────────────────

/** An export older than this reads as "you probably leveled / changed gear since". */
const OLD_EXPORT_DAYS = 14;

function relativeAge(savedAt: string): { days: number; text: string } | null {
  const then = Date.parse(savedAt);
  if (Number.isNaN(then)) return null;
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days < 1) return { days, text: "today" };
  if (days === 1) return { days, text: "yesterday" };
  if (days < 30) return { days, text: `${days} days ago` };
  const months = Math.floor(days / 30);
  return { days, text: months === 1 ? "a month ago" : `${months} months ago` };
}

function buildStalenessWarnings(
  exportLevel: number,
  expectedLevel: number | undefined,
  className: string,
  savedAt: string | undefined,
): ImportStalenessWarning[] {
  const warnings: ImportStalenessWarning[] = [];

  if (expectedLevel && exportLevel && exportLevel !== expectedLevel) {
    const behind = exportLevel < expectedLevel;
    warnings.push({
      id: behind ? "level-behind" : "level-ahead",
      message: behind
        ? `This preset is for a Level ${exportLevel} ${className} but yours is Level ${expectedLevel}. It may differ from your current stats, so make sure to double check the values.`
        : `This preset is for a Level ${exportLevel} ${className} but yours is Level ${expectedLevel}. Make sure you are importing the right preset.`,
    });
  }

  const age = savedAt ? relativeAge(savedAt) : null;
  if (age && age.days >= OLD_EXPORT_DAYS) {
    warnings.push({
      id: "old-export",
      message: `This preset was exported ${age.text}. If you have changed anything since, re-export it and upload the new file.`,
    });
  }

  return warnings;
}

function buildSections(payload: ScouterUserStat): ImportSectionSummary[] {
  const { stat, doping, linkSkill, hexa, special } = payload;
  const soul = soulDetail(special);
  const ia = innerAbilityDetail(stat);
  const whLevel = Number(stat.wildhunterUnion || "0");
  const artifactFa = Number(stat.artifact_finalAttack || "0");

  return [
    { id: "stats", label: "Stats", present: hasStatData(stat) },
    { id: "buffs", label: "Buffs", present: hasBuffData(doping) },
    { id: "linkSkills", label: "Link Skills", present: hasLinkSkillData(linkSkill) },
    { id: "hexa", label: "HEXA", present: hasHexaData(hexa) },
    { id: "ozRings", label: "Oz Rings", present: hasOzRingData(special) },
    {
      id: "wildHunter",
      label: "Wild Hunter rank",
      present: whLevel > 0,
      detail: whLevel > 0 ? `Legion Lv. ${whLevel}` : undefined,
    },
    {
      id: "legionArtifact",
      label: "Legion Artifact",
      present: stat.artifact_increaseTarget || artifactFa > 0,
    },
    { id: "innerAbility", label: "Inner Ability", present: ia !== null, detail: ia ?? undefined },
    { id: "soul", label: "Soul Weapon", present: soul !== null, detail: soul ?? undefined },
  ];
}

// ── Entry point ─────────────────────────────────────────────────────────────

/** Parses and validates a pasted MapleScouter export against the character being set up.
 *  `expectedJobName` is the confirmed character's Nexon jobName -- the export must be for
 *  the same class, or we refuse it (importing a Bishop's numbers onto a Kanna is always a
 *  mistake). `expectedLevel` is the character's live level, only used to flag a stale
 *  preset (a mismatch is a warning, never a rejection). */
export function parseMapleScouterExport(
  raw: string,
  expectedJobName: string,
  expectedLevel?: number,
): MapleScouterImportResult | MapleScouterImportFailure {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "not-json" };
  }

  if (!parsed || typeof parsed !== "object") return { ok: false, error: "not-json" };
  const file = parsed as Partial<MapleScouterExportFile>;
  if (file.type !== EXPORT_FILE_TYPE) return { ok: false, error: "wrong-file-type" };
  if (!file.data || typeof file.data !== "object") return { ok: false, error: "no-data" };

  const payload = file.data as ScouterUserStat;
  const koreanName = payload.stat?.myClass ?? "";
  const classId = classIdFromKoreanName(koreanName);
  if (!classId) return { ok: false, error: "unknown-class", foundClassName: koreanName };

  const expectedClass = CLASS_SKILL_DATA.find((c) => c.nexonJobName === expectedJobName);
  if (!expectedClass || expectedClass.id !== classId) {
    const importedClass = CLASS_SKILL_DATA.find((c) => c.id === classId);
    return { ok: false, error: "class-mismatch", foundClassName: importedClass?.displayName ?? importedClass?.nexonJobName ?? koreanName };
  }

  const level = Number(payload.stat.level || "0");
  return {
    ok: true,
    label: typeof file.label === "string" ? file.label : "",
    classId,
    className: expectedClass.displayName ?? expectedClass.nexonJobName,
    level,
    sections: buildSections(payload),
    warnings: buildStalenessWarnings(level, expectedLevel, expectedClass.displayName ?? expectedClass.nexonJobName, file.savedAt),
    payload,
  };
}

// ── Draft mapping (Phase 2 -- not yet implemented) ──────────────────────────

/** World-level values the import needs to write outside the per-step drafts (Wild Hunter
 *  Legion rank + Legion Artifact are account-scoped, per scouterApi.ts). */
export interface MapleScouterImportWorldData {
  wildHunterLegionLevel?: number;
  artifactExtraTarget?: boolean;
  artifactFinalAttackDmg?: number;
}

export interface MapleScouterImportDrafts {
  /** Partial SetupStepInputById -- merged onto the live setup drafts. */
  stepDrafts: SetupStepInputById;
  world: MapleScouterImportWorldData;
}

/** Turns a parsed export into setup-step drafts + world-level data.
 *  TODO(Phase 2): implement the reverse of every buildSeededStepTestByStep converter. */
export function mapImportToDrafts(_result: MapleScouterImportResult): MapleScouterImportDrafts {
  return { stepDrafts: {}, world: {} };
}
