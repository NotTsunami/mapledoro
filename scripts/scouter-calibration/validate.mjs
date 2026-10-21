// Checks predict.mjs against MapleScouter on synthetic sheets: a reference sheet with each class's
// HEXA cores set to random levels (fixed seed, so the same sheets every run). MapleScouter's answers
// are cached in synthetic-checks.json, so a re-run after a predictor change sends nothing new, and
// a MapleScouter update can be caught by re-checking cached sheets (--recheck).
//
//   node scripts/scouter-calibration/validate.mjs --data <dir> [classId...] [--per-class 3] [--max 100] [--recheck]
//
// <dir> holds the private calibration data, never committed: probe-payload.json (the reference
// sheet, a /calc/dmg body), class-sweep.json and synthetic-checks.json.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { predict } from "./predict.mjs";

const CALC_URL = "https://api.maplescouter.com/api/calc/dmg";
const PAUSE_MS = 1500;
const args = process.argv.slice(2), dataDir = args.includes("--data") ? args[args.indexOf("--data") + 1] : null;
if (!dataDir) {
  console.error("usage: node scripts/scouter-calibration/validate.mjs --data <dir> [classId...] [--per-class 3] [--max 100] [--recheck]");
  process.exit(1);
}
const CHECKS_FILE = path.join(dataDir, "synthetic-checks.json");
const readJson = (file, fallback) => { try { return JSON.parse(readFileSync(file, "utf8")); } catch (error) { if (error.code === "ENOENT") return fallback; throw error; } };
const SWEEP = readJson(path.join(dataDir, "class-sweep.json"));
const TEMPLATE = readJson(path.join(dataDir, "probe-payload.json")).userStat;
const CORES = ["skillCore1", "skillCore2", "masteryCore1", "masteryCore2", "masteryCore3", "masteryCore4", "reinCore1", "reinCore2", "reinCore3", "reinCore4", "generalCore2", "generalCore3"];

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const seedOf = (text) => [...text].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261);

// Sheet kinds, cycled per class: anything goes, mid progression, and nearly maxed.
const PROFILES = [
  (r) => Object.fromEntries(CORES.map((c) => [c, Math.floor(r() * 31)])),
  (r) => Object.fromEntries(CORES.map((c) => [c, c.startsWith("skill") ? 10 + Math.floor(r() * 21) : c.startsWith("mastery") ? 1 + Math.floor(r() * 30) : Math.floor(r() * 21)])),
  (r) => Object.fromEntries(CORES.map((c) => [c, r() < 0.3 ? 15 + Math.floor(r() * 15) : 30])),
];

function sheetFor(classId, index) {
  const r = rng(seedOf(`${classId} ${index}`)), levels = PROFILES[index % PROFILES.length](r);
  const u = structuredClone(TEMPLATE);
  u.stat.myClass = SWEEP[classId].koreanName;
  for (const c of CORES) u.hexa[c] = String(levels[c]);
  return { levels, u };
}

const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : fallback; };
const perClass = opt("--per-class", 3), maxRequests = opt("--max", 100), recheck = args.includes("--recheck");
const classIds = args.filter((a, i) => !a.startsWith("--") && !["--per-class", "--max", "--data"].includes(args[i - 1]));
const checks = readJson(CHECKS_FILE, {});
let sent = 0;
const rows = [];

for (const classId of classIds.length ? classIds : Object.keys(SWEEP)) {
  for (let i = 0; i < perClass; i++) {
    const key = `${classId} ${i}`, { levels, u } = sheetFor(classId, i);
    if (!checks[key] || recheck) {
      if (sent >= maxRequests) continue;
      const response = await fetch(CALC_URL, { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "MapleDoro/1.0 (+https://www.mapledoro.com)" }, body: JSON.stringify({ userStat: u }) });
      sent++;
      if (!response.ok) { console.log(`${key}: HTTP ${response.status}, stopping`); break; }
      const c = (await response.json()).calculatedData;
      if (recheck && checks[key] && Math.abs(checks[key].damage / c.calculatedHexaDamage_380 - 1) > 1e-9) console.log(`${key}: MapleScouter's answer changed since it was cached`);
      checks[key] = { levels, damage: c.calculatedHexaDamage_380, hexa: c.boss380_hexaStat };
      writeFileSync(CHECKS_FILE, `${JSON.stringify(checks, null, 1)}\n`);
      await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    }
    const p = predict(u);
    rows.push({ key, err: p.damage / checks[key].damage - 1, hexaDiff: p.hexa === null ? null : p.hexa - checks[key].hexa });
  }
}

rows.sort((a, b) => Math.abs(b.err) - Math.abs(a.err));
for (const row of rows) console.log(`${row.key.padEnd(22)} damage ${(row.err * 100).toFixed(3).padStart(7)}%  HEXA ${row.hexaDiff ?? "-"}`);
const abs = rows.map((r) => Math.abs(r.err)).sort((a, b) => a - b);
if (abs.length) console.log(`\n${rows.length} sheets: median |damage error| ${(abs[Math.floor(abs.length / 2)] * 100).toFixed(3)}%, worst ${(abs.at(-1) * 100).toFixed(3)}%`);
console.log(`sent ${sent} request(s) this run`);
