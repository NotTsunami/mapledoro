"use client";

import type { CSSProperties, ReactNode } from "react";
import HoverTooltip from "../../components/HoverTooltip";
import Panel from "../../components/Panel";
import { STATUS, statusText } from "../../components/statusColors";
import type { AppTheme } from "../../components/themes";
import { formatCountdown, formatCountdownDays, getNextReset } from "../../lib/time";
import { useClock } from "../../lib/useClock";
import { getUrsusStatus } from "../../lib/ursus";

const PLACEHOLDER_COUNTDOWN = "--:--:--";
const WEEKLY_RESET_DAY = 4; // Thursday, UTC
const EVENT_RESET_DAY = 3; // Wednesday, UTC

interface EventReset {
  name: string;
  /** UTC day (0 = Sunday) this event's weeklies roll over on. */
  day: number;
  /** Exclusive: the UTC midnight the event's stated last day rolls into. */
  endsAt: number;
}

/** v270's event lineup, from the "Ride the Lightning" patch notes. Each entry's
 *  reset day and end date are the ones the notes state for that event, and the
 *  panel drops an event the moment it ends: the Event Reset row disappears once
 *  every event on it is over, and the weekly row's list shrinks the same way. So
 *  the next patch needs this list replaced, not pruned.
 *
 *  Nexon writes the ends as "11:59 PM UTC"; each is stored as the following
 *  midnight, which is also the reset the event's final week ends on. */
const EVENT_RESETS: EventReset[] = [
  // The notes only say "the weekly reset at 12:00 AM UTC" for this one, never a day;
  // Wednesday is the observed rollover, matching the rest of the v270 lineup.
  { name: "Ride or Die", day: EVENT_RESET_DAY, endsAt: Date.UTC(2026, 8, 2) }, // Sep 1
  { name: "Operation: Dive", day: EVENT_RESET_DAY, endsAt: Date.UTC(2026, 8, 9) }, // Sep 8
  { name: "Tallahart Fantasia", day: EVENT_RESET_DAY, endsAt: Date.UTC(2026, 8, 9) }, // Sep 8
  { name: "Momentum Pass", day: EVENT_RESET_DAY, endsAt: Date.UTC(2026, 8, 9) }, // Sep 8
  { name: "Frontier Pass", day: EVENT_RESET_DAY, endsAt: Date.UTC(2026, 8, 9) }, // Sep 8
  // The v270 notes still print this one's original "Thursday at 12:00 PM UTC", but the
  // v269 notes (same event, one continuous run) carry Nexon's 6/23 correction of that
  // exact line to Wednesday at 12:00 AM UTC.
  { name: "Phantasmal Echoes", day: EVENT_RESET_DAY, endsAt: Date.UTC(2026, 8, 9) }, // Sep 8
  { name: "Challenger Pass", day: WEEKLY_RESET_DAY, endsAt: Date.UTC(2026, 8, 9) }, // Sep 8
  { name: "Item Burning Plus challenges", day: WEEKLY_RESET_DAY, endsAt: Date.UTC(2026, 10, 11) }, // Nov 10
];

/** Events still running on `nowMs`. A null clock (SSR, pre-mount) passes 0 and gets
 *  the whole lineup, so the server renders every row the client can and the row set
 *  only ever shrinks after mount. */
function liveEventNames(day: number, nowMs: number): string[] {
  return EVENT_RESETS.filter((e) => e.day === day && nowMs < e.endsAt).map((e) => e.name);
}

type RowKey = "daily" | "weekly" | "events" | "ursus";

/** The time-dependent half of a row, blank until the clock mounts. */
interface RowValues {
  schedule: string;
  countdown: string;
  active?: boolean;
}

interface TimerRow extends RowValues {
  key: RowKey;
  label: string;
  tooltip: ReactNode;
}

const IDLE_VALUES: RowValues = { schedule: "", countdown: PLACEHOLDER_COUNTDOWN };

// The bubble centers short one-line labels (see .hover-tip-bubble), which turns a
// list into a ragged block -- these override to left-aligned.
const tooltipStyle: CSSProperties = { textAlign: "left", maxWidth: 200 };
const tooltipHeadStyle: CSSProperties = { fontWeight: 800, marginBottom: 4 };

function TooltipBody({ utc, summary, events }: { utc: string; summary: string; events?: string[] }) {
  return (
    <div style={tooltipStyle}>
      <div style={tooltipHeadStyle}>{utc}</div>
      <div>{summary}</div>
      {events?.map((name) => (
        <div key={name} style={{ marginTop: 2 }}>• {name}</div>
      ))}
    </div>
  );
}

const DAILY_TOOLTIP = (
  <TooltipBody
    utc="Midnight UTC, every day"
    summary="Daily boss entries, daily quests, Monster Park, Maple Tour, and daily event missions."
  />
);

const URSUS_TOOLTIP = (
  <TooltipBody
    utc="1:00 – 5:00 and 18:00 – 22:00 UTC"
    summary="Ursus pays double meso during these two windows every day."
  />
);

/** Every formatter below is unreachable during SSR: `now` is null until useClock()
 *  ticks post-mount, and buildRows() returns the placeholder rows until then. */
