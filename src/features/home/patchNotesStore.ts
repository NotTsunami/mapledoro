// Patch notes external store — fetched once per page load (with a
// localStorage cache as fallback), consumed via useSyncExternalStore.

import { FALLBACK_PATCH_NOTES, type PatchNote } from "./patchNotesFallback";

const PATCH_CACHE_KEY = "mapledoro_patch_notes_v1";
const PATCH_CACHE_TTL_MS = 60 * 60 * 1000;

function readCachedPatchNotes(): PatchNote[] | null {
  try {
    const raw = localStorage.getItem(PATCH_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as { expiresAt: number; data: PatchNote[] };
    if (Date.now() < cached.expiresAt && Array.isArray(cached.data) && cached.data.length > 0) {
      return cached.data;
    }
  } catch { /* ignore */ }
  return null;
}

let patchNotesData: PatchNote[] = FALLBACK_PATCH_NOTES;
const patchListeners = new Set<() => void>();
let patchFetched = false;

export function subscribePatchNotes(listener: () => void) {
  patchListeners.add(listener);
  if (!patchFetched) {
    patchFetched = true;
    const cached = readCachedPatchNotes();
    fetch("/api/patch-notes")
      .then((res) => {
        // fetch resolves on 4xx/5xx, so an error payload would otherwise be
        // parsed as data; throwing routes it to the cached/fallback branch.
        if (!res.ok) throw new Error(`patch notes ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          patchNotesData = data as PatchNote[];
          try {
            localStorage.setItem(
              PATCH_CACHE_KEY,
              JSON.stringify({ expiresAt: Date.now() + PATCH_CACHE_TTL_MS, data }),
            );
          } catch { /* localStorage full or unavailable */ }
        } else if (cached) {
          patchNotesData = cached;
        }
        patchListeners.forEach((l) => l());
      })
      .catch(() => {
        if (cached) {
          patchNotesData = cached;
          patchListeners.forEach((l) => l());
        }
      });
  }
  return () => { patchListeners.delete(listener); };
}

export function getPatchNotesSnapshot() { return patchNotesData; }
