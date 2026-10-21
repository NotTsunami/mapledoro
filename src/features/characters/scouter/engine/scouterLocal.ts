/*
  Browser side of the local Scouter engine: loads the per-class constants once from
  public/data/scouter-engine.json, then turns a ScouterUserStat into the ScouterResultEntry the
  Scouter figure, Boss Clear grid, Stat Efficiency bookmark, Simulator and Stat Optimizer read.
  Calculating takes milliseconds, so results are only remembered in memory, keyed by the
  payload hash, to keep re-renders free.
*/

import type { ScouterStat, ScouterUserStat } from "../scouterApi";
import type { BossClearInputs, ScouterErrorReason, ScouterResultEntry, ScouterSpecEfficiency } from "../scouterResult";
import { coreAtt, coreAttAt, createEngine, type EngineData, type EnginePrediction, type ScouterEngine } from "./scouterEngine";

const ENGINE_DATA_URL = "/data/scouter-engine.json";
const MAX_REMEMBERED_RESULTS = 64;

export type ScouterEngineState = "idle" | "loading" | "ready" | "failed";

let state: ScouterEngineState = "idle";
let engine: ScouterEngine | null = null;
let loading: Promise<ScouterEngine | null> | null = null;
const listeners = new Set<() => void>();
const remembered = new Map<string, ScouterComputeResult>();

function setState(next: ScouterEngineState) {
  state = next;
  for (const listener of listeners) listener();
}

export const getScouterEngineState = (): ScouterEngineState => state;

