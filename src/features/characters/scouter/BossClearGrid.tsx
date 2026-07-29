"use client";

import Image from "next/image";
import { useRef, useState, type CSSProperties } from "react";
import type { AppTheme } from "../../../components/themes";
import { STATUS, statusText } from "../../../components/statusColors";
import { bossDifficultyIconUrl, bossIconUrl, bossSplashUrl } from "../../../lib/mapleResource";
import HoverTooltip from "../../../components/HoverTooltip";
import { Toggle } from "../../tools/shared-ui";
import { toolStyles } from "../../tools/tool-styles";
import type { StoredCharacterRecord } from "../model/charactersStore";
import { BOSSCUT_DATA, BOSSCUT_SCRAPED_AT, type BossCutEntry } from "./bosscut-data.generated";
import { computeBossClear, type BossClearResult, type ClearColorTier } from "./bossClearFormula";
import { formatFigure } from "./ScouterFigure";
import type { ScouterResultEntry } from "./scouterCache";

// Icon ids hand-looked-up from manifests/v270/ui-boss.json (renamed from boss.json as of v269
// -- see root CLAUDE.md "Image Policy"), cross-checked against the same bosses already mapped in
// liberation-data.ts and trace-restoration-data.ts.
const BOSS_ICON_ID: Record<string, string> = {
  스우: "13", 데미안: "15", 루시드: "19", 윌: "23", 더스크: "26", "진 힐라": "24",
  듄켈: "27", "검은 마법사": "25", 세렌: "28", 칼로스: "30", 대적자: "35", 흉성: "37",
  카링: "31", 림보: "33", 발드릭스: "34", 유피테르: "38", 가엔슬: "29", 카이: "36",
};

const BOSS_DISPLAY_NAME: Record<string, string> = {
  스우: "Lotus", 데미안: "Damien", 루시드: "Lucid", 윌: "Will", 더스크: "Gloom",
  "진 힐라": "Verus Hilla", 듄켈: "Darknell", "검은 마법사": "Black Mage", 세렌: "Seren",
  칼로스: "Kalos", 대적자: "Adversary", 흉성: "Malefic Star", 카링: "Kaling",
  림보: "Limbo", 발드릭스: "Baldrix", 유피테르: "Jupiter", 가엔슬: "Guardian Angel Slime",
  카이: "Kai",
};

const DIFFICULTY_ORDER: Record<string, number> = { Easy: 0, Normal: 1, Hard: 2, Chaos: 3, Extreme: 4, Destiny: 5, Champion: 6 };

// Only these 5 difficulties have their own ribboned sprite in the manifest (`_meta.assets` in
// ui-boss.json) -- Destiny/Champion fall back to the plain icon.png.
const DIFFICULTY_ASSET = new Set(["Easy", "Normal", "Hard", "Chaos", "Extreme"]);
function difficultyImageUrl(iconId: string, difficulty: string): string {
  return DIFFICULTY_ASSET.has(difficulty) ? bossDifficultyIconUrl(iconId, difficulty) : bossIconUrl(iconId);
}

// MapleScouter's own "relevant" filter, ported verbatim (confirmed by clicking their own
// "View my (relevant) boss standards" toggle live -- see project_maplescouter_bosscut_formula
// memory) -- hides a difficulty tile once the character has wildly outgrown it (>10x, or
// >10x/partyLimit for a party-only boss) or genuinely can't touch it yet (<0.15x, or
// <0.85x/partyLimit).
function isRelevant(clearRate: number, isPartyBoss: boolean, partyLimit: number): boolean {
  const outgrown = isPartyBoss ? clearRate / partyLimit > 10 : clearRate > 10;
  if (outgrown) return false;
  const tooWeak = isPartyBoss ? clearRate < 0.85 / partyLimit : clearRate < 0.15;
  return !tooWeak;
}

type PillStatus = "success" | "info" | "warning" | null;

// Collapses MapleScouter's 6-tier color scheme onto mapledoro's 3 usable STATUS tones:
// green/red (both are "clears solo, comfortably or by a huge margin") -> success, primary
// (borderline solo pass) -> info, blue/purple (both are "needs a party", worse vs less-worse)
// -> warning, gray (impossible/can't enter) -> no status color, a neutral pill instead.
function pillStatus(colorTier: ClearColorTier): PillStatus {
  if (colorTier === "green" || colorTier === "red") return "success";
  if (colorTier === "primary") return "info";
  if (colorTier === "blue" || colorTier === "purple") return "warning";
  return null;
}

