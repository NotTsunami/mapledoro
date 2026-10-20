// Predicts MapleScouter's damage figures and HEXA values for a stat sheet without calling
// MapleScouter, from per-class constants (engine-data.json, written by build-engine-data.mjs).
//
//   node scripts/scouter-calibration/predict.mjs <sheet.json> [--verbose]
//
// <sheet.json> is a MapleScouter Save Preset (its `data`) or a /calc/dmg body (its `userStat`).
// The damage figure is a per-class constant times a product of groups; inputs inside a group add,
// each group starting from the class's hidden amount (passives and built-in bonuses):
//   stat term x flat ATT x ATT% x damage bucket x crit damage bucket x defense x cores x the rest
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(DIR, "engine-data.json");
const n = Number;

// Crit rate above 100 converts into crit damage for these classes (per point of crit rate).
const CRIT_RATE_TO_CRIT_DMG = { bow_master: 0.2425, marksman: 0.235, pathfinder: 0.2817, wind_archer: 0.255, wild_hunter: 0.2678, mercedes: 0.294, kain: 0.263 };
// Demon Avenger: one HP is worth 0.8 / 3.5 of a STR point (measured 0.2286 on two HP scales).
const STAT_WEIGHTS = {
  xenon: { main: 1, sub: 1, ssub: 1 },
  demon_avenger: { main: 0.8 / 3.5, sub: 1, ssub: 0 },
  // A third stat weighs the same as the second (measured on Blade Master).
  blade_master: { main: 4, sub: 1, ssub: 1 }, shadower: { main: 4, sub: 1, ssub: 1 }, cadena: { main: 4, sub: 1, ssub: 1 },
};
const DEFAULT_WEIGHTS = { main: 4, sub: 1, ssub: 0 };
export const statWeights = (classId) => STAT_WEIGHTS[classId] ?? DEFAULT_WEIGHTS;

// Doping items by the group they add to, in that group's own units (flat ATT, % points, or a
// final-damage / ignore-defense fraction, or base points of every stat). Several items add to more
// than one group. Keys missing here had no effect when measured.
const DOPING = {
  flatAtk: { unionsPower: 30, urus: 30, extreme: 30, superPower: 30, thanks: 30, superVip: 30, legendHero: 30, fish: 30, sayram: 30, additional1: 15, collector: 44, rebootAtkPotion: 10, moonshine: 20, tengu: 20, rainbow: 20, cake: 40, truffle: 40, hyperRainbow: 40, ultraVip: 50, buff275: 60, whiteBear: 80, apple: 100, medal: 120 },
  dmg: { additional1: 15, sayram: 10, shiningRed: 20, authenticDmg: 20, house: 15, bigHero: 10, statPotion: 3 },
  crit: { sayram: 8, jangBi: 5 },
  atkPct: { sayram: 10, heroesHawl: 4 },
  fd: {},
  ied: { shiningBlue: 0.2, additional1: 0.15 },
  // Candy: base all stat (0.06% on a reference sheet, 0.03% at 0% main stat), nothing on Demon Avenger.
  allStat: { additional1: 15, collector: 13, candy: 7 },
};
// Demon Avenger only: base HP the same items add (scaled by HP %), and Guild Blessing's 30 ATT,
// which no other measured class gets.
const DA_HP = { sayram: 1295, additional1: 1505, collector: 182 };
const DA_HP_PER_CHAMPION_ALL = 490;

// Mu Gong's soul (Memories: +25% ATT for 10 or 20 s every 120 s) counts as 3 ATT% at either level:
// its probe comes to 2.989 to 2.998 ATT% points on every class measured.
const MUGONG_SOUL_ATT_PCT = 3;
export const soulAtkPct = (s) => (n(s.special.mugongSoul) > 0 ? MUGONG_SOUL_ATT_PCT : 0);

