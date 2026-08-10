/*
  Tracks whether the last write to localStorage failed.

  localStorage is the only copy of a player's character data, so a failed write
  is silent data loss: the write throws, the app keeps rendering the in-memory
  state that never reached disk, and the player finds out on their next visit.
  The two realistic causes are a full storage quota (the character store grows
  with roster size) and storage being blocked outright (private mode, or a
  browser setting). Both look the same from here and have the same consequence,
  so they share one flag.

  Writers report through this module and StorageWriteFailureBanner surfaces it.
*/

let failed = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Called by a store whose localStorage write threw. */
export function reportStorageWriteFailure() {
  if (failed) return;
  failed = true;
  emit();
}

/** Called by a store whose localStorage write succeeded, so the warning clears
 *  once the player frees up space (or dismisses it). */
export function clearStorageWriteFailure() {
  if (!failed) return;
  failed = false;
  emit();
}

export function subscribeStorageWriteFailure(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getStorageWriteFailureSnapshot = () => failed;
export const getStorageWriteFailureServerSnapshot = () => false;
