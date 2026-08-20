"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import AppShell from "../../components/AppShell";
import type { AppTheme } from "../../components/themes";
import { ACCENT_THEMES, dialogBtnColors, dialogPrimaryBtnColors } from "../../components/themes";
import { useTheme } from "../../components/ThemeContext";
import { ConfirmButton } from "../../components/ConfirmButton";
import { SegmentedToggle } from "../../components/SegmentedToggle";
import { useMounted } from "../../lib/useMounted";
import {
  DRIVE_SYNC_STORAGE_KEY,
  connectDrive,
  disconnectDrive,
  driveSyncConfigured,
  getDriveBackupMeta,
  loadFromAppData,
  markDriveSynced,
  readDriveSyncState,
  saveToAppData,
} from "../../lib/driveSync";
import ConfirmModal from "../../components/ConfirmModal";
import ModalShell from "../../components/ModalShell";
import WarningIcon from "../../components/WarningIcon";
import { STATUS, statusText } from "../../components/statusColors";
import {
  CHARACTERS_STORE_STORAGE_KEY,
  parseCharactersStore,
  readCharactersStore,
  selectCharactersList,
} from "../../features/characters/model/charactersStore";

const COLOR_MODES = ["light", "dark"] as const;
const COLOR_MODE_LABELS = { light: "Light", dark: "Dark" } as const;

function hardReset() {
  const keys = Object.keys(localStorage).filter((k) => k.startsWith("mapledoro"));
  keys.forEach((k) => localStorage.removeItem(k));
  window.location.reload();
}

/* One backup payload for both the file export and the Drive backup, so a Drive
   restore behaves exactly like importing an exported file. The Drive-connection
   flag is the one exclusion: it is sync metadata, not save data, and a backup
   restored on another browser must not claim that browser is connected. */
function collectBackupData(): Record<string, string> {
  const data: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith("mapledoro") && key !== DRIVE_SYNC_STORAGE_KEY) {
      data[key] = localStorage.getItem(key) ?? "";
    }
  }
  return data;
}

/* Whole-payload reject, not a silent per-entry skip: collectBackupData can only
   ever produce mapledoro-prefixed string values, so anything else (a wrong key,
   a non-string value) means the payload was hand-edited or corrupted, not a
   real backup -- same "reject, don't quietly drop what's wrong" reasoning as
   world import's own cap/shape checks. */
function parseBackupEntries(data: unknown): [string, string][] | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const entries = Object.entries(data);
  const isValid = entries.every(([key, value]) => key.startsWith("mapledoro") && typeof value === "string");
  return isValid ? (entries as [string, string][]) : null;
}

