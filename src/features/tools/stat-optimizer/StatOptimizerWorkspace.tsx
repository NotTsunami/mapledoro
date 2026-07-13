"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { ToolHeader } from "../../../components/ToolHeader";
import { CharacterSyncPanel } from "../../../components/CharacterSyncPanel";
import { HexaSkillIcon } from "../../../components/ResourceImage";
import { SegmentedToggle } from "../../../components/SegmentedToggle";
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

const statName = (id: MainStatId | null): string => (id ? STAT_NAME[id] : "");

const SCALAR_FIELDS: { key: ScalarInputKey; label: string }[] = [
  { key: "damagePct", label: "Damage %" },
  { key: "bossDamagePct", label: "Boss Damage %" },
  { key: "critRatePct", label: "Critical Rate %" },
  { key: "critDamagePct", label: "Critical Damage %" },
  { key: "ignoreDefPct", label: "Ignore Enemy DEF %" },
];

function hexaTypeLabel(type: HexaStatType | "", profile: ClassDamageProfile): string {
  const primary = profile.mainStat;
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

function GainBanner({
  theme,
  gainPct,
  label,
  alreadyOptimal,
}: {
  theme: AppTheme;
  gainPct: number;
  label: string;
  alreadyOptimal: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
      {alreadyOptimal ? (
        <span style={{ fontSize: "1.5rem", fontWeight: 800, color: theme.accentText }}>Already optimized</span>
      ) : (
        <span style={{ fontSize: "2rem", fontWeight: 800, color: theme.accentText }}>
          {gainPct >= 0 ? "+" : ""}{gainPct.toFixed(2)}%
        </span>
      )}
      <span style={{ fontSize: "0.85rem", fontWeight: 700, color: theme.muted }}>
        {alreadyOptimal ? "no better allocation found" : label}
      </span>
    </div>
  );
}

function WarnNote({ theme, text }: { theme: AppTheme; text: string }) {
  return (
    <div style={{ fontSize: "0.78rem", color: theme.muted, fontWeight: 600, lineHeight: 1.5, marginBottom: "0.85rem", padding: "0.55rem 0.75rem", background: theme.timerBg, borderRadius: 10, border: `1px solid ${theme.border}` }}>
      {text}
    </div>
  );
}

function NumberInput({
  theme,
  value,
  onChange,
  max,
  width,
  ariaLabel,
  disabled,
}: {
  theme: AppTheme;
  value: number;
  onChange: (v: number) => void;
  max: number;
  width?: number | string;
  ariaLabel: string;
  disabled?: boolean;
}) {
  const styles = toolStyles(theme);
  return (
    <ToolNumberInput
      value={value}
      min={0}
      max={max}
      integer
      aria-label={ariaLabel}
      disabled={disabled}
      onKeyDown={replaceZeroOnDigit}
      onCommit={onChange}
      style={{ ...styles.inputStyle, width: width ?? "100%", textAlign: "center", opacity: disabled ? 0.55 : 1 }}
    />
  );
}

// ── Editable stat inputs ──────────────────────────────────────────────────────

const TRIPLE_PARTS: { part: TriplePart; label: string }[] = [
  { part: "base", label: "Base Value" },
  { part: "pct", label: "% Value" },
  { part: "flat", label: "% Not Applied" },
];

/** One tooltip stat: Base Value / % Value / % Not Applied, as shown in-game. */
function TripleFieldRow({
  theme,
  label,
  value,
  onChange,
}: {
  theme: AppTheme;
  label: string;
  value: TripleStat;
  onChange: (part: TriplePart, v: number) => void;
}) {
  const styles = toolStyles(theme);
  return (
    <div>
      <div className="tool-field-label" style={styles.labelStyle}>{label}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "0.5rem" }}>
        {TRIPLE_PARTS.map(({ part, label: partLabel }) => (
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
  profile,
  inputs,
  onScalarChange,
  onTripleChange,
}: {
  theme: AppTheme;
  profile: ClassDamageProfile;
  inputs: OptimizerStatInputs;
  onScalarChange: (key: ScalarInputKey, value: number) => void;
  onTripleChange: (key: TripleInputKey, part: TriplePart, value: number) => void;
}) {
  const styles = toolStyles(theme);
  const triples: { key: TripleInputKey; label: string }[] = [
    { key: "main", label: `Main Stat (${statName(profile.mainStat)})` },
    ...(profile.subStat ? [{ key: "sub" as const, label: `Secondary Stat (${statName(profile.subStat)})` }] : []),
    ...(profile.subStat2 ? [{ key: "sub2" as const, label: `Secondary Stat II (${statName(profile.subStat2)})` }] : []),
    { key: "attack", label: profile.usesMagic ? "Magic ATT" : "Attack Power" },
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
            label={t.label}
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
function hyperLineLabel(id: HyperLineId, profile: ClassDamageProfile): string {
  if (id === "mainStat") {
    return profile.isHpBased ? "Max HP %" : `Main Stat (${statName(profile.mainStat)})`;
  }
  if (id === "subStat") return `Secondary Stat (${statName(profile.subStat)})`;
  if (id === "subStat2") return `Secondary Stat II (${statName(profile.subStat2)})`;
  if (id === "attack") return profile.usesMagic ? "Magic ATT" : "ATT";
  return HYPER_LINES.find((l) => l.id === id)?.label ?? id;
}

// Shared columns so the header and every row align without magic widths.
const HYPER_GRID = "minmax(0, 1fr) 58px 64px";

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
  label,
  current,
  recommended,
  onChange,
}: {
  theme: AppTheme;
  label: string;
  current: number;
  recommended: number;
  onChange: (v: number) => void;
}) {
  const changed = recommended !== current;
  return (
    <div style={{ display: "grid", gridTemplateColumns: HYPER_GRID, alignItems: "center", gap: "0.6rem", padding: "0.4rem 0.7rem", background: theme.timerBg, borderRadius: 10, border: `1px solid ${theme.border}` }}>
      <span style={{ fontSize: "0.85rem", fontWeight: 700, color: theme.text, minWidth: 0 }}>{label}</span>
      <NumberInput theme={theme} value={current} onChange={onChange} max={HYPER_MAX_LEVEL} ariaLabel={`${label} current level`} />
      <span style={{ textAlign: "right", fontSize: "0.85rem", fontWeight: 800, color: changed ? theme.accentText : theme.muted }}>
        {changed ? `→ ${recommended}` : recommended}
      </span>
    </div>
  );
}

function HyperPanel({
  theme,
  profile,
  result,
  alloc,
  onLevelChange,
  tracked,
}: {
  theme: AppTheme;
  profile: ClassDamageProfile;
  result: HyperResult;
  alloc: HyperAllocation;
  onLevelChange: (id: HyperLineId, level: number) => void;
  tracked: boolean;
}) {
  const styles = toolStyles(theme);
  const rows = HYPER_DISPLAY_ORDER.filter((id) => id !== "subStat2" || profile.subStat2 !== null);
  return (
    <div className="fade-in panel-card" style={styles.sectionPanel}>
      {/* The budget itself comes from the level input in the controls row. */}
      <PanelTitle
        theme={theme}
        title="Hyper Stat"
        aside={
          <span style={{ fontSize: "0.8rem", color: theme.muted, fontWeight: 700 }}>
            {result.pointsUsed} / {result.pointsAvailable} points used
          </span>
        }
      />
      <GainBanner
        theme={theme}
        gainPct={result.gainPct}
        label="bossing damage vs your current hyper stats"
        alreadyOptimal={result.alreadyOptimal}
      />
      {!tracked && (
        <WarnNote
          theme={theme}
          text="No Hyper Stat allocation is tracked for this character. Your stats above already include your in-game hyper stats, so enter your current levels below (or set them in character setup) to keep the gain accurate."
        />
      )}
      <div style={{ display: "grid", gridTemplateColumns: HYPER_GRID, gap: "0.6rem", padding: "0 0.7rem", marginBottom: "0.4rem" }}>
        <span className="tool-field-label" style={styles.labelStyle}>Stat</span>
        <span className="tool-field-label" style={{ ...styles.labelStyle, textAlign: "center" }}>Now</span>
        <span className="tool-field-label" style={{ ...styles.labelStyle, textAlign: "right" }}>Best</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        {rows.map((id) => (
          <HyperLineRow
            key={id}
            theme={theme}
            label={hyperLineLabel(id, profile)}
            current={alloc[id]}
            recommended={result.allocation[id]}
            onChange={(v) => onLevelChange(id, v)}
          />
        ))}
      </div>
    </div>
  );
}

// ── HEXA Stat ─────────────────────────────────────────────────────────────────

/** Segmented level indicator (one pip per level), matching the character setup flow. */
function LineLevelBar({ theme, level }: { theme: AppTheme; level: number }) {
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {Array.from({ length: HEXA_MAX_LINE_LEVEL }, (_, i) => (
        <div
          key={i}
          style={{ flex: 1, height: 3, borderRadius: 2, background: i < level ? theme.accent : theme.border, transition: "background 0.1s ease" }}
        />
      ))}
    </div>
  );
}

function HexaLineRow({
  theme,
  profile,
  coreLabel,
  role,
  type,
  level,
  recommended,
  onTypeChange,
  onLevelChange,
}: {
  theme: AppTheme;
  profile: ClassDamageProfile;
  coreLabel: string;
  role: CoreLineKey;
  type: HexaStatType | "";
  level: number;
  recommended: HexaStatType | "" | undefined;
  onTypeChange: (t: HexaStatType | "") => void;
  onLevelChange: (v: number) => void;
}) {
  const styles = toolStyles(theme);
  const isPrimary = role === "primary";
  const rec = recommended !== undefined && recommended !== "" && recommended !== type && level > 0 ? recommended : null;
  const recBonus = rec ? getHexaStatBonus(rec, level, isPrimary, profile.classId) : "";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
        <span style={{ fontSize: "0.75rem", fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: isPrimary ? theme.accentText : theme.muted }}>
          {HEXA_LINE_LABELS[role]}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: theme.muted }}>Lv</span>
          <NumberInput
            theme={theme}
            value={level}
            onChange={onLevelChange}
            max={HEXA_MAX_LINE_LEVEL}
            width={46}
            ariaLabel={`${coreLabel} ${HEXA_LINE_LABELS[role]} level`}
          />
        </div>
      </div>
      <select
        className="tool-select"
        style={{ ...styles.selectStyle, width: "100%" }}
        value={type}
        aria-label={`${coreLabel} ${HEXA_LINE_LABELS[role]} stat`}
        onChange={(e) => onTypeChange(e.target.value as HexaStatType | "")}
      >
        <option value="">Select…</option>
        {HEXA_STAT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{hexaTypeLabel(o.value, profile)}</option>
        ))}
      </select>
      <LineLevelBar theme={theme} level={level} />
      {rec && (
        <div style={{ fontSize: "0.76rem", fontWeight: 700, color: theme.accentText }}>
          ★ Best: {hexaTypeLabel(rec, profile)}{recBonus ? ` (${recBonus})` : ""}
        </div>
      )}
    </div>
  );
}

