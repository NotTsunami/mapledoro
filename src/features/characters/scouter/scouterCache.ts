/*
  Per-character, hash-keyed cache for MapleScouter results, see the architecture
  decision in project_maplescouter_api_re_2026_07_27 memory for why this can't be a
  shared server cache. Keyed by a hash of the built payload (not "most recent value"),
  so reverting a stat change back to its original value is a cache hit, not a refetch.

  Refresh flow: hash hit -> return instantly, zero network. Hash miss -> POST through
  the stateless proxy route. Success -> cache under that hash. Failure or a malformed
  response (missing fields, a suspicious zero) -> don't cache it, fall back to the last
  good result marked stale. No previous result at all -> neutral empty state, not an error.
*/

import type { StoredCharacterRecord } from "../model/charactersStore";
import { readCharactersStore } from "../model/charactersStore";
import { readCharacterToolData, writeCharacterToolData } from "../../tools/characterToolStorage";
import { buildScouterPayload, hashScouterPayload, type ScouterUserStat } from "./scouterApi";

const SCOUTER_RESULT_TOOL_KEY = "scouterResult";
const MAX_CACHE_ENTRIES = 8;

export interface ScouterResultEntry {
  computedAt: number;
  boss300Normal: number;
  boss300Hexa: number;
  boss380Normal: number;
  boss380Hexa: number;
  convertedPowerNormal: number;
  convertedPowerHexa: number;
}

interface ScouterCacheData {
  entries: Record<string, ScouterResultEntry>;
  lastHash: string;
}

/** Not yet detected server-side beyond these 4 buckets -- route.ts maps every upstream/
 *  proxy failure mode into one of these via a `code` field on its JSON error body. */
export type ScouterErrorReason = "rate_limited" | "timeout" | "bad_response" | "network";

export type ScouterRefreshResult =
  | { status: "ok"; entry: ScouterResultEntry; stale: false }
  // stale is only ever reached via a failed refresh (see staleFallback below), so the
  // reason it's stale is always known -- never a bare "stale: true" with no explanation.
  | { status: "ok"; entry: ScouterResultEntry; stale: true; reason: ScouterErrorReason }
  | { status: "unsupported" }
  | { status: "empty" }
  | { status: "error"; reason: ScouterErrorReason };

function readCache(characterName: string): ScouterCacheData | null {
  return readCharacterToolData<ScouterCacheData>(characterName, SCOUTER_RESULT_TOOL_KEY);
}

/** Stores a fresh result under its hash, evicting the oldest entry (by computedAt)
 *  past MAX_CACHE_ENTRIES so an actively-tweaked character doesn't grow unbounded. */
function storeCacheEntry(characterName: string, hash: string, entry: ScouterResultEntry, existing: ScouterCacheData | null): void {
  const entries = { ...(existing?.entries ?? {}), [hash]: entry };
  const hashes = Object.keys(entries);
  if (hashes.length > MAX_CACHE_ENTRIES) {
    const oldest = hashes.toSorted((a, b) => entries[a].computedAt - entries[b].computedAt)[0];
    delete entries[oldest];
  }
  writeCharacterToolData(characterName, SCOUTER_RESULT_TOOL_KEY, { entries, lastHash: hash } satisfies ScouterCacheData);
}

interface MapleScouterCalcResponse {
  calculatedData?: {
    boss300_stat?: number;
    boss380_stat?: number;
    boss300_hexaStat?: number;
    boss380_hexaStat?: number;
    exchangePower?: number;
    exchangePowerHexa?: number;
  };
}

/** A 0 for the headline figure is MapleScouter's own known failure signature (e.g. the
 *  Ephenia Soul "C" tier bug), treat it the same as a network failure, not a real result. */
function parseCalcResponse(data: MapleScouterCalcResponse): ScouterResultEntry | null {
  const c = data.calculatedData;
  if (!c) return null;
  const { boss300_stat, boss380_stat, boss300_hexaStat, boss380_hexaStat, exchangePower, exchangePowerHexa } = c;
  if (
    typeof boss300_stat !== "number" || typeof boss380_stat !== "number" ||
    typeof boss300_hexaStat !== "number" || typeof boss380_hexaStat !== "number" ||
    typeof exchangePower !== "number" || typeof exchangePowerHexa !== "number"
  ) return null;
  if (boss380_hexaStat <= 0) return null;
  return {
    computedAt: Date.now(),
    boss300Normal: boss300_stat,
    boss300Hexa: boss300_hexaStat,
    boss380Normal: boss380_stat,
    boss380Hexa: boss380_hexaStat,
    convertedPowerNormal: exchangePower,
    convertedPowerHexa: exchangePowerHexa,
  };
}

type ScouterFetchResult =
  | { ok: true; entry: ScouterResultEntry }
  | { ok: false; reason: ScouterErrorReason };

const ERROR_CODE_TO_REASON: Record<string, ScouterErrorReason> = {
  RATE_LIMITED: "rate_limited",
  TIMEOUT: "timeout",
  BAD_RESPONSE: "bad_response",
  NETWORK: "network",
};

/** Never throws -- every failure mode (couldn't even reach our own proxy, the proxy
 *  rejected the request, or the response didn't parse into real numbers) resolves to a
 *  tagged reason instead, so refreshScouterResult never needs its own try/catch. */
