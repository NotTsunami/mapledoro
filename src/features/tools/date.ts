/** UTC calendar date as `YYYY-MM-DD`. */
export function utcDateStr(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Local calendar date as `YYYY-MM-DD`. */
export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * A `YYYY-MM-DD` string as a long display date ("March 7, 2026"). Read as UTC,
 * so a stored calendar date never shifts a day for a viewer behind GMT. Pinned
 * to en-US, matching the projection dates the liberation trackers have always
 * shown.
 */
export function formatLongDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/** A date or timestamp as a short display date ("Mar 7, 2026"). */
export function formatShortDate(value: Date | number): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