function CoreCard({
  theme,
  profile,
  index,
  core,
  recommended,
  onUnlockedChange,
  onLineChange,
}: {
  theme: AppTheme;
  profile: ClassDamageProfile;
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
                profile={profile}
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
  profile,
  cores,
  result,
  onUnlockedChange,
  onLineChange,
  tracked,
}: {
  theme: AppTheme;
  profile: ClassDamageProfile;
  cores: HexaCore[];
  result: HexaResult;
  onUnlockedChange: (index: number, unlocked: boolean) => void;
  onLineChange: (index: number, line: CoreLineKey, patch: { type?: HexaStatType | ""; level?: number }) => void;
  tracked: boolean;
}) {
  const styles = toolStyles(theme);
  // result.cores is aligned to the unlocked cores in order; map each core to its recommendation.
  const recByCore: (HexaResult["cores"][number] | undefined)[] = [];
  let recCursor = 0;
  for (const c of cores) recByCore.push(c.unlocked ? result.cores[recCursor++] : undefined);
  return (
    <div className="fade-in panel-card" style={styles.sectionPanel}>
      <PanelTitle
        theme={theme}
        title="HEXA Stat"
        subtitle="Each core has 20 levels split across three lines (the split is set in-game, not chosen). Keeping your levels fixed, this finds the best stat type for each line; a ★ marks a better pick."
      />
      <GainBanner
        theme={theme}
        gainPct={result.gainPct}
        label="bossing damage from re-assigning your HEXA lines"
        alreadyOptimal={result.alreadyOptimal}
      />
      {!tracked && (
        <WarnNote
          theme={theme}
          text="No HEXA Stat data is tracked. Enter each core's line stat and level (they total 20 per maxed core), or set them in character setup, to get a recommendation."
        />
      )}
      <div className="stat-opt-core-grid">
        {cores.map((core, i) => (
          <CoreCard
            key={CORE_LABELS[i]}
            theme={theme}
            profile={profile}
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

type StatOptimizerState = ReturnType<typeof useStatOptimizer>;

function hyperTracked(alloc: HyperAllocation): boolean {
  return Object.values(alloc).some((level) => level > 0);
}

function hexaTracked(cores: HexaCore[]): boolean {
  return cores.some((c) => c.unlocked && (c.primary.level > 0 || c.additional[0].level > 0 || c.additional[1].level > 0));
}

function CharacterControls({ theme, opt, styles }: { theme: AppTheme; opt: StatOptimizerState; styles: ReturnType<typeof toolStyles> }) {
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
        <div style={{ display: "flex", alignItems: "flex-end", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <div className="tool-field-label" style={styles.labelStyle}>Level</div>
            {/* A stored character's level (and hyper-point budget, which deducts
                untracked-line spending) comes from the store; only standalone
                entry edits it, recomputing the budget from the closed form. */}
            <NumberInput
              theme={theme}
              value={opt.state.inputs.level}
              onChange={opt.setLevel}
              max={300}
              width={72}
              ariaLabel="Character level"
              disabled={opt.selectedCharName !== null}
            />
          </div>
          <div>
            <div className="tool-field-label" style={styles.labelStyle}>Boss DEF %</div>
            <NumberInput theme={theme} value={opt.bossPdrPct} onChange={opt.setBossPdr} max={999} width={96} ariaLabel="Boss DEF %" />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatOptimizerContent({ theme, opt }: { theme: AppTheme; opt: StatOptimizerState }) {
  const styles = toolStyles(theme);
  const { state } = opt;

  return (
    <>
      <CharacterControls theme={theme} opt={opt} styles={styles} />

      <StatsPanel
        theme={theme}
        profile={state.profile}
        inputs={state.inputs}
        onScalarChange={opt.setScalarInput}
        onTripleChange={opt.setTriplePart}
      />

      {opt.mode === "hyper" ? (
        <HyperPanel
          theme={theme}
          profile={state.profile}
          result={opt.hyperResult}
          alloc={state.hyperAlloc}
          onLevelChange={opt.setHyperLevel}
          tracked={hyperTracked(state.hyperAlloc)}
        />
      ) : (
        <HexaPanel
          theme={theme}
          profile={state.profile}
          cores={state.cores}
          result={opt.hexaResult}
          onUnlockedChange={opt.setCoreUnlocked}
          onLineChange={opt.setCoreLine}
          tracked={hexaTracked(state.cores)}
        />
      )}
    </>
  );
}

/** Empty panels shaped like the mounted layout, so the page doesn't pop or
 *  jump while waiting for the localStorage-backed content. */
function LoadingPlaceholder({ styles }: { styles: ToolStyles }) {
  return (
    <>
      <div className="panel-card" style={{ ...styles.sectionPanel, height: 92 }} />
      <div className="panel-card" style={{ ...styles.sectionPanel, height: 560 }} />
      <div className="panel-card" style={{ ...styles.sectionPanel, height: 520 }} />
    </>
  );
}

export default function StatOptimizerWorkspace({ theme }: { theme: AppTheme }) {
  const opt = useStatOptimizer();
  const styles = toolStyles(theme);

  return (
    <div className="page-content">
      <style>{CORE_GRID_CSS}</style>
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
          onChange={opt.setMode}
          sectionPanel={styles.sectionPanel}
        />

        {opt.mounted ? <StatOptimizerContent theme={theme} opt={opt} /> : <LoadingPlaceholder styles={styles} />}
      </div>
    </div>
  );
}
