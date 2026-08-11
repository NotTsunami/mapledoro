/*
  Sole owner of the `mapledoro_games_v1` localStorage key.

  Every game keeps its results in its own section of this one key (`skillGuesser`,
  `bgmGuesser`). Each game module used to read and write the whole key itself,
  which is how two games sharing it ended up destroying each other's history: a
  module that didn't recognize the other's section rebuilt the object from the
  keys it knew about, and the write persisted that. Sections now go through
  readGameSection/writeGameSection, which always carry every other section across
  untouched -- a game module can no longer see, let alone drop, a section it does
  not own.

  Mirrors globalToolsStore's shape and versioning.
*/

import {
  clearStorageWriteFailure,
  reportStorageWriteFailure,
} from "../../lib/storageWriteFailure";

const STORAGE_KEY = "mapledoro_games_v1";

/** Whole-key schema version. Sections migrate together with it, see migrateV1. */
const VERSION = 2;

interface GamesStore {
  version: typeof VERSION;
  [section: string]: unknown;
}

/* Parsed-store cache, keyed on the raw string it was parsed from. Same design as
 * globalToolsStore and charactersStore: a read compares the raw string instead of
 * reparsing, a write seeds the cache with the serialization it already paid for,
 * and a write that bypasses this module (Settings' hard reset, devtools, another
 * tab) self-heals on the next read. Never populated during SSR, so it can't leak
 * between requests on the server.
 *
 * Callers share one object, which holds because nothing mutates a read result
 * without persisting it: writeGameSection is the sole mutator and writes on the
 * next line, and the game modules rebuild their section rather than mutating it. */
let cachedRaw: string | null = null;
let cachedStore: GamesStore | null = null;

function emptyStore(): GamesStore {
  return { version: VERSION };
}

/* v1 -> v2. v1 was `{ version: 1, skillGuesser: { results: Record<string,
   SkillGuesserResult>, hardMode?: boolean } }`: one result per puzzle, scored
   against the class, plus a global hard-mode toggle. v2 splits each puzzle into
   `{ normal?, hard? }`, so an old result folds into `normal` and the toggle goes.

   This lives here rather than in skill-guesser/storage.ts because `version`
   describes the whole key, not one section. Bumping it without reshaping that
   section in the same step would leave Mapledle reading v1-shaped results as v2
   ones, where every puzzle silently reads as never played. Sections other than
   skillGuesser are carried across untouched. */
function migrateV1(parsed: Record<string, unknown>): GamesStore {
  const section = parsed.skillGuesser as { results?: Record<string, unknown> } | undefined;
  const results: Record<string, unknown> = {};
  for (const [puzzle, result] of Object.entries(section?.results ?? {})) {
    results[puzzle] = { normal: result };
  }
  return { ...parsed, version: VERSION, skillGuesser: { results } };
}

function readStore(): GamesStore {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    if (cachedStore && raw === cachedRaw) return cachedStore;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      let store: GamesStore | null = null;
      if (record.version === VERSION) store = record as GamesStore;
      else if (record.version === 1) store = migrateV1(record);
      if (store) {
        cachedRaw = raw;
        cachedStore = store;
        return store;
      }
    }
  } catch { /* fall through to an empty store */ }
  return emptyStore();
}

function writeStore(store: GamesStore): void {
  if (typeof window === "undefined") return;
  try {
    const raw = JSON.stringify(store);
    window.localStorage.setItem(STORAGE_KEY, raw);
    // Seed the cache with what was just persisted: the serialization is already
    // paid for here, so the read that follows a write is a hit.
    cachedRaw = raw;
    cachedStore = store;
    clearStorageWriteFailure("games");
  } catch {
    // Same reasoning as the other stores: this is the only copy of the player's
    // game results, so swallowing the failure loses the guess that triggered it.
    // Drop the cache rather than seeding it, since `store` holds a change that
    // never reached disk.
    cachedRaw = null;
    cachedStore = null;
    reportStorageWriteFailure("games");
  }
}

/** Reads one game's section. Never sees the other games' sections. */
export function readGameSection<T>(section: string): T | null {
  const data = readStore()[section];
  return data != null ? (data as T) : null;
}

/** Replaces one game's section, preserving every other section as-is. */
export function writeGameSection(section: string, data: unknown): void {
  const store = readStore();
  // Mutates the shared cached object, which is sound only because writeStore
  // persists it in the same tick (see the cache note above).
  store[section] = data;
  writeStore(store);
}
