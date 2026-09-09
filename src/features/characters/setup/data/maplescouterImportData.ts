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
import { assignMainSubStats } from "../../scouter/scouterApi";
import { SCOUTER_CLASS_KOREAN_NAMES } from "../../scouter/scouterClassNames";
import { LINK_SKILL_TO_SCOUTER_KEY } from "../../scouter/scouterLinkSkills";
import type { LinkSkillId } from "../../model/charactersStore";
import { CLASS_SKILL_DATA } from "./classSkillData";
import type { TripleStatFieldId } from "./statFields";
import { serializeStatsStepDraft, type StatsStepDraft, type TripleStatDraft } from "./statsStepDraft";
import { serializeOzRingsDraft, OZ_RING_MAX_LEVEL, type OzRingId } from "./ozRingData";
import { serializeBuffsDraft, emptyBuffsDraft, type BuffsDraft } from "./buffsData";
import { whRankForLevel } from "./scouterQuestionsData";
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

/** A non-blocking "this preset may be out of date" notice shown after a successful parse.
 *  The import still goes through -- the real review is the setup steps themselves. */
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
  /** "This preset looks stale" notices -- level mismatch vs. the live character, an old
   *  savedAt. Never blocks the import. */
  warnings: ImportStalenessWarning[];
  /** The parsed payload, mapped into setup-step drafts by mapImportToDrafts. */
  payload: ScouterUserStat;
}

export interface MapleScouterImportFailure {
  ok: false;
  error: MapleScouterImportError;
  /** For "class-mismatch"/"unknown-class": the class name we read out of the export. */
  foundClassName?: string;
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
    warnings: buildStalenessWarnings(level, expectedLevel, expectedClass.displayName ?? expectedClass.nexonJobName, file.savedAt),
    payload,
  };
}

// ── Draft mapping ───────────────────────────────────────────────────────────
//
// Every value ends up in a setup-step draft string (the `stats`, `oz_rings`, `buffs`,
// `link_skills`, `hexa_matrix` slots of SetupStepInputById). The account-level bits (Wild
// Hunter Legion rank, Legion Artifact) ride in the stats draft's `scouterQuestions` block,
// which the existing finish path (applyMapleScouterFlow / buildFullSetupRecord ->
// applyScouterLegionForWorld) already persists per-world -- so there is no separate
// world-write path to wire.

