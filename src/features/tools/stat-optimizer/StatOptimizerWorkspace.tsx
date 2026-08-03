"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { ToolHeader } from "../../../components/ToolHeader";
import { CharacterSyncPanel } from "../../../components/CharacterSyncPanel";
import { HexaSkillIcon } from "../../../components/ResourceImage";
import { SegmentedToggle } from "../../../components/SegmentedToggle";
import { STATUS, statusText } from "../../../components/statusColors";
import type { AppTheme } from "../../../components/themes";
import { ToolNumberInput } from "../shared-ui";
import { toolStyles, type ToolStyles } from "../tool-styles";
import { replaceZeroOnDigit } from "../numberInputHandlers";
import {
  getMainStatLabel,
  getAttackLabel,
  getHexaStatBonus,
  HEXA_STAT_OPTIONS,
  type HexaStatType,
} from "../../characters/setup/data/hexaStatData";
import type { ClassDamageProfile, MainStatId, OptimizerStatInputs, TripleStat } from "./damage-formula";
import { HYPER_LINES, HYPER_MAX_LEVEL, type HyperLineId } from "./hyper-stat-data";
import type { HyperResult, HyperAllocation } from "./hyper-stat-engine";
import { HEXA_CORE_TOTAL, HEXA_MAX_LINE_LEVEL, type HexaCore, type HexaLine, type HexaResult } from "./hexa-stat-engine";
import type { CalibrationNotice } from "./stat-optimizer-character";
import {
  useStatOptimizer,
  type CoreLineKey,
  type OptimizerMode,
  type ScalarInputKey,
  type TripleInputKey,
  type TriplePart,
} from "./useStatOptimizer";

const CORE_LABELS = ["Core I", "Core II", "Core III"];
// HEXA Stat node icons (hexa-skill manifest ids), same art the character setup flow uses.
const HEXA_NODE_ICON_IDS = ["50000000", "50000001", "50000002"];
const HEXA_LINE_LABELS: Record<CoreLineKey, string> = { primary: "Primary", alt0: "Additional 1", alt1: "Additional 2" };

const STAT_NAME: Record<MainStatId, string> = { str: "STR", dex: "DEX", int: "INT", luk: "LUK", hp: "Max HP" };

/** Names a stat's role, and which stat fills it once a class is known. Standalone
 *  entry has no class, so the blank seed's STR/DEX are placeholders the kernel
 *  never reads as themselves; printing them would answer a question the tool has
 *  not been told, and send a mage looking for an INT field that doesn't exist. */
function statLabel(role: string, id: MainStatId | null, standalone: boolean): string {
  return standalone || !id ? role : `${role} (${STAT_NAME[id]})`;
}

const SCALAR_FIELDS: { key: ScalarInputKey; label: string }[] = [
  { key: "damagePct", label: "Damage %" },
  { key: "bossDamagePct", label: "Boss Damage %" },
  { key: "critRatePct", label: "Critical Rate %" },
  { key: "critDamagePct", label: "Critical Damage %" },
  { key: "ignoreDefPct", label: "Ignore Enemy DEF %" },
];

function hexaTypeLabel(type: HexaStatType | "", profile: ClassDamageProfile, standalone: boolean): string {
  // Withholding the placeholder primary stat drops getMainStatLabel onto its own
  // generic "Main Stat", matching the stat fields above for the same reason.
  const primary = standalone ? "" : profile.mainStat;
  if (type === "mainStat") return getMainStatLabel(profile.classId ?? "", primary);
  if (type === "attackPower") return getAttackLabel(primary);
  if (type === "criticalDamage") return "Critical Damage";
  if (type === "bossDamage") return "Boss Damage";
  if (type === "ignoreDefense") return "Ignore DEF";
  if (type === "damage") return "Damage";
  return "Select…";
}

const gridTwo: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.85rem" };
// The three cores share one row, then collapse straight to a single column on
// narrow screens (skipping a lopsided 2 + 1 layout). See CORE_GRID_CSS below.
const CORE_GRID_CSS = `
  .stat-opt-core-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; }
  @media (max-width: 760px) { .stat-opt-core-grid { grid-template-columns: 1fr; } }
`;
// Compact segmented options for the Boss PDR picker. Both class names are on the
// element, so the selector is doubled up to win on specificity rather than on
// the order this <style> happens to land in relative to globals.css.
const PDR_PICKER_CSS = `
  .segmented-toggle-option.stat-opt-pdr-option { flex: 0 0 auto; padding: 0 14px; font-size: 0.82rem; }
`;
// Pre-mount panel heights (see LoadingPlaceholder). The 860px breakpoint is the
// one `.page-content` drops its padding at, which is also where the character
// row wraps and the stat grid collapses to a single column.
const SKELETON_CSS = `
  .stat-opt-skeleton-chars { height: 88px; }
  .stat-opt-skeleton-stats { height: 482px; }
  .stat-opt-skeleton-mode { height: 628px; }
  @media (max-width: 860px) {
    .stat-opt-skeleton-chars { height: 146px; }
    .stat-opt-skeleton-stats { height: 895px; }
    .stat-opt-skeleton-mode { height: 717px; }
  }
`;

