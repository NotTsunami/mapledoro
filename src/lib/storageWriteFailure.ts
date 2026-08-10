/*
  Tracks whether the last write to localStorage failed, per store.

  localStorage is the only copy of a player's data, so a failed write is silent
  data loss: the write throws, the app keeps rendering the in-memory state that
  never reached disk, and the player finds out on their next visit. The two
  realistic causes are a full storage quota (these payloads grow with roster size
  and with logged history) and storage being blocked outright (private mode, or a
  browser setting). Both look the same from here and have the same consequence,
  so they share one signal.

  Tracked per store rather than as one flag because the stores are very different
  sizes: a full quota can reject a ~1MB character store rewrite while a small
  Daily Tracker toggle still fits. One flag would let that toggle's success clear
  a warning about character data that is still unsaved.

  Writers report through this module and StorageWriteFailureBanner surfaces it.
*/

export type StorageWriteFailureSource = "characters" | "tools";

const failedSources = new Set<StorageWriteFailureSource>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Called by a store whose localStorage write threw. */
export function reportStorageWriteFailure(source: StorageWriteFailureSource) {
  if (failedSources.has(source)) return;
  failedSources.add(source);
  emit();
}

/** Called by a store whose localStorage write succeeded, so the warning clears
 *  once that store persists again. Only clears its own source. */
export function clearStorageWriteFailure(source: StorageWriteFailureSource) {
  if (!failedSources.delete(source)) return;
  emit();
}

/** Player dismissed the warning. Clears every source, so a later failure in any
 *  store shows it again. */
export function dismissStorageWriteFailures() {
  if (failedSources.size === 0) return;
  failedSources.clear();
  emit();
}

export function subscribeStorageWriteFailure(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getStorageWriteFailureSnapshot = () => failedSources.size > 0;
export const getStorageWriteFailureServerSnapshot = () => false;
