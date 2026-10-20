// Per-class sweep for rebuilding MapleScouter's damage calculation. For each class, sends a
// reference sheet (a /calc/dmg body) with myClass swapped, changing one thing at a time, and
// records MapleScouter's damage figure. Raw results go to class-sweep.json after every request, so
// a stopped batch resumes where it left off and nothing already measured is sent twice.
//
//   node scripts/scouter-calibration/sweep.mjs --data <dir> <classId...> [--max 100] [--set base|interaction|pairs|special|curves|curvespot|buffs|summon|down]
//
// <dir> holds the private calibration data, never committed: probe-payload.json (the reference
// sheet; every probe in class-sweep.json must come from the same one) and class-sweep.json.
// classId as in src/features/characters/scouter/scouterClassNames.ts. --max caps how many new
// requests this run sends (default 100), so a sweep runs as batches with breaks in between: keep
// the pace gentle so the requesting IP isn't flagged by MapleScouter's Cloudflare.
import { readFileSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const dataIndex = process.argv.indexOf("--data"), dataDir = dataIndex >= 0 ? process.argv[dataIndex + 1] : null;
if (!dataDir) {
  console.error("usage: node scripts/scouter-calibration/sweep.mjs --data <dir> <classId...> [--max 100] [--set ...]");
  process.exit(1);
}
const RESULTS_FILE = path.join(dataDir, "class-sweep.json");
const TEMPLATE_FILE = path.join(dataDir, "probe-payload.json");
const CALC_URL = "https://api.maplescouter.com/api/calc/dmg";
const PAUSE_MS = 1500;

register(pathToFileURL(path.join(DIR, "resolve-ts.mjs")));
const { scouterKoreanClassName } = await import(
  pathToFileURL(path.join(DIR, "..", "..", "src", "features", "characters", "scouter", "scouterClassNames.ts")).href
);

const add = (field, amount) => (u) => { u.stat[field] = String(Number(u.stat[field]) + amount); };
const setRing = (ring, level) => (u) => { u.special[ring] = String(level); u.seedRing[ring].level = String(level); };
const CORES = ["skillCore1", "skillCore2", "masteryCore1", "masteryCore2", "masteryCore3", "masteryCore4", "reinCore1", "reinCore2", "reinCore3", "reinCore4", "generalCore2", "generalCore3"];

// Probe name -> change applied to the template. Names are the keys in class-sweep.json.
const PROBES = {
  base: () => {},
  "boss+100": add("bossDmg", 100),
  "critDmg+10": add("criticalDmg", 10),
  "atkPercent+10": add("atkPercent", 10),
  "atkBase+500": add("atkBase", 500),
  "mainStatAbs+5000": add("mainStatAbs", 5000),
  ...Object.fromEntries(CORES.map((core) => [`${core}=0`, (u) => { u.hexa[core] = "0"; }])),
  "allCores=0": (u) => { for (const core of CORES) u.hexa[core] = "0"; },
  "ignoreDef=90": (u) => { u.stat.ignoreDef = "90"; },
  "restraintRing=0": setRing("restraintRing", 0),
  "restraintRing=4": setRing("restraintRing", 4),
  "continuosRing=0": setRing("continuosRing", 0),
  // The Continuous Ring adds to both the ATT% group and the damage bucket; these two, against
  // the base probes, split its effect between them.
  "continuosRing=0 atkPercent+10": (u) => { setRing("continuosRing", 0)(u); add("atkPercent", 10)(u); },
  "continuosRing=0 boss+100": (u) => { setRing("continuosRing", 0)(u); add("bossDmg", 100)(u); },
  // Flat cooldown seconds raise HEXA without changing the damage figure; compare its `hexa`.
  "coolTimeReduce=2": (u) => { u.stat.coolTimeReduce = "2"; },
  "coolTimeReducePercent=0": (u) => { u.stat.coolTimeReducePercent = "0"; },
  "buffDuration=0": (u) => { u.stat.buffDuration = "0"; },
  "passiveSkillLevelUp=false": (u) => { u.stat.passiveSkillLevelUp = false; },
  "isReboot=true": (u) => { u.special.isReboot = true; },
};

// "Only this core at 30, every other core at 0". Against the single "core=0" probes above, this
// shows whether a core adds to the shared skill pool (worth relatively more when alone) or
// multiplies everything (worth the same either way). Only needed for classes whose cores don't
// simply add up.
const INTERACTION_PROBES = Object.fromEntries(
  CORES.map((only) => [`only ${only}`, (u) => { for (const core of CORES) u.hexa[core] = core === only ? "30" : "0"; }]),
);

// Each core's "gain alone / loss at max" sorts it into one of three kinds. Pool cores (adding to
// the shared skill pool) all share one ratio; the median is used for it, since a core that
// multiplies everything distorts the all-cores-lost ratio. A multiplier core's ratio is
// 1 / (1 - loss). Anything else interacts with specific other cores and gets pair probes.
const INTERACTION_TOLERANCE = 0.05;

function classifyCores(probes) {
  const full = probes.base.damage, none = probes["allCores=0"].damage;
  const stats = CORES.map((core) => {
    const loss = 1 - probes[`${core}=0`].damage / full;
    const gain = probes[`only ${core}`].damage / none - 1;
    return { core, loss, ratio: loss > 0 ? gain / loss : null };
  }).filter((s) => s.ratio !== null);
  const sorted = stats.map((s) => s.ratio).sort((a, b) => a - b);
  const poolRatio = sorted[Math.floor(sorted.length / 2)];
  const near = (a, b) => Math.abs(a / b - 1) <= INTERACTION_TOLERANCE;
  const kinds = { pool: [], multiplier: [], interacting: [] };
  for (const s of stats) {
    if (near(s.ratio, poolRatio)) kinds.pool.push(s.core);
    else if (near(s.ratio, 1 / (1 - s.loss))) kinds.multiplier.push(s.core);
    else kinds.interacting.push(s.core);
  }
  return kinds;
}

// Pairs of non-pool cores (and all of them together) at 30, every other core at 0. Multipliers
// are included: a core can look like a multiplier and still boost one specific skill (Lara's
// Mastery 2 and 4). A single non-pool core is paired with every pool core instead, to find what
// it interacts with. Built per class from its interaction results, so run `--set interaction`
// for a class first.
function pairProbesFor(probes) {
  if (!CORES.every((core) => probes[`only ${core}`])) return {};
  const { pool, multiplier, interacting } = classifyCores(probes);
  const flagged = [...multiplier, ...interacting];
  const sets = [];
  if (flagged.length === 1) for (const other of pool) sets.push([flagged[0], other]);
  for (let i = 0; i < flagged.length; i++) for (let j = i + 1; j < flagged.length; j++) sets.push([flagged[i], flagged[j]]);
  if (flagged.length > 2) sets.push(flagged);
  return Object.fromEntries(sets.map((set) => [`only ${set.join("+")}`, (u) => { for (const core of CORES) u.hexa[core] = set.includes(core) ? "30" : "0"; }]));
}

// Stat shape probes: how each stat field enters the stat term. Run on a few classes with
// different stat layouts (a normal 4×main + sub class, Xenon's three stats, Demon Avenger's HP).
const STAT_PROBES = {
  "mainStatBase+1000": add("mainStatBase", 1000),
  "mainStatPer+10": add("mainStatPer", 10),
  "subStatAbs+1000": add("subStatAbs", 1000),
  "subStatPer+10": add("subStatPer", 10),
  // special.statThird/statFourth: production always sends "0"; check whether they matter.
  "statThird+5000": (u) => { u.special.statThird = String(Number(u.special.statThird) + 5000); },
  "statFourth+5000": (u) => { u.special.statFourth = String(Number(u.special.statFourth) + 5000); },
};

// The 7 classes whose crit rate above 100% converts into crit damage, plus Kanna as a control
// (expected flat above 100).
const CRIT_PROBES = {
  "critical=120": (u) => { u.stat.critical = "120"; },
  "critical=150": (u) => { u.stat.critical = "150"; },
};
const CRIT_CLASSES = ["bow_master", "marksman", "pathfinder", "wind_archer", "wild_hunter", "mercedes", "kain", "kanna"];

// Demon Avenger at an HP-sized stat sheet (the template's numbers are INT-sized), and the
// same deltas from there.
const hpScale = (u) => {
  Object.assign(u.stat, { mainStatBase: "60000", mainStatPer: "400", mainStatAbs: "250000" });
};
const HP_PROBES = {
  hpScale,
  "hpScale mainStatBase+10000": (u) => { hpScale(u); add("mainStatBase", 10000)(u); },
  "hpScale mainStatPer+10": (u) => { hpScale(u); add("mainStatPer", 10)(u); },
  "hpScale mainStatAbs+50000": (u) => { hpScale(u); add("mainStatAbs", 50000)(u); },
  "hpScale subStatAbs+1000": (u) => { hpScale(u); add("subStatAbs", 1000)(u); },
};

// Xenon's third stat: first give it the same values as the second stat, then move each one.
const withSsub = (u) => {
  Object.assign(u.stat, { ssubStatBase: u.stat.subStatBase, ssubStatPer: u.stat.subStatPer, ssubStatAbs: u.stat.subStatAbs });
};
const SSUB_PROBES = {
  "ssub=sub": withSsub,
  "ssub=sub ssubStatAbs+1000": (u) => { withSsub(u); add("ssubStatAbs", 1000)(u); },
  "ssub=sub subStatAbs+1000": (u) => { withSsub(u); add("subStatAbs", 1000)(u); },
  "ssub=sub mainStatAbs+1000": (u) => { withSsub(u); add("mainStatAbs", 1000)(u); },
};

const special = (field, value) => (u) => { u.special[field] = value; };
const OPTION_PROBES = {
  oneHand: { "oneHandSword=true": special("oneHandSword", true) },
  rfs: { "useRuinForceShild=true": special("useRuinForceShild", true) },
  souls: { "epiSoul=2": special("epiSoul", "2"), "mugongSoul=2": special("mugongSoul", "2") },
  // Production sends ringOfSum, riskTaker and weaponAtk as inert "0"; check they are inert.
  rings: {
    "ringOfSum=0": (u) => { setRing("ringOfSum", 0)(u); },
    "weaponRing=4": setRing("weaponRing", 4),
    "riskTaker=4": special("riskTaker", "4"),
    "weaponAtk=0": (u) => { u.stat.weaponAtk = "0"; },
  },
};

function specialProbesFor(_probes, classId) {
  const sets = [];
  if (["kanna", "xenon", "demon_avenger", "zero"].includes(classId)) sets.push(STAT_PROBES);
  if (CRIT_CLASSES.includes(classId)) sets.push(CRIT_PROBES);
  if (classId === "demon_avenger") sets.push(HP_PROBES, OPTION_PROBES.rfs, OPTION_PROBES.souls);
  if (classId === "demon_slayer") sets.push(OPTION_PROBES.rfs);
  if (classId === "xenon") sets.push(SSUB_PROBES);
  if (["hero", "paladin", "dawn_warrior"].includes(classId)) sets.push(OPTION_PROBES.oneHand);
  if (classId === "kanna") sets.push(OPTION_PROBES.souls, OPTION_PROBES.rings);
  return Object.assign({}, ...sets);
}

// Core level curves: one core of each type at every level, run on a class whose cores simply add
// up (`curves`), then spot-checked at a few levels on interacting classes (`curvespot`).
const CURVE_CORES = ["skillCore1", "skillCore2", "masteryCore1", "reinCore1", "generalCore2", "generalCore3"];
const coreLevelProbes = (levels) => Object.fromEntries(
  CURVE_CORES.flatMap((core) => levels.map((level) => [`${core}=${level}`, (u) => { u.hexa[core] = String(level); }])),
);
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

// Link skill, Noblesse and Champion levels, each moved alone from the template's value.
const LINK_LEVELS = { magician: range(0, 9), thief: range(0, 9) };
const LINKS = ["ark", "illium", "kadena", "kain", "angel", "hoyoung", "mukhyun", "mihile", "kaiser", "hayato", "kanna"];
const CHAMPIONS = ["championAll", "championAtk", "championBoss", "championIgnore", "championCriDmg"];
const BUFF_LEVEL_PROBES = Object.fromEntries([
  ...[...LINKS.map((link) => [link, range(0, 3)]), ...Object.entries(LINK_LEVELS)].flatMap(([link, levels]) =>
    levels.map((level) => [`link ${link}=${level}`, (u) => { u.linkSkill[link] = String(level); }])),
  ...range(0, 3).flatMap((slot) => [0, 1, 2, 5, 8, 10, 13, 15].map((level) =>
    [`nobless[${slot}]=${level}`, (u) => { u.doping.nobless[slot] = String(level); }])),
  ...CHAMPIONS.flatMap((champion) => range(0, 4).map((level) =>
    [`${champion}=${level}`, (u) => { u.doping[champion] = String(level); }])),
]);

const PROBE_SETS = {
  base: () => PROBES,
  interaction: () => INTERACTION_PROBES,
  pairs: pairProbesFor,
  special: specialProbesFor,
  curves: () => coreLevelProbes(range(1, 29)),
  curvespot: () => coreLevelProbes([5, 15, 25]),
  buffs: () => BUFF_LEVEL_PROBES,
  // ATT bends slightly at the template (the slope going down differs from going up by ~0.05%),
  // so each ATT probe is also measured going down; the predictor uses the side the sheet is on.
  down: () => ({ "atkBase-500": add("atkBase", -500), "atkPercent-10": add("atkPercent", -10) }),
  // Summon duration matters for summon-heavy classes (Lara), so it is measured per class.
  summon: (_probes, classId) => ({
    "summonPersistTime=0": (u) => { u.stat.summonPersistTime = "0"; },
    ...(classId === "lara" ? { "summonPersistTime=42": (u) => { u.stat.summonPersistTime = "42"; }, "summonPersistTime=82": (u) => { u.stat.summonPersistTime = "82"; } } : {}),
  }),
};

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

const args = process.argv.slice(2);
const maxIndex = args.indexOf("--max");
const setIndex = args.indexOf("--set");
const maxRequests = maxIndex >= 0 ? Number(args[maxIndex + 1]) : 100;
// `--set levels:<core,core...>:<from>-<to>` probes the given cores at each level in the range, one at
// a time with the rest at 30 (e.g. levels:masteryCore1,reinCore1:1-29).
function levelsSet(spec) {
  const [, cores, span] = spec.split(":");
  const [from, to] = span.split("-").map(Number);
  return () => Object.fromEntries(cores.split(",").flatMap((core) => range(from, to).map((level) =>
    [`${core}=${level}`, (u) => { u.hexa[core] = String(level); }])));
}
const setName = setIndex >= 0 ? args[setIndex + 1] : "base";
const probeSet = setName.startsWith("levels:") ? levelsSet(setName) : PROBE_SETS[setName];
const classIds = args.filter((a, i) => !a.startsWith("--") && i !== maxIndex + 1 && i !== setIndex + 1 && args[i - 1] !== "--data");
if (classIds.length === 0 || !probeSet) {
  console.error(`usage: node scripts/scouter-calibration/sweep.mjs <classId...> [--max 100] [--set ${Object.keys(PROBE_SETS).join("|")}]`);
  process.exit(1);
}

const template = readJson(TEMPLATE_FILE);
const results = readJson(RESULTS_FILE, {});
let sent = 0;

outer: for (const classId of classIds) {
  const koreanName = scouterKoreanClassName(classId);
  if (!koreanName) {
    console.log(`${classId}: not in scouterClassNames.ts, skipped`);
    continue;
  }
  results[classId] ??= { koreanName, probes: {} };
  const probes = probeSet(results[classId].probes, classId);
  for (const [name, mutate] of Object.entries(probes)) {
    if (results[classId].probes[name]) continue;
    if (sent >= maxRequests) break outer;
    const body = structuredClone(template);
    body.userStat.stat.myClass = koreanName;
    mutate(body.userStat);
    const response = await fetch(CALC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "MapleDoro/1.0 (+https://www.mapledoro.com)" },
      body: JSON.stringify(body),
    });
    sent++;
    if (!response.ok) {
      console.log(`${classId} ${name}: HTTP ${response.status}, stopping this run`);
      break outer;
    }
    const c = (await response.json()).calculatedData;
    results[classId].probes[name] = { damage: c.calculatedHexaDamage_380, hexa: c.boss380_hexaStat };
    writeFileSync(RESULTS_FILE, `${JSON.stringify(results, null, 2)}\n`);
    await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
  }
  const done = Object.keys(probes).filter((name) => results[classId].probes[name]).length;
  console.log(`${classId}: ${done}/${Object.keys(probes).length} probes`);
}
console.log(`sent ${sent} request(s) this run`);
