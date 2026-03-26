import type { NormalizedCharacterData } from "./types";

export function toCharacterKey(character: NormalizedCharacterData) {
  return `${character.worldID}:${character.characterName.trim().toLowerCase()}`;
}

export function findRosterCharacterByName(
  roster: NormalizedCharacterData[],
  name: string,
) {
  const normalizedName = name.trim().toLowerCase();
  return roster.find(
    (entry) => entry.characterName.trim().toLowerCase() === normalizedName,
  );
}
