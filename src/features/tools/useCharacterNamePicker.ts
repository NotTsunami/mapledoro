"use client";

import { useCallback, useMemo, useState } from "react";
import type { StoredCharacterRecord } from "../characters/model/charactersStore";

type NameMode = "type" | "select";

/**
 * State behind `AddCharacterNameDialog`: type a name or pick an imported
 * character, and derive the name about to be added. `storeChars` is the
 * caller's candidate list (Boss Crystals narrows it to the world in view);
 * names already in the tracker are dropped from the picker here.
 */
export function useCharacterNamePicker(
  storeChars: StoredCharacterRecord[],
  usedNames: Set<string>,
) {
  const [nameMode, setMode] = useState<NameMode>("type");
  const [typedName, setTypedName] = useState("");
  const [selectedChar, setSelectedChar] = useState<StoredCharacterRecord | null>(null);

  // Switching modes drops the other mode's input so it can't leak into `pendingName`.
  const setNameMode = useCallback((m: NameMode) => {
    setMode(m);
    if (m === "type") setSelectedChar(null);
    else setTypedName("");
  }, []);

  const reset = useCallback(() => {
    setMode("type");
    setTypedName("");
    setSelectedChar(null);
  }, []);

  const available = useMemo(
    () => storeChars.filter((c) => !usedNames.has(c.characterName.toLowerCase())),
    [storeChars, usedNames],
  );

  const pendingName =
    nameMode === "type" ? typedName.trim() : (selectedChar?.characterName ?? "");
  // The picker can't offer a name already added, but a typed one can still collide,
  // and adding one twice leaves two cards the tracker can't tell apart.
  const nameTaken = pendingName !== "" && usedNames.has(pendingName.toLowerCase());

  return {
    nameMode,
    setNameMode,
    typedName,
    setTypedName,
    selectedChar,
    setSelectedChar,
    available,
    pendingName,
    nameTaken,
    reset,
  };
}

export type CharacterNamePicker = ReturnType<typeof useCharacterNamePicker>;
