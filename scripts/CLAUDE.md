# Data Generators

Everything in `scripts/` writes generated data into the app (`public/data/`, `*.generated.ts`, `*Data.ts`). Nothing here runs at build time, so a stale output never errors, it just serves old content: re-run the generator and diff its output before committing.

Two triggers, one per group below: a game version bump for the manifest generators, and the source's own changes for the scrapers.

## Manifest generators (version bump)

- **Bumping the version:** every `gen-*.mjs`/`generate-*.mjs` has its own hardcoded manifest path. Grep `scripts/` for the old version string and update every hit together, or a generator silently keeps reading the old manifest and masks real data drift.
- **After bumping, actually re-run each generator** — repointing isn't regenerating. At minimum: `gen-equipment.mjs` (needs `EQUIP_ICON_DIR` + `EQUIP_DEDUP_VERDICTS`, see its doc comment), `gen-familiars.mjs` (needs `FAMILIAR_DUMP_DIR` for reissue dedup; without it, duplicate picker rows return), `gen-vmatrix.mjs`, `gen-stat-baselines.mjs`. Diff before committing; a same-id-count regen can still hide real stat/name changes.
- **The daily games' generators are excluded** — regenerating a puzzle payload reshuffles the daily order and breaks in-flight streaks, so a version bump is not a reason to re-run them (Mapledle's payload is still v269 on purpose; see its feature doc).

## External data scrapers (own trigger)

These read live external sites rather than WZ manifests, so a version bump is not their trigger.

- `generate-bgm-guesser-data.mjs` → `src/features/games/bgm-guesser/puzzle-data.generated.ts`. Combines `manifests/v270/bgm.json` with a hand-curated track→answer allowlist in the script, fetching [maplebgm-db](https://github.com/maplestory-music/maplebgm-db) at generation time for titles. Re-run only when the curation changes; it exits non-zero if a curated track or answer icon no longer resolves. New BGMs are *not* picked up automatically, by design.
- `scrape-bosscut.mjs` → `src/features/characters/scouter/bosscut-data.generated.ts`. MapleScouter's crowdsourced Boss Clear (Cut) thresholds and boss requirement physics. Re-run whenever a MapleStory version drops: MapleScouter adds new bosses ahead of the official patch, so this both picks up new content and re-syncs community-revised numbers. It locates the data by content-fingerprinting its object shape, not a module ID or chunk filename (both reshuffle every deploy). A failed fingerprint, or output that stops matching real in-game results, means the data shape or the formula itself changed — investigate before trusting it.
- `scrape-class-resources.mjs` → `src/app/guides/character-guides/classResources.ts` (used by the `[className]` guide page). Per-class community links from a third-party class-reference site (URL in the script). Re-run only when a class's resources change or a new class needs an entry, not on a version bump; its `CLASS_PATHS` table maps our class names to that source's slugs.