/** "0"/""/absent -> 0, otherwise the parsed number. */
const num = (v: string | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** A payload stat triple ({Base,Per,Abs} strings) -> the draft's {base,percent,percentUnapplied}. */
function statTriple(base: string, per: string, abs: string): TripleStatDraft {
  return { base: base || "0", percent: per || "0", percentUnapplied: abs || "0" };
}

// ── Stats step ──────────────────────────────────────────────────────────────

/** Reverses scouterApi.ts's buildStat: the payload carries main/sub/ssub stat SLOTS, so
 *  un-map each slot back to the real stat (STR/DEX/INT/LUK) it belongs to for this class,
 *  and the attack triple back to attackPower or magicAtt. */
function buildStatsDraft(payload: ScouterUserStat, classId: string, requiredStats: readonly string[]): StatsStepDraft {
  const { stat } = payload;
  const tripleIds = requiredStats.filter((s): s is TripleStatFieldId =>
    s === "str" || s === "dex" || s === "int" || s === "luk");
  const assignment = assignMainSubStats(classId, tripleIds);

  const draft: StatsStepDraft = {};

  // Demon Avenger's Main Stat slot is HP (buildStat overrides mainField to "hp"); its one
  // real stat (STR) sits in the Sub slot instead -- assignMainSubStats already encodes that.
  const mainField: TripleStatFieldId | "hp" | null = classId === "demon_avenger" ? "hp" : assignment.main;
  if (mainField) draft[mainField] = statTriple(stat.mainStatBase, stat.mainStatPer, stat.mainStatAbs);
  if (assignment.sub) draft[assignment.sub] = statTriple(stat.subStatBase, stat.subStatPer, stat.subStatAbs);
  if (assignment.ssub) draft[assignment.ssub] = statTriple(stat.ssubStatBase, stat.ssubStatPer, stat.ssubStatAbs);

  // atkBase/atkPercent/atkAbs is the class's weapon-type attack (buildStat picks magicAtt
  // for an INT main, attackPower otherwise).
  const atkField: TripleStatFieldId = mainField === "int" ? "magicAtt" : "attackPower";
  draft[atkField] = statTriple(stat.atkBase, stat.atkPercent, stat.atkAbs);

  draft.damage = stat.dmg || "0";
  draft.bossDamage = stat.bossDmg || "0";
  draft.ignoreDefense = stat.ignoreDef || "0";
  draft.criticalRate = stat.critical || "0";
  draft.criticalDamage = stat.criticalDmg || "0";
  draft.buffDuration = stat.buffDuration || "0";
  draft.cooldownReduction = { seconds: stat.coolTimeReduce || "0", percent: stat.coolTimeReducePercent || "0" };
  draft.cooldownSkip = stat.resetCoolDown || "0";
  draft.ignoreElementalResistance = stat.ignoreElementalResist || "0";
  draft.additionalStatusDamage = stat.statusAdditionalDmg || "0";
  draft.summonDuration = stat.summonPersistTime || "0";
  draft.normalEnemyDamage = stat.normalDmg || "0";
  draft.arcanePower = stat.arcaneForce || "0";
  draft.sacredPower = stat.authenticForce || "0";

  if (num(stat.weaponAtk) > 0) draft.weaponAtt = stat.weaponAtk;

  draft.setupOptions = {
    isLiberated: payload.special.genesis === true ? true : undefined,
    weaponHand: payload.special.oneHandSword ? "1h" : undefined,
    hasRuinForceShield: payload.special.useRuinForceShild === true ? true : undefined,
    ...soulOption(payload),
  };

  draft.scouterQuestions = buildScouterQuestions(payload);
  return draft;
}

/** Payload soul level ("0"/"1"/"2" per epiSoul/mugongSoul) -> setupOptions soul fields.
 *  An export always carries a definite value for these; "0" means no Soul Weapon (a real,
 *  committable answer), not "unanswered" -- so map it to "none" rather than leaving the
 *  Quick Questions soul pick blank for the player to fill in. */
function soulOption(payload: ScouterUserStat): Pick<NonNullable<StatsStepDraft["setupOptions"]>, "soulType" | "soulLevel"> {
  const mugong = num(payload.special.mugongSoul);
  const epi = num(payload.special.epiSoul);
  if (mugong === 1 || mugong === 2) return { soulType: "mugong", soulLevel: mugong };
  if (epi === 1 || epi === 2) return { soulType: "ephenia", soulLevel: epi };
  return { soulType: "none" };
}

/** The MapleScouter-only questionnaire answers: Inner Ability line, Wild Hunter Legion
 *  rank (from the raw union level), Legion Artifact effects. All committed by the existing
 *  finish path. */
function buildScouterQuestions(payload: ScouterUserStat): StatsStepDraft["scouterQuestions"] {
  const { stat } = payload;
  const out: NonNullable<StatsStepDraft["scouterQuestions"]> = {};

  if (stat.passiveSkillLevelUp) out.innerAbilityLine = "passive";
  else if (stat.increaseTarget) out.innerAbilityLine = "multiTarget";

  const whLevel = num(stat.wildhunterUnion);
  const whRank = whLevel > 0 ? whRankForLevel(whLevel) : null;
  if (whRank) out.whLegion = whRank;

  if (stat.artifact_increaseTarget === true) out.artifactExtraTarget = true;
  const artifactFa = num(stat.artifact_finalAttack);
  if (artifactFa > 0) out.artifactFinalAttackDmg = String(artifactFa);

  return Object.keys(out).length > 0 ? out : undefined;
}

// ── Oz Rings step ───────────────────────────────────────────────────────────

const OZ_RING_PAYLOAD_KEY: Record<OzRingId, keyof ScouterUserStat["special"]> = {
  restraint: "restraintRing",
  weaponJump: "weaponRing",
  continuous: "continuosRing",
};

function buildOzRingsDraft(payload: ScouterUserStat): { levels: Partial<Record<OzRingId, string>> } {
  const levels: Partial<Record<OzRingId, string>> = {};
  for (const ring of Object.keys(OZ_RING_PAYLOAD_KEY) as OzRingId[]) {
    const raw = num(payload.special[OZ_RING_PAYLOAD_KEY[ring]] as string | undefined);
    if (raw > 0) levels[ring] = String(Math.min(raw, OZ_RING_MAX_LEVEL[ring]));
  }
  return { levels };
}

// ── Buffs step ──────────────────────────────────────────────────────────────

/** payload doping flag -> BuffsDraft bool id. Mirrors scouterApi.ts's buildDoping. */
const DOPING_BOOL_MAP: Partial<Record<keyof ScouterUserStat["doping"], keyof BuffsDraft["bools"]>> = {
  bigHero: "greatHeroBoost",
  extreme: "extremePotion",
  fish: "fishBuff",
  jangBi: "advWeaponTempering",
  legendHero: "legendaryHero",
  shiningRed: "sparklingRedStar",
  shiningBlue: "sparklingBlueStar",
  superPower: "mvpSuperpower",
  unionsPower: "legionMight",
  urus: "masarayuGift",
  heroesHawl: "heroEcho",
  sayram: "sayramElixir",
  collector: "collectorElixir",
  buff275: "honorableElixir",
  additional1: "vipBuff",
  authenticDmg: "maxedSacredSymbol",
  moonshine: "brightMoonlight",
  apple: "onyxApple",
  tengu: "tengusJudgement",
  candy: "candiedApple",
  house: "caretakerSupport",
  genePass: "genepass",
};

const RENOWN_PAYLOAD_KEY: Record<keyof NonNullable<BuffsDraft["renown"]>, keyof ScouterUserStat["doping"]> = {
  allStats: "championAll",
  atkMagAtk: "championAtk",
  bossDmg: "championBoss",
  ignoreDef: "championIgnore",
  critDmg: "championCriDmg",
};

function buildBuffsDraft(payload: ScouterUserStat): BuffsDraft {
  const { doping } = payload;
  const draft = emptyBuffsDraft();

  for (const [dopingKey, boolId] of Object.entries(DOPING_BOOL_MAP)) {
    if (doping[dopingKey as keyof ScouterUserStat["doping"]] === true) draft.bools[boolId] = true;
  }

  // Advanced Stat Potion: the UI only models tier X (+30), so any non-zero value maps to it.
  if (num(doping.stat) > 0) draft.statPotionTier = "10";

  // Guild buffs -- doping.nobless is [bossSlayers, forTheGuild, hardHitter, undeterred].
  const [bossSlayers, forTheGuild, hardHitter, undeterred] = doping.nobless ?? ["0", "0", "0", "0"];
  if (num(bossSlayers) > 0) draft.guild.bossSlayers = bossSlayers;
  if (num(forTheGuild) > 0) draft.guild.forTheGuild = forTheGuild;
  if (num(hardHitter) > 0) draft.guild.hardHitter = hardHitter;
  if (num(undeterred) > 0) draft.guild.undeterred = undeterred;

  // Champion's Renown.
  for (const [renownId, dopingKey] of Object.entries(RENOWN_PAYLOAD_KEY)) {
    const level = num(doping[dopingKey] as string | undefined);
    if (level > 0) draft.renown[renownId as keyof NonNullable<BuffsDraft["renown"]>] = String(level);
  }

  return draft;
}

// ── Link Skills step ────────────────────────────────────────────────────────

function buildLinkSkillsDraft(payload: ScouterUserStat): Partial<Record<LinkSkillId, string>> {
  const out: Partial<Record<LinkSkillId, string>> = {};
  for (const [linkId, scouterKey] of Object.entries(LINK_SKILL_TO_SCOUTER_KEY)) {
    if (!scouterKey) continue;
    const level = num(payload.linkSkill?.[scouterKey]);
    if (level > 0) out[linkId as LinkSkillId] = String(level);
  }
  return out;
}

// ── HEXA Matrix step ────────────────────────────────────────────────────────

/** The hexa_matrix draft is JSON.stringify of a partial HexaSkillLevels plus a `hexaStat`
 *  key. useHexaSkillsState.normalizeLevels handles slicing arrays to the class's real node
 *  count and clamping, so a flat 4-length array is fine here. */
function buildHexaDraft(payload: ScouterUserStat): Record<string, unknown> | null {
  const { hexa } = payload;
  const origin = num(hexa.skillCore1);
  const ascent = num(hexa.skillCore2);
  const mastery = [hexa.masteryCore1, hexa.masteryCore2, hexa.masteryCore3, hexa.masteryCore4].map(num);
  const enhancement = [hexa.reinCore1, hexa.reinCore2, hexa.reinCore3, hexa.reinCore4].map(num);
  // common[0] = Sol Janus (huntSkill.solJanus), common[1] = Sol Hecate (hexa.generalCore2).
  const common = [num(payload.huntSkill?.solJanus), num(hexa.generalCore2)];

  const anyData = origin > 0 || ascent > 0 || mastery.some((v) => v > 0)
    || enhancement.some((v) => v > 0) || common.some((v) => v > 0);
  if (!anyData) return null;

  return { origin, ascent, mastery, enhancement, common };
}

export interface MapleScouterImportDrafts {
  /** Partial SetupStepInputById -- merged onto the live setup drafts. */
  stepDrafts: SetupStepInputById;
}

/** Turns a parsed export into setup-step draft strings. Every step the MapleScouter Setup
 *  and Full Setup flows share gets seeded; the flow's own steps then render these for the
 *  player to review before Finish. */
export function mapImportToDrafts(result: MapleScouterImportResult): MapleScouterImportDrafts {
  const { payload, classId } = result;
  const classData = CLASS_SKILL_DATA.find((c) => c.id === classId);
  const requiredStats = classData?.requiredStats ?? [];

  const stepDrafts: SetupStepInputById = {};

  stepDrafts.stats = serializeStatsStepDraft(buildStatsDraft(payload, classId, requiredStats));

  const ozRings = buildOzRingsDraft(payload);
  if (Object.keys(ozRings.levels).length > 0) stepDrafts.oz_rings = serializeOzRingsDraft(ozRings);

  stepDrafts.buffs = serializeBuffsDraft(buildBuffsDraft(payload));

  const linkSkills = buildLinkSkillsDraft(payload);
  if (Object.keys(linkSkills).length > 0) stepDrafts.link_skills = JSON.stringify(linkSkills);

  const hexa = buildHexaDraft(payload);
  if (hexa) stepDrafts.hexa_matrix = JSON.stringify(hexa);

  return { stepDrafts };
}
