"use client";

import { useState, type CSSProperties } from "react";
import ModalShell from "../../../../components/ModalShell";
import { dialogBtnColors, dialogPrimaryBtnColors, type AppTheme } from "../../../../components/themes";
import type { StoredCharacterRecord } from "../../model/charactersStore";
import { toCharacterKey } from "../../model/characterKeys";
import { resolveDisplayJobName } from "../../setup/data/nexonJobMapping";
import { CHARACTERS_COPY } from "../content";
import CharacterAvatar from "../components/CharacterAvatar";

function rowStyle(theme: AppTheme, active: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: "0.6rem",
    width: "100%",
    padding: "0.5rem 0.6rem",
    borderRadius: "10px",
    border: `1px solid ${active ? theme.accent : theme.border}`,
    background: active ? theme.accentSoft : theme.bg,
    fontFamily: "inherit",
    textAlign: "left",
    cursor: "pointer",
  };
}

export default function ChampionSwapDialog({
  theme,
  champions,
  onClose,
  onConfirm,
}: {
  theme: AppTheme;
  champions: StoredCharacterRecord[];
  onClose: () => void;
  onConfirm: (swapOutKey: string) => void;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  return (
    <ModalShell
      theme={theme}
      ariaLabel="Choose a champion to swap out"
      onClose={onClose}
      style={{ width: "min(420px, 100%)", maxHeight: "85vh", overflow: "hidden", display: "flex", flexDirection: "column" }}
    >
      <div style={{ padding: "1rem 1.1rem 0.75rem", borderBottom: `1px solid ${theme.border}` }}>
        <span className="panel-header-title" style={{ color: theme.text, fontSize: "1.05rem" }}>
          {CHARACTERS_COPY.championSwap.title}
        </span>
        <div style={{ fontSize: "0.78rem", color: theme.muted, fontWeight: 600, marginTop: 4 }}>
          {CHARACTERS_COPY.championSwap.subtitle}
        </div>
      </div>

      <div style={{ padding: "0.75rem 1.1rem", overflowY: "auto", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {champions.map((champion) => {
          const key = toCharacterKey(champion);
          return (
            <button
              key={key}
              type="button"
              aria-pressed={selectedKey === key}
              onClick={() => setSelectedKey(key)}
              style={rowStyle(theme, selectedKey === key)}
            >
              <CharacterAvatar
                src={champion.characterImgURL}
                alt=""
                width={36}
                height={36}
                style={{ display: "block", borderRadius: "8px", objectFit: "contain", objectPosition: "center bottom", flexShrink: 0 }}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: "0.84rem", color: theme.text }}>{champion.characterName}</div>
                <div style={{ fontSize: "0.78rem", fontWeight: 600, color: theme.muted }}>
                  {resolveDisplayJobName(champion.jobName)} · Lv. {champion.level}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.55rem", padding: "0.8rem 1.1rem", borderTop: `1px solid ${theme.border}` }}>
        <button type="button" onClick={onClose} className="tool-btn tool-dialog-btn" style={dialogBtnColors(theme)}>
          {CHARACTERS_COPY.championSwap.cancelButton}
        </button>
        <button
          type="button"
          disabled={!selectedKey}
          onClick={() => selectedKey && onConfirm(selectedKey)}
          className="tool-btn tool-dialog-btn"
          style={{ ...dialogPrimaryBtnColors(theme), opacity: selectedKey ? 1 : 0.5, cursor: selectedKey ? "pointer" : "not-allowed" }}
        >
          {CHARACTERS_COPY.championSwap.confirmButton}
        </button>
      </div>
    </ModalShell>
  );
}
