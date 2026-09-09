"use client";

import { useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import type { AppTheme } from "../../../../components/themes";
import { statusText } from "../../../../components/statusColors";
import {
  parseMapleScouterExport,
  type MapleScouterImportError,
  type MapleScouterImportResult,
} from "../data/maplescouterImportData";
import SetupStepFrame from "./SetupStepFrame";

interface MapleScouterImportStepProps {
  theme: AppTheme;
  stepNumber: number;
  totalSteps: number;
  jobName?: string;
  characterLevel?: number;
  /** The uploaded file's JSON text, persisted as this step's draft so a resumed setup can
   *  re-parse it. The player never sees or edits this directly -- they upload a file. */
  value: string;
  onChange: (value: string) => void;
  onBack: () => void;
  onNext: () => void;
  onFinish: () => void;
  /** Applies a successfully parsed export to the other steps' drafts (Phase 2 wires the
   *  real mapping). */
  onImport?: (result: MapleScouterImportResult) => void;
}

function errorMessage(error: MapleScouterImportError, className: string | undefined): string {
  switch (error) {
    case "not-json":
      return "That file isn't valid JSON. Upload the .json file MapleScouter downloaded, without editing it.";
    case "wrong-file-type":
      return "That's not a MapleScouter character preset file. Use the file you get from Save Preset on MapleScouter.";
    case "no-data":
      return "This file is missing its character data. Try exporting again from MapleScouter.";
    case "unknown-class":
      return className
        ? `MapleDoro doesn't recognize the class "${className}" in this file.`
        : "MapleDoro doesn't recognize the class in this file.";
    case "class-mismatch":
      return className
        ? `This is a ${className} preset, but you're setting up a different class.`
        : "This preset is for a different class than the character you're setting up.";
  }
}

const MAPLESCOUTER_INPUT_URL = "https://maplescouter.com/en/input";

/** Matches MapleScouter's own "Save Preset" button icon: a down arrow above an
 *  open-topped tray. */
function SavePresetIcon({ color }: { color: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block" }}>
      <path d="M12 3v10" />
      <path d="m8 9 4 4 4-4" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

/** Matches MapleScouter's per-preset "export to file" icon: a document with a folded
 *  top-right corner and a down arrow inside its body. */
function ExportPresetIcon({ color }: { color: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block" }}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M12 11v6" />
      <path d="m9 14 3 3 3-3" />
    </svg>
  );
}

const labelStyle = (theme: AppTheme): CSSProperties => ({
  margin: "0 0 0.4rem",
  fontSize: "0.75rem",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: theme.muted,
});

const howToBoxStyle = (theme: AppTheme): CSSProperties => ({
  border: `1px solid ${theme.border}`,
  borderRadius: 10,
  padding: "0.8rem 1rem",
  background: theme.panel,
});

/** Inline "button chip" that mimics one of MapleScouter's own UI controls, so the
 *  instruction text points at something the player can recognize by shape. */
function UiChip({ theme, label, icon }: { theme: AppTheme; label?: string; icon: ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.3rem",
        border: `1px solid ${theme.border}`,
        borderRadius: 6,
        padding: label ? "0.15rem 0.4rem" : "0.15rem 0.3rem",
        background: theme.bg,
        fontSize: "0.75rem",
        fontWeight: 700,
        lineHeight: 1,
        color: theme.text,
        verticalAlign: "middle",
      }}
    >
      {label}
      {icon}
    </span>
  );
}

function dropZoneBorderColor(theme: AppTheme, dragging: boolean, hasError: boolean): string {
  if (dragging) return theme.accent;
  if (hasError) return statusText(theme, "danger");
  return theme.border;
}

const dropZoneStyle = (theme: AppTheme, dragging: boolean, hasError: boolean): CSSProperties => ({
  border: `1.5px dashed ${dropZoneBorderColor(theme, dragging, hasError)}`,
  borderRadius: 12,
  padding: "1.4rem 1rem",
  background: dragging ? theme.accentSoft : "transparent",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "0.6rem",
  textAlign: "center",
  transition: "border-color 0.15s ease, background 0.15s ease",
});

const pickButtonStyle = (theme: AppTheme): CSSProperties => ({
  border: "none",
  borderRadius: 8,
  background: theme.accent,
  color: theme.accentOn,
  fontFamily: "inherit",
  fontWeight: 800,
  fontSize: "0.8rem",
  padding: "0.5rem 1rem",
  cursor: "pointer",
});

const applyButtonStyle = (theme: AppTheme): CSSProperties => ({
  border: "none",
  borderRadius: 8,
  background: theme.accent,
  color: theme.accentOn,
  fontFamily: "inherit",
  fontWeight: 800,
  fontSize: "0.8rem",
  padding: "0.5rem 0.9rem",
  cursor: "pointer",
});

const changeFileButtonStyle = (theme: AppTheme): CSSProperties => ({
  background: "none",
  border: "none",
  padding: 0,
  font: "inherit",
  fontSize: "0.78rem",
  fontWeight: 700,
  color: theme.muted,
  textDecoration: "underline",
  textUnderlineOffset: "2px",
  cursor: "pointer",
});

const summaryCardStyle = (theme: AppTheme): CSSProperties => ({
  border: `1px solid ${theme.border}`,
  borderRadius: 10,
  padding: "0.9rem 1rem",
  background: theme.panel,
  display: "flex",
  flexDirection: "column",
  gap: "0.7rem",
});

const chipRowStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: "0.4rem" };