function localTime(d: Date) {
  // react-doctor-disable-next-line no-locale-format-in-render -- post-mount `now` gate, see above
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function localDayTime(d: Date) {
  // react-doctor-disable-next-line no-locale-format-in-render -- post-mount `now` gate, see above
  return d.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
}

function liveValues(now: Date): Record<RowKey, RowValues> {
  const nowMs = now.getTime();
  const daily = getNextReset(now, 0);
  const weekly = getNextReset(now, 0, WEEKLY_RESET_DAY);
  const events = getNextReset(now, 0, EVENT_RESET_DAY);
  const ursus = getUrsusStatus(now);
  // The window boundary the countdown is running toward, so the schedule line names
  // the same moment the number does.
  const ursusEdge = new Date(nowMs + (ursus.active ? ursus.remaining : ursus.until));

  return {
    daily: {
      schedule: `${localTime(daily)} daily`,
      countdown: formatCountdown(daily.getTime() - nowMs),
    },
    weekly: {
      schedule: localDayTime(weekly),
      countdown: formatCountdownDays(weekly.getTime() - nowMs),
    },
    events: {
      schedule: localDayTime(events),
      countdown: formatCountdownDays(events.getTime() - nowMs),
    },
    ursus: {
      schedule: `${ursus.active ? "Until" : "Next"} ${localTime(ursusEdge)}`,
      countdown: formatCountdown(ursus.active ? ursus.remaining : ursus.until),
      active: ursus.active,
    },
  };
}

function buildRows(now: Date | null): TimerRow[] {
  const nowMs = now ? now.getTime() : 0;
  const values = now ? liveValues(now) : null;
  const valuesFor = (key: RowKey) => values?.[key] ?? IDLE_VALUES;
  const weeklyEvents = liveEventNames(WEEKLY_RESET_DAY, nowMs);
  const eventDayEvents = liveEventNames(EVENT_RESET_DAY, nowMs);

  return [
    { key: "daily", label: "Daily Reset", tooltip: DAILY_TOOLTIP, ...valuesFor("daily") },
    {
      key: "weekly",
      label: "Weekly Reset",
      tooltip: (
        <TooltipBody
          utc="Thursday, midnight UTC"
          summary={
            weeklyEvents.length > 0
              ? "Weekly boss entries and weekly quests, plus these event resets:"
              : "Weekly boss entries and weekly quests."
          }
          events={weeklyEvents}
        />
      ),
      ...valuesFor("weekly"),
    },
    // Dropped entirely once the last event on it ends, rather than counting down to
    // a reset with nothing left to reset.
    ...(eventDayEvents.length > 0
      ? [{
          key: "events" as const,
          // The asterisk points at the tooltip: which events these are is the whole
          // content of the row, and only the tooltip can carry the list.
          label: "Event Reset*",
          tooltip: (
            <TooltipBody
              utc="Wednesday, midnight UTC"
              summary="v270 events that reset off their own day:"
              events={eventDayEvents}
            />
          ),
          ...valuesFor("events"),
        }]
      : []),
    { key: "ursus", label: "Ursus 2× Meso", tooltip: URSUS_TOOLTIP, ...valuesFor("ursus") },
  ];
}

const activeBadgeStyle: CSSProperties = {
  color: STATUS.success.on,
  background: STATUS.success.fill,
  letterSpacing: "0.05em",
};

const rowTextStyle: CSSProperties = { minWidth: 0, flex: 1 };
const rowValueStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: 4,
};
const scheduleStyle: CSSProperties = { fontSize: "0.75rem", fontWeight: 700 };

function timerRowStyle(theme: AppTheme): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: "0.6rem",
    background: theme.timerBg,
    borderRadius: "14px",
    padding: "0.7rem 0.85rem",
    border: `1px solid ${theme.border}`,
  };
}

function TimerRowCard({ theme, row }: { theme: AppTheme; row: TimerRow }) {
  return (
    <div className="timer-row" style={timerRowStyle(theme)}>
      <div style={rowTextStyle}>
        {/* Ink on the name, muted on the schedule: three steps of hierarchy across the
            row (what resets, when it resets locally, how long that is). */}
        <div className="section-label" style={{ color: theme.text, marginBottom: row.schedule ? 4 : 0 }}>
          {row.label}
        </div>
        {row.schedule && <div style={{ ...scheduleStyle, color: theme.muted }}>{row.schedule}</div>}
      </div>
      <div style={rowValueStyle}>
        {row.active && <span className="tool-badge" style={activeBadgeStyle}>ACTIVE</span>}
        <div
          className="timer-countdown"
          style={{ color: row.active ? statusText(theme, "success") : theme.accentText }}
        >
          {row.countdown}
        </div>
      </div>
    </div>
  );
}

const tooltipWrapStyle: CSSProperties = { display: "block" };

/** Daily / weekly / event / Ursus countdowns in one panel. Owns its own clock so a
 *  per-second tick re-renders these rows alone, not the whole dashboard. */
export default function ResetTimersPanel({ theme }: { theme: AppTheme }) {
  const now = useClock();
  const rows = buildRows(now);

  return (
    <Panel theme={theme} icon="⏱" title="Timers">
      <div className="timer-rows">
        {rows.map((row) => (
          <HoverTooltip key={row.key} theme={theme} label={row.tooltip} style={tooltipWrapStyle}>
            <TimerRowCard theme={theme} row={row} />
          </HoverTooltip>
        ))}
      </div>
    </Panel>
  );
}
