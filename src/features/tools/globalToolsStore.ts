import {
  clearStorageWriteFailure,
  reportStorageWriteFailure,
} from "../../lib/storageWriteFailure";

const STORAGE_KEY = "mapledoro_tools_v1";

interface GlobalToolsStore {
  version: 1;
  [key: string]: unknown;
}

/* Parsed-store cache, keyed on the raw string it was parsed from. Same design as
 * charactersStore.ts, for the same reason: readGlobalTool parses this whole
 * payload once per key, so Trace Restoration's two keys cost two full parses, and
 * Boss Crystals re-reads on a 60s interval while open.
 *
 * Keying on the string rather than invalidating explicitly means a write that
 * bypasses writeStore (Settings' hard reset, devtools, another tab) self-heals on
 * the next read. Never populated during SSR, so this module-level state can't
 * leak between requests on the server.
 *
 * Every caller shares one object, which is only safe because nothing mutates a
 * read result without persisting it: writeGlobalTool is the sole mutator and
 * writes on the next line, and the tools rebuild rather than mutate the blob
 * readGlobalTool hands back. Keep it that way. */
let cachedRaw: string | null = null;
let cachedStore: GlobalToolsStore | null = null;

function readStore(): GlobalToolsStore {
  if (typeof window === "undefined") return { version: 1 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1 };
    if (cachedStore && raw === cachedRaw) return cachedStore;
    const parsed = JSON.parse(raw);
    if (parsed?.version === 1) {
      cachedRaw = raw;
      cachedStore = parsed as GlobalToolsStore;
      return cachedStore;
    }
  } catch { /* ignore */ }
  return { version: 1 };
}

function writeStore(store: GlobalToolsStore): void {
  if (typeof window === "undefined") return;
  try {
    const raw = JSON.stringify(store);
    localStorage.setItem(STORAGE_KEY, raw);
    // Seed the cache with what was just persisted: the serialization is already
    // paid for here, so the read that follows a write is a hit.
    cachedRaw = raw;
    cachedStore = store;
    clearStorageWriteFailure("tools");
  } catch {
    // Same reasoning as writeCharactersStore: this is the only copy of the
    // player's Daily Tracker, Event Planner, Boss Crystals, Drop Tracker, and
    // Trace Restoration data, so swallowing the failure loses the change that
    // triggered it. Drop the cache rather than seeding it -- `store` holds a
    // change that never reached disk.
    cachedRaw = null;
    cachedStore = null;
    reportStorageWriteFailure("tools");
  }
}

export function readGlobalTool<T>(key: string): T | null {
  const store = readStore();
  const data = store[key];
  return data != null ? (data as T) : null;
}

export function writeGlobalTool(key: string, data: unknown): void {
  const store = readStore();
  // Mutates the shared cached object, which is sound only because writeStore
  // persists it in the same tick (see the cache note above).
  store[key] = data;
  writeStore(store);
}
