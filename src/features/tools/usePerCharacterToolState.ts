"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useMounted } from "../../lib/useMounted";
import {
  readCharactersStore,
  selectCharacterByIgn,
  selectCharactersList,
  type StoredCharacterRecord,
} from "../characters/model/charactersStore";
import { readCharacterToolData, writeCharacterToolData } from "./characterToolStorage";
import { useApplyCharacterQueryParam } from "./useApplyCharacterQueryParam";

interface Options<TForm, TSaved> {
  /** Key inside the character's `tools` field (e.g. `"symbols"`, `"liberation"`). */
  toolKey: string;
  /**
   * Builds the in-memory form from the character's saved blob. Called with
   * `(null, undefined)` for the initial state and whenever the character is
   * cleared, so it must return a usable default in that case.
   *
   * `char` is the incoming character record, for tools that seed defaults from
   * the character itself (job name, level).
   */
  parse: (saved: TSaved | null, char: StoredCharacterRecord | undefined) => TForm;
  /** Reduces the in-memory form to the blob that gets persisted. */
  serialize: (form: TForm) => TSaved;
}

/**
 * Per-character tool state: the character list, the selected character, and the
 * load/save wiring around `characterToolStorage`.
 *
 * Writes happen synchronously inside the state updater so the persisted value
 * stays atomic with the state change. The selected character is mirrored into a
 * ref because those updaters run outside the render that queued them: reading
 * the name from a ref means a write always targets the character that was
 * selected when it ran, regardless of closure timing.
 *
 * `parse` and `serialize` are held in `useCallback` dependency arrays, so define
 * them at module scope rather than inline in the component.
 */
export function usePerCharacterToolState<TForm, TSaved>({
  toolKey,
  parse,
  serialize,
}: Options<TForm, TSaved>) {
  const mounted = useMounted();

  const characters: StoredCharacterRecord[] = useMemo(
    () => (mounted ? selectCharactersList(readCharactersStore()) : []),
    [mounted],
  );

  const [selectedCharName, setSelectedCharName] = useState<string | null>(null);
  const [state, setState] = useState<TForm>(() => parse(null, undefined));
  const selectedCharRef = useRef<string | null>(null);

  const update = useCallback(
    (updater: (prev: TForm) => TForm) => {
      setState((prev) => {
        const next = updater(prev);
        const target = selectedCharRef.current;
        if (target) writeCharacterToolData(target, toolKey, serialize(next));
        return next;
      });
    },
    [toolKey, serialize],
  );

  const handleCharChange = useCallback(
    (charName: string | null) => {
      const outgoing = selectedCharRef.current;
      // Read the incoming character up front: it doesn't depend on the outgoing
      // state, and it keeps the updater below down to one write.
      const incomingChar = charName
        ? selectCharacterByIgn(readCharactersStore(), charName) ?? undefined
        : undefined;
      const incomingSaved = charName
        ? readCharacterToolData<TSaved>(charName, toolKey)
        : null;

      setState((current) => {
        if (outgoing) writeCharacterToolData(outgoing, toolKey, serialize(current));
        return parse(incomingSaved, incomingChar);
      });

      selectedCharRef.current = charName;
      setSelectedCharName(charName);
    },
    [toolKey, parse, serialize],
  );

  useApplyCharacterQueryParam({ mounted, characters, handleCharChange });

  return { mounted, characters, selectedCharName, handleCharChange, state, update };
}