async function fetchScouterResult(payload: ScouterUserStat): Promise<ScouterFetchResult> {
  let response: Response;
  try {
    response = await fetch("/api/scouter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userStat: payload }),
    });
  } catch {
    return { ok: false, reason: "network" };
  }
  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { code?: string } | null;
    const reason = errorBody?.code ? ERROR_CODE_TO_REASON[errorBody.code] : undefined;
    return { ok: false, reason: reason ?? "bad_response" };
  }
  const data = (await response.json().catch(() => null)) as MapleScouterCalcResponse | null;
  if (!data) return { ok: false, reason: "bad_response" };
  const entry = parseCalcResponse(data);
  return entry ? { ok: true, entry } : { ok: false, reason: "bad_response" };
}

/** The last good value to fall back on after a failed refresh, or null if there's never
 *  been one -- refreshScouterResult reports "error" (with a reason) in that null case,
 *  rather than the misleading "empty" (== never even tried) it used to collapse into.
 *  Carries the reason the fresh fetch failed, so the UI can say *why* it's stale. */
function staleFallback(
  cache: ScouterCacheData | null,
  reason: ScouterErrorReason,
): { status: "ok"; entry: ScouterResultEntry; stale: true; reason: ScouterErrorReason } | null {
  const lastEntry = cache ? cache.entries[cache.lastHash] : undefined;
  return lastEntry ? { status: "ok", entry: lastEntry, stale: true, reason } : null;
}

function buildPayloadAndHash(character: StoredCharacterRecord): { payload: ScouterUserStat; hash: string } | null {
  const store = readCharactersStore();
  const payload = buildScouterPayload(character, {
    linkSkillsByWorld: store.linkSkillsByWorld,
    scouterLegionByWorld: store.scouterLegionByWorld,
  });
  if (!payload) return null;
  return { payload, hash: hashScouterPayload(payload) };
}

/** Reads the cached result for the character's CURRENT input state, with no network
 *  call, safe to run on mount even though the Scouter figure is otherwise manual-refresh
 *  only, since a cache hit costs nothing. Returns null if nothing matches yet (new
 *  character, or inputs changed since the last real fetch) rather than falling back to
 *  a stale entry, that fallback is only for a failed refresh attempt, not a cold read. */
export function peekScouterCache(character: StoredCharacterRecord): ScouterResultEntry | null {
  const built = buildPayloadAndHash(character);
  if (!built) return null;
  const cache = readCache(character.characterName);
  return cache?.entries[built.hash] ?? null;
}

/** Refreshes a character's Scouter figure. Builds the payload fresh each call (so it
 *  always reflects current stored data), hashes it, and either returns a cache hit
 *  instantly or fetches through the proxy route. */
export async function refreshScouterResult(character: StoredCharacterRecord): Promise<ScouterRefreshResult> {
  const built = buildPayloadAndHash(character);
  if (!built) return { status: "unsupported" };
  const { payload, hash } = built;

  const cache = readCache(character.characterName);
  const cached = cache?.entries[hash];
  if (cached) return { status: "ok", entry: cached, stale: false };

  const fetched = await fetchScouterResult(payload);
  if (!fetched.ok) {
    return staleFallback(cache, fetched.reason) ?? { status: "error", reason: fetched.reason };
  }

  storeCacheEntry(character.characterName, hash, fetched.entry, cache);
  return { status: "ok", entry: fetched.entry, stale: false };
}

// Session-only guard against an auto-refresh silently retrying on every remount (e.g.
// bouncing between bookmarks) after a failed automatic attempt -- once tried and failed
// for a given hash, only a manual refresh click tries again this session. Not persisted:
// a page reload resetting this is fine (a fresh reload asking for one more automatic try
// isn't "spam"), and it keeps the scouter cache's stored shape untouched for something
// that doesn't need to survive a reload. The real backstop against deliberate abuse is
// the per-IP rate limit on the proxy route itself (Yuki, 2026-07-27).
const autoAttemptedThisSession = new Set<string>();

function autoAttemptKey(characterName: string, hash: string): string {
  return `${characterName.trim().toLowerCase()}:${hash}`;
}

/** Auto-refresh trigger for useScouterResult's "empty -> silently try once" effect.
 *  Covers both of Yuki's cases with one rule: a brand-new character finishing setup and
 *  an existing character after a real edit both land on a hash `peekScouterCache` has
 *  never seen, i.e. status "empty" -- a no-op re-save doesn't, since it reproduces a hash
 *  that's either already cached or already attempted. Returns null with no network call
 *  for every case that isn't a genuine, first-time-this-session "empty": unsupported,
 *  already has a result, or already tried and failed this session. */
export async function autoRefreshScouterResultIfNeeded(character: StoredCharacterRecord): Promise<ScouterRefreshResult | null> {
  const built = buildPayloadAndHash(character);
  if (!built) return null;
  const cache = readCache(character.characterName);
  if (cache?.entries[built.hash]) return null;
  const key = autoAttemptKey(character.characterName, built.hash);
  if (autoAttemptedThisSession.has(key)) return null;
  autoAttemptedThisSession.add(key);
  return refreshScouterResult(character);
}
