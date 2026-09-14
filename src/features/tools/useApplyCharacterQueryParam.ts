"use client";

import { useEffect, useRef } from "react";
import { readCharactersStore, selectMainCharacter } from "../characters/model/charactersStore";

interface Options {
  mounted: boolean;
  characters: { characterName: string }[];
  handleCharChange: (name: string | null) => void;
}

/** Selects the tool's initial character once after mount: the `?character=`
 *  query param if it names a known character, otherwise the world Main. */
export function useApplyCharacterQueryParam({
  mounted,
  characters,
  handleCharChange,
}: Options) {
  const appliedRef = useRef(false);

  useEffect(() => {
    if (appliedRef.current || !mounted || characters.length === 0) return;
    appliedRef.current = true;
    const name = new URLSearchParams(window.location.search).get("character");
    if (name && characters.some((c) => c.characterName === name)) {
      // react-doctor-disable-next-line no-pass-data-to-parent -- the parent already owns this hook (usePerCharacterToolState, useStatOptimizer). The effect exists because the URL param and the character store are only readable after hydration, so the initial selection can't be seeded in a state initializer without a server/client mismatch.
      handleCharChange(name);
      return;
    }
    const main = selectMainCharacter(readCharactersStore());
    if (main && characters.some((c) => c.characterName === main.characterName)) {
      // react-doctor-disable-next-line no-pass-data-to-parent -- same post-hydration reasoning as above.
      handleCharChange(main.characterName);
    }
  }, [mounted, characters, handleCharChange]);
}