// Flat ATT one HEXA core also gives (the 3rd common node on most of these, Zero's 4th Mastery core),
// by core level, measured at base ATT 855 where it shows. Lynn's and Mo Xuan's "core at 0" probes
// return MapleScouter's error value, so theirs are taken from Erel Light and Sia, which match them
// with every core at 0.
export const CORE_ATT = {
  kanna: ["generalCore3", { 1: 30.6, 15: 39, 30: 48 }], hayato: ["generalCore3", { 1: 30.6, 30: 48 }],
  erel_light: ["generalCore3", { 1: 21.7, 30: 42 }], sia_astelle: ["generalCore3", { 1: 21.7, 30: 42 }],
  lynn: ["generalCore3", { 1: 21.7, 30: 42 }], mo_xuan: ["generalCore3", { 1: 21.7, 30: 42 }],
  shade: ["generalCore3", { 1: 1.1, 30: 33.3 }], aran: ["generalCore3", { 1: 1.5, 30: 44.2 }],
  buccaneer: ["generalCore3", { 1: 4, 15: 6, 30: 10 }], cannoneer: ["generalCore3", { 1: 1, 30: 30 }],
  corsair: ["generalCore3", { 1: 0, 15: 6, 30: 18 }], adele: ["generalCore3", { 1: 10, 30: 77 }],
  ark: ["generalCore3", { 1: 10.5, 15: 44.5, 30: 81 }], illium: ["generalCore3", { 1: 9.4, 30: 72 }],
  khali: ["generalCore3", { 1: 9.5, 30: 73 }], kinesis: ["generalCore3", { 1: 15, 30: 73 }],
  evan: ["generalCore3", { 1: 1.1, 30: 31.6 }], luminous: ["generalCore3", { 1: 1.2, 30: 35.2 }],
  mercedes: ["generalCore3", { 1: 1.5, 30: 44.4 }], phantom: ["generalCore3", { 1: 1.8, 30: 53.2 }],
  zero: ["masteryCore4", { 1: 15, 15: 36, 30: 60 }],
};
export function coreAttAt(classId, level) {
  if (!CORE_ATT[classId]) return 0;
  const pts = CORE_ATT[classId][1], L = Math.max(0, Math.min(30, Math.round(n(level)))), xs = Object.keys(pts).map(Number);
  if (L === 0) return 0;
  const i = xs.findIndex((x, j) => j < xs.length - 1 && L <= xs[j + 1]);
  return pts[xs[i]] + ((L - xs[i]) / (xs[i + 1] - xs[i])) * (pts[xs[i + 1]] - pts[xs[i]]);
}
export const coreAtt = (classId, hexa) => (CORE_ATT[classId] ? coreAttAt(classId, hexa[CORE_ATT[classId][0]]) : 0);

// Restraint Ring Lv 1-3 as a share of Lv 4, from level-by-level probes on one class. Its value is
// weighted by duration differently per class, so only the class's own Lv 4 / 5 probes set its size.
// Lv 6 is Lv 5's 20 s with 85% ATT instead of 68%.
const RESTRAINT_SHAPE = [0, 0.165, 0.372, 0.628, 0.934, 1].map((v) => v / 0.934);
const RESTRAINT_LV6_OVER_LV5 = 85 / 68;
export const restraintPts = (ring, s) => {
  const L = n(s.special.restraintRing);
  return L >= 6 ? ring.lv5 * RESTRAINT_LV6_OVER_LV5 : L >= 5 ? ring.lv5 : ring.lv4 * RESTRAINT_SHAPE[L];
};
// Continuous Ring by level (game data): ATT% and boss damage %, counted at full uptime. The Lv 4
// probes come to exactly 10.00 ATT% and 36.00 damage points on every class, level-by-level probes
// agree within 0.003 of Lv 4's effect, and sheets using Lv 1-3 fit better than with a shape fitted
// to those probes.
const CONTINUOUS_ATT = [0, 4, 6, 8, 10, 12, 14];
const CONTINUOUS_BOSS = [0, 9, 18, 27, 36, 45, 54];
const contLevel = (s) => Math.max(0, Math.min(6, Math.round(n(s.special.continuosRing))));
export const contAtt = (s) => CONTINUOUS_ATT[contLevel(s)];
export const contBoss = (s) => CONTINUOUS_BOSS[contLevel(s)];
// Ephenia's soul (A Queenly Fragrance) on Demon Avenger: +30 HP% at either level, which is Lv 1's
// 50% for 180 s of every 300 s (its probe comes to 30.000 HP% points). No other class gains damage.
const EPHENIA_HP_PCT = 30;
// Ruin Force Shield: 10% final damage (its probe reads exactly 1.100). Genesis weapon: 10% too.
const RUIN_FORCE_SHIELD_FD = 1.1;
const GENESIS_FD = 1.1;
// Classes whose final attack skills the artifact's Final Attack damage boosts.
const FINAL_ATTACK_CLASSES = new Set(["hero", "paladin", "dark_knight", "arch_mage_f_p", "arch_mage_i_l", "bishop", "bow_master", "marksman",
  "blade_master", "buccaneer", "corsair", "aran", "evan", "mercedes", "demon_avenger", "battle_mage", "wild_hunter", "blaster", "mihile", "ren"]);
