"use client";

import Image from "next/image";
import { useRef, useState, type CSSProperties } from "react";
import type { AppTheme } from "../../../components/themes";
import { STATUS } from "../../../components/statusColors";
import { bossIconUrl } from "../../../lib/mapleResource";
import HoverTooltip from "../../../components/HoverTooltip";
import { Toggle } from "../../tools/shared-ui";
import type { StoredCharacterRecord } from "../model/charactersStore";
import { BOSSCUT_DATA, BOSSCUT_SCRAPED_AT, type BossCutEntry } from "./bosscut-data.generated";
import { computeBossClear, type ClearColorTier } from "./bossClearFormula";
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

const BOSS_ICON_SIZE = 28;

// Dual-render with refs (display:none on the fallback, swap via onError) rather than useState,
// per root CLAUDE.md's React-Doctor Rules -- same pattern as this screen's own WorldIcon.
// Covers both a real load failure AND a boss with no confirmed icon id at all (BOSS_ICON_ID
// missing an entry) by simply never mounting the Image in the latter case.
function BossIcon({ theme, iconId, displayName }: { theme: AppTheme; iconId: string | undefined; displayName: string }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fallbackRef = useRef<HTMLDivElement>(null);
  const fallbackStyle: CSSProperties = {
    width: BOSS_ICON_SIZE, height: BOSS_ICON_SIZE, borderRadius: 6, background: theme.accentSoft,
    display: iconId ? "none" : "flex", alignItems: "center", justifyContent: "center",
    fontSize: "0.7rem", fontWeight: 800, color: theme.accentText, flexShrink: 0,
  };
  return (
    <>
      {iconId && (
        <div ref={wrapperRef} style={{ width: BOSS_ICON_SIZE, height: BOSS_ICON_SIZE, flexShrink: 0 }}>
          <Image
            src={bossIconUrl(iconId)}
            alt=""
            width={BOSS_ICON_SIZE}
            height={BOSS_ICON_SIZE}
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

function BossClearCard({
  theme, boss, entries, level, arcaneForce, authenticForce, inputs, showAll,
}: {
  theme: AppTheme;
  boss: string;
  entries: BossCutEntry[];
  level: number;
  arcaneForce: number;
  authenticForce: number;
  inputs: NonNullable<ScouterResultEntry["bossClearInputs"]>;
  showAll: boolean;
}) {
  const sorted = [...entries].sort((a, b) => (DIFFICULTY_ORDER[a.difficulty] ?? 99) - (DIFFICULTY_ORDER[b.difficulty] ?? 99));
  const tiles = sorted
    .map((entry) => ({ entry, result: computeBossClear(entry, level, arcaneForce, authenticForce, inputs) }))
    .filter((t): t is { entry: BossCutEntry; result: NonNullable<typeof t.result> } => t.result !== null)
    .filter((t) => showAll || isRelevant(t.result.clearRate, t.result.isPartyBoss, t.result.partyLimit));

  if (tiles.length === 0) return null;

  const iconId = BOSS_ICON_ID[boss];
  const displayName = BOSS_DISPLAY_NAME[boss] ?? boss;

  return (
    <div style={{ background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 12, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <BossIcon theme={theme} iconId={iconId} displayName={displayName} />
        <span style={{ fontSize: "0.85rem", fontWeight: 800, color: theme.text }}>{displayName}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {tiles.map(({ entry, result }) => (
          <HoverTooltip key={entry.difficulty} theme={theme} label={`${entry.difficulty}: ${result.clearRatePercent.toFixed(2)}%`}>
            <span style={pillStyle(theme, pillStatus(result.colorTier), result.colorTier === "red")}>
              {entry.difficulty} · {pillLabel(result.colorTier, result.tagEnglish)}
            </span>
          </HoverTooltip>
        ))}
      </div>
    </div>
  );
}

function groupByBoss(entries: BossCutEntry[]): [string, BossCutEntry[]][] {
  const byBoss = new Map<string, BossCutEntry[]>();
  for (const e of entries) {
    const list = byBoss.get(e.boss);
    if (list) list.push(e);
    else byBoss.set(e.boss, [e]);
  }
  // Lowest-level difficulty first so the card grid roughly follows game progression rather
  // than the scraper's own (arbitrary) array order.
  return [...byBoss.entries()].sort(([, a], [, b]) => Math.min(...a.map((e) => e.level)) - Math.min(...b.map((e) => e.level)));
}

/** Renders once BossClearGrid confirms bossClearInputs exists -- kept as a separate component
 *  so that null-check lives at the call site, not scattered through every card. */
export default function BossClearGrid({ theme, character, entry }: {
  theme: AppTheme;
  character: StoredCharacterRecord;
  entry: ScouterResultEntry;
}) {
  const [showAll, setShowAll] = useState(false);
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Toggle theme={theme} label="Show all bosses" checked={showAll} onChange={setShowAll} />
        <span style={{ fontSize: 11, color: theme.muted }}>Data as of {BOSSCUT_SCRAPED_AT}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
        {grouped.map(([boss, entries]) => (
          <BossClearCard
            key={boss}
            theme={theme}
            boss={boss}
            entries={entries}
            level={character.level}
            arcaneForce={arcaneForce}
            authenticForce={authenticForce}
            inputs={inputs}
            showAll={showAll}
          />
        ))}
      </div>
    </div>
  );
}