// The two "needs a party" tiers get one shared label instead of MapleScouter's granular
// party-size-specific tags (2p/3p/4p/6p Min Cut, etc.) -- exact size shows in the tooltip.
function pillLabel(colorTier: ClearColorTier, tagEnglish: string): string {
  return colorTier === "blue" || colorTier === "purple" ? "Needs Party" : tagEnglish;
}

// "red" isn't a distinct status here, just the same success tier muted down -- see
// bossClearFormula.ts's ClearColorTier doc comment for why red means "so far past the
// threshold the exact number stopped being meaningful," not danger.
function pillStyle(theme: AppTheme, status: PillStatus, overkill: boolean): CSSProperties {
  const base: CSSProperties = {
    display: "inline-flex", alignItems: "center", padding: "3px 8px", borderRadius: 999,
    fontSize: "0.75rem", fontWeight: 700, whiteSpace: "nowrap", cursor: "default",
  };
  if (!status) return { ...base, background: theme.timerBg, color: theme.muted };
  const { fill, on } = STATUS[status];
  return { ...base, background: fill, color: on, opacity: overkill ? 0.55 : 1 };
}

// Dual-render with refs (display:none on the fallback, swap via onError) rather than useState,
// per root CLAUDE.md's React-Doctor Rules -- same pattern for every boss sprite here (row
// difficulty chips, spotlight tile icons). Covers both a real load failure AND a boss with no
// confirmed icon id at all (src undefined) by simply never mounting the Image in the latter case.
function FallbackSpriteIcon({ theme, src, size, displayName }: {
  theme: AppTheme; src: string | undefined; size: number; displayName: string;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fallbackRef = useRef<HTMLDivElement>(null);
  const fallbackStyle: CSSProperties = {
    width: size, height: size, borderRadius: 6, background: theme.accentSoft,
    display: src ? "none" : "flex", alignItems: "center", justifyContent: "center",
    fontSize: Math.max(12, size * 0.35), fontWeight: 800, color: theme.accentText, flexShrink: 0,
  };
  return (
    <>
      {src && (
        <div ref={wrapperRef} style={{ width: size, height: size, flexShrink: 0 }}>
          <Image
            src={src}
            alt=""
            width={size}
            height={size}
            unoptimized
            onError={() => {
              if (wrapperRef.current) wrapperRef.current.style.display = "none";
              if (fallbackRef.current) fallbackRef.current.style.display = "flex";
            }}
            style={{ borderRadius: 6, objectFit: "cover", display: "block" }}
          />
        </div>
      )}
      <div ref={fallbackRef} style={fallbackStyle}>{displayName.charAt(0)}</div>
    </>
  );
}

const BANNER_WIDTH = 180;
const BANNER_HEIGHT = 64;
// Vertical anchor for the wide banner crop of mob.png (a tall splash) -- 20% lands roughly on
// a character's head/shoulders for the 2 splashes checked so far (Malefic Star, First
// Adversary). Not verified across the full roster yet.
const DEFAULT_ART_POSITION = "50% 20%";
// Per-boss override, keyed the same as BOSS_ICON_ID -- framing varies enough per splash that a
// single default crop misses most faces entirely. Hand-tuned 2026-07-29 by eyeballing every
// boss's real mob.png (E:\mapledoro-image\output\ui\boss\<id>\mob.png) and picking the vertical
// anchor (as % of the source image's height) that lands on the character's face/eyes -- Gloom
// has no face (an inanimate seal), positioned on the portal's glowing center instead. Still a
// first pass against a wide (180x64) banner crop -- expect further tweaks once Yuki compares
// these live rather than the raw source art.
const BOSS_ART_POSITION: Record<string, string> = {
  스우: "50% 25%", 데미안: "42% 50%", 루시드: "50% 43%", 윌: "68% 61%", 더스크: "50% 53%",
  "진 힐라": "50% 23%", 듄켈: "48% 46%", "검은 마법사": "42% 19%", 세렌: "50% 33%",
  칼로스: "55% 60%", 대적자: "75% 29%", 흉성: "50% 26%", 카링: "50% 26%", 림보: "50% 58%",
  발드릭스: "50% 40%", 유피테르: "48% 25%", 가엔슬: "50% 51%", 카이: "50% 28%",
};

function bannerMaskStyle(): CSSProperties {
  return {
    position: "absolute", inset: 0,
    maskImage: "linear-gradient(to right, black 55%, transparent 100%)",
    WebkitMaskImage: "linear-gradient(to right, black 55%, transparent 100%)",
  };
}

const bannerScrimStyle: CSSProperties = {
  position: "absolute", inset: 0,
  background: "linear-gradient(90deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.1) 55%, transparent 80%)",
};

const bannerNameStyle: CSSProperties = {
  position: "absolute", left: 8, bottom: 6, fontSize: 12, fontWeight: 800, color: "#fff",
  textShadow: "0 1px 3px rgba(0,0,0,0.8)", maxWidth: BANNER_WIDTH - 16, whiteSpace: "nowrap",
  overflow: "hidden", textOverflow: "ellipsis",
};

// The Quick View row's "extended" boss art -- a wide slice of mob.png, faded to transparent on
// its right edge (bannerMaskStyle) instead of hard-cropped, so it blends into the row's own
// background rather than reading as an obviously-cropped rectangle. Same dual-render-with-refs
// fallback shape as FallbackSpriteIcon, just sized for a banner instead of a small icon.
function BossBanner({ theme, boss, iconId, displayName }: {
  theme: AppTheme; boss: string; iconId: string | undefined; displayName: string;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fallbackRef = useRef<HTMLDivElement>(null);
  const artPosition = BOSS_ART_POSITION[boss] ?? DEFAULT_ART_POSITION;
  const containerStyle: CSSProperties = {
    position: "relative", width: BANNER_WIDTH, height: BANNER_HEIGHT, borderRadius: 10,
    overflow: "hidden", flexShrink: 0, background: theme.bg,
  };
  const fallbackStyle: CSSProperties = {
    position: "absolute", inset: 0, display: iconId ? "none" : "flex",
    alignItems: "center", justifyContent: "center", background: theme.accentSoft,
  };
  return (
    <div style={containerStyle}>
      {iconId && (
        <div ref={wrapperRef} style={{ position: "absolute", inset: 0 }}>
          <div style={bannerMaskStyle()}>
            <Image
              src={bossSplashUrl(iconId)}
              alt=""
              fill
              unoptimized
              onError={() => {
                if (wrapperRef.current) wrapperRef.current.style.display = "none";
                if (fallbackRef.current) fallbackRef.current.style.display = "flex";
              }}
              style={{ objectFit: "cover", objectPosition: artPosition }}
            />
          </div>
          <div style={bannerScrimStyle} />
          <span style={bannerNameStyle}>{displayName}</span>
        </div>
      )}
      <div ref={fallbackRef} style={fallbackStyle}>
        <span style={{ fontSize: 13, fontWeight: 800, color: theme.accentText }}>{displayName}</span>
      </div>
    </div>
  );
}

// flexWrap so the chip column drops to its own full-width line below the banner once the row
// gets too narrow for both side by side (mobile) -- see the chip container's own flex-basis
// below, which is what actually triggers that wrap.
function rowStyle(theme: AppTheme, isLast: boolean): CSSProperties {
  return {
    display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, width: "100%",
    background: "none", border: "none", padding: "8px 4px", font: "inherit", textAlign: "left",
    cursor: "pointer", borderBottom: isLast ? "none" : `1px solid ${theme.border}`,
  };
}

type BossEntryList = [string, BossCutEntry[]];

/** One boss+difficulty tile's computed result, or null if computeBossClear couldn't produce one
 *  (missing formula fields) -- filtered out before rendering either view. */
function relevantTiles(entries: BossCutEntry[], level: number, arcaneForce: number, authenticForce: number, inputs: NonNullable<ScouterResultEntry["bossClearInputs"]>, showAll: boolean) {
  const sorted = [...entries].sort((a, b) => (DIFFICULTY_ORDER[a.difficulty] ?? 99) - (DIFFICULTY_ORDER[b.difficulty] ?? 99));
  return sorted
    .map((entry) => ({ entry, result: computeBossClear(entry, level, arcaneForce, authenticForce, inputs) }))
    .filter((t): t is { entry: BossCutEntry; result: BossClearResult } => t.result !== null)
    .filter((t) => showAll || isRelevant(t.result.clearRate, t.result.isPartyBoss, t.result.partyLimit));
}

// Status-colored TEXT on a neutral card (statusText), not a filled/saturated pill -- matches
// the "info" tier (colorTier "primary", the borderline-solo-pass tier) to theme.accentText since
// statusText only covers success/danger/warning.
function chipTagColor(theme: AppTheme, status: PillStatus): string {
  if (status === "success") return statusText(theme, "success");
  if (status === "warning") return statusText(theme, "warning");
  if (status === "info") return theme.accentText;
  return theme.muted;
}

// Tag + % both visible without hovering (per Yuki's friend's ask -- MapleScouter users expect
// both at a glance), hover expands into the adjusted stat + damage-loss factor that used to be
// Spotlight-only. A small neutral card (icon + stacked text) instead of the old saturated pill.
function DifficultyChip({ theme, iconId, displayName, entry, result }: {
  theme: AppTheme; iconId: string | undefined; displayName: string; entry: BossCutEntry; result: BossClearResult;
}) {
  const tagColor = chipTagColor(theme, pillStatus(result.colorTier));
  const loss = dominantLossLabel(result);
  return (
    <HoverTooltip
      theme={theme}
      label={<>{entry.difficulty}: {result.clearRatePercent.toFixed(2)}%<br />Adjusted {formatFigure(result.bossStat)}{loss && <><br />{loss}</>}</>}
    >
      {/* Fixed width so every chip lines up evenly instead of sizing to its own tag text.
          118px is measured, not guessed: "Needs Party" (the longest of TAG_TRANSLATIONS'
          English strings) is 70px of text at this 12px font (React-Doctor's sub-12px-text
          rule floor, not a design choice), +28 icon +6 gap +12 padding +2 border = 118px
          exact fit. Don't shrink further without re-measuring. */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, width: 118, padding: "4px 8px 4px 4px", borderRadius: 10, background: theme.bg, border: `1px solid ${theme.border}`, boxSizing: "border-box" }}>
        <FallbackSpriteIcon theme={theme} src={iconId ? difficultyImageUrl(iconId, entry.difficulty) : undefined} size={28} displayName={displayName} />
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25, minWidth: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: tagColor, opacity: result.colorTier === "red" ? 0.7 : 1 }}>
            {pillLabel(result.colorTier, result.tagEnglish)}
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: theme.muted }}>{result.clearRatePercent.toFixed(1)}%</span>
        </div>
      </div>
    </HoverTooltip>
  );
}

