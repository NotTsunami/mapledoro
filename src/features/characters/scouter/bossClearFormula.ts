/*
  TS port of MapleScouter's Boss Clear (Cut) formula, reverse-engineered from their client
  bundle. Full byte-exact source, the real call-site argument mapping, and numeric validation
  against a real character (73.26% exact match on Hard Malefic Star) live in the
  project_maplescouter_bosscut_formula_2026_07_28 memory -- read that before changing any
  constant here, they're not arbitrary.

  Deliberately NOT ported (see memory for why each is safe to skip):
  - Their "Additional Spec Simulator" build-preview multiplier -- always 1 for a character's own
    real, current setup, which is all mapledoro shows.
  - Newbie Standard mode -- a separate toggle on their site, out of scope for a first version.
  - The Sayram authentic-symbol bonus multiplier on a few bosses (Maerin among them) -- a small,
    documented accuracy gap, not worth the extra complexity yet.
  - The legacy pre-spline cubic-polynomial fallback -- dead code on MapleScouter's own site for
    any modern character. computeBossClear returns null if spline_300/spline_380 aren't present
    rather than porting that fallback.
*/

import type { BossCutEntry } from "./bosscut-data.generated";
import type { BossClearInputs } from "./scouterCache";

interface Spline {
  x: number[];
  y: number[];
  m: number[];
}

// Forward cubic Hermite spline eval (MapleScouter module 62509's `M8`).
function splineEval(spline: Spline, t: number): number {
  const { x, y, m } = spline;
  const n = x.length;
  if (t < x[0]) return y[0] + (t - x[0]) * m[0];
  if (t <= x[n - 1]) {
    let seg = n - 2;
    for (let i = 0; i < n - 1; i++) {
      if (t >= x[i] && t <= x[i + 1]) {
        seg = i;
        break;
      }
    }
    const h = x[seg + 1] - x[seg];
    const s = (t - x[seg]) / h;
    const s2 = s * s;
    const s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * y[seg] + (s3 - 2 * s2 + s) * h * m[seg] + (-2 * s3 + 3 * s2) * y[seg + 1] + (s3 - s2) * h * m[seg + 1];
  }
  const last = x[n - 1];
  return y[n - 1] + (t - last) * Math.max(m[n - 1], 1e-9);
}

