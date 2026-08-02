"use client";

import { useState, type CSSProperties } from "react";
import ModalShell from "../../../../components/ModalShell";
import { dialogBtnColors, dialogPrimaryBtnColors, type AppTheme } from "../../../../components/themes";
import {
  IMPORT_SECTION_DEFS,
  type ImportSectionId,
  type StoredCharacterRecord,
} from "../../model/charactersStore";
import { CHARACTERS_COPY } from "../content";

type Choice = "mine" | "imported";

function rowStyle(theme: AppTheme, isLast: boolean): CSSProperties {
  return {
    gap: "0.4rem",
    padding: "0.55rem 0",
    borderBottom: isLast ? "none" : `1px solid ${theme.border}`,
  };
}

function pillStyle(theme: AppTheme, active: boolean): CSSProperties {
  return {
    border: `1px solid ${active ? theme.accent : theme.border}`,
    borderRadius: "999px",
    background: active ? theme.accentSoft : theme.bg,
    color: theme.text,
    fontFamily: "inherit",
    fontWeight: 700,
    fontSize: "0.78rem",
    padding: "0.35rem 0.7rem",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

function ChoiceRow({
  theme,
  label,
  value,
  onChange,
  isLast,
}: {
  theme: AppTheme;
  label: string;
  value: Choice;
  onChange: (next: Choice) => void;
  isLast: boolean;
}) {
  return (
    <div className="import-conflict-row" style={rowStyle(theme, isLast)}>
      <span style={{ fontWeight: 700, fontSize: "0.82rem", color: theme.text }}>{label}</span>
      <div className="import-conflict-pills" style={{ display: "flex", gap: "0.4rem" }}>
        <button
          type="button"
          aria-pressed={value === "mine"}
          onClick={() => onChange("mine")}
          style={pillStyle(theme, value === "mine")}
        >
          {CHARACTERS_COPY.importConflict.keepMine}
        </button>
        <button
          type="button"
          aria-pressed={value === "imported"}
          onClick={() => onChange("imported")}
          style={pillStyle(theme, value === "imported")}
        >
          {CHARACTERS_COPY.importConflict.useImported}
        </button>
      </div>
    </div>
  );
}

function initialChoices(): Record<ImportSectionId, Choice> {
  return IMPORT_SECTION_DEFS.reduce((acc, section) => {
    acc[section.id] = "mine";
    return acc;
  }, {} as Record<ImportSectionId, Choice>);
}

export default function ImportConflictDialog({
  theme,
  existing,
  onClose,
  onConfirm,
}: {
  theme: AppTheme;
  existing: StoredCharacterRecord;
  onClose: () => void;
  onConfirm: (choices: Record<ImportSectionId, Choice>) => void;
}) {
  const [choices, setChoices] = useState<Record<ImportSectionId, Choice>>(initialChoices);

  return (
    <ModalShell
      theme={theme}
      ariaLabel="Resolve character import conflict"
      onClose={onClose}
      style={{ width: "min(480px, 100%)", maxHeight: "85vh", overflow: "hidden", display: "flex", flexDirection: "column" }}
    >
      <style>{`
        .import-conflict-row { display: flex; flex-direction: column; align-items: flex-start; }
        .import-conflict-pills { width: 100%; }
        .import-conflict-pills button { flex: 1; }
        @media (min-width: 420px) {
          .import-conflict-row { flex-direction: row; align-items: center; justify-content: space-between; }
          .import-conflict-pills { width: auto; }
          .import-conflict-pills button { flex: none; }
        }
      `}</style>
      <div style={{ padding: "1rem 1.1rem 0.75rem", borderBottom: `1px solid ${theme.border}` }}>
        <span className="panel-header-title" style={{ color: theme.text, fontSize: "1.05rem" }}>
          {existing.characterName} {CHARACTERS_COPY.importConflict.titleSuffix}
        </span>
        <div style={{ fontSize: "0.78rem", color: theme.muted, fontWeight: 600, marginTop: 4 }}>
          {CHARACTERS_COPY.importConflict.subtitle}
        </div>
      </div>

      <div style={{ padding: "0.2rem 1.1rem", overflowY: "auto", flex: 1, minHeight: 0 }}>
        {IMPORT_SECTION_DEFS.map((section, index) => (
          <ChoiceRow
            key={section.id}
            theme={theme}
            label={section.label}
            value={choices[section.id]}
            onChange={(next) => setChoices((prev) => ({ ...prev, [section.id]: next }))}
            isLast={index === IMPORT_SECTION_DEFS.length - 1}
          />
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.55rem", padding: "0.8rem 1.1rem", borderTop: `1px solid ${theme.border}` }}>
        <button type="button" onClick={onClose} className="tool-btn tool-dialog-btn" style={dialogBtnColors(theme)}>
          {CHARACTERS_COPY.importConflict.cancelButton}
        </button>
        <button
          type="button"
          onClick={() => onConfirm(choices)}
          className="tool-btn tool-dialog-btn"
          style={dialogPrimaryBtnColors(theme)}
        >
          {CHARACTERS_COPY.importConflict.confirmButton}
        </button>
      </div>
    </ModalShell>
  );
}
