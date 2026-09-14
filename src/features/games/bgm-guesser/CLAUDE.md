# BGM Guesser

Daily game: hear a MapleStory BGM track, name the **area or boss** it plays for in 3 tries. No
hints, one mode. Shared chrome, puzzle numbering, archive routing, payload encoding and results
storage are in [`../CLAUDE.md`](../CLAUDE.md); only the differences are here. Puzzle #1 is
2026-08-04. This workspace supplies the player, the answer pool with its mark icons, and the reveal
card contents.

**Audio** streams from haku.network's `bgm` namespace via `bgmTrackUrl(group, track)`. The manifest
key is `{group}/{trackName}` and **track names are not unique across groups** (32 collisions), so
both halves travel together everywhere. `BgmPlayer` drives everything off the `<audio>` element's own
events (no effects, no mount-time setState), sets the starting volume in a callback ref, and loops —
these are in-game loops, not songs with an ending. The parent keys it by puzzle number so a new day
gets a fresh element.

**Puzzle payload:** regenerate with `node scripts/generate-bgm-guesser-data.mjs` (needs the dev-only
`manifests/v270/bgm.json` + `ui-mark.json`, pinned by the script's `MANIFEST_VERSION`, and network
access to fetch maplebgm-db). It exports `[group, track, title, answer]` tuples, plus the plain
`BGM_GUESSER_ANSWER_DATA` pool (`[name, ui-mark id, isBoss]`) — the picker needs every answer anyway,
so only the day's answer is worth hiding. Adding or removing an answer reshuffles every day, since
`answerOrder` is a shuffle of the whole key set.

**Answers come from a hand-curated allowlist** (`ANSWERS` in the generator), not from any rule the
data could supply: the manifest has no map names at all, and
[maplebgm-db](https://github.com/maplestory-music/maplebgm-db)'s free-text `description` mixes maps,
bosses, story beats and events in one field. maplebgm-db is fetched at generation time only for
titles; every inclusion decision was made by reading its descriptions once. Curation rules:

- Only tracks tied to a concrete GMS place or boss fight. Storyline, cutscene, credits, tutorial
  and "unused" tracks are out — they aren't a map, so there's nothing fair to guess.
- No event/anniversary/collab content, no class-burst or 6th-job skill themes, no minigame hubs
  (Star Planet, Monster Life, PvP), no UI/login themes.
- No region-exclusive content GMS never shipped (CMS/TMS/JMS-only areas), and no Mirror World
  remixes — they re-score a town theme already in the pool, so both would be the same puzzle.
- **The Guild Castle jukebox tracks are excluded on purpose**: they're piano covers of *other*
  areas' themes (Temple of Time, Pantheon, Elodin…), so they'd punish players for correctly
  recognizing the tune.
- Party quests answer as the area they sit in rather than getting their own entry — Ludibrium PQ is
  Ludibrium, Orbis PQ is Orbis. Sharenian is the exception, since it's its own place.
- Tracks whose description names two unrelated places ("Henesys Market, Southperry"; "Hekaton boss
  theme, Morass: Trueffet") are left out — there's no single right answer.
- One track per distinct piece of music: near-identical variants (`...B`, `_Loop`, `_MR`,
  `_reprise`, `Short`, `Extended`, the Afterlands' `_Night` re-scores) are left out of `ANSWERS`.

The generator **fails loudly** rather than silently shrinking the pool: it exits non-zero if a
curated track is missing from the manifest, an answer has no tracks, or an answer's `mark` is not in
`ui-mark.json`. Each answer carries a `ui-mark` icon id shown in the picker and on reveal, so adding
an answer means finding its mark in that manifest. Note the mark id is the WZ asset name, not the
answer label — Geardock's mark is `Geardrak`, Karote's is `karotte`. The round-robin balancer trims
the pool to 365 puzzles so the daily sequence is exactly a year before it repeats, and the largest
pools give up their surplus first.

**Results** live under the `bgmGuesser` section of the shared games key.
