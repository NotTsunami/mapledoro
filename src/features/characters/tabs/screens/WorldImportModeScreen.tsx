"use client";

import { useMemo, useRef, useState } from "react";
import {
  readCharactersStore,
  selectCharacterByIgn,
  selectCharactersList,
  mergeImportedCharacterRecord,
  parseImportedWorldPayload,
  type ImportSectionId,
  type StoredCharacterRecord,
  type StoredLegionArtifact,
  type StoredScouterLegion,
  type WorldExportPayload,
} from "../../model/charactersStore";
import { toCharacterKey } from "../../model/characterKeys";
import { MAX_CHAMPIONS, MAX_CHARACTERS_PER_WORLD } from "../useCharacterSetupController";
import { useScrollEdges, edgeFadeMask } from "../../../../lib/useScrollEdges";
import { resolveDisplayJobName } from "../../setup/data/nexonJobMapping";
import { statusText } from "../../../../components/statusColors";
import { CHARACTERS_COPY } from "../content";
import type { AppTheme } from "../../../../components/themes";
import { formatRoles, type ProfileRole, type SearchPaneActions, type SearchPaneModel } from "../paneModels";
import CharacterAvatar from "../components/CharacterAvatar";
import ImportConflictDialog from "./ImportConflictDialog";
import { ExportTabIcon } from "./CharacterProfileOverviewScreen";
import {
  primaryButtonStyle,
  secondaryButtonStyle,
  subtitleStyle,
  titleStyle,
} from "../components/uiStyles";

type Choice = "mine" | "imported";

interface ConflictEntry {
  existing: StoredCharacterRecord;
  imported: StoredCharacterRecord;
  // Existing's role on whichever world it's CURRENTLY on -- not the import's target
  // world, which can differ (e.g. importing a world file while the same IGN is Main
  // somewhere else entirely).
  currentRoles: ProfileRole[];
}

interface ResidentEntry {
  character: StoredCharacterRecord;
  currentRoles: ProfileRole[];
}

// One resolution per conflicting character: "mine"/"imported" from the bulk default
// buttons, or a full per-section choice map once someone customizes that one character
// via the same ImportConflictDialog the single-character flow already uses.
type ConflictResolution = Choice | Record<ImportSectionId, Choice>;

function isSectionChoiceMap(value: ConflictResolution): value is Record<ImportSectionId, Choice> {
  return typeof value === "object";
}

// Main is a single world-level slot -- unlike a data section, one character's role
// choice can silently bump ANOTHER character's role, including someone never even shown
// a choice (an untouched resident who's currently Main but not mentioned in the file at
// all). Detects that clash before commit instead of letting importWorldBulk's own
// unconditional overwrite happen invisibly. Extracted out of the component body purely
// to stay under the cognitive-complexity cap -- this is otherwise inline logic with no
// reuse elsewhere.
//
// Only a KEPT conflict's current Main status counts as a real clash -- a conflict
// resolved "Use imported"/customized is deliberately giving up whatever role they
// currently hold (that's what usesFileRole means), so finding them as "currently Main"
// is not a conflict, it's the expected outcome of their own choice. Residents have no
// choice mechanism at all (they either stay untouched or get removed), so their current
// Main status is always effectively "kept."
function resolveMainConflict(
  keptConflicts: ConflictEntry[],
  worldResidents: ResidentEntry[],
  effectiveMainCharacterKey: string | null,
  removedSet: Set<string>,
  rosterByKey: Map<string, StoredCharacterRecord>,
): { currentMainName: string; fileMainName: string } | null {
  const currentMainConflictEntry = keptConflicts.find((entry) => entry.currentRoles.includes("main"));
  const currentMainResidentEntry = worldResidents.find((r) => r.currentRoles.includes("main"));
  let currentMainKey: string | null = null;
  if (currentMainConflictEntry) {
    currentMainKey = toCharacterKey(currentMainConflictEntry.existing);
  } else if (currentMainResidentEntry) {
    currentMainKey = toCharacterKey(currentMainResidentEntry.character);
  }
  if (
    !currentMainKey ||
    !effectiveMainCharacterKey ||
    currentMainKey === effectiveMainCharacterKey ||
    removedSet.has(currentMainKey)
  ) {
    return null;
  }
  return {
    currentMainName: rosterByKey.get(currentMainKey)?.characterName ?? currentMainKey,
    fileMainName: rosterByKey.get(effectiveMainCharacterKey)?.characterName ?? effectiveMainCharacterKey,
  };
}

// Collapses a per-section map back into a plain bulk Choice when every section actually
// agrees -- Customize's own "Keep all existing"/"Use all imported" buttons produce a map
// that's uniform in exactly this way, and without this it reads as "Customized" even
// though nothing about the outcome differs from clicking the row's own Keep/Use pill.
function collapseUniformChoiceMap(choices: Record<ImportSectionId, Choice>): ConflictResolution {
  const values = Object.values(choices);
  const first = values[0];
  return values.every((v) => v === first) ? first : choices;
}