function BossQuickViewRow({
  theme, boss, entries, level, arcaneForce, authenticForce, inputs, showAll, isLast, onSelect,
}: {
  theme: AppTheme; boss: string; entries: BossCutEntry[]; level: number; arcaneForce: number;
  authenticForce: number; inputs: NonNullable<ScouterResultEntry["bossClearInputs"]>;
  showAll: boolean; isLast: boolean; onSelect: (boss: string) => void;
}) {
  const tiles = relevantTiles(entries, level, arcaneForce, authenticForce, inputs, showAll);
  if (tiles.length === 0) return null;

  const iconId = BOSS_ICON_ID[boss];
  const displayName = BOSS_DISPLAY_NAME[boss] ?? boss;

  return (
    <button type="button" className="boss-quick-row" style={rowStyle(theme, isLast)} onClick={() => onSelect(boss)}>
      <BossBanner theme={theme} boss={boss} iconId={iconId} displayName={displayName} />
      <div className="boss-quick-chip-grid" style={{ display: "flex", flexWrap: "wrap", gap: 6, flex: "1 1 200px", minWidth: 0 }}>
        {tiles.map(({ entry, result }) => (
          <DifficultyChip key={entry.difficulty} theme={theme} iconId={iconId} displayName={displayName} entry={entry} result={result} />
        ))}
      </div>
    </button>
  );
}