const warningNoticeStyle = (theme: AppTheme): CSSProperties => ({
  display: "flex",
  gap: "0.4rem",
  fontSize: "0.75rem",
  fontWeight: 700,
  lineHeight: 1.4,
  color: statusText(theme, "warning"),
  border: `1px solid ${statusText(theme, "warning")}44`,
  background: `${statusText(theme, "warning")}14`,
  borderRadius: 8,
  padding: "0.5rem 0.6rem",
});

function sectionChipStyle(theme: AppTheme, present: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.3rem",
    borderRadius: 999,
    padding: "0.2rem 0.6rem",
    fontSize: "0.75rem",
    fontWeight: 700,
    border: `1px solid ${present ? statusText(theme, "success") + "55" : theme.border}`,
    background: present ? statusText(theme, "success") + "18" : "transparent",
    color: present ? statusText(theme, "success") : theme.muted,
  };
}

export default function MapleScouterImportStep({
  theme, stepNumber, totalSteps, jobName = "", characterLevel, value, onChange, onBack, onNext, onFinish, onImport,
}: MapleScouterImportStepProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Re-parse a resumed draft's stored JSON once on mount so its summary card shows again
  // without re-uploading (the file name itself isn't persisted, only its contents).
  const [initialParse] = useState(() =>
    value.trim() ? parseMapleScouterExport(value.trim(), jobName, characterLevel) : null,
  );
  const [result, setResult] = useState<MapleScouterImportResult | null>(
    initialParse?.ok ? initialParse : null,
  );
  const [error, setError] = useState<MapleScouterImportError | null>(
    initialParse && !initialParse.ok ? initialParse.error : null,
  );
  const [errorClassName, setErrorClassName] = useState<string | undefined>(
    initialParse && !initialParse.ok ? initialParse.foundClassName : undefined,
  );
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [applied, setApplied] = useState(false);

  function ingestText(raw: string, name: string) {
    onChange(raw);
    setFileName(name);
    setApplied(false);
    const parsed = parseMapleScouterExport(raw.trim(), jobName, characterLevel);
    if (parsed.ok) {
      setResult(parsed);
      setError(null);
      setErrorClassName(undefined);
    } else {
      setResult(null);
      setError(parsed.error);
      setErrorClassName(parsed.foundClassName);
    }
  }

  async function readFile(file: File) {
    const text = await file.text();
    ingestText(text, file.name);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void readFile(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void readFile(file);
  }

  function handleApply() {
    if (!result) return;
    onImport?.(result);
    setApplied(true);
    onNext();
  }

  // A rejected file doesn't count as "have a file" -- the drop zone stays up so they can
  // try another, with the error shown inside it. Only a successful parse (result set)
  // swaps the drop zone out for the summary card.
  const showDropZone = result === null;

  return (
    <SetupStepFrame
      theme={theme}
      stepLabel="Import from MapleScouter"
      stepNumber={stepNumber}
      totalSteps={totalSteps}
      description="Optional. If you already saved a preset for this character on MapleScouter, upload its export file and the next steps will be pre-filled for you to double-check. Skip this to fill everything in yourself."
      onBack={onBack}
      onNext={onNext}
      onFinish={onFinish}
      nextLabel="Skip"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: 520 }}>
        <div style={howToBoxStyle(theme)}>
          <div style={{ ...labelStyle(theme), marginBottom: "0.5rem" }}>How to get the file</div>
          <ol style={{ margin: 0, paddingLeft: "1.1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <li style={{ fontSize: "0.8rem", color: theme.text, lineHeight: 1.5 }}>
              Go to{" "}
              <a
                href={MAPLESCOUTER_INPUT_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: theme.accent, fontWeight: 700, textDecoration: "none" }}
              >
                MapleScouter&apos;s Input page →
              </a>
            </li>
            <li style={{ fontSize: "0.8rem", color: theme.text, lineHeight: 1.5 }}>
              Click{" "}
              <UiChip theme={theme} label="Save Preset" icon={<SavePresetIcon color={theme.text} />} />
            </li>
            <li style={{ fontSize: "0.8rem", color: theme.text, lineHeight: 1.5 }}>
              Click the export icon{" "}
              <UiChip theme={theme} icon={<ExportPresetIcon color={theme.text} />} />
              {" "}for the preset that matches this character.
            </li>
          </ol>
        </div>

        {showDropZone && (
          <div
            style={dropZoneStyle(theme, dragging, error !== null)}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            {error ? (
              <>
                <p style={{ margin: 0, fontSize: "0.8rem", fontWeight: 700, color: statusText(theme, "danger") }}>
                  {errorMessage(error, errorClassName)}
                </p>
                <button type="button" onClick={() => fileInputRef.current?.click()} style={pickButtonStyle(theme)}>
                  Choose another file
                </button>
              </>
            ) : (
              <>
                <p style={{ margin: 0, fontSize: "0.82rem", fontWeight: 700, color: theme.muted }}>
                  Drop your <code style={{ fontSize: "0.78rem" }}>scouter-preset-....json</code> here
                </p>
                <button type="button" onClick={() => fileInputRef.current?.click()} style={pickButtonStyle(theme)}>
                  Choose file
                </button>
              </>
            )}
          </div>
        )}

        <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleFileChange} style={{ display: "none" }} />

        {result && (
          <div style={summaryCardStyle(theme)}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.6rem" }}>
              <div>
                <div style={{ fontSize: "0.95rem", fontWeight: 800, color: theme.text }}>
                  {result.className} &middot; Lv. {result.level}
                </div>
                {result.label && (
                  <div style={{ fontSize: "0.78rem", color: theme.muted, marginTop: "0.15rem" }}>
                    Preset: {result.label}{fileName ? ` (${fileName})` : ""}
                  </div>
                )}
              </div>
              <button type="button" onClick={() => fileInputRef.current?.click()} style={changeFileButtonStyle(theme)}>
                Choose a different file
              </button>
            </div>

            {result.warnings.map((w) => (
              <div key={w.id} style={warningNoticeStyle(theme)}>
                <span aria-hidden="true">⚠</span>
                <span>{w.message}</span>
              </div>
            ))}

            <div>
              <div style={{ ...labelStyle(theme), marginBottom: "0.35rem" }}>Found in this file</div>
              <div style={chipRowStyle}>
                {result.sections.map((s) => (
                  <span key={s.id} style={sectionChipStyle(theme, s.present)}>
                    {s.label}
                    {s.present && s.detail ? ` (${s.detail})` : ""}
                  </span>
                ))}
              </div>
            </div>

            <button type="button" onClick={handleApply} style={applyButtonStyle(theme)}>
              {applied ? "Applied" : "Use these values and continue"}
            </button>
          </div>
        )}
      </div>
    </SetupStepFrame>
  );
}