export function subscribeScouterEngine(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Starts loading the engine data if it isn't loaded or loading. A failed load can be retried by
 *  calling this again (each component mount does). Resolves to null on failure. */
export function ensureScouterEngine(): Promise<ScouterEngine | null> {
  if (engine) return Promise.resolve(engine);
  loading ??= (async () => {
    setState("loading");
    try {
      const response = await fetch(ENGINE_DATA_URL);
      if (!response.ok) throw new Error(`engine data ${response.status}`);
      engine = createEngine((await response.json()) as EngineData);
      setState("ready");
      return engine;
    } catch {
      setState("failed");
      return null;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

type EditableStat = "atkBase" | "atkPercent" | "bossDmg" | "criticalDmg" | "ignoreDef"
  | `${"main" | "sub" | "ssub"}Stat${"Base" | "Per" | "Abs"}`;
type Nudge = (s: ScouterStat) => void;
const add = (field: EditableStat, amount: number): Nudge => (s) => { s[field] = String(Number(s[field]) + amount); };
const addAll = (fields: EditableStat[]): Nudge => (s) => { for (const field of fields) add(field, 1)(s); };
// +1% ignore defense multiplies what defense is left; "minus 40" removes a 40% source the same way.
const iedTimes = (keepFactor: number): Nudge => (s) => { s.ignoreDef = String(100 - (100 - Number(s.ignoreDef)) * keepFactor); };

/** MapleScouter's stat efficiency table, rebuilt by nudging one stat at a time: each value is the
 *  fraction of extra damage one unit buys. Boss damage and the "_380" entries move the 380 figure,
 *  the rest the 300 figure, as MapleScouter's table does (matching its saved tables to within 1% on
 *  every class). */
function specEfficiency(eng: ScouterEngine, u: ScouterUserStat, base: EnginePrediction): ScouterSpecEfficiency {
  const gain = (nudge: Nudge, figure: "damage" | "damage300" = "damage300") => {
    const sheet = structuredClone(u);
    nudge(sheet.stat);
    return eng.predict(sheet)[figure] / base[figure] - 1;
  };
  // MapleScouter's table counts a HEXA core's flat ATT at Lv 30 whatever its level (its damage and
  // HEXA figures use the real level), so the flat ATT line spreads over that much more ATT.
  const flatAtk = gain(add("atkBase", 1));
  const missingCoreAtt = coreAttAt(base.classId, 30) - coreAtt(base.classId, u.hexa);
  // Demon Avenger's all stat skips HP, its main stat.
  const allStat: EditableStat[] = base.classId === "demon_avenger" ? ["subStatPer", "ssubStatPer"] : ["mainStatPer", "subStatPer", "ssubStatPer"];
  return {
    dmgeff1: gain(add("bossDmg", 1), "damage"),
    atkeff1: 1 / (1 / flatAtk + missingCoreAtt),
    atkPereff1: gain(add("atkPercent", 1)),
    cridmgeff1: gain(add("criticalDmg", 1)),
    igreff1: gain(iedTimes(0.99)),
    igreff1_380: gain(iedTimes(0.99), "damage"),
    igreffminus40_380: gain(iedTimes(1 / 0.6), "damage"),
    mainStateff1: gain(add("mainStatBase", 1)),
    mainStatPereff1: gain(add("mainStatPer", 1)),
    mainStatAbseff1: gain(add("mainStatAbs", 1)),
    subStateff1: gain(add("subStatBase", 1)),
    subStatPereff1: gain(add("subStatPer", 1)),
    subStatAbseff1: gain(add("subStatAbs", 1)),
    ssubStateff1: gain(add("ssubStatBase", 1)),
    ssubStatPereff1: gain(add("ssubStatPer", 1)),
    ssubStatAbseff1: gain(add("ssubStatAbs", 1)),
    allStatEff: gain(addAll(allStat)),
  };
}

function bossClearInputs(eng: ScouterEngine, u: ScouterUserStat, base: EnginePrediction): BossClearInputs | undefined {
  const c = eng.classData(base.classId);
  if (!c?.spline300 || !c.spline380) return undefined;
  return {
    calculatedHexaDamage300: base.damage300,
    calculatedHexaDamage380: base.damage,
    calculatedDamage380: eng.predictNormal(u).damage,
    calculatedHexaDamageKaling: eng.predictKaling(u),
    ascentConst: eng.ascentShare(u),
    ignoreDefConst300: base.ign300,
    ignoreDefConst380: base.ign380,
    spline300: c.spline300,
    spline380: c.spline380,
    // 1 on every sheet MapleScouter has answered for.
    genePassConst: 1,
  };
}

export type ScouterComputeResult =
  | { ok: true; entry: ScouterResultEntry }
  | { ok: false; reason: ScouterErrorReason };

function compute(eng: ScouterEngine, u: ScouterUserStat): ScouterComputeResult {
  try {
    if (!eng.classOf(u)) return { ok: false, reason: "bad_response" };
    const base = eng.predict(u), normal = eng.predictNormal(u);
    if (base.hexa === null || base.hexa300 === null || normal.hexa === null || normal.hexa300 === null) return { ok: false, reason: "bad_response" };
    if (!Number.isFinite(base.damage) || base.hexa <= 0) return { ok: false, reason: "bad_response" };
    return {
      ok: true,
      entry: {
        boss300Normal: normal.hexa300,
        boss300Hexa: base.hexa300,
        boss380Normal: normal.hexa,
        boss380Hexa: base.hexa,
        bossClearInputs: bossClearInputs(eng, u, base),
        specEfficiency: specEfficiency(eng, u, base),
      },
    };
  } catch {
    return { ok: false, reason: "bad_response" };
  }
}

/** The result for a payload, or null while the engine data hasn't loaded. `hash` is the payload's
 *  hashScouterPayload, used to remember results across re-renders. */
export function computeScouterResultSync(u: ScouterUserStat, hash: string): ScouterComputeResult | null {
  if (!engine) return null;
  const known = remembered.get(hash);
  if (known) return known;
  const result = compute(engine, u);
  remembered.set(hash, result);
  if (remembered.size > MAX_REMEMBERED_RESULTS) remembered.delete(remembered.keys().next().value as string);
  return result;
}

/** Same as computeScouterResultSync, loading the engine data first if needed. A failed load is
 *  "network". */
export async function computeScouterResult(u: ScouterUserStat, hash: string): Promise<ScouterComputeResult> {
  const eng = await ensureScouterEngine();
  if (!eng) return { ok: false, reason: "network" };
  return computeScouterResultSync(u, hash) ?? { ok: false, reason: "network" };
}