function PowerStripItem({ theme, label, value, sub }: { theme: AppTheme; label: string; value: number; sub?: number }) {
  const content = (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: theme.muted }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 800, color: theme.text, fontFamily: "var(--font-heading)" }}>{formatFigure(value)}</span>
    </div>
  );
  if (sub === undefined) return content;
  return <HoverTooltip theme={theme} label={`Normal: ${formatFigure(sub)}`}>{content}</HoverTooltip>;
}

// The old ScouterSummaryView's 3 StatBlocks, collapsed into one compact strip that sits above
// the boss table instead of behind a separate page -- these are the raw power figures that feed
// every row below it, so they read as this view's header now instead of an unrelated sibling.
function PowerStrip({ theme, entry }: { theme: AppTheme; entry: ScouterResultEntry }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 16, padding: "10px 14px", background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 12 }}>
      <PowerStripItem theme={theme} label="Boss 300" value={entry.boss300Hexa} sub={entry.boss300Normal} />
      <PowerStripItem theme={theme} label="Boss 380" value={entry.boss380Hexa} sub={entry.boss380Normal} />
      <PowerStripItem theme={theme} label="Converted" value={entry.convertedPowerHexa} sub={entry.convertedPowerNormal} />
      <PowerStripItem theme={theme} label="Dojo" value={entry.dojoPower} />
    </div>
  );
}