function exportData() {
  const blob = new Blob([JSON.stringify(collectBackupData(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mapledoro-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------- Drive backup comparison (restore preview / overwrite guard) ---------- */

/* Drive stamps modifiedTime server-side while lastSyncedAt comes from this
   browser's clock, so "newer" needs slack for clock skew. A minute is far above
   real skew on a synced clock and far below the gaps that matter (a backup from
   another device's play session). */
const CLOCK_SLACK_MS = 60_000;

function formatSyncTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function countCharacters(count: number): string {
  return `${count} character${count === 1 ? "" : "s"}`;
}

/** Caps a roster list so a 40-character roster doesn't become a wall of names. */
function nameList(names: string[]): string {
  const MAX_NAMES = 6;
  if (names.length <= MAX_NAMES) return names.join(", ");
  return `${names.slice(0, MAX_NAMES).join(", ")} and ${names.length - MAX_NAMES} more`;
}

interface RestorePreview {
  entries: [string, string][];
  /** Drive's modifiedTime for the backup file. */
  savedAt: number | null;
  localNames: string[];
  /** null = the backup's character data couldn't be parsed (a different
   *  MapleDoro version), which the dialog says outright instead of showing 0. */
  backupNames: string[] | null;
}

/* The one content diff shown is the character roster, by name: that's the
   vocabulary players think in, and it answers "will I lose something?" exactly.
   Anything deeper -- which side of the SAME character is newer, tool blob diffs --
   the stores can't answer honestly (they don't timestamp their writes), so the
   dialog sticks to facts: counts, names, and the two exact times. */
function buildRestorePreview(entries: [string, string][], savedAt: number | null): RestorePreview {
  const rawBackupStore = entries.find(([key]) => key === CHARACTERS_STORE_STORAGE_KEY)?.[1];
  const backupStore = rawBackupStore == null ? null : parseCharactersStore(rawBackupStore);
  return {
    entries,
    savedAt,
    localNames: selectCharactersList(readCharactersStore()).map((c) => c.ign),
    backupNames:
      rawBackupStore == null
        ? [] // no characters key in the backup = a roster of zero, not a parse failure
        : backupStore && selectCharactersList(backupStore).map((c) => c.ign),
  };
}

/** What the savedAt / lastSyncedAt relationship means, in player terms. Both
 *  facts are exact (Drive's server clock vs this browser's own backup stamp);
 *  everything else stays out because the stores can't date their own changes. */
function restoreInterpretation(savedAt: number | null, lastSyncedAt: number | null): string | null {
  if (savedAt === null) return null;
  if (lastSyncedAt === null) {
    return "This browser hasn't backed up yet, so this backup came from another browser or device.";
  }
  if (savedAt > lastSyncedAt + CLOCK_SLACK_MS) {
    return "This backup is newer than this browser's last backup, so it likely holds progress from another device.";
  }
  return "This backup matches this browser's last backup. Restoring rolls back anything changed here since then.";
}

function overwriteWarningDescription(savedAt: number | null, lastSyncedAt: number | null): string {
  const savedPart = savedAt === null ? "The backup in your Drive" : `The backup in your Drive from ${formatSyncTime(savedAt)}`;
  const syncPart = lastSyncedAt === null
    ? "was made by another browser or device"
    : `is newer than this browser's last backup (${formatSyncTime(lastSyncedAt)})`;
  return `${savedPart} ${syncPart}, so it may hold progress this browser doesn't have.`;
}

function DriveRestoreModal({
  theme,
  preview,
  lastSyncedAt,
  onConfirm,
  onCancel,
}: {
  theme: AppTheme;
  preview: RestorePreview;
  lastSyncedAt: number | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const localSet = new Set(preview.localNames);
  const backupSet = preview.backupNames === null ? null : new Set(preview.backupNames);
  const gained = backupSet === null ? [] : [...backupSet].filter((name) => !localSet.has(name));
  const lost = backupSet === null ? [] : [...localSet].filter((name) => !backupSet.has(name));
  const interpretation = restoreInterpretation(preview.savedAt, lastSyncedAt);

  const columnStyle: CSSProperties = {
    border: `1px solid ${theme.border}`,
    background: theme.bg,
    borderRadius: "10px",
    padding: "0.6rem 0.75rem",
    display: "grid",
    gap: "0.15rem",
    alignContent: "start",
  };
  const columnHeadStyle: CSSProperties = {
    fontSize: "0.75rem",
    fontWeight: 800,
    color: theme.muted,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  };
  const countStyle: CSSProperties = { fontSize: "0.95rem", fontWeight: 800, color: theme.text };
  const timeStyle: CSSProperties = { fontSize: "0.78rem", fontWeight: 700, color: theme.muted };
  const diffStyle: CSSProperties = { margin: 0, fontSize: "0.82rem", fontWeight: 700 };

  return (
    <ModalShell
      theme={theme}
      ariaLabel="Restore from Google Drive"
      onClose={onCancel}
      style={{ width: "min(480px, calc(100vw - 2rem))", padding: "1rem" }}
    >
      <div style={{ display: "grid", gap: "0.75rem" }}>
        <p style={{ margin: 0, fontSize: "1rem", fontWeight: 800 }}>Restore from Google Drive?</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
          <div style={columnStyle}>
            <span style={columnHeadStyle}>This browser</span>
            <span style={countStyle}>{countCharacters(preview.localNames.length)}</span>
            <span style={timeStyle}>
              {lastSyncedAt === null
                ? "Never backed up from here"
                : `Last backed up ${formatSyncTime(lastSyncedAt)}`}
            </span>
          </div>
          <div style={columnStyle}>
            <span style={columnHeadStyle}>Drive backup</span>
            <span style={countStyle}>
              {preview.backupNames === null ? "Characters unreadable" : countCharacters(preview.backupNames.length)}
            </span>
            <span style={timeStyle}>
              {preview.savedAt === null ? "Save time unknown" : `Saved ${formatSyncTime(preview.savedAt)}`}
            </span>
          </div>
        </div>
        {gained.length > 0 && (
          <p style={{ ...diffStyle, color: statusText(theme, "success") }}>
            + Only in the backup: {nameList(gained)}
          </p>
        )}
        {lost.length > 0 && (
          <p style={{ ...diffStyle, color: statusText(theme, "danger") }}>
            − Only in this browser, lost on restore: {nameList(lost)}
          </p>
        )}
        {preview.backupNames === null && (
          <p style={{ ...diffStyle, color: theme.muted }}>
            The backup&apos;s character list couldn&apos;t be read (it may be from a different
            MapleDoro version), so no roster comparison is shown.
          </p>
        )}
        {interpretation && <p style={{ ...diffStyle, color: theme.muted }}>{interpretation}</p>}
        <p
          style={{
            margin: 0,
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            color: statusText(theme, "warning"),
            fontSize: "0.86rem",
            fontWeight: 800,
          }}
        >
          <WarningIcon color={statusText(theme, "warning")} />
          Restoring replaces all of this browser&apos;s MapleDoro data. There is no undo.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.55rem" }}>
          <button
            type="button"
            onClick={onCancel}
            className="tool-btn tool-dialog-btn"
            style={dialogBtnColors(theme)}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="tool-btn tool-dialog-btn"
            style={{ background: STATUS.danger.fill, border: `1px solid ${STATUS.danger.fill}`, color: STATUS.danger.on }}
          >
            Restore backup
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

/* Optional Google Drive cloud backup (see src/lib/driveSync.ts for the flow and
   the privacy constraints). Backs up and restores the same payload as the file
   export/import above, so the two paths can never drift apart. */
function DriveSyncPanel({
  theme,
  panelStyle,
  labelStyle,
  descStyle,
}: {
  theme: AppTheme;
  panelStyle: CSSProperties;
  labelStyle: CSSProperties;
  descStyle: CSSProperties;
}) {
  const mounted = useMounted();
  // Lazy read is SSR-safe (disconnected on the server), and the connected UI
  // only renders once mounted, so the server and hydration renders agree.
  const [sync, setSync] = useState(readDriveSyncState);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null);
  const [overwritePending, setOverwritePending] = useState<{ id: string; savedAt: number | null } | null>(null);

  const runDriveAction = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      await action();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Something went wrong talking to Google Drive.");
    } finally {
      setBusy(false);
    }
  };

  const handleConnect = () =>
    runDriveAction(async () => {
      setSync(await connectDrive());
      setStatus("Connected to Google Drive.");
    });

  const performBackup = async (existing: { id: string } | null) => {
    await saveToAppData(collectBackupData(), existing);
    setSync(markDriveSynced());
    setStatus("Backed up to Google Drive.");
  };

  const handleBackup = () =>
    runDriveAction(async () => {
      const meta = await getDriveBackupMeta();
      // A cloud file newer than this browser's last backup (or one this browser
      // never wrote at all) likely holds another device's progress -- confirm
      // before clobbering it instead of silently last-write-wins.
      const cloudLooksNewer =
        meta !== null &&
        (sync.lastSyncedAt === null ||
          (meta.savedAt !== null && meta.savedAt > sync.lastSyncedAt + CLOCK_SLACK_MS));
      if (cloudLooksNewer) {
        setOverwritePending(meta);
        return;
      }
      await performBackup(meta);
    });

  // Downloads and compares before anything is touched; the actual overwrite
  // happens in applyRestore once the preview dialog is confirmed.
  const handleRestore = () =>
    runDriveAction(async () => {
      const meta = await getDriveBackupMeta();
      if (meta === null) {
        setStatus("No backup in your Drive yet. Back up from your other device first.");
        return;
      }
      const entries = parseBackupEntries(await loadFromAppData(meta.id));
      if (!entries) {
        setStatus("The file in your Drive doesn't look like a MapleDoro backup.");
        return;
      }
      setRestorePreview(buildRestorePreview(entries, meta.savedAt));
    });

  const applyRestore = () => {
    if (!restorePreview) return;
    setRestorePreview(null);
    for (const [key, value] of restorePreview.entries) {
      localStorage.setItem(key, value);
    }
    setStatus(`Restored ${restorePreview.entries.length} item${restorePreview.entries.length === 1 ? "" : "s"}. Reloading...`);
    setTimeout(() => window.location.reload(), 800);
  };

  const handleDisconnect = () => {
    if (busy) return;
    setSync(disconnectDrive());
    setStatus("Disconnected. The backup file stays in your Drive.");
  };

  const busyStyle: CSSProperties = busy ? { opacity: 0.6, pointerEvents: "none" } : {};
  const noteStyle: CSSProperties = { fontSize: "0.8rem", fontWeight: 700, color: theme.muted };
  // Same destructive pill as ConfirmButton's trigger (red ink on a neutral
  // surface, 20% alpha outline); a plain button here because the confirm dialog
  // opens after the download-and-compare, not before.
  const dangerInk = statusText(theme, "danger");
  const restorePillStyle: CSSProperties = {
    padding: "0.5rem 1rem",
    fontSize: "0.82rem",
    borderRadius: "10px",
    background: "transparent",
    color: dangerInk,
    border: `1px solid ${dangerInk}33`,
    fontWeight: 800,
  };

  return (
    <div className="fade-in panel-card settings-row-panel" style={panelStyle}>
      <div style={{ maxWidth: 460 }}>
        <p style={labelStyle}>Google Drive backup</p>
        <p style={descStyle}>
          Back up your data to your Google Drive and restore it on another device.
        </p>
        <p style={descStyle}>
          This only saves your MapleDoro data to a private, hidden app folder in your Drive.
          MapleDoro can&apos;t see or touch anything else in your Drive.
        </p>
      </div>
      <div className="settings-data-actions">
        {mounted && (
          <div className="settings-actions">
            {sync.connected ? (
              <>
                <button
                  type="button"
                  onClick={handleBackup}
                  disabled={busy}
                  className="tool-btn tool-dialog-btn"
                  style={{ ...dialogPrimaryBtnColors(theme), ...busyStyle }}
                >
                  Back up now
                </button>
                <button
                  type="button"
                  onClick={handleRestore}
                  disabled={busy}
                  className="tool-btn"
                  style={{ ...restorePillStyle, ...busyStyle }}
                >
                  Restore
                </button>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={busy}
                  className="tool-btn tool-dialog-btn"
                  style={{ ...dialogBtnColors(theme), ...busyStyle }}
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleConnect}
                disabled={busy}
                className="tool-btn tool-dialog-btn"
                style={{ ...dialogPrimaryBtnColors(theme), ...busyStyle }}
              >
                Connect Google Drive
              </button>
            )}
          </div>
        )}
        {mounted && (status ? (
          <span style={noteStyle}>{status}</span>
        ) : (
          sync.connected && sync.lastSyncedAt !== null && (
            <span style={noteStyle}>Last backed up {formatSyncTime(sync.lastSyncedAt)}</span>
          )
        ))}
      </div>
      {restorePreview && (
        <DriveRestoreModal
          theme={theme}
          preview={restorePreview}
          lastSyncedAt={sync.lastSyncedAt}
          onConfirm={applyRestore}
          onCancel={() => setRestorePreview(null)}
        />
      )}
      {overwritePending && (
        <ConfirmModal
          theme={theme}
          title="Overwrite the Drive backup?"
          description={overwriteWarningDescription(overwritePending.savedAt, sync.lastSyncedAt)}
          warning="Backing up now replaces it with this browser's data."
          confirmLabel="Overwrite backup"
          confirmDanger
          onConfirm={() => {
            const existing = overwritePending;
            setOverwritePending(null);
            runDriveAction(() => performBackup(existing));
          }}
          onCancel={() => setOverwritePending(null)}
        />
      )}
    </div>
  );
}

function SettingsContent({ theme }: { theme: AppTheme }) {
  const { themeKey, setThemeKey, colorMode, setColorMode } = useTheme();
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [accentDropdownOpen, setAccentDropdownOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accentDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setAccentDropdownOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAccentDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [accentDropdownOpen]);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let data: unknown;
      try {
        data = JSON.parse(reader.result as string);
      } catch {
        setImportStatus("That file isn't valid JSON.");
        return;
      }
      const entries = parseBackupEntries(data);
      if (!entries) {
        setImportStatus("That file doesn't look like a MapleDoro backup.");
        return;
      }
      for (const [key, value] of entries) {
        localStorage.setItem(key, value);
      }
      setImportStatus(`Imported ${entries.length} item${entries.length === 1 ? "" : "s"}. Reloading...`);
      setTimeout(() => window.location.reload(), 800);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const panelStyle = {
    background: theme.panel,
    border: `1px solid ${theme.border}`,
    borderRadius: "14px",
    padding: "1.25rem 1.5rem",
    marginTop: "1rem",
  } as const;

  const labelStyle = {
    margin: 0,
    fontWeight: 800 as const,
    fontSize: "0.95rem",
    color: theme.text,
  };

  const descStyle = {
    margin: 0,
    marginTop: "0.2rem",
    fontSize: "0.82rem",
    color: theme.muted,
    fontWeight: 700 as const,
  };

  return (
    <div className="page-content">
      <div className="page-container">
        <div className="page-title" style={{ color: theme.text }}>
          Settings
        </div>
        <div className="page-subtitle" style={{ color: theme.muted }}>
          Customize your MapleDoro experience
        </div>

        {/* Color mode (same setting as the sun/moon toggle in the top nav) */}
        <div
          className="fade-in panel-card settings-row-panel"
          style={panelStyle}
        >
          <div>
            <p style={labelStyle}>Appearance</p>
            <p style={descStyle}>Switch between light and dark mode.</p>
          </div>
          <SegmentedToggle
            theme={theme}
            options={COLOR_MODES}
            value={colorMode}
            labels={COLOR_MODE_LABELS}
            ariaLabel="Color mode"
            onChange={setColorMode}
          />
        </div>

        {/* Accent theme selector */}
        <div
          className="fade-in panel-card settings-row-panel settings-theme-panel"
          style={panelStyle}
        >
          <div>
            <p style={labelStyle}>Theme</p>
            <p style={descStyle}>Choose the theme used across the site.</p>
          </div>
          <div ref={dropdownRef} className="settings-dropdown-root">
            <button
              type="button"
              onClick={() => setAccentDropdownOpen((prev) => !prev)}
              className="settings-dropdown-trigger"
              style={{
                border: `1px solid ${theme.border}`,
                background: theme.bg,
                color: theme.text,
              }}
            >
              <span
                className="settings-swatch settings-swatch-current"
                style={{
                  background: theme.accent,
                }}
              />
              <span>{ACCENT_THEMES[themeKey]?.name ?? "Default"}</span>
              <svg className="settings-dropdown-icon" width="10" height="6" viewBox="0 0 10 6" fill="none">
                <path
                  d="M1 1L5 5L9 1"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {accentDropdownOpen && (
              <div
                className="settings-dropdown-menu"
                style={{
                  background: theme.panel,
                  border: `1px solid ${theme.border}`,
                }}
              >
                {Object.entries(ACCENT_THEMES).map(([key, accent]) => {
                  const active = themeKey === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setThemeKey(key);
                        setAccentDropdownOpen(false);
                      }}
                      className="settings-dropdown-item"
                      style={{
                        background: active ? theme.accentSoft : "transparent",
                        color: active ? theme.accentText : theme.text,
                      }}
                    >
                      <span
                        className="settings-swatch settings-swatch-option"
                        style={{
                          background: accent.accent,
                        }}
                      />
                      <span style={{ fontWeight: active ? 800 : 600 }}>{accent.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Import / Export */}
        <div
          className="fade-in panel-card settings-row-panel"
          style={panelStyle}
        >
          <div>
            <p style={labelStyle}>Data management</p>
            <p style={descStyle}>Export your data as a backup, or import a previous backup.</p>
          </div>
          <div className="settings-data-actions">
            <div className="settings-actions">
              <button
                type="button"
                onClick={exportData}
                className="tool-btn tool-dialog-btn"
                style={dialogPrimaryBtnColors(theme)}
              >
                Export data
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="tool-btn tool-dialog-btn"
                style={dialogBtnColors(theme)}
              >
                Import data
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                aria-label="Import data file"
                onChange={handleImport}
                style={{ display: "none" }}
              />
            </div>
            {importStatus && (
              <span style={{ fontSize: "0.8rem", fontWeight: 700, color: theme.muted }}>
                {importStatus}
              </span>
            )}
          </div>
        </div>

        {/* Google Drive backup, only in deployments with an OAuth client ID configured */}
        {driveSyncConfigured && (
          <DriveSyncPanel
            theme={theme}
            panelStyle={panelStyle}
            labelStyle={labelStyle}
            descStyle={descStyle}
          />
        )}

        {/* Reset */}
        <div
          className="fade-in panel-card settings-row-panel"
          style={panelStyle}
        >
          <div>
            <p style={labelStyle}>Reset all data</p>
            <p style={descStyle}>
              Clears all characters, settings, and saved state from this browser.
            </p>
          </div>
          <ConfirmButton
            theme={theme}
            label="Reset all data"
            style={{ padding: "0.5rem 1rem", fontSize: "0.82rem", borderRadius: "10px" }}
            title="Reset all data?"
            message="This will delete all your characters, world settings, and saved state from this browser. There is no undo."
            confirmLabel="Reset everything"
            onConfirm={hardReset}
          />
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <AppShell currentPath="/settings">
      {({ theme }) => <SettingsContent theme={theme} />}
    </AppShell>
  );
}
