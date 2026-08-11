import { useSyncExternalStore } from "react";

let clockMs = 0;
const listeners = new Set<() => void>();
let interval: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!interval) {
    clockMs = Date.now();
    interval = setInterval(() => {
      clockMs = Date.now();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && interval) {
      clearInterval(interval);
      interval = null;
    }
  };
}

function getSnapshot() { return clockMs; }
function getServerSnapshot() { return 0; }
function getMinuteSnapshot() { return Math.floor(clockMs / 60000); }

export function useClock(): Date | null {
  const ms = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return ms ? new Date(ms) : null;
}

/** Same clock, truncated to the minute: the snapshot only changes once a minute, so
 *  React bails out of the other 59 ticks instead of re-rendering the subscriber for a
 *  value it doesn't display. For panels that show dates and windows rather than a
 *  running countdown, which in exchange notice a boundary up to a minute late. */
export function useMinuteClock(): Date | null {
  const minutes = useSyncExternalStore(subscribe, getMinuteSnapshot, getServerSnapshot);
  return minutes ? new Date(minutes * 60000) : null;
}
