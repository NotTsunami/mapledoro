// Runs the app's local damage engine (src/features/characters/scouter/engine/scouterEngine.ts) on
// a stat sheet from the command line, with the per-class constants in public/data/scouter-engine.json.
// The calibration scripts import predict / predictNormal / predictKaling from here.
//
//   node scripts/scouter-calibration/predict.mjs <sheet.json> [--verbose]
//
// <sheet.json> is a MapleScouter Save Preset (its `data`) or a /calc/dmg body (its `userStat`).
import { existsSync, readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
export const ENGINE_DATA_FILE = path.join(DIR, "..", "..", "public", "data", "scouter-engine.json");
register(pathToFileURL(path.join(DIR, "resolve-ts.mjs")));
export const engineModule = await import(pathToFileURL(path.join(DIR, "..", "..", "src", "features", "characters", "scouter", "engine", "scouterEngine.ts")).href);

let engine = null;
const loaded = () => (engine ??= engineModule.createEngine(JSON.parse(readFileSync(ENGINE_DATA_FILE, "utf8"))));
export const predict = (u, opts) => loaded().predict(u, opts);
export const predictNormal = (u) => loaded().predictNormal(u);
export const predictKaling = (u) => loaded().predictKaling(u);
export const hasEngineData = () => existsSync(ENGINE_DATA_FILE);

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
