// Dev-only console drill for verifying Scouter Simulator Input tab field formulas. Every
// Input tab field is additive against MapleScouter's own /calc/dmg-simulator endpoint's
// `simulator` overlay object, but the plan is to eventually mutate the real ScouterUserStat
// directly and call the plain (non api-key-gated) /calc/dmg endpoint instead -- see
// buildDirectScouterPayload's own file header for why that's possible for level/HEXA/buffs/
// rings already. Whether a given ScouterStat field can be mutated the same additive way is
// UNCONFIRMED per field (some may be a different stacking rule, e.g. Ignore DEF is suspected
// multiplicative-against-remaining-DEF, not a flat add) -- this drill runs ONE field's real
// simulator result against ONE candidate-formula direct-payload result and prints both side
// by side, so a mismatch is obvious immediately instead of requiring a manual two-tab compare.
// The formula per field lives in INPUT_FIELD_FORMULAS below -- a stated hypothesis, UNTESTED
// until this drill confirms it -- not something the caller computes by hand each run.
//
// Deliberately does NOT loop across multiple fields or characters automatically -- each call
// is exactly 2 real requests to MapleScouter's own upstream (proxied, but not cached across
// the two different payload shapes), and MapleScouter's own server -- not just mapledoro's
// proxy -- has rate-limited real accounts before. One comparison per console call, run at
// whatever pace the caller chooses; never wire this into an automated harness that fires
// many of these back to back.
//
// Same NODE_ENV-gated window-global convention as scouterDevDrill.ts/wipeTripwire.ts.

import type { StoredCharacterRecord } from "../model/charactersStore";
import { readCharactersStore, selectCharacterByIgn } from "../model/charactersStore";
import { parseCalcResponse, parseSimulatorCalcResponse, peekScouterLastKnown } from "./scouterCache";
import { buildScouterPayload, buildSimulatorPayload, type ScouterPayloadContext, type ScouterStat, type ScouterUserStat } from "./scouterApi";

// Delay between the two requests so even a single comparison doesn't read as a burst to
// MapleScouter's own upstream server.
const REQUEST_GAP_MS = 4000;

/** One entry per Input tab field this drill knows how to test. `simulatorField` is the raw
 *  ScouterSimulator key sent as ground truth. `mutate` takes the character's own REAL
 *  ScouterStat block (already built by buildScouterPayload) plus the typed value, and returns
 *  the candidate mutation to Object.assign onto a fresh copy of that same stat block --
 *  a stated hypothesis per field, unverified until this drill confirms it:
 *  - Plain additive fields just add the typed value onto the real field's own number.
 *  - "Stat per 9 Levels" -- guessed floor(level / 9) * typed, unconfirmed rounding.
 *  - Ignore DEF -- guessed diminishing stack against the remaining (100 - real)%, i.e.
 *    real + (100 - real) * (typed / 100), unconfirmed -- this is the one most likely to be
 *    wrong on the first try. */
function statField(field: keyof ScouterStat): (userStat: ScouterUserStat, v: number) => void {
  return (userStat, v) => {
    (userStat.stat[field] as string) = String(Number(userStat.stat[field]) + v);
  };
}

// For a field suspected to be a full override rather than additive -- e.g. weaponAtk: typing
// "1" into MapleScouter's real Input tab dropped the result BELOW the character's real
// baseline (live-confirmed), which additive can't produce (adding a positive number can only
// raise or no-op the result, never lower it). Replaces the real value outright instead of
// adding to it, to test that hypothesis.
function statFieldOverride(field: keyof ScouterStat): (userStat: ScouterUserStat, v: number) => void {
  return (userStat, v) => {
    (userStat.stat[field] as string) = String(v);
  };
}

// ScouterPower's fields are typed as literal 0 (always hardcoded in the real payload) --
// this drill needs to write a real nonzero number to test whether the server actually reads
// from `power` instead of `stat` for a given field, so the cast is a deliberate, dev-only
// override of that literal-0 typing, not a real payload-shape change.
function powerField(field: keyof ScouterUserStat["power"]): (userStat: ScouterUserStat, v: number) => void {
  return (userStat, v) => {
    (userStat.power[field] as number) = v;
  };
}