function BossPicker({ theme, grouped, onSelectBoss }: {
  theme: AppTheme; grouped: BossEntryList[]; onSelectBoss: (boss: string) => void;
}) {
  const { selectStyle } = toolStyles(theme);
  return (
    <select
      className="tool-select"
      style={{ ...selectStyle, maxWidth: 180 }}
      value=""
      aria-label="Jump to boss"
      onChange={(e) => { if (e.target.value) onSelectBoss(e.target.value); }}
    >
      <option value="">Jump to boss…</option>
      {grouped.map(([boss]) => (
        <option key={boss} value={boss}>{BOSS_DISPLAY_NAME[boss] ?? boss}</option>
      ))}
    </select>
  );
}

function BossQuickView({
  theme, entry, grouped, showAll, onShowAllChange, level, arcaneForce, authenticForce, inputs, onSelectBoss,
}: {
  theme: AppTheme; entry: ScouterResultEntry; grouped: BossEntryList[]; showAll: boolean;
  onShowAllChange: (v: boolean) => void; level: number; arcaneForce: number; authenticForce: number;
  inputs: NonNullable<ScouterResultEntry["bossClearInputs"]>; onSelectBoss: (boss: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <PowerStrip theme={theme} entry={entry} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <Toggle theme={theme} label="Show all bosses" checked={showAll} onChange={onShowAllChange} />
        <BossPicker theme={theme} grouped={grouped} onSelectBoss={onSelectBoss} />
      </div>
      <div className="boss-quick-row-list" style={{ display: "flex", flexDirection: "column" }}>
        {grouped.map(([boss, entries], i) => (
          <BossQuickViewRow
            key={boss}
            theme={theme}
            boss={boss}
            entries={entries}
            level={level}
            arcaneForce={arcaneForce}
            authenticForce={authenticForce}
            inputs={inputs}
            showAll={showAll}
            isLast={i === grouped.length - 1}
            onSelect={onSelectBoss}
          />
        ))}
      </div>
      <span style={{ fontSize: 12, color: theme.muted, textAlign: "right" }}>Data as of {BOSSCUT_SCRAPED_AT}</span>
    </div>
  );
}

const SPOTLIGHT_HEIGHT = 260;

function spotlightMaskStyle(): CSSProperties {
  return {
    position: "absolute", inset: 0,
    maskImage: "radial-gradient(ellipse 90% 75% at 50% 30%, black 45%, transparent 95%)",
    WebkitMaskImage: "radial-gradient(ellipse 90% 75% at 50% 30%, black 45%, transparent 95%)",
  };
}

function NavArrowButton({ theme, direction, disabled, onClick }: {
  theme: AppTheme; direction: "prev" | "next"; disabled: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="tap-target-44"
      aria-label={direction === "prev" ? "Previous boss" : "Next boss"}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32,
        borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.bg,
        color: theme.text, opacity: disabled ? 0.4 : 1, cursor: disabled ? "default" : "pointer",
        fontSize: 16, fontWeight: 800,
      }}
    >
      {direction === "prev" ? "‹" : "›"}
    </button>
  );
}

/** The lowest of the 3 gap multipliers, if it's actually costing damage (< 1) -- surfaces WHICH
 *  of level/arcane/authentic is the limiting factor on this specific boss, not just the combined
 *  clear%. Part of the task-5 data exposure -- see bossClearFormula.ts's BossClearResult doc. */
