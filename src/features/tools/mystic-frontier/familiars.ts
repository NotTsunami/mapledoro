// Mystic Frontier familiar pool: reuses the character-flow familiar list
// (names, sprites, card icons) and joins it with the per-id type/element traits.
// This is what powers the lineup picker and the auto-populated type/element.

import { FAMILIARS, getFamiliarDisplayLabel, type FamiliarEntry } from "../../characters/setup/data/familiarsData";
import { FAMILIAR_TRAITS } from "./familiarTraits";
import type { MfElement, MfType } from "./types";

export interface MfFamiliar extends Pick<FamiliarEntry, "id" | "name" | "mobId" | "spriteMobId" | "cardId" | "duplicateOf"> {
  label: string;
  type: MfType;
  element: MfElement;
}

export const MF_FAMILIARS: readonly MfFamiliar[] = FAMILIARS.flatMap((f) => {
  const traits = FAMILIAR_TRAITS[f.id];
  if (!traits) return [];
  return [{
    id: f.id,
    name: f.name,
    label: getFamiliarDisplayLabel(f),
    mobId: f.mobId,
    spriteMobId: f.spriteMobId,
    cardId: f.cardId,
    duplicateOf: f.duplicateOf,
    type: traits[0],
    element: traits[1],
  }];
});

const BY_ID = new Map<number, MfFamiliar>(MF_FAMILIARS.map((f) => [f.id, f]));

export function getMfFamiliar(id: number | null): MfFamiliar | undefined {
  return id === null ? undefined : BY_ID.get(id);
}