// Summon duration: only Lara's damage moves with it, linear from 0 and flat somewhere between 42
// (measured still rising) and 82 (measured same as 42), so 42 is used as the cap.
const SUMMON_CAP = 42;

export const sheetDmg = (s) => (n(s.dmg) + n(s.bossDmg) + n(s.statusAdditionalDmg)) / 100;
export const critOver = (s) => Math.max(100, n(s.stat.critical));
export const CRIT_CONVERSION = CRIT_RATE_TO_CRIT_DMG;

// Buff contributions of a whole sheet, per group. `links` is damage % by link and level.
export function buffs(u, classId, links) {
  const d = u.doping, out = { flatAtk: 0, dmg: 0, crit: 0, atkPct: 0, allStat: 0, hp: 0, fd: 1, iedKeep: 1 };
  for (const [group, items] of Object.entries(DOPING)) {
    for (const [key, value] of Object.entries(items)) {
      if (!d[key]) continue;
      if (group === "fd") out.fd *= 1 + value;
      else if (group === "ied") out.iedKeep *= 1 - value;
      else out[group] += value;
    }
  }
  const nob = d.nobless.map(n);
  if (d.noblessBoss) out.dmg += 2 * nob[0];
  if (d.noblessDmg) out.dmg += 2 * nob[1];
  if (d.noblessCriDmg) out.crit += 2 * nob[2];
  if (d.noblessIgnore) out.iedKeep *= 1 - 0.02 * nob[3];
  out.dmg += 2 * n(d.championBoss);
  out.allStat += 10 * n(d.championAll);
  if (classId === "demon_avenger") {
    for (const [key, hp] of Object.entries(DA_HP)) if (d[key]) out.hp += hp;
    out.hp += DA_HP_PER_CHAMPION_ALL * n(d.championAll);
    if (d.guildBlessing) out.flatAtk += 30;
    if (d.candy) out.allStat -= DOPING.allStat.candy;
  }
  // Wild Hunter Legion card: +0.8% damage per rank (level 60 / 100 / 140 / 200 / 250).
  out.dmg += 0.8 * [60, 100, 140, 200, 250].filter((level) => n(u.stat.wildhunterUnion) >= level).length;
  out.crit += 0.5 * n(d.championCriDmg);
  out.flatAtk += 5 * n(d.championAtk);
  out.iedKeep *= 1 - 0.02 * n(d.championIgnore);
  for (const [link, level] of Object.entries(u.linkSkill)) {
    if (link === "magician") {
      // Every 2 levels (rounded up): +3% damage and +3% ignore defense, 15% + 15% at Lv 9.
      const steps = Math.ceil(n(level) / 2);
      out.dmg += 3 * steps;
      out.iedKeep *= 1 - 0.03 * steps;
    } else if (links[link]) out.dmg += links[link][level] ?? 0;
  }
  return out;
}

export const CORES = ["skillCore1", "skillCore2", "masteryCore1", "masteryCore2", "masteryCore3", "masteryCore4", "reinCore1", "reinCore2", "reinCore3", "reinCore4", "generalCore2", "generalCore3"];

// Mastery cores that step every few levels instead of rising evenly: Hoyoung's 1st steps every 6
// levels (MapleScouter's own leveling path takes it 1 -> 6 -> 12 -> 18 -> 24 -> 30, and its Lv 29 -> 30
// probe gains 7x an ordinary level), Cadena's 1st every 2 (its measured levels fit that exactly).
// Between measured levels these follow a + s L + J x (steps so far), fitted to the class's own levels.
const CORE_STAIRS = { hoyoung: { masteryCore1: 6 }, cadena: { masteryCore1: 2 } };