// Inverse of splineEval via binary search, 40 iterations matching MapleScouter's own `mg`.
function splineInverse(spline: Spline, damage: number): number {
  const { x, y, m } = spline;
  const n = x.length;
  if (damage <= y[0]) return Math.round(x[0] + (damage - y[0]) / Math.max(m[0], 1e-9));
  if (damage >= y[n - 1]) return Math.round(x[n - 1] + (damage - y[n - 1]) / Math.max(m[n - 1], 1e-9));
  let lo = x[0];
  let hi = x[n - 1];
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (splineEval(spline, mid) < damage) lo = mid;
    else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

// Level-gap damage-loss bucket, keyed by clamped (character level - boss level), -40..5.
const LEVEL_GAP_PERCENT: Record<number, number> = {
  5: 120, 4: 118, 3: 116, 2: 114, 1: 112, 0: 110,
  [-1]: 105.3, [-2]: 100.7, [-3]: 96.2, [-4]: 91.8, [-5]: 87.5, [-6]: 85, [-7]: 82.5, [-8]: 80,
  [-9]: 77.5, [-10]: 75, [-11]: 72.5, [-12]: 70, [-13]: 67.5, [-14]: 65, [-15]: 62.5, [-16]: 60,
  [-17]: 57.5, [-18]: 55, [-19]: 52.5, [-20]: 50, [-21]: 47.5, [-22]: 45, [-23]: 42.5, [-24]: 40,
  [-25]: 37.5, [-26]: 35, [-27]: 32.5, [-28]: 30, [-29]: 27.5, [-30]: 25, [-31]: 22.5, [-32]: 20,
  [-33]: 17.5, [-34]: 15, [-35]: 12.5, [-36]: 10, [-37]: 7.5, [-38]: 5, [-39]: 2.5, [-40]: 0,
};
function levelGapDmg(characterLevel: number, bossLevel: number): number {
  const diff = Math.max(-40, Math.min(5, characterLevel - bossLevel));
  return LEVEL_GAP_PERCENT[diff] / 100;
}

/** Ordered highest-threshold-first; the first entry whose min the value clears wins, else fallback. */
function pickTier<T>(value: number, thresholds: [min: number, result: T][], fallback: T): T {
  for (const [min, result] of thresholds) {
    if (value >= min) return result;
  }
  return fallback;
}

const ARCANE_GAP_TIERS: [number, number][] = [
  [150, 150], [130, 130], [110, 110], [100, 100], [70, 80], [50, 70], [30, 60], [10, 30],
];
function arcaneGapDmg(bossArcaneForce: number | null, characterArcaneForce: number): number {
  if (!bossArcaneForce || bossArcaneForce <= 0) return 1;
  const ratio = (characterArcaneForce / bossArcaneForce) * 100;
  return pickTier(ratio, ARCANE_GAP_TIERS, 10) / 100;
}

const AUTHENTIC_GAP_TIERS: [number, number][] = [
  [50, 125], [40, 120], [30, 115], [20, 110], [10, 105], [0, 100], [-10, 90], [-20, 80],
  [-30, 70], [-40, 60], [-50, 50], [-60, 40], [-70, 30], [-80, 20], [-90, 10],
];
function authenticGapDmg(bossAuthenticForce: number | null, characterAuthenticForce: number): number {
  if (!bossAuthenticForce || bossAuthenticForce <= 0) return 1;
  const diff = characterAuthenticForce - bossAuthenticForce;
  return pickTier(diff, AUTHENTIC_GAP_TIERS, 5) / 100;
}

// Real level floor for a handful of current-tier raid bosses, separate from the damage-loss
// gap tables above -- below it the boss can't be entered at all, not just "hard."
const ENTRY_LEVEL_BY_DIFFICULTY: Record<string, Record<string, number>> = {
  메이린: { Normal: 270, Hard: 280 },
};
const ENTRY_LEVEL_DEFAULT: Record<string, number> = {
  유피테르: 295, 발드릭스: 290, 림보: 285, 카링: 275, 대적자: 270, 칼로스: 265, 세렌: 260,
};
function cannotEnter(bossName: string, difficulty: string, characterLevel: number): boolean {
  const required = ENTRY_LEVEL_BY_DIFFICULTY[bossName]?.[difficulty] ?? ENTRY_LEVEL_DEFAULT[bossName] ?? 200;
  return required > characterLevel;
}

// MapleScouter's universal "converted power" calibration splines (guard<380 vs guard>=380),
// same hardcoded control points for every character, calibrated so stat 114000 always maps to
// exactly 1e9. Only feeds the displayed "converted power" number, never clearRate itself.
const CALIBRATION_SPLINE_300: Spline = {
  x: [0, 23669, 31571, 44859, 54997, 66681, 80448, 92420, 104603, 115271, 125592, 135121, 145777],
  y: [0, 0x7c85422, 0xd6a725e, 0x1db110e3, 0x30ecb258, 0x4e46ba39, 0x7a91c572, 0xa92bdb7c, 0xf4a23ef7, 0x161148007, 0x1f6659e79, 0x2acd89600, 0x38d42f36d],
  m: [5516.4666863830325, 8044.1943204984545, 14789.269328580256, 25218.024144283732, 36148.70231997388, 47175.69922998355, 59235.13103370648, 80154.51354834021, 129843.61610868858, 200526.65317574335, 277023.054602908, 336216.9876380784, 353328.37058933935],
};
const CALIBRATION_SPLINE_380: Spline = {
  x: [0, 23669, 31571, 44859, 54997, 66681, 80448, 92420, 104603, 115271, 125592, 135121, 145777],
  y: [0, 0x7ed8fad, 0xda11ba3, 0x1e0e6b06, 0x31744bb1, 0x4f0d6eb2, 0x7b8c552b, 0xaa5d553e, 0xf62821e2, 0x162ddf0f5, 0x1f8c1a334, 0x2b0251045, 0x3918f7ef5],
  m: [5619.558282986184, 8173.607442464422, 14954.342493122054, 25444.829794050493, 36456.11866357817, 47495.027385720256, 59506.8463563112, 80516.26536398455, 130313.03577388721, 201131.21598745478, 278244.2102268488, 337839.3881066491, 354903.2237237237],
};
function convertedBossPower(statValue: number, guard: number): number {
  const spline = guard < 380 ? CALIBRATION_SPLINE_300 : CALIBRATION_SPLINE_380;
  const scale = 1e9 / splineEval(spline, 114000);
  return splineEval(spline, statValue) * scale;
}

// --- Tag bucketing (MapleScouter module 97571's `Rn`) ---------------------------------------

/** Verified real English strings, found in MapleScouter's own i18n dictionary -- not a gloss. */
export const TAG_TRANSLATIONS: Record<string, string> = {
  "솔플 최소컷": "Solo Min",
  "솔플 여유컷": "Easy",
  "솔플 가능": "Possible",
  "파티격 가능": "Party-able",
  "파티 최소컷": "Party Min",
  파티: "Party",
  불가능: "Impossible",
  "입장 불가능": "Can't Enter",
  "2인 최소컷": "2p Min Cut",
  "3인 최소컷": "3p Min Cut",
  "4인 최소컷": "4p Min Cut",
  "6인 최소컷": "6p Min Cut",
  "격수 3인 최소컷": "3D Min Cut",
  "숍+격수2인 최소컷": "2D1B Min Cut",
};

// Soloable bosses share the same top 3 tiers regardless of partyLimit; only the party-assist
// tiers at the bottom vary (and partyLimit=1 has none, since there's no party to fall back to).
const SOLO_TAG_TIERS: Record<number, [number, string][]> = {
  6: [[2, "솔플 여유컷"], [1.1, "솔플 가능"], [0.9, "솔플 최소컷"], [0.25, "파티격 가능"], [0.15, "파티 최소컷"]],
  3: [[2, "솔플 여유컷"], [1.1, "솔플 가능"], [0.9, "솔플 최소컷"], [0.36, "파티격 가능"], [0.3, "파티 최소컷"]],
  2: [[2, "솔플 여유컷"], [1.1, "솔플 가능"], [0.9, "솔플 최소컷"], [0.55, "파티격 가능"], [0.45, "파티 최소컷"]],
  1: [[2, "솔플 여유컷"], [1.1, "솔플 가능"], [0.9, "솔플 최소컷"]],
};
// Party-only bosses (no solo option at all) use a different, party-size-labeled tag set.
const PARTY_ONLY_TAG_TIERS_BY_LIMIT: Record<number, [number, string][]> = {
  3: [[2.7, "솔플 최소컷"], [1.35, "2인 최소컷"], [0.9, "3인 최소컷"]],
};
const PARTY_ONLY_TAG_TIERS_DEFAULT: [number, string][] = [
  [5.1, "솔플 최소컷"], [2.55, "2인 최소컷"], [1.7, "3인 최소컷"], [1.275, "4인 최소컷"], [0.9, "6인 최소컷"],
];

function tagBucket(clearRate: number, isPartyBoss: boolean, partyLimit: number): string {
  if (isPartyBoss) {
    const tiers = PARTY_ONLY_TAG_TIERS_BY_LIMIT[partyLimit] ?? PARTY_ONLY_TAG_TIERS_DEFAULT;
    return pickTier(clearRate, tiers, "불가능");
  }
  const tiers = SOLO_TAG_TIERS[partyLimit];
  return tiers ? pickTier(clearRate, tiers, "불가능") : "불가능";
}

// --- Tile color tier (the inline style ternary in MapleScouter's own render component) ------

/** "red" isn't danger here -- MapleScouter uses it as "clearing by such a wide margin the exact
 *  number stopped being meaningful," a threshold consistently ABOVE the tag's own top tier. See
 *  the color-logic RESOLVED section in memory before reusing these thresholds elsewhere. */
export type ClearColorTier = "red" | "green" | "primary" | "blue" | "purple" | "gray";

const SOLOABLE_COLOR_TIERS: Record<number, [number, ClearColorTier][]> = {
  1: [[2.5, "red"], [1.5, "green"], [0.9, "primary"]],
  2: [[2.5, "red"], [1.5, "green"], [0.9, "primary"], [0.55, "blue"], [0.45, "purple"]],
  3: [[2.5, "red"], [1.5, "green"], [0.9, "primary"], [0.36, "blue"], [0.3, "purple"]],
  6: [[2.5, "red"], [1.5, "green"], [0.9, "primary"], [0.25, "blue"], [0.15, "purple"]],
};
const PARTY_ONLY_COLOR_TIERS_BY_LIMIT: Record<number, [number, ClearColorTier][]> = {
  3: [[2.7, "red"], [1.35, "green"], [0.9, "primary"]],
};
const PARTY_ONLY_COLOR_TIERS_DEFAULT: [number, ClearColorTier][] = [
  [5.1, "red"], [2.55, "green"], [1.7, "primary"], [1.275, "blue"], [0.9, "purple"],
];

function colorTier(clearRate: number, isPartyBoss: boolean, partyLimit: number): ClearColorTier {
  if (isPartyBoss) {
    const tiers = PARTY_ONLY_COLOR_TIERS_BY_LIMIT[partyLimit] ?? PARTY_ONLY_COLOR_TIERS_DEFAULT;
    return pickTier(clearRate, tiers, "gray");
  }
  const tiers = SOLOABLE_COLOR_TIERS[partyLimit] ?? SOLOABLE_COLOR_TIERS[6];
  return pickTier(clearRate, tiers, "gray");
}

// --- Main per-boss calc (MapleScouter module 33528) ------------------------------------------

export interface BossClearResult {
  clearRate: number;
  clearRatePercent: number;
  tagKorean: string;
  tagEnglish: string;
  colorTier: ClearColorTier;
  isPartyBoss: boolean;
  partyLimit: number;
  bossPower: number;
  /** The character's own raw HEXA damage, inverse-splined back into stat-space AFTER the
   *  level/arcane/authentic gap adjustments -- i.e. what this specific boss actually "sees"
   *  as your stat, not your flat HEXA figure. Feeds bossPower; exposed so the UI can show it
   *  directly (MapleScouter's own "adjusted stat / clear%" per-tile display). */
  bossStat: number;
  /** The three damage-loss multipliers that produced bossStat, each 1 = no loss. Exposed so
   *  the UI can show WHICH gap (level/arcane/authentic) is actually costing damage on a given
   *  boss, not just the combined result. */
  levelGapDmg: number;
  arcaneGapDmg: number;
  authenticGapDmg: number;
}

/** Adjusts the character's raw HEXA damage for the handful of bosses whose real fight uses a
 *  different damage figure than the plain 300/380 HEXA number -- Guardian Angel Slime divides
 *  by genePassConst, Kaling swaps in its own dedicated damage figure, Maerin blends in a slice
 *  of the non-HEXA number. Every other boss passes the plain figure through unchanged. */
function adjustedHexaDamage(bossName: string, guard: number, inputs: BossClearInputs): number {
  if (guard === 300) {
    return bossName === "가엔슬" ? inputs.calculatedHexaDamage300 / (inputs.genePassConst || 1) : inputs.calculatedHexaDamage300;
  }
  if (bossName === "카링") return inputs.calculatedHexaDamageKaling || inputs.calculatedHexaDamage380;
  if (bossName === "메이린") return 0.95 * inputs.calculatedHexaDamage380 + 0.05 * inputs.calculatedDamage380;
  return inputs.calculatedHexaDamage380;
}

/** Computes one boss+difficulty tile's clear rate, tag, and color for a character, or null if
 *  the character's cached Scouter result doesn't have Boss Clear inputs yet (needs a refresh) or
 *  the entry is missing required fields (bossCut/partyBossCut, or guard isn't 300/380). */
export function computeBossClear(
  entry: BossCutEntry,
  characterLevel: number,
  characterArcaneForce: number,
  characterAuthenticForce: number,
  inputs: BossClearInputs,
): BossClearResult | null {
  if (entry.guard !== 300 && entry.guard !== 380) return null;
  const cutThreshold = entry.bossCut ?? entry.partyBossCut;
  if (cutThreshold === null || cutThreshold === undefined) return null;

  const hasArcaneReq = !!entry.arcaneForce && entry.arcaneForce > 0;
  const hasAuthenticReq = !!entry.authenticForce && entry.authenticForce > 0;
  let arcaneCorrection = 1;
  if (hasArcaneReq) arcaneCorrection = entry.boss === "검은 마법사" ? 1.1 : 1.5;
  const correctionFactor = 1.2 * arcaneCorrection * (hasAuthenticReq ? 1.25 : 1);

  const rawDamage = adjustedHexaDamage(entry.boss, entry.guard, inputs);
  const arcaneGap = arcaneGapDmg(entry.arcaneForce, Math.min(characterArcaneForce, 1750));
  const authenticGap = authenticGapDmg(entry.authenticForce, characterAuthenticForce);
  const levelGap = levelGapDmg(characterLevel, entry.level);
  const gapAdjusted = rawDamage * arcaneGap * authenticGap * levelGap;
  const damage = gapAdjusted / correctionFactor;

  const spline = entry.guard === 300 ? inputs.spline300 : inputs.spline380;
  const cutInDamageSpace = splineEval(spline, cutThreshold);
  const bossStat = splineInverse(spline, damage);

  const preTimerClearRate = (damage / (cutInDamageSpace < 0 ? 1e4 : cutInDamageSpace)) * (entry.easyRate ?? 1);
  const ascentR = inputs.ascentConst === 1 ? 0 : inputs.ascentConst;
  const timerDivisor = entry.boss === "루시드" && entry.difficulty === "Hard" ? 0.4 : Math.min(3, Math.ceil(20 / preTimerClearRate / 5.667));
  const timerCorrection = (3 * ascentR) / timerDivisor - ascentR || 0;
  const clearRate = preTimerClearRate * (1 + timerCorrection) || 0;

  const isPartyBoss = !!entry.partyBossCut;
  const partyLimit = entry.partyLimit || 6;
  const tagKorean = cannotEnter(entry.boss, entry.difficulty, characterLevel) ? "입장 불가능" : tagBucket(clearRate, isPartyBoss, partyLimit);

  return {
    clearRate,
    clearRatePercent: clearRate * 100,
    tagKorean,
    tagEnglish: TAG_TRANSLATIONS[tagKorean] ?? tagKorean,
    colorTier: colorTier(clearRate, isPartyBoss, partyLimit),
    isPartyBoss,
    partyLimit,
    bossPower: convertedBossPower(bossStat, entry.guard),
    bossStat,
    levelGapDmg: levelGap,
    arcaneGapDmg: arcaneGap,
    authenticGapDmg: authenticGap,
  };
}
