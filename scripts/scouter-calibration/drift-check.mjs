// After a patch (or news that MapleScouter changed a class), checks whether MapleScouter still
// gives the answers the engine was built from: one request per class, the reference sheet
// unchanged, comparing its damage figure, HEXA and both HEXA splines with class-sweep.json and
// class-probes.json. Answers are kept in drift-check.json in the data folder, so a stopped run
// resumes where it left off; delete that file to start a fresh check.
//
//   node scripts/scouter-calibration/drift-check.mjs --data <dir> [classId...] [--max 50]
//
// Classes reported as moved need a re-sweep (sweep.mjs --set all --into fresh.json), then
// build-engine-data.mjs and validate.mjs; see scripts/CLAUDE.md.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const CALC_URL = "https://api.maplescouter.com/api/calc/dmg";
const PAUSE_MS = 1500;
// Same sheet, same day: MapleScouter's answers repeat exactly, so anything past rounding is real.
const DAMAGE_TOLERANCE = 1e-6;

const args = process.argv.slice(2), at = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const dataDir = at("--data"), maxRequests = Number(at("--max") ?? 50);
if (!dataDir) {
  console.error("usage: node scripts/scouter-calibration/drift-check.mjs --data <dir> [classId...] [--max 50]");
  process.exit(1);
}
const readJson = (name, fallback) => { try { return JSON.parse(readFileSync(path.join(dataDir, name), "utf8")); } catch (error) { if (error.code === "ENOENT" && fallback !== undefined) return fallback; throw error; } };
const SWEEP = readJson("class-sweep.json"), SPLINES = readJson("class-probes.json"), TEMPLATE = readJson("probe-payload.json");
const CHECK_FILE = "drift-check.json", checks = readJson(CHECK_FILE, {});
const classIds = args.filter((a, i) => !a.startsWith("--") && !["--data", "--max"].includes(args[i - 1]));

let sent = 0;
for (const classId of classIds.length ? classIds : Object.keys(SWEEP)) {
  if (checks[classId]) continue;
  if (sent >= maxRequests) break;
  const body = structuredClone(TEMPLATE);
  body.userStat.stat.myClass = SWEEP[classId].koreanName;
  const response = await fetch(CALC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "MapleDoro/1.0 (+https://www.mapledoro.com)" },
    body: JSON.stringify(body),
  });
  sent++;
  if (!response.ok) {
    console.log(`${classId}: HTTP ${response.status}, stopping this run`);
    break;
  }
  const c = (await response.json()).calculatedData;
  checks[classId] = { damage: c.calculatedHexaDamage_380, hexa: c.boss380_hexaStat, spline300: c.spline_300, spline380: c.spline_380 };
  writeFileSync(path.join(dataDir, CHECK_FILE), `${JSON.stringify(checks)}\n`);
  await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
}

const sameSpline = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const moved = [];
for (const [classId, check] of Object.entries(checks)) {
  const base = SWEEP[classId].probes.base, probe = SPLINES[classId], notes = [];
  const shift = check.damage / base.damage - 1;
  if (Math.abs(shift) > DAMAGE_TOLERANCE) notes.push(`damage ${(shift * 100).toFixed(4)}%`);
  if (check.hexa !== base.hexa) notes.push(`HEXA ${base.hexa} -> ${check.hexa}`);
  if (probe && !sameSpline(check.spline380, probe.spline380)) notes.push("380 spline changed");
  if (probe && !sameSpline(check.spline300, probe.spline300)) notes.push("300 spline changed");
  if (notes.length) moved.push(`${classId}: ${notes.join(", ")}`);
}
console.log(`sent ${sent} request(s) this run; ${Object.keys(checks).length}/${Object.keys(SWEEP).length} classes checked`);
console.log(moved.length ? `moved:\n  ${moved.join("\n  ")}` : "nothing moved");