// Spline evaluation: MapleScouter's cubic Hermite (bossClearFormula.ts has the same one).
export function splineEval({ x, y, m }, t) {
  const L = x.length;
  if (t < x[0]) return y[0] + (t - x[0]) * m[0];
  if (t > x[L - 1]) return y[L - 1] + (t - x[L - 1]) * Math.max(m[L - 1], 1e-9);
  let seg = L - 2;
  for (let i = 0; i < L - 1; i++) if (t >= x[i] && t <= x[i + 1]) { seg = i; break; }
  const h = x[seg + 1] - x[seg], s = (t - x[seg]) / h, s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * y[seg] + (s3 - 2 * s2 + s) * h * m[seg] + (-2 * s3 + 3 * s2) * y[seg + 1] + (s3 - s2) * h * m[seg + 1];
}
export const hexaAt = (spline, target) => {
  let lo = 0, hi = 400000;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (splineEval(spline, mid) < target) lo = mid; else hi = mid; }
  return lo;
};
// A cooldown table's bonus for s seconds at no-cooldown HEXA h0, linear between rows, held at the ends.
export function tableBonus(rows, s, h0) {
  const i = rows.findIndex((r) => r.h0 >= h0);
  if (i <= 0) return rows[i === 0 ? 0 : rows.length - 1].bonus[s];
  const a = rows[i - 1], b = rows[i];
  return a.bonus[s] + ((h0 - a.h0) / (b.h0 - a.h0)) * (b.bonus[s] - a.bonus[s]);
}