// A character can hold both roles at once (Main AND a Champion slot), so this returns
// every role that applies rather than picking one -- mirrors getProfileRoleChips'
// (CharacterProfileScreen.tsx) own main+champion handling.
function resolveRoles(characterKey: string, mainCharacterKey: string | null, championCharacterKeys: string[]): ProfileRole[] {
  const roles: ProfileRole[] = [];
  if (characterKey === mainCharacterKey) roles.push("main");
  if (championCharacterKeys.includes(characterKey)) roles.push("champion");
  return roles;
}

// Shows what this character's role on the target world will become after import, e.g.
// "Main -> Mule" for a character who's Main somewhere else but not assigned any role in
// this file, or just "Main" (no arrow) for a brand-new character with no prior role to
// compare against, or nothing at all when nothing changes (mule staying a mule).
function RoleTransitionLabel({
  theme,
  currentRoles,
  newRoles,
}: {
  theme: AppTheme;
  currentRoles: ProfileRole[] | null;
  newRoles: ProfileRole[];
}) {
  const newLabel = formatRoles(newRoles);
  if (currentRoles === null) {
    // New character, nothing to compare against -- only worth a line when it's landing
    // as Main/Champion; silently becoming a Mule isn't worth calling out.
    if (newRoles.length === 0) return null;
    return (
      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: theme.accentText }}>{newLabel}</span>
    );
  }
  const currentLabel = formatRoles(currentRoles);
  if (currentLabel === newLabel) return null;
  return (
    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: theme.accentText }}>
      {currentLabel} → {newLabel}
    </span>
  );
}