function dominantLossLabel(result: BossClearResult): string | null {
  const gaps: [string, number][] = [
    ["Level", result.levelGapDmg], ["Arcane", result.arcaneGapDmg], ["Authentic", result.authenticGapDmg],
  ];
  const worst = gaps.reduce((a, b) => (b[1] < a[1] ? b : a), gaps[0]);
  return worst[1] < 1 ? `${worst[0]} -${Math.round((1 - worst[1]) * 100)}%` : null;
}

function SpotlightTile({ theme, iconId, displayName, entry, result }: {
  theme: AppTheme; iconId: string | undefined; displayName: string; entry: BossCutEntry; result: BossClearResult;
}) {
  const loss = dominantLossLabel(result);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: `${theme.bg}dd`, borderRadius: 10, padding: "6px 10px" }}>
      <FallbackSpriteIcon theme={theme} src={iconId ? difficultyImageUrl(iconId, entry.difficulty) : undefined} size={32} displayName={displayName} />
      <span style={{ fontSize: 12, fontWeight: 700, color: theme.text, minWidth: 52 }}>{entry.difficulty}</span>
      <span style={pillStyle(theme, pillStatus(result.colorTier), result.colorTier === "red")}>
        {pillLabel(result.colorTier, result.tagEnglish)}
      </span>
      <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>{result.clearRatePercent.toFixed(2)}%</span>
      <span style={{ marginLeft: "auto", fontSize: 12, color: theme.muted, textAlign: "right" }}>
        Adjusted {formatFigure(result.bossStat)}
        {loss && <><br /><span style={{ color: statusText(theme, "warning") }}>{loss}</span></>}
      </span>
    </div>
  );
}