export function createEngine(data) {
  const { classes, links, curves, cooldownRefs } = data;
  const classOf = (u) => Object.keys(classes).find((id) => classes[id].koreanName === u.stat.myClass);

  function coreShare(core, level) {
    const L = Math.max(0, Math.min(30, Math.round(level)));
    const curve = core === "skillCore1" ? "skill1" : core === "skillCore2" ? "skill2" : core.startsWith("mastery") ? "mastery"
      : core.startsWith("rein") ? "rein" : core === "generalCore2" ? "general2" : "general3";
    return curves[curve][L];
  }

  // Multiplier cores multiply a share of the class's damage: removing one alongside another core
  // costs share x (its loss) x (the other's loss) less than the two losses added (Thunder Breaker's
  // 1st Reinforcement core multiplies 83%, Paladin's 100%). The share comes from the "only this core,
  // all others at 0" probe: with q = that probe, share = (1 - (q - none) / loss) / (1 - q).
  // Ordinary cores all land on one per-class baseline (about 0.1, an artifact of the multipliers
  // being at 0 in that probe), so only cores clearly above it count. Mastery cores are left out:
  // they interact in pairs instead (corePairs).
  const sharesCache = {}, pairsCache = {}, stairCache = {};
  function multiplierShares(classId) {
    if (sharesCache[classId]) return sharesCache[classId];
    const r = classes[classId].cores, shares = {};
    if (!CORES.every((c) => r[`only ${c}`] !== undefined)) return (sharesCache[classId] = shares);
    const p0 = r["allCores=0"];
    const raw = CORES.filter((c) => !c.startsWith("mastery")).map((c) => {
      const loss = 1 - r[`${c}=0`], q = r[`only ${c}`];
      return loss > 0 ? [c, (1 - (q - p0) / loss) / (1 - q)] : null;
    }).filter(Boolean);
    const baseline = raw.map(([, s]) => s).sort((a, b) => a - b)[Math.floor(raw.length / 2)];
    const paired = new Set(corePairs(classId).flatMap(({ a, b }) => [a, b]));
    for (const [c, s] of raw) if (s - baseline > 0.08 && !(s > 1 && paired.has(c))) shares[c] = s;
    return (sharesCache[classId] = shares);
  }

  // Pairs of ordinary cores that interact (mostly two Mastery cores boosting the same skill), probed
  // on a {0, 1} x {0, 1} grid with the other cores at 30, keyed "a=0,b=1".
  function corePairs(classId) {
    if (pairsCache[classId]) return pairsCache[classId];
    const pairs = {};
    for (const [key, value] of Object.entries(classes[classId].cores)) {
      const m = key.match(/^(\w+)=(\d+),(\w+)=(\d+)$/);
      if (!m) continue;
      const [a, x, b, y] = m[1] < m[3] ? [m[1], m[2], m[3], m[4]] : [m[3], m[4], m[1], m[2]];
      (pairs[`${a},${b}`] ??= { a, b, grid: {} }).grid[`${x},${y}`] = value;
    }
    return (pairsCache[classId] = Object.values(pairs).filter((pair) => ["0,0", "0,1", "1,0", "1,1"].every((k) => pair.grid[k] !== undefined)));
  }

  function stairShape(classId, core, pts) {
    const period = CORE_STAIRS[classId]?.[core];
    if (!period) return null;
    const key = `${classId} ${core}`;
    if (stairCache[key]) return stairCache[key];
    // Least squares for s and J (the constant cancels in the shape).
    const steps = (L) => Math.floor(L / period), mean = (f) => pts.reduce((t, pt) => t + f(pt), 0) / pts.length;
    const mL = mean(([L]) => L), mS = mean(([L]) => steps(L)), mY = mean(([, y]) => y);
    const sLL = mean(([L]) => (L - mL) ** 2), sSS = mean(([L]) => (steps(L) - mS) ** 2), sLS = mean(([L]) => (L - mL) * (steps(L) - mS));
    const sLY = mean(([L, y]) => (L - mL) * (y - mY)), sSY = mean(([L, y]) => (steps(L) - mS) * (y - mY)), det = sLL * sSS - sLS * sLS;
    const s = (sLY * sSS - sSY * sLS) / det, J = (sSY * sLL - sLY * sLS) / det;
    return (stairCache[key] = (L) => s * L + J * steps(L));
  }

  // Share of a core's value kept at a level, from the class's own probes where they exist (the core
  // at that level, others at 30), else a straight line from its Lv 1 probe for Mastery cores and the
  // 3rd common node (their curves are straight lines, but start at a different share per class and
  // core: Marksman's 3rd node keeps 30.4% at Lv 1, Ren's 14.3%), else Ren's curve, bent to the
  // class's Lv 5 / 15 / 25 spot probes when those were measured.
  function coreShareSpot(classId, core, level) {
    const r = classes[classId].cores, L = Math.max(0, Math.min(30, Math.round(level)));
    if (L === 0 || L === 30) return L / 30;
    const z = r[`${core}=0`], has = (k) => r[`${core}=${k}`] !== undefined, at = (k) => (r[`${core}=${k}`] - z) / (1 - z);
    // Some cores carry no value in MapleScouter for some classes (Lynn's 4th Mastery core).
    if (z === 1) return 1;
    if (has(L)) return at(L);
    // Mastery and the 3rd node: straight lines through the measured levels (some classes bend at 15).
    if ((core.startsWith("mastery") || core === "generalCore3") && has(1)) {
      const pts = [...Array(29).keys()].map((k) => k + 1).filter(has).map((k) => [k, at(k)]).concat([[30, 1]]);
      const i = pts.findIndex(([x], j) => j < pts.length - 1 && L <= pts[j + 1][0]);
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const stair = stairShape(classId, core, pts);
      return y0 + (y1 - y0) * (stair ? (stair(L) - stair(x0)) / (stair(x1) - stair(x0)) : (L - x0) / (x1 - x0));
    }
    // Other cores follow Ren's shape between the class's own measured levels (Lv 1 and 15 at least):
    // the steps land at the same levels, but how much each class keeps at Lv 1 and 15 varies
    // (Marksman's Sol Janus keeps 32.2% at Lv 1 where Ren's keeps 29.7%).
    // Some cores are straight lines instead (Hoyoung's 1st Reinforcement core has no step at 20), so
    // each core takes whichever shape better predicts its own inner measured levels from their neighbors.
    if (has(1)) {
      const pts = [...Array(29).keys()].map((k) => k + 1).filter(has).concat([30]);
      const y = (k) => (k === 30 ? 1 : at(k));
      const ren = (x, x0, x1) => (coreShare(core, x) - coreShare(core, x0)) / (coreShare(core, x1) - coreShare(core, x0));
      const lin = (x, x0, x1) => (x - x0) / (x1 - x0);
      const miss = (shape) => pts.slice(1, -1).reduce((sum, x, j) => sum + Math.abs(y(pts[j]) + (y(pts[j + 2]) - y(pts[j])) * shape(x, pts[j], pts[j + 2]) - y(x)), 0);
      const shape = pts.length > 3 && miss(lin) < miss(ren) ? lin : ren;
      const i = pts.findIndex((x, j) => j < pts.length - 1 && L <= pts[j + 1]);
      const [x0, x1] = [pts[i], pts[i + 1]];
      return y(x0) + (y(x1) - y(x0)) * shape(L, x0, x1);
    }
    const spotCore = core.startsWith("mastery") ? "masteryCore1" : core;
    const ren = (k) => coreShare(spotCore, k);
    if (r[`${spotCore}=15`] === undefined || r[`${spotCore}=5`] === undefined) return coreShare(core, L);
    const sz = r[`${spotCore}=0`];
    const adj = (k) => (r[`${spotCore}=${k}`] - sz) / (1 - sz) / ren(k);
    const pts = [[1, adj(5)], [5, adj(5)], [15, adj(15)], [25, adj(25)], [30, 1]];
    const i = pts.findIndex(([x], j) => j < pts.length - 1 && L <= pts[j + 1][0]);
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    return Math.min(1, ren(L) * (y0 + ((L - x0) / (x1 - x0)) * (y1 - y0)));
  }

  // Cores relative to all at Lv 30. Every ordinary core subtracts what it loses alone (its "this
  // core at L, the rest at 30" value) from a pool; each multiplier core with share s and loss d then
  // gives pool x (1 - s d) - (1 - s) d, which is exactly its own loss when the pool is full and
  // multiplies everything else when s = 1. A measured pair replaces its two separate losses with the
  // pair's own value: within a pair, damage is bilinear over each core's {0, 1, 30} nodes (a core's
  // Lv 1 unlock is a step, Lv 1 to 30 follows its curve), so the partner's level changes how much a
  // core's unlock is worth. Core flat ATT is not in here; the flat ATT group adds it.
  function coreRatio(classId, levels) {
    const r = classes[classId].cores, shares = multiplierShares(classId);
    const L = Object.fromEntries(CORES.map((c) => [c, Math.max(0, Math.min(30, Math.round(n(levels[c]))))]));
    const single = (c, level) => 1 - (1 - r[`${c}=0`]) * (1 - coreShareSpot(classId, c, level));
    const nodes = (c, level) => {
      if (level === 0) return [[0, 1]];
      const f1 = coreShareSpot(classId, c, 1), t = f1 >= 1 ? 1 : (coreShareSpot(classId, c, level) - f1) / (1 - f1);
      return [[1, 1 - t], [30, t]];
    };
    let add = 1;
    for (const c of CORES) if (!(c in shares)) add -= 1 - single(c, L[c]);
    for (const { a, b, grid } of corePairs(classId)) {
      if (a in shares || b in shares) continue;
      const at = (i, j) => (i === 30 && j === 30 ? 1 : j === 30 ? single(a, i) : i === 30 ? single(b, j) : grid[`${i},${j}`]);
      let pair = 0;
      for (const [i, wi] of nodes(a, L[a])) for (const [j, wj] of nodes(b, L[b])) pair += wi * wj * at(i, j);
      add += pair - (single(a, L[a]) + single(b, L[b]) - 1);
    }
    let scale = 1, flat = 0;
    for (const [c, s] of Object.entries(shares)) {
      const d = 1 - single(c, L[c]);
      scale *= 1 - s * d;
      flat += (1 - s) * d;
    }
    return add * scale - flat;
  }

  // Cooldown seconds raise HEXA but not the damage figure, by a bonus that shrinks as the sheet gets
  // stronger. The reference classes were measured on a grid of strengths x 1-6 s and share a shape up
  // to a scale, so every other class takes their averaged table scaled by its own measured seconds.
  const sharedBonus = (s, h0) => Object.values(cooldownRefs).reduce((t, ref) => t + tableBonus(ref.rows, s, h0) / ref.norm2, 0) / Object.keys(cooldownRefs).length;
  function cooldownScale(classId, s) {
    const k = classes[classId].cooldownScale, known = Object.keys(k).map(Number);
    const lo = Math.max(...known.filter((x) => x <= s), known[0]), hi = Math.min(...known.filter((x) => x >= s), known.at(-1));
    return lo === hi ? k[lo] : k[lo] + ((s - lo) / (hi - lo)) * (k[hi] - k[lo]);
  }
  function cooldownBonus(classId, s, h0) {
    // Above 6 s (not measured) scale the 6 s column.
    const col = Math.min(s, 6), over = s / col;
    if (cooldownRefs[classId]) return over * tableBonus(cooldownRefs[classId].rows, col, h0);
    return over * cooldownScale(classId, col) * sharedBonus(col, h0);
  }
  function hexaFor(classId, damage, cooldownSeconds, splineKey = "spline380") {
    const c = classes[classId], spline = c[splineKey];
    if (!spline) return null;
    const s = Math.round(cooldownSeconds), h0 = hexaAt(spline, damage * c.splineScale);
    return Math.round(s <= 0 ? h0 : hexaAt(spline, damage * c.splineScale * (1 + cooldownBonus(classId, s, h0))));
  }

  // Every group from the class's hidden amount plus the sheet's own inputs.
  function groups(classId, u, { normal = false } = {}) {
    const c = classes[classId], b = buffs(u, classId, links), w = statWeights(classId);
    if (classId === "demon_avenger" && n(u.special.epiSoul) > 0) {
      u = structuredClone(u);
      u.stat.mainStatPer = String(n(u.stat.mainStatPer) + EPHENIA_HP_PCT);
    }
    const s = u.stat, mult = (k) => 1 + n(s[`${k}StatPer`]) / 100, g = {};

    // Stat term: base stat (the sheet's plus the class's hidden base plus buff base stat) times stat %,
    // plus flat stat. Character level adds base main stat per level (AP-based skills on Explorers,
    // Heroes and Resistance; the other classes don't change), so main stat % scales it too.
    g.stat = Object.entries(c.stat.hiddenBase).reduce((t, [k, hidden]) =>
      t + w[k] * (hidden + b.allStat + (k === "main" ? b.hp : 0)) * mult(k), 0)
      + ["main", "sub", "ssub"].reduce((t, k) => t + w[k] * (n(s[`${k}StatBase`]) * mult(k) + n(s[`${k}StatAbs`])), 0)
      + c.stat.flat + c.stat.perLevel * n(s.level) * mult("main");
    g.flatAtk = c.flatAtk + n(s.atkBase) + b.flatAtk + coreAtt(classId, u.hexa);
    g.atkPct = c.atkPct + (n(s.atkPercent) + b.atkPct + soulAtkPct(u) + contAtt(u)) / 100 + restraintPts(c.restraint, u);
    // Buff duration keeps damage buffs up longer, so it adds damage % points.
    g.dmg = c.dmg + sheetDmg(s) + (contBoss(u) + b.dmg) / 100 + c.dmgPerBuffDuration * n(s.buffDuration);
    g.crit = c.crit + (n(s.criticalDmg) + (CRIT_RATE_TO_CRIT_DMG[classId] ?? 0) * critOver(u) + b.crit) / 100;
    // Ignore defense: defense factor = 1 - k (1 - IED); buffs that ignore defense scale k.
    const keep = c.defenseK * b.iedKeep * (1 - n(s.ignoreDef) / 100);
    g.def = 1 - keep;
    g.cores = coreRatio(classId, u.hexa);
    const on = (flag, factor) => (flag ? factor : 1);
    g.other = b.fd
      * on(u.special.isReboot, c.toggles.isReboot ?? 1)
      * on(s.passiveSkillLevelUp, c.toggles.passiveSkillLevelUp ?? 1)
      * on(u.special.oneHandSword, c.toggles.oneHandSword ?? 1)
      * on(u.special.genesis, GENESIS_FD)
      * on(u.special.useRuinForceShild, RUIN_FORCE_SHIELD_FD)
      // Ignore elemental resistance: whole points only (0.5 counts as 0), capped at 5.
      * (1 + Math.min(5, Math.floor(n(s.ignoreElementalResist))) / 100)
      * (1 + c.perCooldownPercent * n(s.coolTimeReducePercent))
      // Cooldown reset chance: linear on the classes it affects (checked at 0 / 10 / 15 / 20).
      * (1 + c.perResetChance * n(s.resetCoolDown))
      * (1 + c.perSummonDuration * Math.min(SUMMON_CAP, n(s.summonPersistTime)))
      // Artifact final attack: only measured on Ren (30 -> +0.136%), assumed linear and the same on
      // the other classes with final attack skills; nothing on the rest.
      * (FINAL_ATTACK_CLASSES.has(classId) ? 1 + 0.00136 * n(s.artifact_finalAttack) / 30 : 1)
      // Below Lv 260 everything does 3% less, flat (the same at 200 and 259).
      * (!normal && n(s.level) < 260 ? 0.97 : 1);
    return { g, keep };
  }

  function predict(u, { normal = false } = {}) {
    const classId = classOf(u);
    if (!classId) throw new Error(`no engine data for class ${u.stat.myClass}`);
    const c = classes[classId], { g, keep } = groups(classId, u, { normal });
    const damage = c.scale * Object.values(g).reduce((a, x) => a * x, 1);
    // MapleScouter's ignoreDefConst_380 / _300: guard 380% and 300%, the same IED. The 300 figure is
    // the same damage at guard 300, without the authentic symbol doping's 20% damage (it only counts
    // against 380 bosses). Exact on every saved full response.
    const ign380 = 1 - keep, ign300 = 1 - (keep * 3) / 3.8;
    const damage300 = damage * (ign300 / ign380) * (u.doping.authenticDmg ? 1 - DOPING.dmg.authenticDmg / 100 / g.dmg : 1);
    const cd = n(u.stat.coolTimeReduce);
    return { classId, damage, damage300, ign380, ign300, groups: g, hexa: hexaFor(classId, damage, cd), hexa300: hexaFor(classId, damage300, cd, "spline300") };
  }

  // MapleScouter's "Normal" figures (calculatedDamage_380, boss380_stat) are the same sheet with
  // every HEXA core at 30 and without the under-260 cut.
  function predictNormal(u) {
    const maxed = structuredClone(u);
    for (const core of CORES) maxed.hexa[core] = "30";
    return predict(maxed, { normal: true });
  }

  // Kaling's figure (calculatedHexaDamage_kaling) moves with the Ascent core: with a = what Ascent
  // adds on this sheet (MapleScouter's ascent_const, damage / damage at Ascent 0, minus 1) and A = the
  // class's reference value, Kaling = 380 damage x (1 + K a) / (1 + K A). K is fitted, not derived:
  // within 0.031% on every saved full response, weak and maxed alike.
  function predictKaling(u) {
    const full = predict(u), noAscent = structuredClone(u);
    noAscent.hexa.skillCore2 = "0";
    const a = full.damage / predict(noAscent).damage - 1, A = classes[full.classId].kalingAscent;
    return full.damage * ((1 + KALING_ASCENT_WEIGHT * a) / (1 + KALING_ASCENT_WEIGHT * A));
  }

  return { predict, predictNormal, predictKaling, groups, classOf };
}
const KALING_ASCENT_WEIGHT = 1.944;

let engine = null;
const loaded = () => (engine ??= createEngine(JSON.parse(readFileSync(DATA_FILE, "utf8"))));
export const predict = (u, opts) => loaded().predict(u, opts);
export const predictNormal = (u) => loaded().predictNormal(u);
export const predictKaling = (u) => loaded().predictKaling(u);
export const hasEngineData = () => existsSync(DATA_FILE);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node scripts/scouter-calibration/predict.mjs <sheet.json> [--verbose]");
    process.exit(1);
  }
  const json = JSON.parse(readFileSync(file, "utf8")), u = json.data ?? json.userStat ?? json;
  const result = predict(u);
  console.log(`${result.classId}: damage ${result.damage.toFixed(0)}, HEXA 380 ${result.hexa ?? "(no spline for this class)"}, HEXA 300 ${result.hexa300 ?? "-"}`);
  if (process.argv.includes("--verbose")) for (const [k, v] of Object.entries(result.groups)) console.log(`  ${k.padEnd(8)} ${v.toFixed(5)}`);
}
