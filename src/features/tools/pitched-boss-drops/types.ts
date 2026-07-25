/** A logged drop. Drops are events, not per-character toggles: the same item can be
 *  logged any number of times. `characterName` is the canonical identity for display
 *  and filtering, since `characterId` isn't reliably unique. */
export interface PitchedBossDrop {
  id: string;
  characterId: string;
  characterName: string;
  itemId: string;
  channel: number;
  date: string; // YYYY-MM-DD
  timestamp: number;
  note?: string;
}
