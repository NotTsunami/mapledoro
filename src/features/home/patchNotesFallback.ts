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
    version: "v270",
    date: "Jul 22",
    title: "V.270 KNOWN ISSUES",
    tags: ["MAINTENANCE"],
    url: "https://www.nexon.com/maplestory/news/maintenance/43420/v-270-known-issues",
  },
  {
    version: "",
    date: "Jul 22",
    title: "MYSTIC FRONTIER CHAMPIONS",
    tags: ["EVENTS"],
    url: "https://www.nexon.com/maplestory/news/events/42466/mystic-frontier-champions",
  },
  {
    version: "",
    date: "Jul 22",
    title: "KINESIS REDUX!",
    tags: ["EVENTS"],
    url: "https://www.nexon.com/maplestory/news/events/42465/kinesis-redux",
  },
];