function ConflictRow({
  theme,
  entry,
  resolution,
  currentRoles,
  newRoles,
  onSetBulkChoice,
  onCustomize,
}: {
  theme: AppTheme;
  entry: ConflictEntry;
  resolution: ConflictResolution;
  currentRoles: ProfileRole[];
  newRoles: ProfileRole[];
  onSetBulkChoice: (choice: Choice) => void;
  onCustomize: () => void;
}) {
  const isCustomized = isSectionChoiceMap(resolution);
  return (
    <div className="world-import-conflict-row" style={{ padding: "0.5rem 0", borderBottom: `1px solid ${theme.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
        <CharacterAvatar
          src={entry.imported.characterImgURL}
          alt=""
          width={28}
          height={28}
          style={{ display: "block", borderRadius: "6px", objectFit: "contain", objectPosition: "center bottom", flexShrink: 0 }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: "0.8rem", color: theme.text }}>{entry.existing.characterName}</div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.75rem", fontWeight: 600, color: theme.muted }}>
            <span>{resolveDisplayJobName(entry.existing.jobName)} · Lv. {entry.existing.level}</span>
            <RoleTransitionLabel theme={theme} currentRoles={currentRoles} newRoles={newRoles} />
          </div>
        </div>
      </div>
      <div className="world-import-conflict-actions" style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
          <button
            type="button"
            aria-pressed={!isCustomized && resolution === "mine"}
            onClick={() => onSetBulkChoice("mine")}
            style={{
              border: `1px solid ${!isCustomized && resolution === "mine" ? theme.accent : theme.border}`,
              borderRadius: "999px",
              background: !isCustomized && resolution === "mine" ? theme.accentSoft : theme.bg,
              color: theme.text,
              fontFamily: "inherit",
              fontWeight: 700,
              fontSize: "0.75rem",
              padding: "0.25rem 0.55rem",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {CHARACTERS_COPY.importConflict.keepMine}
          </button>
          <button
            type="button"
            aria-pressed={!isCustomized && resolution === "imported"}
            onClick={() => onSetBulkChoice("imported")}
            style={{
              border: `1px solid ${!isCustomized && resolution === "imported" ? theme.accent : theme.border}`,
              borderRadius: "999px",
              background: !isCustomized && resolution === "imported" ? theme.accentSoft : theme.bg,
              color: theme.text,
              fontFamily: "inherit",
              fontWeight: 700,
              fontSize: "0.75rem",
              padding: "0.25rem 0.55rem",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {CHARACTERS_COPY.importConflict.useImported}
          </button>
        </div>
        <button
          type="button"
          onClick={onCustomize}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.3rem",
            background: "none",
            border: "none",
            padding: 0,
            font: "inherit",
            fontSize: "0.75rem",
            fontWeight: 700,
            color: theme.muted,
            cursor: "pointer",
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              flexShrink: 0,
              background: isCustomized ? theme.accent : "transparent",
              border: isCustomized ? "none" : `1px solid ${theme.border}`,
            }}
          />
          <span style={{ textDecoration: "underline", textUnderlineOffset: "2px" }}>
            {CHARACTERS_COPY.worldImport.customizeButton}
          </span>
        </button>
      </div>
    </div>
  );
}

function NewCharacterRow({
  theme,
  character,
  newRoles,
  checked,
  onToggle,
  fileRoles,
  roleDropped,
  onToggleDropRole,
}: {
  theme: AppTheme;
  character: StoredCharacterRecord;
  newRoles: ProfileRole[];
  checked: boolean;
  onToggle: () => void;
  /** The role the FILE assigns this character, independent of whether it's currently
   *  applied (roleDropped) -- only passed for actual new characters (not residents), so
   *  the toggle can flip both ways: drop a role-carrying character down to a plain mule,
   *  or take it back, instead of a one-way action with no undo. */
  fileRoles?: ProfileRole[];
  roleDropped?: boolean;
  onToggleDropRole?: () => void;
}) {
  const showRoleToggle = Boolean(onToggleDropRole) && (fileRoles?.length ?? 0) > 0 && checked;
  return (
    <div className={showRoleToggle ? "world-import-conflict-row" : undefined} style={{ padding: "0.5rem 0", borderBottom: `1px solid ${theme.border}` }}>
      <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          style={{ width: "16px", height: "16px", flexShrink: 0, accentColor: theme.accent, cursor: "pointer" }}
        />
        <CharacterAvatar
          src={character.characterImgURL}
          alt=""
          width={28}
          height={28}
          style={{ display: "block", borderRadius: "6px", objectFit: "contain", objectPosition: "center bottom", flexShrink: 0, opacity: checked ? 1 : 0.5 }}
        />
        <div style={{ minWidth: 0, flex: 1, opacity: checked ? 1 : 0.5 }}>
          <div style={{ fontWeight: 800, fontSize: "0.8rem", color: theme.text }}>{character.characterName}</div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.75rem", fontWeight: 600, color: theme.muted }}>
            <span>{resolveDisplayJobName(character.jobName)} · Lv. {character.level}</span>
            <RoleTransitionLabel theme={theme} currentRoles={null} newRoles={newRoles} />
          </div>
        </div>
      </label>
      {showRoleToggle && (
        <div className="world-import-conflict-actions" style={{ display: "flex" }}>
          <button
            type="button"
            onClick={onToggleDropRole}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              font: "inherit",
              fontSize: "0.75rem",
              fontWeight: 700,
              color: theme.muted,
              textDecoration: "underline",
              textUnderlineOffset: "2px",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {roleDropped
              ? CHARACTERS_COPY.worldImport.restoreNewCharacterRoleButton
              : CHARACTERS_COPY.worldImport.dropNewCharacterRoleButton}
          </button>
        </div>
      )}
    </div>
  );
}

interface WorldImportConflictViewProps {
  theme: AppTheme;
  isUiLocked: boolean;
  payload: WorldExportPayload;
  onImportWorldBulk: (
    resolvedCharacters: StoredCharacterRecord[],
    roleKeys: { mainCharacterKey: string | null; championCharacterKeys: string[] },
    worldId: number,
    legionData: { legionArtifact?: StoredLegionArtifact; scouterLegion?: StoredScouterLegion } | null,
    removedKeys?: string[],
  ) => void;
  onChooseDifferentFile: () => void;
}

// The post-parse view: partitions the payload's characters into new-vs-conflicting,
// and lets the user resolve conflicts in bulk (or per-character) before confirming.
// Rendered by WorldImportModeScreen below once a file has actually been chosen and
// parsed -- this component itself has no "pick a file" step and no back button of its
// own (the outer screen owns navigation across both its idle and loaded states).
function WorldImportConflictView({ theme, isUiLocked, payload, onImportWorldBulk, onChooseDifferentFile }: WorldImportConflictViewProps) {

  // Partitioned once per loaded file, not on every render -- selectCharacterByIgn reads
  // the roster fresh from storage, and the conflict set this screen operates on should
  // stay fixed for the duration of resolving it, not shift under the user's feet if
  // something else in the app happened to touch storage mid-review.
  const { newCharacters, conflicts, worldDataConflict, worldResidents } = useMemo(() => {
    const store = readCharactersStore();
    const newChars: StoredCharacterRecord[] = [];
    const conflictEntries: ConflictEntry[] = [];
    const conflictKeys = new Set<string>();
    for (const imported of payload.characters) {
      const existing = selectCharacterByIgn(store, imported.characterName);
      if (existing) {
        const existingKey = toCharacterKey(existing);
        const currentRoles = resolveRoles(
          existingKey,
          store.mainCharacterIdByWorld[String(existing.worldID)] ?? null,
          store.championCharacterIdsByWorld[String(existing.worldID)] ?? [],
        );
        conflictEntries.push({ existing, imported, currentRoles });
        conflictKeys.add(existingKey);
      } else {
        newChars.push(imported);
      }
    }
    const hasWorldData = Boolean(
      store.legionArtifactByWorld[String(payload.worldID)] || store.scouterLegionByWorld[String(payload.worldID)],
    );
    // Characters already on the target world that the FILE doesn't mention at all --
    // not a conflict (that IGN already has a resolution above), just existing residents
    // who may need to be dropped to make room if the import would otherwise go over cap.
    const residents: ResidentEntry[] = selectCharactersList(store)
      .filter((c) => c.worldID === payload.worldID && !conflictKeys.has(toCharacterKey(c)))
      .map((character) => ({
        character,
        currentRoles: resolveRoles(
          toCharacterKey(character),
          store.mainCharacterIdByWorld[String(payload.worldID)] ?? null,
          store.championCharacterIdsByWorld[String(payload.worldID)] ?? [],
        ),
      }));
    return { newCharacters: newChars, conflicts: conflictEntries, worldDataConflict: hasWorldData, worldResidents: residents };
  }, [payload]);

  const [resolutions, setResolutions] = useState<Record<string, ConflictResolution>>(() => {
    const initial: Record<string, ConflictResolution> = {};
    for (const entry of conflicts) initial[toCharacterKey(entry.existing)] = "mine";
    return initial;
  });
  const [keepMyWorldData, setKeepMyWorldData] = useState(true);
  const [customizingKey, setCustomizingKey] = useState<string | null>(null);
  // Explicit per-conflict role overrides set via Customize's role row -- absent means the
  // default (role follows the data resolution: "mine" keeps the current role, "imported"/
  // customized applies the file's role), present means the user explicitly chose
  // independent of their data choice (e.g. keep existing data but still take the file's
  // role, or the reverse).
  const [roleOverrides, setRoleOverrides] = useState<Record<string, boolean>>({});
  // Every new character starts checked -- unchecking is how someone stays under the
  // per-world cap (MAX_CHARACTERS_PER_WORLD) when the file would otherwise push them over
  // it, since conflicts never add a NET-NEW slot (they replace/keep an existing IGN) and
  // can't be the cause of going over.
  const [selectedNewCharacterKeys, setSelectedNewCharacterKeys] = useState<Set<string>>(
    () => new Set(newCharacters.map(toCharacterKey)),
  );
  // Existing residents default to KEPT (checked) -- storing the deselected set rather
  // than the selected one, since "keep everyone" is the common case and residents is
  // usually large (up to MAX_CHARACTERS_PER_WORLD), so tracking exceptions is cheaper
  // to reason about than tracking the whole default-true set.
  const [deselectedResidentKeys, setDeselectedResidentKeys] = useState<Set<string>>(() => new Set());
  // A new character can be added WITHOUT taking the file's Main/Champion assignment for
  // them -- e.g. they'd push Champion count over cap, but there's no reason a Champion
  // conflict should force dropping the character entirely when they'd otherwise fit fine
  // as a plain mule. Keyed independently of selectedNewCharacterKeys since "add them" and
  // "give them this role" are separate decisions.
  const [droppedNewCharacterRoleKeys, setDroppedNewCharacterRoleKeys] = useState<Set<string>>(() => new Set());

  // Fades whichever edge actually has more to scroll to (see useScrollEdges/edgeFadeMask)
  // -- a static fade misreads as "more to scroll" even once fully scrolled to the bottom,
  // or when a list is short enough to never overflow its own cap in the first place.
  const { ref: conflictsRef, atStart: conflictsAtStart, atEnd: conflictsAtEnd } =
    useScrollEdges<HTMLDivElement>([conflicts.length], "vertical");
  const conflictsMask = edgeFadeMask(conflictsAtStart, conflictsAtEnd, 28, "vertical");
  const { ref: residentsRef, atStart: residentsAtStart, atEnd: residentsAtEnd } =
    useScrollEdges<HTMLDivElement>([worldResidents.length], "vertical");
  const residentsMask = edgeFadeMask(residentsAtStart, residentsAtEnd, 28, "vertical");
  const { ref: newCharactersRef, atStart: newCharactersAtStart, atEnd: newCharactersAtEnd } =
    useScrollEdges<HTMLDivElement>([newCharacters.length], "vertical");
  const newCharactersMask = edgeFadeMask(newCharactersAtStart, newCharactersAtEnd, 28, "vertical");

  function applyBulkChoiceToAll(choice: Choice) {
    const next: Record<string, ConflictResolution> = {};
    for (const entry of conflicts) next[toCharacterKey(entry.existing)] = choice;
    setResolutions(next);
    setKeepMyWorldData(choice === "mine");
    // Clears any explicit per-character role override set via a previous Customize visit
    // -- a bulk choice is a full reset, so a stale override from before shouldn't keep
    // pinning that one character's role against what the bulk buttons now say.
    setRoleOverrides({});
  }

  // Conflicts resolved "imported"/customized land ON payload.worldID (that's what
  // entry.imported's own worldID already is); "mine" keeps entry.existing wherever it
  // already lives, which can be a different world entirely -- so this is NOT simply
  // "current count + selected new characters", it's the real post-import membership.
  const resolvedConflicts: StoredCharacterRecord[] = conflicts.map((entry) => {
    const key = toCharacterKey(entry.existing);
    const resolution = resolutions[key] ?? "mine";
    if (isSectionChoiceMap(resolution)) {
      return mergeImportedCharacterRecord(entry.existing, entry.imported, resolution);
    }
    return resolution === "imported" ? entry.imported : entry.existing;
  });
  const selectedNewCharacters = newCharacters.filter((c) => selectedNewCharacterKeys.has(toCharacterKey(c)));
  const resolvedCharacters = [...selectedNewCharacters, ...resolvedConflicts];
  const removedResidentKeys = Array.from(deselectedResidentKeys);

  // Same "upsert by key, then drop removed" merge importWorldBulk itself performs (see
  // useCharacterSetupController.ts), mirrored here purely to preview the resulting
  // per-world count before committing -- every resolved character's worldID already
  // reflects where it will actually end up (payload.worldID for imported/customized
  // conflicts and new characters, wherever it already was for "keep mine" conflicts).
  const removedSet = new Set(removedResidentKeys);
  const rosterByKey = new Map(
    selectCharactersList(readCharactersStore())
      .filter((c) => !removedSet.has(toCharacterKey(c)))
      .map((c) => [toCharacterKey(c), c]),
  );
  for (const character of resolvedCharacters) rosterByKey.set(toCharacterKey(character), character);
  const projectedWorldCount = Array.from(rosterByKey.values()).filter((c) => c.worldID === payload.worldID).length;
  const isOverCap = projectedWorldCount > MAX_CHARACTERS_PER_WORLD;

  function toggleNewCharacter(key: string) {
    setSelectedNewCharacterKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleResident(key: string) {
    setDeselectedResidentKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleNewCharacterRole(key: string) {
    setDroppedNewCharacterRoleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // A conflicting character resolved "mine" (Keep existing) keeps their real current
  // role untouched, same as their data -- the file's role assignment for that specific
  // key is dropped rather than applied, so "Keep existing" actually means keep
  // everything about them, not just their stats/equipment/etc. New characters have no
  // current role to preserve, so the file's assignment always applies to them.
  // roleOverrides (set via Customize's own role row) lets someone decouple role from
  // data entirely -- e.g. keep existing data but still take the file's role, or the
  // reverse -- overriding the data-resolution default when present.
  function usesFileRole(key: string): boolean {
    if (key in roleOverrides) return roleOverrides[key];
    return (resolutions[key] ?? "mine") !== "mine";
  }
  const keptConflicts = conflicts.filter((entry) => !usesFileRole(toCharacterKey(entry.existing)));
  const keptConflictKeys = new Set(keptConflicts.map((entry) => toCharacterKey(entry.existing)));
  // The file's role assignment for a key only actually applies if that key is NOT a kept
  // conflict (their current role stays untouched, per usesFileRole above), IS actually
  // going to exist on this world after import (a deselected new character can't hold a
  // role for a character that was never added), and hasn't had its role explicitly
  // dropped via a new character's own "add without role" toggle.
  const resolvedCharacterKeys = new Set(resolvedCharacters.map(toCharacterKey));
  const fileRoleApplies = (key: string) =>
    !keptConflictKeys.has(key) && resolvedCharacterKeys.has(key) && !droppedNewCharacterRoleKeys.has(key);
  const effectiveMainCharacterKey =
    payload.mainCharacterKey && fileRoleApplies(payload.mainCharacterKey) ? payload.mainCharacterKey : null;
  // importWorldBulk's champion merge is "replace with this list if non-empty, else keep
  // whatever's already stored" -- not a union -- so a kept conflict's (or a kept, not-
  // removed resident's) real current champion status has to be folded into THIS list
  // explicitly, or it would be silently dropped whenever the file assigns anyone else as
  // champion. Residents were previously missing here entirely -- their current champion
  // status never counted toward the total at all, so unchecking overflow new characters
  // never actually resolved a real overflow that residents' own status was causing.
  const keptCurrentChampionKeys = keptConflicts
    .filter((entry) => entry.currentRoles.includes("champion"))
    .map((entry) => toCharacterKey(entry.existing));
  const keptResidentChampionKeys = worldResidents
    .filter((r) => r.currentRoles.includes("champion") && !removedSet.has(toCharacterKey(r.character)))
    .map((r) => toCharacterKey(r.character));
  const effectiveChampionCharacterKeys = Array.from(
    new Set([
      ...payload.championCharacterKeys.filter(fileRoleApplies),
      ...keptCurrentChampionKeys,
      ...keptResidentChampionKeys,
    ]),
  );

  // Champion overflow gets the same "surface before commit" treatment -- see
  // resolveMainConflict's own comment for why this can't just be left to
  // importWorldBulk's silent MAX_CHAMPIONS truncation.
  const mainConflict = resolveMainConflict(keptConflicts, worldResidents, effectiveMainCharacterKey, removedSet, rosterByKey);
  const championOverflowCount = Math.max(0, effectiveChampionCharacterKeys.length - MAX_CHAMPIONS);

  function handleConfirm() {
    if (isOverCap || mainConflict || championOverflowCount > 0) return;
    const legionData = keepMyWorldData
      ? null
      : { legionArtifact: payload.legionArtifact, scouterLegion: payload.scouterLegion };
    onImportWorldBulk(
      resolvedCharacters,
      { mainCharacterKey: effectiveMainCharacterKey, championCharacterKeys: effectiveChampionCharacterKeys },
      payload.worldID,
      legionData,
      removedResidentKeys,
    );
  }

  const customizingEntry = customizingKey !== null ? conflicts.find((e) => toCharacterKey(e.existing) === customizingKey) : undefined;

  return (
    <>
      <style>{`
        .world-import-conflict-row { display: flex; flex-direction: column; }
        .world-import-conflict-actions { padding-left: calc(28px + 0.6rem); margin-top: 0.4rem; }
        @media (min-width: 861px) {
          .world-import-conflict-row { flex-direction: row; align-items: center; justify-content: space-between; gap: 0.6rem; }
          .world-import-conflict-actions { padding-left: 0; margin-top: 0; margin-left: auto; flex-wrap: nowrap; }
        }
      `}</style>
      {conflicts.length > 0 && (
        <div style={{ marginBottom: "0.9rem" }}>
          <p style={{ fontSize: "0.85rem", fontWeight: 700, color: theme.text, margin: "0 0 0.5rem" }}>
            {conflicts.length} {CHARACTERS_COPY.worldImport.conflictSummaryPrefix} {payload.characters.length} {CHARACTERS_COPY.worldImport.conflictSummarySuffix}
          </p>
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <button type="button" onClick={() => applyBulkChoiceToAll("mine")} style={secondaryButtonStyle(theme, "0.5rem 0.8rem")}>
              {CHARACTERS_COPY.worldImport.keepAllMine}
            </button>
            <button type="button" onClick={() => applyBulkChoiceToAll("imported")} style={secondaryButtonStyle(theme, "0.5rem 0.8rem")}>
              {CHARACTERS_COPY.worldImport.useAllImported}
            </button>
          </div>
          <div
            ref={conflictsRef}
            style={{
              border: `1px solid ${theme.border}`,
              borderRadius: "12px",
              padding: "0 0.7rem",
              maxHeight: "260px",
              overflowY: "auto",
              WebkitMaskImage: conflictsMask,
              maskImage: conflictsMask,
            }}
          >
            {conflicts.map((entry) => {
              const key = toCharacterKey(entry.existing);
              return (
                <ConflictRow
                  key={key}
                  theme={theme}
                  entry={entry}
                  resolution={resolutions[key] ?? "mine"}
                  currentRoles={entry.currentRoles}
                  newRoles={resolveRoles(key, payload.mainCharacterKey, payload.championCharacterKeys)}
                  onSetBulkChoice={(choice) => {
                    setResolutions((prev) => ({ ...prev, [key]: choice }));
                    // Clicking Keep/Use directly on the row is also a reset for that one
                    // character -- drops any role override a prior Customize visit set,
                    // so role goes back to following this new data choice.
                    setRoleOverrides((prev) => {
                      if (!(key in prev)) return prev;
                      const next = { ...prev };
                      delete next[key];
                      return next;
                    });
                  }}
                  onCustomize={() => setCustomizingKey(key)}
                />
              );
            })}
          </div>
        </div>
      )}

      {newCharacters.length > 0 && (
        <div style={{ marginBottom: "0.9rem" }}>
          <p style={{ fontSize: "0.78rem", fontWeight: 600, color: theme.muted, margin: "0 0 0.5rem" }}>
            {newCharacters.length} {CHARACTERS_COPY.worldImport.newCharacterCountSuffix}
          </p>
          <div
            ref={newCharactersRef}
            style={{
              border: `1px solid ${theme.border}`,
              borderRadius: "12px",
              padding: "0 0.7rem",
              maxHeight: "180px",
              overflowY: "auto",
              WebkitMaskImage: newCharactersMask,
              maskImage: newCharactersMask,
            }}
          >
            {newCharacters.map((character) => {
              const key = toCharacterKey(character);
              const fileRoles = resolveRoles(key, payload.mainCharacterKey, payload.championCharacterKeys);
              const roleDropped = droppedNewCharacterRoleKeys.has(key);
              return (
                <NewCharacterRow
                  key={key}
                  theme={theme}
                  character={character}
                  newRoles={roleDropped ? [] : fileRoles}
                  checked={selectedNewCharacterKeys.has(key)}
                  onToggle={() => toggleNewCharacter(key)}
                  fileRoles={fileRoles}
                  roleDropped={roleDropped}
                  onToggleDropRole={() => toggleNewCharacterRole(key)}
                />
              );
            })}
          </div>
        </div>
      )}

      {worldResidents.length > 0 && (
        <div style={{ marginBottom: "0.9rem" }}>
          <p style={{ fontSize: "0.78rem", fontWeight: 600, color: theme.muted, margin: "0 0 0.5rem" }}>
            {worldResidents.length} {CHARACTERS_COPY.worldImport.residentCountSuffix}
          </p>
          <div
            ref={residentsRef}
            style={{
              border: `1px solid ${theme.border}`,
              borderRadius: "12px",
              padding: "0 0.7rem",
              maxHeight: "180px",
              overflowY: "auto",
              WebkitMaskImage: residentsMask,
              maskImage: residentsMask,
            }}
          >
            {worldResidents.map((resident) => {
              const key = toCharacterKey(resident.character);
              return (
                <NewCharacterRow
                  key={key}
                  theme={theme}
                  character={resident.character}
                  newRoles={resident.currentRoles}
                  checked={!deselectedResidentKeys.has(key)}
                  onToggle={() => toggleResident(key)}
                />
              );
            })}
          </div>
        </div>
      )}

      <div style={{ marginBottom: "0.9rem" }}>
        <p style={{ fontSize: "0.8rem", fontWeight: 700, color: isOverCap ? statusText(theme, "danger") : theme.muted, margin: 0 }}>
          {projectedWorldCount}/{MAX_CHARACTERS_PER_WORLD} {CHARACTERS_COPY.worldImport.characterCapSuffix}
        </p>
        {effectiveChampionCharacterKeys.length > 0 && (
          <p style={{ fontSize: "0.8rem", fontWeight: 700, color: championOverflowCount > 0 ? statusText(theme, "danger") : theme.muted, margin: "0.15rem 0 0" }}>
            {effectiveChampionCharacterKeys.length}/{MAX_CHAMPIONS} {CHARACTERS_COPY.worldImport.championCountSuffix}
          </p>
        )}
        {isOverCap && (
          <p style={{ fontSize: "0.78rem", fontWeight: 600, color: statusText(theme, "danger"), margin: "0.25rem 0 0" }}>
            {CHARACTERS_COPY.worldImport.characterCapErrorPrefix} {MAX_CHARACTERS_PER_WORLD} {CHARACTERS_COPY.worldImport.characterCapErrorSuffix}
          </p>
        )}
        {mainConflict && (
          <p style={{ fontSize: "0.78rem", fontWeight: 600, color: statusText(theme, "danger"), margin: "0.25rem 0 0" }}>
            {mainConflict.currentMainName} {CHARACTERS_COPY.worldImport.mainConflictPrefix} {mainConflict.fileMainName} {CHARACTERS_COPY.worldImport.mainConflictSuffix}
          </p>
        )}
        {championOverflowCount > 0 && (
          <p style={{ fontSize: "0.78rem", fontWeight: 600, color: statusText(theme, "danger"), margin: "0.25rem 0 0" }}>
            {CHARACTERS_COPY.worldImport.championOverflowPrefix} {MAX_CHAMPIONS} {CHARACTERS_COPY.worldImport.championOverflowMiddle} {effectiveChampionCharacterKeys.length} {CHARACTERS_COPY.worldImport.championOverflowSuffix}
          </p>
        )}
      </div>

      {(payload.legionArtifact || payload.scouterLegion) && worldDataConflict && (
        <div style={{ marginBottom: "0.9rem" }}>
          <p style={{ fontSize: "0.8rem", fontWeight: 700, color: theme.text, margin: "0 0 0.4rem" }}>
            {CHARACTERS_COPY.worldImport.legionDataConflict}
          </p>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <button
              type="button"
              aria-pressed={keepMyWorldData}
              onClick={() => setKeepMyWorldData(true)}
              style={{
                border: `1px solid ${keepMyWorldData ? theme.accent : theme.border}`,
                borderRadius: "999px",
                background: keepMyWorldData ? theme.accentSoft : theme.bg,
                color: theme.text,
                fontFamily: "inherit",
                fontWeight: 700,
                fontSize: "0.76rem",
                padding: "0.35rem 0.7rem",
                cursor: "pointer",
              }}
            >
              {CHARACTERS_COPY.importConflict.keepMine}
            </button>
            <button
              type="button"
              aria-pressed={!keepMyWorldData}
              onClick={() => setKeepMyWorldData(false)}
              style={{
                border: `1px solid ${!keepMyWorldData ? theme.accent : theme.border}`,
                borderRadius: "999px",
                background: !keepMyWorldData ? theme.accentSoft : theme.bg,
                color: theme.text,
                fontFamily: "inherit",
                fontWeight: 700,
                fontSize: "0.76rem",
                padding: "0.35rem 0.7rem",
                cursor: "pointer",
              }}
            >
              {CHARACTERS_COPY.importConflict.useImported}
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        disabled={isUiLocked}
        onClick={onChooseDifferentFile}
        style={{
          display: "block",
          background: "none",
          border: "none",
          padding: 0,
          font: "inherit",
          textAlign: "left",
          fontSize: "0.78rem",
          fontWeight: 700,
          color: theme.muted,
          cursor: isUiLocked ? "not-allowed" : "pointer",
          marginBottom: "0.75rem",
        }}
      >
        {CHARACTERS_COPY.importCharacter.chooseDifferentFileButton}
      </button>

      <button
        type="button"
        disabled={isUiLocked || isOverCap || Boolean(mainConflict) || championOverflowCount > 0}
        onClick={handleConfirm}
        style={{
          ...primaryButtonStyle(theme),
          opacity: isOverCap || mainConflict || championOverflowCount > 0 ? 0.5 : 1,
          cursor: isOverCap || mainConflict || championOverflowCount > 0 ? "not-allowed" : "pointer",
        }}
      >
        {CHARACTERS_COPY.worldImport.confirmButton}
      </button>

      {customizingEntry && (
        <ImportConflictDialog
          theme={theme}
          existing={customizingEntry.existing}
          initialChoice={resolutions[toCharacterKey(customizingEntry.existing)]}
          roleControl={{
            initialUseFileRole: usesFileRole(toCharacterKey(customizingEntry.existing)),
          }}
          onClose={() => setCustomizingKey(null)}
          onConfirm={(choices, useFileRole) => {
            const key = toCharacterKey(customizingEntry.existing);
            setResolutions((prev) => ({ ...prev, [key]: collapseUniformChoiceMap(choices) }));
            if (useFileRole !== undefined) {
              setRoleOverrides((prev) => ({ ...prev, [key]: useFileRole }));
            }
            setCustomizingKey(null);
          }}
        />
      )}
    </>
  );
}

type WorldImportFileState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "loaded"; payload: WorldExportPayload };

async function readWorldImportFile(file: File): Promise<WorldImportFileState> {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(await file.text());
  } catch {
    return { status: "error", message: CHARACTERS_COPY.worldImport.invalidJsonError };
  }

  // A single-character export (no "kind" wrapper, just the raw record) belongs in the
  // Import Character screen -- same reasoning as that screen's own world-file rejection,
  // mirrored the other direction.
  if (
    typeof parsedJson === "object" &&
    parsedJson !== null &&
    (parsedJson as Record<string, unknown>).kind !== "world" &&
    typeof (parsedJson as Record<string, unknown>).ign === "string"
  ) {
    return { status: "error", message: CHARACTERS_COPY.worldImport.wrongFileTypeCharacterError };
  }

  // Checked here (not just left to parseImportedWorldPayload's own rejection) so this
  // gets its own specific message -- a file over the cap is shaped correctly, it's just
  // too big to be a real MapleDoro export, which "doesn't look like a world export"
  // would misleadingly suggest is a structural problem.
  if (
    typeof parsedJson === "object" &&
    parsedJson !== null &&
    Array.isArray((parsedJson as Record<string, unknown>).characters) &&
    ((parsedJson as Record<string, unknown>).characters as unknown[]).length > MAX_CHARACTERS_PER_WORLD
  ) {
    return { status: "error", message: CHARACTERS_COPY.worldImport.tooManyCharactersError };
  }

  // Same "specific message before the generic parser rejection" pattern as the two
  // checks above -- a real export can never have two characters share an IGN, so this
  // gets its own message rather than the generic "doesn't look like a world export."
  if (
    typeof parsedJson === "object" &&
    parsedJson !== null &&
    Array.isArray((parsedJson as Record<string, unknown>).characters)
  ) {
    const rawCharacters = (parsedJson as Record<string, unknown>).characters as unknown[];
    const names = rawCharacters
      .map((c) => (typeof c === "object" && c !== null ? (c as Record<string, unknown>).characterName : undefined))
      .filter((n): n is string => typeof n === "string")
      .map((n) => n.trim().toLowerCase());
    if (new Set(names).size !== names.length) {
      return { status: "error", message: CHARACTERS_COPY.worldImport.duplicateCharacterError };
    }
  }

  const payload = parseImportedWorldPayload(parsedJson);
  if (!payload) {
    return { status: "error", message: CHARACTERS_COPY.worldImport.invalidShapeError };
  }
  return { status: "loaded", payload };
}

interface WorldImportModeScreenProps {
  model: SearchPaneModel;
  actions: SearchPaneActions;
}

// Owns the "pick a file" step -- clicking Import World from the directory (via
// actions.runTransitionToMode("worldImport"), the same cross-pane mechanism
// FirstTimeSetupScreen's "Import instead" link uses for the single-character case)
// lands here first (idle, just a Choose File button), not straight into the
// conflict-resolution view. Rendered by SearchPaneCard alongside ImportModeScreen, so
// it gets that panel's real transition + narrow centered layout for free -- no lookalike
// CSS needed, unlike an earlier attempt that rendered this inside the directory panel
// and tried to imitate the look with a fade-in class and a width cap.
export default function WorldImportModeScreen({ model, actions }: WorldImportModeScreenProps) {
  const { theme, shell } = model;
  const [state, setState] = useState<WorldImportFileState>({ status: "idle" });
  // Bumped on every file pick so WorldImportConflictView remounts with fresh resolution
  // state instead of reusing a previous file's stale conflicts/choices -- payload alone
  // isn't a safe key since re-picking a file for the same world keeps the same worldID.
  const [loadNonce, setLoadNonce] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setState(await readWorldImportFile(file));
    setLoadNonce((n) => n + 1);
  }

  return (
    <>
      <div style={{ marginBottom: "1rem" }}>
        <button
          type="button"
          disabled={shell.isUiLocked}
          onClick={actions.backToCharactersDirectory}
          style={{
            ...secondaryButtonStyle(theme, "0.38rem 0.62rem"),
            fontSize: "0.76rem",
            fontWeight: 800,
            borderRadius: "999px",
            marginBottom: "0.65rem",
          }}
        >
          {CHARACTERS_COPY.worldImport.backButton}
        </button>
        <h1 style={titleStyle()}>{CHARACTERS_COPY.worldImport.title}</h1>
        <p style={{ ...subtitleStyle(theme), display: "flex", alignItems: "center", gap: "0.3rem", flexWrap: "wrap" }}>
          {CHARACTERS_COPY.worldImport.subtitlePrefix}
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem", fontWeight: 800, color: theme.text }}>
            <ExportTabIcon strokeWidth={2.5} />
            {CHARACTERS_COPY.worldImport.subtitleSuffix}
          </span>
        </p>
      </div>

      {state.status === "error" && (
        <p style={{ margin: "0 0 1rem", color: statusText(theme, "danger"), fontWeight: 700, fontSize: "0.85rem" }}>
          {state.message}
        </p>
      )}

      {state.status === "loaded" ? (
        <WorldImportConflictView
          key={loadNonce}
          theme={theme}
          isUiLocked={shell.isUiLocked}
          payload={state.payload}
          onImportWorldBulk={actions.importWorldBulk}
          onChooseDifferentFile={() => fileInputRef.current?.click()}
        />
      ) : (
        <button
          type="button"
          disabled={shell.isUiLocked}
          onClick={() => fileInputRef.current?.click()}
          style={secondaryButtonStyle(theme)}
        >
          {CHARACTERS_COPY.importCharacter.pickFileButton}
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />
    </>
  );
}
