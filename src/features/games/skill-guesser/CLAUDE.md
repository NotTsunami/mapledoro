# Mapledle (Skill Guesser)

User-facing name is **Mapledle** (matching the Discord Activity port); internal identifiers and the
`/games/skill-guesser` route keep the old name. Shared chrome, puzzle numbering, archive routing,
payload encoding and results storage are in [`../CLAUDE.md`](../CLAUDE.md); only the differences
are here.

Daily game: guess which class learns the shown skill icon in 5 tries. Puzzle #1 is 2026-06-11.
`GuessControls` is keyed by mode here so the search resets with the answer pool. Mode tabs, hint
cards and the skill-name reveal rule are Mapledle's own.

**Two modes per puzzle**, with independent guesses and results. Normal names the **class**
(`answer = puzzle.className`, picker from `SKILL_GUESSER_CLASSES`); hard names the **skill**
(`answer = puzzle.skillName`, picker from `allSkillNames()`). The whole board keys off that one
`answer`. Hard is locked until normal is **finished** (won or 5 guesses used). The **skill name stays
hidden everywhere until the player clears hard mode** (`results.hard.won`), so a normal finish reveals
only the class. Stats are per mode (`computeSkillGuesserStats(mode)`). Mirror behavior changes with
the Discord Activity port.

**Puzzle payload:** regenerate with `node scripts/generate-skill-guesser-data.mjs`. Tuples are
`[resourceType, skillId, skillName, className]` (0 = `skill`, 1 = `hexa-skill`, 2 = `erda-skill`,
rendered via `PuzzleSkillIcon`). Don't reorder the generator's filters; that reshuffles the daily
order the same way changing `SEED` would.

**The shipped payload was generated from v269 and is deliberately not re-run.** The script's manifest
path was bumped to `manifests/v270/skill.json` with the rest of `scripts/` in the v270 sweep, but the
payload was left alone: regenerating reshuffles the daily order and breaks every in-flight streak,
the same reason `SEED` is frozen. **The v270 path in the script is not evidence the payload is v270
data**, and a version bump alone is not a reason to re-run this one.

**Class attribution** comes from skill-id job prefixes (`floor(id/10000)`), not the manifest, which
has no class field. Excluded: branch-shared jobs (Explorer commons, beginners, 5th-job, removed
classes like Beast Tamer/Jett) and any name appearing in more than one class pool (shared icons are
unguessable). HEXA origin/ascent/mastery skills live in each class's HEXA job group (Hero = 114) with
per-skill icons; combined mastery icons are never used. Origin/ascent skills missing from skill.json
are backfilled from `hexa-classes.ts` via `hexa-skill` ids (Demon Slayer's Nightmare, Kain's Churning
Malice), and SHINE Erda Link enhancements come from `erda-skill` paths. The generator warns if a
class pool loses its origin/ascent.

**Answer pool + hints** (`classes.ts`): main stats follow
`characters/setup/data/classSkillData.ts`; secondary/weapon types were verified against GMS sources.
Renaming a class requires regenerating the payload, since the generator validates names against this
file.

**Results** live under the `skillGuesser` section of the shared games key, keyed by puzzle number to
`{ normal?, hard? }`. In-progress guesses persist too (`done: false`) and are excluded from stats.
The v1 shape (one result per puzzle plus a global `hardMode` toggle) migrates into the `normal` slot.