// Full-bleed backdrop version of BossBanner's fade trick -- a radial mask (same shape as the
// Bio bookmark's ClassPortrait fade) instead of a linear one, since this backdrop has content
// overlaid on all sides rather than just needing to fade into whatever sits to its right.
function BossSpotlight({
  theme, grouped, selectedIndex, onNavigate, level, arcaneForce, authenticForce, inputs, showAll,
}: {
  theme: AppTheme; grouped: BossEntryList[]; selectedIndex: number; onNavigate: (i: number) => void;
  level: number; arcaneForce: number; authenticForce: number;
  inputs: NonNullable<ScouterResultEntry["bossClearInputs"]>; showAll: boolean;
}) {
  const [boss, entries] = grouped[selectedIndex];
  const iconId = BOSS_ICON_ID[boss];
  const displayName = BOSS_DISPLAY_NAME[boss] ?? boss;
  const artPosition = BOSS_ART_POSITION[boss] ?? DEFAULT_ART_POSITION;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fallbackRef = useRef<HTMLDivElement>(null);
  const tiles = relevantTiles(entries, level, arcaneForce, authenticForce, inputs, showAll);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <NavArrowButton theme={theme} direction="prev" disabled={selectedIndex === 0} onClick={() => onNavigate(selectedIndex - 1)} />
        <span style={{ fontSize: 12, color: theme.muted }}>{selectedIndex + 1} / {grouped.length}</span>
        <NavArrowButton theme={theme} direction="next" disabled={selectedIndex === grouped.length - 1} onClick={() => onNavigate(selectedIndex + 1)} />
      </div>
      <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", minHeight: SPOTLIGHT_HEIGHT, background: theme.panel }}>
        {iconId && (
          <div ref={wrapperRef} style={spotlightMaskStyle()}>
            <Image
              src={bossSplashUrl(iconId)}
              alt=""
              fill
              unoptimized
              onError={() => {
                if (wrapperRef.current) wrapperRef.current.style.display = "none";
                if (fallbackRef.current) fallbackRef.current.style.display = "flex";
              }}
              style={{ objectFit: "cover", objectPosition: artPosition }}
            />
          </div>
        )}
        <div
          ref={fallbackRef}
          style={{ position: "absolute", inset: 0, display: iconId ? "none" : "flex", alignItems: "center", justifyContent: "center", background: theme.accentSoft }}
        >
          <span style={{ fontSize: 40, fontWeight: 800, color: theme.accentText }}>{displayName.charAt(0)}</span>
        </div>
        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 8, padding: "1rem", minHeight: SPOTLIGHT_HEIGHT, justifyContent: "flex-end" }}>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>{displayName}</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {tiles.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>No relevant difficulties right now.</p>
            ) : (
              tiles.map(({ entry, result }) => (
                <SpotlightTile key={entry.difficulty} theme={theme} iconId={iconId} displayName={displayName} entry={entry} result={result} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function groupByBoss(entries: BossCutEntry[]): BossEntryList[] {
  const byBoss = new Map<string, BossCutEntry[]>();
  for (const e of entries) {
    const list = byBoss.get(e.boss);
    if (list) list.push(e);
    else byBoss.set(e.boss, [e]);
  }
  // Highest level requirement first (Yuki's preference), tie-broken by each boss's HIGHEST
  // tier (e.g. Lotus's 210 floor ties Damien's, but Lotus also has a 285 Extreme tier Damien
  // has no equivalent for, so Lotus ranks above it -- this is "how hard does it get," not
  // "when do you unlock it") rather than falling back to the scraper's own arbitrary array
  // order. Both Quick View and Spotlight share this order.
  return [...byBoss.entries()].sort(([, a], [, b]) => {
    const minDiff = Math.min(...b.map((e) => e.level)) - Math.min(...a.map((e) => e.level));
    return minDiff !== 0 ? minDiff : Math.max(...b.map((e) => e.level)) - Math.max(...a.map((e) => e.level));
  });
}

export type ScouterBookmarkView = "quickView" | "spotlight";

/** Renders once BossClearGrid confirms bossClearInputs exists -- kept as a separate component
 *  so that null-check lives at the call site, not scattered through every sub-view. Owns both
 *  swappable sub-views (Quick View table / Spotlight card) internally, same stacked-grid-cell
 *  shape as every other multi-sub-view bookmark (see CharacterSetupFlow.styles.ts's
 *  .bookmark-subview comment) -- ScouterBookmark just passes view/onViewChange through. */
export default function BossClearGrid({ theme, character, entry, view, onViewChange }: {
  theme: AppTheme;
  character: StoredCharacterRecord;
  entry: ScouterResultEntry;
  view: ScouterBookmarkView;
  onViewChange: (v: ScouterBookmarkView) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputs = entry.bossClearInputs;

  if (!inputs) {
    return (
      <p style={{ margin: 0, fontSize: "0.8rem", color: theme.muted, textAlign: "center", padding: "2rem 0" }}>
        Boss Clear data isn&apos;t available yet -- refresh the Scouter figure on Overview to compute it.
      </p>
    );
  }

  const arcaneForce = Number(character.stats.arcanePower) || 0;
  const authenticForce = Number(character.stats.sacredPower) || 0;
  const grouped = groupByBoss(BOSSCUT_DATA);
  const clampedIndex = Math.min(selectedIndex, grouped.length - 1);

  const handleSelectBoss = (boss: string) => {
    const idx = grouped.findIndex(([b]) => b === boss);
    if (idx >= 0) setSelectedIndex(idx);
    onViewChange("spotlight");
  };

  return (
    <div style={{ display: "grid" }}>
      <div className={`bookmark-subview${view === "quickView" ? " bookmark-subview-active" : ""}`} style={{ gridArea: "1 / 1", visibility: view === "quickView" ? "visible" : "hidden" }}>
        <BossQuickView
          theme={theme}
          entry={entry}
          grouped={grouped}
          showAll={showAll}
          onShowAllChange={setShowAll}
          level={character.level}
          arcaneForce={arcaneForce}
          authenticForce={authenticForce}
          inputs={inputs}
          onSelectBoss={handleSelectBoss}
        />
      </div>
      <div className={`bookmark-subview${view === "spotlight" ? " bookmark-subview-active" : ""}`} style={{ gridArea: "1 / 1", visibility: view === "spotlight" ? "visible" : "hidden" }}>
        <BossSpotlight
          theme={theme}
          grouped={grouped}
          selectedIndex={clampedIndex}
          onNavigate={setSelectedIndex}
          level={character.level}
          arcaneForce={arcaneForce}
          authenticForce={authenticForce}
          inputs={inputs}
          showAll={showAll}
        />
      </div>
    </div>
  );
}