// ── Small shared pieces ───────────────────────────────────────────────────────

function PanelTitle({ theme, title, subtitle, aside }: { theme: AppTheme; title: string; subtitle?: string; aside?: ReactNode }) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.75rem", flexWrap: "wrap" }}>
        {/* fontWeight pinned so the heading keeps the weight the <div> version inherited */}
        <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "1.1rem", fontWeight: 400, color: theme.text, margin: 0 }}>{title}</h2>
        {aside}
      </div>
      {subtitle && (
        <div style={{ fontSize: "0.8rem", color: theme.muted, fontWeight: 600, marginTop: "0.3rem", lineHeight: 1.4 }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

/* Sized to hold the 2rem gain figure's line box, so filling in the first stat
   swaps the placeholder for the verdict without nudging the panel below it.
   Shorter states center in that space rather than sitting at its top. */
const GAIN_BANNER_ROW: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  alignContent: "center",
  gap: "0.5rem",
  marginBottom: "1rem",
  minHeight: "2.4rem",
  flexWrap: "wrap",
};

/** Stands in for the gain figure whenever the panel has nothing to compute one
 *  from. Both engines report 0% in those states, which would otherwise read as a
 *  verdict ("no gain available") rather than as missing input. */
interface GainPending {
  title: string;
  detail: string;
}

const NO_STATS_PENDING: GainPending = {
  title: "No stats yet",
  detail: "fill in your stats above to get a recommendation",
};

/** A zero budget means no level is set, not that the allocation can't improve. */
function hyperPending(hasStats: boolean, pointsAvailable: number): GainPending | null {
  if (!hasStats) return NO_STATS_PENDING;
  if (pointsAvailable <= 0) {
    return { title: "No points to spend", detail: "set your level above to get a recommendation" };
  }
  return null;
}

/** With no unlocked core carrying levels there are no lines to re-assign, so the
 *  engine's 0% gain means "nothing entered", not "already optimal". */
function hexaPending(hasStats: boolean, tracked: boolean): GainPending | null {
  if (!hasStats) return NO_STATS_PENDING;
  if (!tracked) {
    return { title: "No HEXA lines yet", detail: "unlock a core and enter its levels to get a recommendation" };
  }
  return null;
}

function GainBanner({
  theme,
  gainPct,
  label,
  alreadyOptimal,
  pending,
}: {
  theme: AppTheme;
  gainPct: number;
  label: string;
  alreadyOptimal: boolean;
  /** Non-null replaces the figure entirely; see GainPending. */
  pending: GainPending | null;
}) {
  if (pending) {
    return (
      <div style={GAIN_BANNER_ROW}>
        <span style={{ fontSize: "1.2rem", fontWeight: 800, color: theme.muted }}>{pending.title}</span>
        <span style={{ fontSize: "0.85rem", fontWeight: 700, color: theme.muted }}>{pending.detail}</span>
      </div>
    );
  }
  return (
    <div style={GAIN_BANNER_ROW}>
      {alreadyOptimal ? (
        <span style={{ fontSize: "1.5rem", fontWeight: 800, color: theme.accentText }}>Already optimized</span>
      ) : (
        // Always signed "+": both engines revert to the current allocation and
        // report 0 rather than ever handing back a loss.
        <span style={{ fontSize: "2rem", fontWeight: 800, color: theme.accentText }}>
          +{gainPct.toFixed(2)}%
        </span>
      )}
      <span style={{ fontSize: "0.85rem", fontWeight: 700, color: theme.muted }}>
        {alreadyOptimal ? "no better allocation found" : label}
      </span>
    </div>
  );
}

/** A caveat that changes how much the recommendation can be trusted, so it reads
 *  as a warning rather than as the quietest text on the panel. Background stays
 *  `timerBg`: the notes carry links whose `accentText` is contrast-tuned against
 *  the theme's own surfaces, not against a tinted one. */
function WarnNote({ theme, children }: { theme: AppTheme; children: ReactNode }) {
  return (
    <div style={{ fontSize: "0.78rem", color: statusText(theme, "warning"), fontWeight: 600, lineHeight: 1.5, marginBottom: "0.85rem", padding: "0.55rem 0.75rem", background: theme.timerBg, borderRadius: 10, border: `1px solid ${STATUS.warning.fill}55` }}>
      {children}
    </div>
  );
}

/** What an uncalibrated result is missing, and the step that fixes it. Only the
 *  first two are actionable; "unavailable" states the limit without sending the
 *  user somewhere that won't help. */
function CalibrationNote({ theme, notice }: { theme: AppTheme; notice: CalibrationNotice }) {
  if (notice === "unavailable") {
    return (
      <WarnNote theme={theme}>
        Buffed-stat calibration is not available for this class, so this is valued against your
        unbuffed stat window and will not line up with MapleScouter.
      </WarnNote>
    );
  }
  const action =
    notice === "setup"
      ? "finish this character's Scouter setup"
      : "refresh this character's Scouter figure";
  return (
    <WarnNote theme={theme}>
      This is valued against your unbuffed stat window, so it will not line up with MapleScouter.
      For the most accurate recommendation, {action} in{" "}
      <Link href="/characters" style={{ color: theme.accentText }}>Characters</Link>, which accounts
      for your link skills and buffs.
    </WarnNote>
  );
}

function NumberInput({
  inputStyle,
  value,
  onChange,
  max,
  width,
  id,
  disabled,
}: {
  /** Theme colors from the workspace's one `toolStyles`; shape is `.tool-input`. */
  inputStyle: CSSProperties;
  value: number;
  onChange: (v: number) => void;
  max: number;
  width?: number | string;
  /** Required: every box here is named by a real <label htmlFor>. */
  id: string;
  disabled?: boolean;
}) {
  return (
    <ToolNumberInput
      value={value}
      min={0}
      max={max}
      integer
      id={id}
      disabled={disabled}
      onKeyDown={replaceZeroOnDigit}
      onCommit={onChange}
      style={{ ...inputStyle, width: width ?? "100%", textAlign: "center", opacity: disabled ? 0.55 : 1 }}
    />
  );
}

// ── Editable stat inputs ──────────────────────────────────────────────────────

const TRIPLE_PARTS: { part: TriplePart; label: string }[] = [
  { part: "base", label: "Base Value" },
  { part: "pct", label: "% Value" },
  { part: "flat", label: "% Not Applied" },
];
/** No class currently gets ATT into the "% Not Applied" bucket, so the row hides
 *  that field. The stored value still reaches the kernel if one ever shows up. */
const ATTACK_PARTS = TRIPLE_PARTS.filter((p) => p.part !== "flat");

/** One tooltip stat: Base Value / % Value / % Not Applied, as shown in-game.
 *  The grid stays three columns wide whatever `parts` holds, so a shorter row's
 *  boxes still line up with the rows above it. */
function TripleFieldRow({
  theme,
  styles,
  label,
  parts,
  value,
  onChange,
}: {
  theme: AppTheme;
  styles: ToolStyles;
  label: string;
  parts: { part: TriplePart; label: string }[];
  value: TripleStat;
  onChange: (part: TriplePart, v: number) => void;
}) {
  return (
    <div>
      <div className="tool-field-label" style={styles.labelStyle}>{label}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "0.5rem" }}>
        {parts.map(({ part, label: partLabel }) => (
          <div key={part}>
            <ToolNumberInput
              min={0}
              value={value[part]}
              aria-label={`${label} ${partLabel}`}
              style={{ ...styles.inputStyle, width: "100%" }}
              onKeyDown={replaceZeroOnDigit}
              onCommit={(v) => onChange(part, v)}
            />
            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: theme.muted, marginTop: "0.15rem" }}>{partLabel}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatsPanel({
  theme,
  styles,
  profile,
  standalone,
  inputs,
  onScalarChange,
  onTripleChange,
}: {
  theme: AppTheme;
  styles: ToolStyles;
  profile: ClassDamageProfile;
  standalone: boolean;
  inputs: OptimizerStatInputs;
  onScalarChange: (key: ScalarInputKey, value: number) => void;
  onTripleChange: (key: TripleInputKey, part: TriplePart, value: number) => void;
}) {
  const triples: { key: TripleInputKey; label: string; parts: typeof TRIPLE_PARTS }[] = [
    { key: "main", label: statLabel("Main Stat", profile.mainStat, standalone), parts: TRIPLE_PARTS },
    ...(profile.subStat ? [{ key: "sub" as const, label: statLabel("Secondary Stat", profile.subStat, standalone), parts: TRIPLE_PARTS }] : []),
    ...(profile.subStat2 ? [{ key: "sub2" as const, label: statLabel("Secondary Stat II", profile.subStat2, standalone), parts: TRIPLE_PARTS }] : []),
    { key: "attack", label: profile.usesMagic ? "Magic ATT" : "Attack Power", parts: ATTACK_PARTS },
  ];
  return (
    <div className="fade-in panel-card" style={styles.sectionPanel}>
      <PanelTitle
        theme={theme}
        title="Your Stats"
        subtitle="Values from the in-game stat window tooltips (Base Value / % Value / % Value Not Applied). Pulled from this character; edit any value to model a change."
      />
      <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginBottom: "0.85rem" }}>
        {triples.map((t) => (
          <TripleFieldRow
            key={t.key}
            theme={theme}
            styles={styles}
            label={t.label}
            parts={t.parts}
            value={inputs[t.key]}
            onChange={(part, v) => onTripleChange(t.key, part, v)}
          />
        ))}
      </div>
      <div style={gridTwo}>
        {SCALAR_FIELDS.map((f) => (
          <div key={f.key}>
            <label className="tool-field-label" htmlFor={`stat-opt-${f.key}`} style={styles.labelStyle}>{f.label}</label>
            <ToolNumberInput
              id={`stat-opt-${f.key}`}
              min={0}
              value={inputs[f.key]}
              style={{ ...styles.inputStyle, width: "100%" }}
              onKeyDown={replaceZeroOnDigit}
              onCommit={(v) => onScalarChange(f.key, v)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Hyper Stat ────────────────────────────────────────────────────────────────

/** Class-aware label for a hyper line. */
function hyperLineLabel(id: HyperLineId, profile: ClassDamageProfile, standalone: boolean): string {
  if (id === "mainStat") {
    return profile.isHpBased ? "Max HP %" : statLabel("Main Stat", profile.mainStat, standalone);
  }
  if (id === "subStat") return statLabel("Secondary Stat", profile.subStat, standalone);
  if (id === "subStat2") return statLabel("Secondary Stat II", profile.subStat2, standalone);
  if (id === "attack") return profile.usesMagic ? "Magic ATT" : "ATT";
  return HYPER_LINES.find((l) => l.id === id)?.label ?? id;
}

/* The Now/Best table is real tabular data, so it's a real <table>: the stat name is
   each row's header and doubles as its input's <label>, which makes the recommended
   value a cell a screen reader can place ("Critical Damage, Best, 15") instead of
   text floating beside an input. Shape lives here; colors stay inline per theme.
   `border-spacing` reproduces the old 0.4rem gap between row cards, which needs
   `border-collapse: separate`, so each row's border is painted per cell with the
   radius split across the first and last one. */
const HYPER_TABLE_CSS = `
  .hyper-table { width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 0 0.4rem; }
  .hyper-table thead th { padding: 0 0.7rem 0.2rem; font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; }
  .hyper-table tbody th, .hyper-table tbody td { padding: 0.4rem 0; border-style: solid; border-width: 1px 0; }
  .hyper-table tbody th { padding-left: 0.7rem; border-left-width: 1px; border-top-left-radius: 10px; border-bottom-left-radius: 10px; }
  .hyper-table tbody td.hyper-best { padding-right: 0.7rem; border-right-width: 1px; border-top-right-radius: 10px; border-bottom-right-radius: 10px; }
  .hyper-table td.hyper-now { padding-right: 0.6rem; }
`;

// In-game hyper stat window order. Display only: HYPER_LINES keeps scouter's
// greedy iteration order, which the engine's tie-breaking depends on.
const HYPER_DISPLAY_ORDER: HyperLineId[] = [
  "mainStat",
  "subStat",
  "subStat2",
  "critRate",
  "critDamage",
  "ignoreDefense",
  "damage",
  "bossDamage",
  "attack",
];

function HyperLineRow({
  theme,
  inputStyle,
  id,
  label,
  current,
  recommended,
  onChange,
}: {
  theme: AppTheme;
  inputStyle: CSSProperties;
  id: HyperLineId;
  label: string;
  current: number;
  recommended: number;
  onChange: (v: number) => void;
}) {
  const changed = recommended !== current;
  const inputId = `hyper-level-${id}`;
  const cell: CSSProperties = { background: theme.timerBg, borderColor: theme.border };
  return (
    <tr>
      <th scope="row" style={{ ...cell, textAlign: "left" }}>
        <label htmlFor={inputId} style={{ fontSize: "0.85rem", fontWeight: 700, color: theme.text, cursor: "pointer" }}>
          {label}
        </label>
      </th>
      <td className="hyper-now" style={cell}>
        <NumberInput inputStyle={inputStyle} id={inputId} value={current} onChange={onChange} max={HYPER_MAX_LEVEL} />
      </td>
      {/* Weight carries the changed/unchanged split alongside color, so it survives
          both a monochrome read and a screen reader (which gets the suffix). */}
      <td
        className="hyper-best"
        style={{ ...cell, textAlign: "right", fontSize: "0.85rem", fontWeight: changed ? 800 : 600, color: changed ? theme.accentText : theme.muted }}
      >
        {recommended}
        {changed && <span className="sr-only"> (change from {current})</span>}
      </td>
    </tr>
  );
}

function HyperPanel({
  theme,
  styles,
  profile,
  standalone,
  result,
  alloc,
  onLevelChange,
  tracked,
  calibrationNotice,
  pointsSpent,
  hasStats,
}: {
  theme: AppTheme;
  styles: ToolStyles;
  profile: ClassDamageProfile;
  standalone: boolean;
  result: HyperResult;
  alloc: HyperAllocation;
  onLevelChange: (id: HyperLineId, level: number) => void;
  tracked: boolean;
  calibrationNotice: CalibrationNotice | null;
  pointsSpent: number;
  hasStats: boolean;
}) {
  const rows = HYPER_DISPLAY_ORDER.filter((id) => id !== "subStat2" || profile.subStat2 !== null);
  return (
    <div className="fade-in panel-card" style={styles.sectionPanel}>
      {/* Counts what the Now column spends, which is also what the inputs clamp to;
          the Best column always fits the same budget by construction. */}
      <PanelTitle
        theme={theme}
        title="Hyper Stat"
        aside={
          <span style={{ fontSize: "0.8rem", color: theme.muted, fontWeight: 700 }}>
            {pointsSpent} / {result.pointsAvailable} points used
          </span>
        }
      />
      <GainBanner
        theme={theme}
        gainPct={result.gainPct}
        label="bossing damage vs your current hyper stats"
        alreadyOptimal={result.alreadyOptimal}
        pending={hyperPending(hasStats, result.pointsAvailable)}
      />
      {!tracked && (
        <WarnNote theme={theme}>
          No Hyper Stat allocation is tracked for this character. Your stats above already include
          your in-game hyper stats, so enter your current levels below (or set them in character
          setup) to keep the gain accurate.
        </WarnNote>
      )}
      {calibrationNotice && <CalibrationNote theme={theme} notice={calibrationNotice} />}
      <table className="hyper-table">
        <caption className="sr-only">
          Hyper Stat levels: your current level per line and the recommended level.
        </caption>
        <colgroup>
          <col />
          <col style={{ width: 64 }} />
          <col style={{ width: 64 }} />
        </colgroup>
        {/* Typography lives in HYPER_TABLE_CSS, not `.tool-field-label`, whose
            `display: block` would collapse the header row. */}
        <thead>
          <tr>
            <th scope="col" style={{ ...styles.labelStyle, textAlign: "left" }}>Stat</th>
            <th scope="col" style={{ ...styles.labelStyle, textAlign: "center" }}>Now</th>
            <th scope="col" style={{ ...styles.labelStyle, textAlign: "right" }}>Best</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((id) => (
            <HyperLineRow
              key={id}
              theme={theme}
              inputStyle={styles.inputStyle}
              id={id}
              label={hyperLineLabel(id, profile, standalone)}
              current={alloc[id]}
              recommended={result.allocation[id]}
              onChange={(v) => onLevelChange(id, v)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── HEXA Stat ─────────────────────────────────────────────────────────────────

/** Segmented level indicator (one pip per level), matching the character setup flow. */
function LineLevelBar({ theme, level }: { theme: AppTheme; level: number }) {
  // Two style objects for the whole bar rather than one per pip: nine of these
  // bars re-render on every keystroke in the stat fields.
  const filled: CSSProperties = { flex: 1, height: 3, borderRadius: 2, background: theme.accent, transition: "background 0.1s ease" };
  const empty: CSSProperties = { ...filled, background: theme.border };
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {Array.from({ length: HEXA_MAX_LINE_LEVEL }, (_, i) => (
        <div key={i} style={i < level ? filled : empty} />
      ))}
    </div>
  );
}

/* Both controls get a real <label htmlFor> rather than an aria-label, so clicking
   the visible text focuses the control. The visible words alone don't say which
   core they belong to, so each label carries the rest of its old aria-label in an
   sr-only span, leaving the accessible names exactly as complete as before. */
function HexaLineRow({
  theme,
  styles,
  profile,
  standalone,
  idPrefix,
  coreLabel,
  role,
  type,
  level,
  recommended,
  onTypeChange,
  onLevelChange,
}: {
  theme: AppTheme;
  styles: ToolStyles;
  profile: ClassDamageProfile;
  standalone: boolean;
  idPrefix: string;
  coreLabel: string;
  role: CoreLineKey;
  type: HexaStatType | "";
  level: number;
  recommended: HexaStatType | "" | undefined;
  onTypeChange: (t: HexaStatType | "") => void;
  onLevelChange: (v: number) => void;
}) {
  const isPrimary = role === "primary";
  const rec = recommended !== undefined && recommended !== "" && recommended !== type && level > 0 ? recommended : null;
  const recBonus = rec ? getHexaStatBonus(rec, level, isPrimary, profile.classId) : "";
  const statId = `${idPrefix}-stat`;
  const levelId = `${idPrefix}-level`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
        <label
          htmlFor={statId}
          style={{ fontSize: "0.75rem", fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: isPrimary ? theme.accentText : theme.muted, cursor: "pointer" }}
        >
          {HEXA_LINE_LABELS[role]}
          <span className="sr-only"> stat, {coreLabel}</span>
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <label htmlFor={levelId} style={{ fontSize: "0.75rem", fontWeight: 700, color: theme.muted, cursor: "pointer" }}>
            <span aria-hidden="true">Lv</span>
            <span className="sr-only">{HEXA_LINE_LABELS[role]} level, {coreLabel}</span>
          </label>
          <NumberInput inputStyle={styles.inputStyle} id={levelId} value={level} onChange={onLevelChange} max={HEXA_MAX_LINE_LEVEL} width={46} />
        </div>
      </div>
      <select
        id={statId}
        className="tool-select"
        style={{ ...styles.selectStyle, width: "100%" }}
        value={type}
        onChange={(e) => onTypeChange(e.target.value as HexaStatType | "")}
      >
        <option value="">Select…</option>
        {HEXA_STAT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{hexaTypeLabel(o.value, profile, standalone)}</option>
        ))}
      </select>
      <LineLevelBar theme={theme} level={level} />
      {/* "Best" carries the meaning in words; a glyph here announced inconsistently. */}
      {rec && (
        <div style={{ fontSize: "0.76rem", fontWeight: 700, color: theme.accentText }}>
          Best: {hexaTypeLabel(rec, profile, standalone)}{recBonus ? ` (${recBonus})` : ""}
        </div>
      )}
    </div>
  );
}

function CoreCard({
  theme,
  styles,
  profile,
  standalone,
  index,
  core,
  recommended,
  onUnlockedChange,
  onLineChange,
}: {
  theme: AppTheme;
  styles: ToolStyles;
  profile: ClassDamageProfile;
  standalone: boolean;
  index: number;
  core: HexaCore;
  recommended: HexaResult["cores"][number] | undefined;
  onUnlockedChange: (unlocked: boolean) => void;
  onLineChange: (line: CoreLineKey, patch: { type?: HexaStatType | ""; level?: number }) => void;
}) {
  const total = core.primary.level + core.additional[0].level + core.additional[1].level;
  const maxed = total === HEXA_CORE_TOTAL;
  const recFor = (line: CoreLineKey): HexaStatType | "" | undefined => {
    if (!recommended) return undefined;
    if (line === "primary") return recommended.primary;
    return recommended.additional[line === "alt0" ? 0 : 1];
  };
  const lines: { role: CoreLineKey; line: HexaLine }[] = [
    { role: "primary", line: core.primary },
    { role: "alt0", line: core.additional[0] },
    { role: "alt1", line: core.additional[1] },
  ];
  return (
    <div style={{ padding: "0.85rem", background: theme.timerBg, borderRadius: 12, border: `1px solid ${theme.border}`, opacity: core.unlocked ? 1 : 0.55 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", marginBottom: core.unlocked ? "0.7rem" : 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: "0.45rem", fontSize: "0.9rem", fontWeight: 800, color: theme.text }}>
          <HexaSkillIcon id={HEXA_NODE_ICON_IDS[index]} size={26} disabled={!core.unlocked} />
          {CORE_LABELS[index]}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          {core.unlocked && (
            <span className="tool-badge" style={{ color: maxed ? theme.accentOn : theme.accentText, background: maxed ? theme.accent : theme.accentSoft }}>
              {total}/{HEXA_CORE_TOTAL}
            </span>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.76rem", color: theme.muted, fontWeight: 700, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={core.unlocked}
              style={{ accentColor: theme.accent }}
              onChange={(e) => onUnlockedChange(e.target.checked)}
            />
            Unlocked
          </label>
        </div>
      </div>
      {core.unlocked && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {lines.map(({ role, line }, li) => (
            <div
              key={role}
              style={li === 0 ? undefined : { marginTop: "0.7rem", paddingTop: "0.7rem", borderTop: `1px solid ${theme.border}` }}
            >
              <HexaLineRow
                theme={theme}
                styles={styles}
                profile={profile}
                standalone={standalone}
                idPrefix={`hexa-${index}-${role}`}
                coreLabel={CORE_LABELS[index]}
                role={role}
                type={line.type}
                level={line.level}
                recommended={recFor(role)}
                onTypeChange={(t) => onLineChange(role, { type: t })}
                onLevelChange={(v) => onLineChange(role, { level: v })}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HexaPanel({
  theme,
  styles,
  profile,
  standalone,
  cores,
  result,
  onUnlockedChange,
  onLineChange,
  tracked,
  calibrationNotice,
  hasStats,
}: {
  theme: AppTheme;
  styles: ToolStyles;
  profile: ClassDamageProfile;
  standalone: boolean;
  cores: HexaCore[];
  result: HexaResult;
  onUnlockedChange: (index: number, unlocked: boolean) => void;
  onLineChange: (index: number, line: CoreLineKey, patch: { type?: HexaStatType | ""; level?: number }) => void;
  tracked: boolean;
  calibrationNotice: CalibrationNotice | null;
  hasStats: boolean;
}) {
  // result.cores is aligned to the unlocked cores in order; map each core to its recommendation.
  const recByCore: (HexaResult["cores"][number] | undefined)[] = [];
  let recCursor = 0;
  for (const c of cores) recByCore.push(c.unlocked ? result.cores[recCursor++] : undefined);
  return (
    <div className="fade-in panel-card" style={styles.sectionPanel}>
      <PanelTitle
        theme={theme}
        title="HEXA Stat"
        subtitle="Each core has 20 levels split across three lines (the split is set in-game, not chosen). Keeping your levels fixed, this finds the best stat type for each line; any line with a better pick shows it under the level bar."
      />
      <GainBanner
        theme={theme}
        gainPct={result.gainPct}
        label="bossing damage from re-assigning your HEXA lines"
        alreadyOptimal={result.alreadyOptimal}
        pending={hexaPending(hasStats, tracked)}
      />
      {!tracked && (
        <WarnNote theme={theme}>
          No HEXA Stat data is tracked. Enter each core&apos;s line stat and level (they total 20 per
          maxed core), or set them in character setup, to get a recommendation.
        </WarnNote>
      )}
      {/* HEXA runs through the same kernel as Hyper, so it needs the same footing. */}
      {calibrationNotice && <CalibrationNote theme={theme} notice={calibrationNotice} />}
      <div className="stat-opt-core-grid">
        {cores.map((core, i) => (
          <CoreCard
            key={CORE_LABELS[i]}
            theme={theme}
            styles={styles}
            profile={profile}
            standalone={standalone}
            index={i}
            core={core}
            recommended={recByCore[i]}
            onUnlockedChange={(u) => onUnlockedChange(i, u)}
            onLineChange={(line, patch) => onLineChange(i, line, patch)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Workspace ─────────────────────────────────────────────────────────────────

const MODE_OPTIONS = ["hyper", "hexa"] as const;
const MODE_LABELS: Record<OptimizerMode, string> = { hyper: "Hyper Stat", hexa: "HEXA Stat" };
/** The toggle swaps this whole panel rather than restyling one on screen, so the
 *  buttons point at it: without the link the switch is silent to a screen
 *  reader, which has no way to tell what the press changed. */
const MODE_PANEL_ID = "stat-opt-mode-panel";

type StatOptimizerState = ReturnType<typeof useStatOptimizer>;

function hyperTracked(alloc: HyperAllocation): boolean {
  return Object.values(alloc).some((level) => level > 0);
}

function hexaTracked(cores: HexaCore[]): boolean {
  return cores.some((c) => c.unlocked && (c.primary.level > 0 || c.additional[0].level > 0 || c.additional[1].level > 0));
}

/* The two boss defense values worth planning around, out of the 50-380 range
   scouter's own selector spans. Kept as strings because they are the segmented
   track's option keys; `DEFAULT_BOSS_PDR` picks which one the tool opens on. */
const BOSS_PDR_OPTIONS = ["300", "380"] as const;
const BOSS_PDR_LABELS: Record<(typeof BOSS_PDR_OPTIONS)[number], string> = { "300": "300%", "380": "380%" };
const bossPdrChoice = (pct: number): (typeof BOSS_PDR_OPTIONS)[number] => (pct === 300 ? "300" : "380");
// Height matches `.tool-control-row`'s pinned control height; the options size
// to their own text rather than splitting the width like the mode switch.
const BOSS_PDR_TRACK: CSSProperties = { height: 34 };

function CharacterControls({ theme, opt, styles }: { theme: AppTheme; opt: StatOptimizerState; styles: ToolStyles }) {
  return (
    <div className="fade-in panel-card" style={styles.sectionPanel}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem 1.5rem", flexWrap: "wrap" }}>
        {opt.characters.length > 0 ? (
          <div style={{ flex: "1 1 320px" }}>
            <CharacterSyncPanel
              theme={theme}
              characters={opt.characters}
              selectedCharName={opt.selectedCharName}
              onCharChange={opt.handleCharChange}
              inputStyle={styles.inputStyle}
            />
          </div>
        ) : (
          <div style={{ flex: "1 1 320px", fontSize: "0.82rem", color: theme.muted, fontWeight: 600, lineHeight: 1.5 }}>
            Enter your stats below, or add a character in{" "}
            <Link href="/characters" style={{ color: theme.accentText }}>Characters</Link> to autopopulate.
          </div>
        )}
        {/* Opts into the shared control row so the level box and the PDR track
            take its pinned 34px and their labels stay on one line. */}
        <div className="tool-control-row">
          <div>
            <label className="tool-field-label" htmlFor="stat-opt-level" style={styles.labelStyle}>Level</label>
            {/* A stored character's level (and hyper-point budget, which deducts
                untracked-line spending) comes from the store; only standalone
                entry edits it, recomputing the budget from the closed form. */}
            <NumberInput
              inputStyle={styles.inputStyle}
              id="stat-opt-level"
              value={opt.state.inputs.level}
              onChange={opt.setLevel}
              max={300}
              width={72}
              disabled={opt.selectedCharName !== null}
            />
          </div>
          <div>
            {/* A plain <div>, not a <label>: there is no single control to point
                `htmlFor` at, so the group names itself through `ariaLabel`. */}
            <div className="tool-field-label" style={styles.labelStyle}>Boss PDR</div>
            <SegmentedToggle
              theme={theme}
              options={BOSS_PDR_OPTIONS}
              labels={BOSS_PDR_LABELS}
              value={bossPdrChoice(opt.bossPdrPct)}
              ariaLabel="Boss PDR"
              btnClassName="stat-opt-pdr-option"
              trackStyle={BOSS_PDR_TRACK}
              onChange={(v) => opt.setBossPdr(Number(v))}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatOptimizerContent({ theme, styles, opt }: { theme: AppTheme; styles: ToolStyles; opt: StatOptimizerState }) {
  const { state } = opt;
  // No character behind the numbers, so the seed's class-shaped placeholders
  // (STR main / DEX secondary) are withheld rather than presented as facts.
  const standalone = opt.selectedCharName === null;

  return (
    <>
      <CharacterControls theme={theme} opt={opt} styles={styles} />

      <StatsPanel
        theme={theme}
        styles={styles}
        profile={state.profile}
        standalone={standalone}
        inputs={state.inputs}
        onScalarChange={opt.setScalarInput}
        onTripleChange={opt.setTriplePart}
      />

      <div id={MODE_PANEL_ID}>
        {opt.result.mode === "hyper" ? (
          <HyperPanel
            theme={theme}
            styles={styles}
            profile={state.profile}
            standalone={standalone}
            result={opt.result.hyper}
            alloc={state.hyperAlloc}
            onLevelChange={opt.setHyperLevel}
            tracked={hyperTracked(state.hyperAlloc)}
            calibrationNotice={state.calibrationNotice}
            pointsSpent={opt.hyperPointsSpent}
            hasStats={opt.hasStats}
          />
        ) : (
          <HexaPanel
            theme={theme}
            styles={styles}
            profile={state.profile}
            standalone={standalone}
            cores={state.cores}
            result={opt.result.hexa}
            onUnlockedChange={opt.setCoreUnlocked}
            onLineChange={opt.setCoreLine}
            tracked={hexaTracked(state.cores)}
            calibrationNotice={state.calibrationNotice}
            hasStats={opt.hasStats}
          />
        )}
      </div>
    </>
  );
}

/** Empty panels shaped like the mounted layout, so the page doesn't pop or
 *  jump while waiting for the localStorage-backed content. Heights come from
 *  SKELETON_CSS, not inline: the real panels are far taller once the character
 *  row wraps, the stat fields drop to one column and every caption reflows, so
 *  one desktop number left the swap shifting the page by hundreds of pixels on
 *  a phone. Sized against the first-load state (blank stats, Hyper mode, the
 *  untracked-allocation note showing). */
function LoadingPlaceholder({ styles }: { styles: ToolStyles }) {
  return (
    <>
      <div className="panel-card stat-opt-skeleton-chars" style={styles.sectionPanel} />
      <div className="panel-card stat-opt-skeleton-stats" style={styles.sectionPanel} />
      <div className="panel-card stat-opt-skeleton-mode" style={styles.sectionPanel} />
    </>
  );
}

/* Concatenated once at module scope, not per render, and passed as a single text
   child: two children serialize differently on server and client and trip a
   hydration mismatch. */
const STAT_OPT_CSS = CORE_GRID_CSS + HYPER_TABLE_CSS + PDR_PICKER_CSS + SKELETON_CSS;

export default function StatOptimizerWorkspace({ theme }: { theme: AppTheme }) {
  const opt = useStatOptimizer();
  // The one `toolStyles` call for the whole tree; every panel and row takes it as
  // a prop rather than rebuilding six style objects apiece. It used to run ~20-30
  // times a render (once per input box, stat row and HEXA line), and every
  // keystroke in a stat field re-renders all of them.
  const styles = toolStyles(theme);

  return (
    <div className="page-content">
      <style>{STAT_OPT_CSS}</style>
      <div className="tool-container">
        <ToolHeader
          theme={theme}
          title="Stat Optimizer"
          description="Find the best Hyper Stat and HEXA Stat allocation for bossing, valued against the boss defense you set."
        />

        <SegmentedToggle
          theme={theme}
          options={MODE_OPTIONS}
          labels={MODE_LABELS}
          value={opt.mode}
          ariaLabel="Optimizer"
          ariaControls={MODE_PANEL_ID}
          onChange={opt.setMode}
          sectionPanel={styles.sectionPanel}
        />

        {opt.mounted ? (
          <StatOptimizerContent theme={theme} styles={styles} opt={opt} />
        ) : (
          <LoadingPlaceholder styles={styles} />
        )}
      </div>
    </div>
  );
}