const INPUT_FIELD_FORMULAS: Record<string, {
  simulatorField: string;
  /** Mutates userStat in place -- usually a stat.* field, but a variant key (e.g.
   *  "mainStatPer_power") can instead target userStat.power's own same-named field, to test
   *  whether a %/Abs-style field is actually read from `power` server-side instead of `stat`
   *  (stat.mainStatPer had no effect at all in a live test -- see this file's own findings). */
  mutate: (userStat: ScouterUserStat, typed: number) => void;
}> = {
  mainStatBase: { simulatorField: "mainStat", mutate: statField("mainStatBase") },
  mainStatPer: { simulatorField: "mainStatPer", mutate: statField("mainStatPer") },
  mainStatPer_power: { simulatorField: "mainStatPer", mutate: powerField("mainStatPer") },
  mainStatAbs: { simulatorField: "mainStatAbs", mutate: statField("mainStatAbs") },
  mainStatAbs_power: { simulatorField: "mainStatAbs", mutate: powerField("mainStatAbs") },
  subStatBase: { simulatorField: "subStat", mutate: statField("subStatBase") },
  subStatPer: { simulatorField: "subStatPer", mutate: statField("subStatPer") },
  subStatPer_power: { simulatorField: "subStatPer", mutate: powerField("subStatPer") },
  subStatAbs: { simulatorField: "subStatAbs", mutate: statField("subStatAbs") },
  subStatAbs_power: { simulatorField: "subStatAbs", mutate: powerField("subStatAbs") },
  // 3-real-stat classes only (e.g. Dual Blade: LUK main, DEX/STR as sub+ssub) -- ssubStat* is
  // always hardcoded "0"/unused in ScouterSimulator's own type (see buildSimulatorPayload),
  // so this drill overwrites the built request's field directly rather than needing a real
  // SimulatorInputOverrides field for it (that whole overlay type is being phased out by this
  // session's direct-mutation migration anyway -- no point extending it further).
  ssubStatBase: { simulatorField: "ssubStat", mutate: statField("ssubStatBase") },
  ssubStatPer: { simulatorField: "ssubStatPer", mutate: statField("ssubStatPer") },
  ssubStatAbs: { simulatorField: "ssubStatAbs", mutate: statField("ssubStatAbs") },
  coolTimeReduce: { simulatorField: "coolTimeReduce", mutate: statField("coolTimeReduce") },
  resetCoolDown: { simulatorField: "resetCoolDown", mutate: statField("resetCoolDown") },
  bossDmg: { simulatorField: "bossDmg", mutate: statField("bossDmg") },
  bossDmg_power: { simulatorField: "bossDmg", mutate: powerField("bossDmg") },
  criticalRate: { simulatorField: "criRate", mutate: statField("critical") },
  criticalDmg: { simulatorField: "criDmg", mutate: statField("criticalDmg") },
  criticalDmg_power: { simulatorField: "criDmg", mutate: powerField("criDmg") },
  buffDuration: { simulatorField: "buffDuration", mutate: statField("buffDuration") },
  weaponAtk: { simulatorField: "weaponAtk", mutate: statField("weaponAtk") },
  weaponAtk_override: { simulatorField: "weaponAtk", mutate: statFieldOverride("weaponAtk") },
  // Attack/Magic Attack base + %. No longer assuming additive by default after weaponAtk
  // turned out to be an override -- both variants are wired per field so either hypothesis
  // is one console call away. atkAbs (% Not Applied) has no ScouterSimulator field at all to
  // use as ground truth (simulator.atk/atkPer exist, no atkAbs equivalent) -- untestable via
  // this drill until/unless a real captured request shows otherwise.
  atkBase: { simulatorField: "atk", mutate: statField("atkBase") },
  atkBase_override: { simulatorField: "atk", mutate: statFieldOverride("atkBase") },
  atkPercent: { simulatorField: "atkPer", mutate: statField("atkPercent") },
  atkPercent_override: { simulatorField: "atkPer", mutate: statFieldOverride("atkPercent") },
  ignoreDef: {
    simulatorField: "ignoreGuard",
    mutate: (u, v) => {
      const realVal = Number(u.stat.ignoreDef);
      u.stat.ignoreDef = String(realVal + (100 - realVal) * (v / 100));
    },
  },
  // "Stat per 9 Levels" (real potential line, e.g. "+2 STR per 9 levels") has no stat.* field
  // of its own -- mainStat9Level only exists on ScouterSimulator. Testable anyway via
  // equivalence against mainStatBase's own already-confirmed plain-additive formula: if the
  // guessed floor(level / 9) * typed conversion is right, applying that many flat main stat
  // points via mainStatBase should produce the exact same boss380Hexa as typing the raw value
  // into simulator.mainStat9Level directly. A stated guess, unconfirmed rounding.
  mainStat9Level_floor: {
    simulatorField: "mainStat9Level",
    mutate: (u, v) => {
      const equivalent = Math.floor(Number(u.stat.level) / 9) * v;
      u.stat.mainStatBase = String(Number(u.stat.mainStatBase) + equivalent);
    },
  },
  mainStat9Level_ceil: {
    simulatorField: "mainStat9Level",
    mutate: (u, v) => {
      const equivalent = Math.ceil(Number(u.stat.level) / 9) * v;
      u.stat.mainStatBase = String(Number(u.stat.mainStatBase) + equivalent);
    },
  },
  // Same confirmed floor(level / 9) * typed formula, applied onto subStatBase instead --
  // mainStat9Level_floor's formula matched live, this just re-targets the sub stat slot.
  subStat9Level_floor: {
    simulatorField: "subStat9Level",
    mutate: (u, v) => {
      const equivalent = Math.floor(Number(u.stat.level) / 9) * v;
      u.stat.subStatBase = String(Number(u.stat.subStatBase) + equivalent);
    },
  },
  // 3-real-stat classes only, same blocked-on-a-real-Dual-Blade-character situation as
  // ssubStatBase/Per/Abs above. ssubStat9Level is hardcoded "" (literal empty string type) in
  // ScouterSimulator, not a real editable field the way mainStat9Level/subStat9Level are --
  // this drill overwrites the built request's field directly, same trick as the other
  // ssubStat* entries, so the hardcoded "" doesn't block testing it.
  ssubStat9Level_floor: {
    simulatorField: "ssubStat9Level",
    mutate: (u, v) => {
      const equivalent = Math.floor(Number(u.stat.level) / 9) * v;
      u.stat.ssubStatBase = String(Number(u.stat.ssubStatBase) + equivalent);
    },
  },
  // All Stat% -- no stat.*/power.* field of its own (same situation as mainStat9Level was),
  // so this is an equivalence guess: "all stat %" as a real MapleStory concept boosts every
  // real stat's own % simultaneously, so test adding the typed value onto mainStatPer AND
  // subStatPer (both already confirmed plain-additive individually) at once. Unconfirmed --
  // no stated hypothesis for this one going in, unlike every other field.
  allStatPer_mainAndSub: {
    simulatorField: "allStatPer",
    mutate: (u, v) => {
      u.stat.mainStatPer = String(Number(u.stat.mainStatPer) + v);
      u.stat.subStatPer = String(Number(u.stat.subStatPer) + v);
    },
  },
  // 3-real-stat classes only (blocked on access to one, same as ssubStat*/ssubStat9Level
  // above) -- same confirmed allStatPer_mainAndSub formula, extended to also cover the 3rd
  // stat slot's own %.
  allStatPer_mainSubSsub: {
    simulatorField: "allStatPer",
    mutate: (u, v) => {
      u.stat.mainStatPer = String(Number(u.stat.mainStatPer) + v);
      u.stat.subStatPer = String(Number(u.stat.subStatPer) + v);
      u.stat.ssubStatPer = String(Number(u.stat.ssubStatPer) + v);
    },
  },
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postJson(url: string, body: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${url} → ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

function summarize(entry: ReturnType<typeof parseCalcResponse>) {
  if (!entry) return null;
  return {
    boss300Hexa: entry.boss300Hexa,
    boss380Hexa: entry.boss380Hexa,
    convertedPowerHexa: entry.convertedPowerHexa,
    dojoPower: entry.dojoPower,
  };
}

function resolveCharacter(characterName: string): { character: StoredCharacterRecord; ctx: ScouterPayloadContext } | null {
  const store = readCharactersStore();
  const character = selectCharacterByIgn(store, characterName);
  if (!character) {
    console.warn(`[scouter input drill] no character named "${characterName}".`);
    return null;
  }
  return { character, ctx: { scouterLegionByWorld: store.scouterLegionByWorld } };
}

/** Fires the ground-truth (/calc/dmg-simulator) request, waits REQUEST_GAP_MS, fires the
 *  candidate (/calc/dmg direct) request, and prints both summaries + a match verdict. Shared
 *  by compareScouterInputField and compareFinalDamageEquivalence -- both just need to build
 *  the two request bodies differently going in. */
async function runComparison(simulatorRequest: unknown, directUserStat: ScouterUserStat): Promise<void> {
  try {
    const simulatorData = await postJson("/api/scouter-simulator", simulatorRequest);
    const simulatorEntry = summarize(parseSimulatorCalcResponse(simulatorData));
    console.info("  ground truth (/calc/dmg-simulator):", simulatorEntry);

    await sleep(REQUEST_GAP_MS);

    const directData = await postJson("/api/scouter", { userStat: directUserStat });
    const directEntry = summarize(parseCalcResponse(directData));
    console.info("  candidate    (/calc/dmg direct):    ", directEntry);

    const matches = JSON.stringify(simulatorEntry) === JSON.stringify(directEntry);
    console.info(matches ? "  ✅ MATCH -- this mutation formula is confirmed correct." : "  ❌ MISMATCH -- formula needs adjustment, do not wire this in yet.");
  } catch (error) {
    console.error("[scouter input drill] request failed:", error);
  }
}

/** Dev-only drill: type one field name + one value, and this builds BOTH MapleScouter
 *  requests itself (the real /calc/dmg-simulator ground truth, and a candidate plain
 *  /calc/dmg call mutated per INPUT_FIELD_FORMULAS' stated hypothesis for that field), fires
 *  them a few seconds apart, and prints both results side by side with a match/mismatch
 *  verdict. Nothing here needs computing by hand -- that's what this drill exists to avoid.
 *
 *  Usage: __mapledoroCompareScouterInputField("yourign", "ignoreDef", 30)
 *  Run __mapledoroCompareScouterInputField() with no args to list known field names. */
async function compareScouterInputField(characterName?: string, fieldKey?: string, typedValue?: number): Promise<void> {
  if (!characterName || !fieldKey || typedValue === undefined) {
    console.info(`[scouter input drill] known fields: ${Object.keys(INPUT_FIELD_FORMULAS).join(", ")}`);
    console.info(`[scouter input drill] usage: __mapledoroCompareScouterInputField("yourign", "ignoreDef", 30)`);
    return;
  }
  const formula = INPUT_FIELD_FORMULAS[fieldKey];
  if (!formula) {
    console.warn(`[scouter input drill] unknown field "${fieldKey}". Known fields: ${Object.keys(INPUT_FIELD_FORMULAS).join(", ")}`);
    return;
  }
  const resolved = resolveCharacter(characterName);
  if (!resolved) return;
  const { character, ctx } = resolved;

  const simulatorRequest = buildSimulatorPayload(character, ctx, {});
  const builtUserStat = buildScouterPayload(character, ctx);
  if (!simulatorRequest || !builtUserStat) {
    console.warn(`[scouter input drill] "${characterName}"'s class isn't supported by MapleScouter.`);
    return;
  }
  // Deep-clone before mutating: buildScouterPayload aliases shared module-level constants
  // (ZERO_POWER/ZERO_ENTIRE_STAT) into every payload it returns for fields the real app never
  // touches after building -- this drill is the first caller to actually write into `power`,
  // and mutating the alias in place would permanently corrupt those constants for every other
  // buildScouterPayload call in the same session (this is exactly what produced an earlier
  // false "MISMATCH": a power.* mutation silently poisoned BOTH the ground-truth and candidate
  // builds afterward, since buildSimulatorPayload calls buildScouterPayload internally too).
  const directUserStat = structuredClone(builtUserStat);
  (simulatorRequest.simulator as unknown as Record<string, string>)[formula.simulatorField] = String(typedValue);
  formula.mutate(directUserStat, typedValue);

  console.info(`[scouter input drill] running "${fieldKey}" = ${typedValue} for ${characterName}...`);
  await runComparison(simulatorRequest, directUserStat);
}

/** Which stat.* field + specEfficiency rate to try converting a Final Damage% target through.
 *  "atkPercent" (ATT%/MATT%, via eff.atkPereff1) was the first hypothesis tried -- consistently
 *  off by a similar absolute amount at both 5% and 0.5% FD (didn't shrink proportionally with
 *  a 10x smaller input), which rules out "just a linear-approximation drift" and suggests
 *  ATT%/MATT% isn't really fungible with Final Damage% at all, despite eff.atkPereff1 nominally
 *  being "FD-equivalent units". "bossDmg" (via eff.dmgeff1) got boss380Hexa/convertedPowerHexa
 *  EXACTLY right but boss300Hexa/dojoPower slightly off -- confirmed via live-read values off
 *  MapleScouter's own Additional Spec Simulation panel (see compareFinalDamageViaBossDmgRate)
 *  that this ISN'T a precision bug: Boss Damage% itself has a genuinely different FD-
 *  equivalent rate per boss bracket (0.909%/10% for Boss 300 vs 0.892%/10% for Boss 380, a
 *  stable ~1.8% gap at every scale tested), while typing Final Damage% DIRECTLY into their
 *  simulator produces near-identical Boss 300/380 readings (rounding noise only, e.g.
 *  4.999%/5.001% for a typed 5) -- meaning FD itself is bracket-independent, and Boss
 *  Damage% is a bad proxy for it precisely because Boss Damage% ISN'T bracket-independent.
 *  A single bossDmg mutation can only ever nail ONE bracket at a time as a result.
 *  "mainStatBase" (via eff.mainStateff1) was a follow-up idea: flat Main Stat sits at the
 *  START of the damage kernel (ATT scaling, weapon multiplier, mastery, crit, damage%, boss
 *  damage%, THEN final damage all layer on top of it per the wiki's own formula order) rather
 *  than at the end like Boss Damage% does, so there's no obvious reason it should inherit a
 *  boss-bracket-specific split the way a late-stage boss-vs-normal term does -- also came back
 *  off on every figure, worse than bossDmg's clean 2-of-4 exact match, so mainStatBase's own
 *  longer chain of formula stages (weapon multiplier, mastery, etc.) adds its own imprecision
 *  rather than avoiding boss damage's issue.
 *  "criticalDmg" (via eff.cridmgeff1) is the next candidate: Critical Damage applies AFTER
 *  DEF reduction on a crit hit (per the wiki), same late-stage timing as Final Damage, but
 *  unlike Boss Damage% has no boss-vs-normal-monster distinction to create a bracket split in
 *  the first place -- if Boss Damage%'s bracket-dependence really does come from interacting
 *  with each bracket's own DEF/PDR value (current working theory), Critical Damage should be
 *  bracket-independent the same way Final Damage itself is. */
const FD_EQUIVALENCE_TARGETS: Record<string, { effKey: "atkPereff1" | "dmgeff1" | "mainStateff1" | "cridmgeff1"; statField: "atkPercent" | "bossDmg" | "mainStatBase" | "criticalDmg" }> = {
  atkPercent: { effKey: "atkPereff1", statField: "atkPercent" },
  bossDmg: { effKey: "dmgeff1", statField: "bossDmg" },
  mainStatBase: { effKey: "mainStateff1", statField: "mainStatBase" },
  criticalDmg: { effKey: "cridmgeff1", statField: "criticalDmg" },
};

/** Dev-only drill for Final Damage%, which has NO /calc/dmg field of its own at all (unlike
 *  every other Input tab field, which at least has some stat or power candidate) -- tests an
 *  equivalence idea via the Stat Efficiency bookmark's per-unit rates (see
 *  FD_EQUIVALENCE_TARGETS above for which conversion each `target` tries and why). Converts a
 *  target FD% into `typedFdPercent / eff[effKey] / 100` units of the chosen stat field and
 *  adds that onto the real payload (each candidate field is already confirmed plain-additive
 *  on its own), then compares against typing the FD% into simulator.finalDmg directly.
 *
 *  Needs the character's LAST KNOWN real Scouter result already cached (peekScouterLastKnown)
 *  to read the efficiency rate from -- refresh the character's Scouter bookmark once first if
 *  this reports no cached result.
 *
 *  Usage: __mapledoroCompareFinalDamageEquivalence("yourign", 5, "bossDmg") */
async function compareFinalDamageEquivalence(characterName?: string, typedFdPercent?: number, target: string = "atkPercent"): Promise<void> {
  if (!characterName || typedFdPercent === undefined) {
    console.info(`[scouter input drill] usage: __mapledoroCompareFinalDamageEquivalence("yourign", 5, "bossDmg")`);
    console.info(`[scouter input drill] known targets: ${Object.keys(FD_EQUIVALENCE_TARGETS).join(", ")}`);
    return;
  }
  const conversion = FD_EQUIVALENCE_TARGETS[target];
  if (!conversion) {
    console.warn(`[scouter input drill] unknown target "${target}". Known targets: ${Object.keys(FD_EQUIVALENCE_TARGETS).join(", ")}`);
    return;
  }
  const resolved = resolveCharacter(characterName);
  if (!resolved) return;
  const { character, ctx } = resolved;

  const lastKnown = peekScouterLastKnown(character);
  const effRate = lastKnown?.specEfficiency?.[conversion.effKey];
  if (!effRate) {
    console.warn(`[scouter input drill] no cached specEfficiency for "${characterName}" -- refresh their Scouter bookmark once first.`);
    return;
  }

  const simulatorRequest = buildSimulatorPayload(character, ctx, {});
  const builtUserStat = buildScouterPayload(character, ctx);
  if (!simulatorRequest || !builtUserStat) {
    console.warn(`[scouter input drill] "${characterName}"'s class isn't supported by MapleScouter.`);
    return;
  }
  const directUserStat = structuredClone(builtUserStat);
  simulatorRequest.simulator.finalDmg = typedFdPercent.toFixed(5);
  const equivalentAmount = typedFdPercent / effRate / 100;
  directUserStat.stat[conversion.statField] = String(Number(directUserStat.stat[conversion.statField]) + equivalentAmount);

  console.info(`[scouter input drill] running Final Damage = ${typedFdPercent}% for ${characterName} via "${target}" (equivalent to +${equivalentAmount.toFixed(4)} ${conversion.statField}, ${conversion.effKey}=${effRate})...`);
  await runComparison(simulatorRequest, directUserStat);
}

/** SUPERSEDED by the Critical Damage% approach (see compareFinalDamageEquivalence's
 *  "criticalDmg" target and applyCritDmgAndFinalDmg in scouterApi.ts) -- kept only as a
 *  record of why Boss Damage% doesn't work as an FD proxy, not an active approach.
 *
 *  Final Damage% via Boss Damage%, using rates READ DIRECTLY off MapleScouter's own
 *  "Additional Spec Simulation" panel (their real simulator UI shows a separate FD% figure
 *  per boss bracket -- Boss 300 and Boss 380 -- for the same typed Boss Damage%) instead of
 *  a rate derived from specEfficiency or from nudging boss380Hexa ourselves. The earlier
 *  nudge-derived rate (deriveBossDmgRate, since removed) was ~4x off -- turned out to be a
 *  bug in that derivation (dividing by boss380Hexa's own compound value, which bakes in
 *  level/mastery/etc. unrelated to the Boss Damage->FD relationship, not a real diminishing-
 *  returns curve): live-read values at 10/20/50/100% Boss Damage on a real character came
 *  back PERFECTLY linear per bracket (ratios 1.998x/5.000x/9.998x for Boss 300,
 *  2.000x/5.004x/10.007x for Boss 380 -- rounding noise only, no curvature), with a stable
 *  ~1.8% gap between the two brackets' rates at every scale tested (0.909 vs 0.892 at 10%,
 *  same ratio at every other value). This confirmed Boss Damage%'s FD-equivalent rate is
 *  genuinely bracket-dependent (unlike Final Damage% itself, which reads near-identically
 *  across brackets when typed directly), so a single bossDmg mutation can only ever match
 *  ONE bracket exactly -- ruled out as a real proxy in favor of Critical Damage%, which
 *  turned out to be bracket-independent the same way Final Damage is.
 *  CHARACTER_BOSS_DMG_TO_FD_RATE below holds live-read rates (per 1% Boss Damage, i.e.
 *  reading / 10) keyed by a placeholder character key -- historical reference only.
 *
 *  Usage: __mapledoroCompareFinalDamageViaBossDmgRate("yourign", 0.5) */
const CHARACTER_BOSS_DMG_TO_FD_RATE: Record<string, number> = {
  examplecharacter: 0.892 / 10,
};

async function compareFinalDamageViaBossDmgRate(characterName?: string, typedFdPercent?: number): Promise<void> {
  if (!characterName || typedFdPercent === undefined) {
    console.info(`[scouter input drill] usage: __mapledoroCompareFinalDamageViaBossDmgRate("yourign", 0.5)`);
    console.info(`[scouter input drill] characters with a live-read rate: ${Object.keys(CHARACTER_BOSS_DMG_TO_FD_RATE).join(", ")}`);
    return;
  }
  const rate = CHARACTER_BOSS_DMG_TO_FD_RATE[characterName.trim().toLowerCase()];
  if (!rate) {
    console.warn(`[scouter input drill] no live-read Boss Damage->FD rate for "${characterName}" yet -- read it off MapleScouter's own Additional Spec Simulation panel (type any Boss Damage%, note the Boss 380 FD% shown, divide by 10) and add it to CHARACTER_BOSS_DMG_TO_FD_RATE.`);
    return;
  }
  const resolved = resolveCharacter(characterName);
  if (!resolved) return;
  const { character, ctx } = resolved;

  const simulatorRequest = buildSimulatorPayload(character, ctx, {});
  const builtUserStat = buildScouterPayload(character, ctx);
  if (!simulatorRequest || !builtUserStat) {
    console.warn(`[scouter input drill] "${characterName}"'s class isn't supported by MapleScouter.`);
    return;
  }
  const directUserStat = structuredClone(builtUserStat);
  simulatorRequest.simulator.finalDmg = typedFdPercent.toFixed(5);
  const equivalentBossDmg = typedFdPercent / rate;
  directUserStat.stat.bossDmg = String(Number(directUserStat.stat.bossDmg) + equivalentBossDmg);

  console.info(`[scouter input drill] running Final Damage = ${typedFdPercent}% for ${characterName} via live-read rate ${rate} (equivalent to +${equivalentBossDmg.toFixed(4)} bossDmg)...`);
  await runComparison(simulatorRequest, directUserStat);
}

function installScouterInputFieldDrill() {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return;
  const target = window as typeof window & {
    __mapledoroCompareScouterInputField?: typeof compareScouterInputField;
    __mapledoroCompareFinalDamageEquivalence?: typeof compareFinalDamageEquivalence;
    __mapledoroCompareFinalDamageViaBossDmgRate?: typeof compareFinalDamageViaBossDmgRate;
  };
  if (!target.__mapledoroCompareScouterInputField) target.__mapledoroCompareScouterInputField = compareScouterInputField;
  if (!target.__mapledoroCompareFinalDamageEquivalence) target.__mapledoroCompareFinalDamageEquivalence = compareFinalDamageEquivalence;
  if (!target.__mapledoroCompareFinalDamageViaBossDmgRate) target.__mapledoroCompareFinalDamageViaBossDmgRate = compareFinalDamageViaBossDmgRate;
}

installScouterInputFieldDrill();
