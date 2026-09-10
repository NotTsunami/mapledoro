// Static patch notes used in two places: the SSR/hydration snapshot for
// PatchNotesPanel, and the API route's response when the Nexon CDN fetch
// fails. Shared so those two can't drift apart (they had, by four months).
//
// These go stale as the game updates. Refresh from
// https://g.nexonstatic.com/maplestory/cms/v1/news, keeping the shape the
// route's transform produces: uppercase title, "MMM d" date, category as a
// single uppercase tag, and `version` only when the title names one.

export type PatchNote = { version: string; date: string; title: string; tags: string[]; url: string };

export const FALLBACK_PATCH_NOTES: PatchNote[] = [
  {
    version: "v271",
    date: "Sep 9",
    title: "V.271 KNOWN ISSUES",
    tags: ["MAINTENANCE"],
    url: "https://www.nexon.com/maplestory/news/maintenance/45226/v-271-known-issues",
  },
  {
    version: "",
    date: "Sep 9",
    title: "FRIEREN'S SPELL COLLECTION",
    tags: ["EVENTS"],
    url: "https://www.nexon.com/maplestory/news/events/44414/frieren-s-spell-collection",
  },
  {
    version: "",
    date: "Sep 9",
    title: "ADVENTURE WITH FRIEREN'S COMPANIONS",
    tags: ["EVENTS"],
    url: "https://www.nexon.com/maplestory/news/events/44415/adventure-with-frieren-s-companions",
  },
];
