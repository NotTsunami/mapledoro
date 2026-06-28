# CLAUDE.md

## Project Overview

MapleDoro — free, open-source MapleStory community web app (character tracking, gameplay tools, live event info). All user data lives in localStorage; server-side caching uses Redis. Not affiliated with Nexon.

## Tech Stack

- **Next.js 16** (App Router), **React 19**, **TypeScript** (strict)
- **Styling:** Inline styles for dynamic theming + global CSS (no Tailwind, no CSS-in-JS)
- **State:** React hooks + Context (theme) + localStorage
- **Server:** Redis (ioredis) char-lookup cache, Nexon CDN patch notes, Discord Sunny Sunday events
- **Linting:** ESLint 9 (eslint-config-next + eslint-plugin-sonarjs)
- **Charts:** `react-chartjs-2` / `chart.js` for standard charts; hand-rolled SVG for small one-offs

## Behavioral Guidelines

**Think first, simplest viable, surgical.** State assumptions and flag simpler approaches; present interpretations rather than silently picking one, and push back when warranted. Write the minimum code that solves the problem — no speculative features, single-use abstractions, or handling for impossible cases. Touch only what was asked, and match existing style.

## Agent Council

Specialized subagents live in `.claude/agents/`. You are the orchestrator: delegate high-token or specialized work to them and keep their verbose output out of this context.

| Agent | Use it for |
| --- | --- |
| **manifest-finder** | Resolving a game-object name → numeric ID (items, bosses, skills, mobs, familiars) from the manifests. |
| **game-researcher** | Researching in-game facts and systems — maplestorywiki.net for authoritative mechanics/stats/drops, community resources for insight into how systems work. |
| **frontend-designer** | Building or polishing UI — applies the `mapledoro-ui` + `frontend-design` skills. |
| **code-reviewer** | Reviewing recent changes for correctness, simplicity, and convention adherence (read-only). |
| **build-lint-verifier** | Running `npm run build` + `npm run lint`, fixing failures, confirming green. |
| **changelog-writer** | Recording a user-facing change in `src/app/changelog/page.tsx`. |

**Delegation playbook:** need an ID → manifest-finder; need a game fact or to understand a system → game-researcher; doing UI work → frontend-designer; user-facing change → changelog-writer; after a change → code-reviewer, then build-lint-verifier before declaring done. For small, isolated edits it's fine to act directly.

## Skills

Skills are the shared knowledge/procedure layer (in `.claude/skills/`), loaded on demand by agents and the main thread — the single source of truth so rules aren't duplicated across agents.

| Skill | Use it for |
| --- | --- |
| **`mapledoro-ui`** | Project UI conventions: theming system, layout, React-Doctor rules, image policy. Invoke before any component work or review. |
| **`react-doctor`** | Running the react-doctor scanner (`npm run doctor`) and triaging its findings. Advisory, after UI work. |
| **`frontend-design`** | Generic aesthetic direction and frontend technique (applied within `mapledoro-ui` constraints). |

## Changelog

User-facing changes (bug fix, feature, behavior change) need a matching entry in the `CHANGELOG` array (`src/app/changelog/page.tsx`); purely internal changes (refactors, tests, tooling, docs) don't. Delegate the entry to the **changelog-writer** agent, which owns the format, tone, type, and date rules.

## Build & Lint

`npm run build` and `npm run lint` must both pass before any work is complete. Delegate verification to the **build-lint-verifier** agent, which fixes failures and reports only the summary. While writing, avoid the two recurring lint traps: no bare `setState()` in `useEffect` (`react-hooks/set-state-in-effect`), and keep functions under the `sonarjs/cognitive-complexity` cap of 15 (extract cohesive sub-steps; don't micro-shuffle).

## UI Conventions

All project UI rules — styling/theming system, layout conventions, React-Doctor rules, and the game-art image policy — live in the **`mapledoro-ui`** skill. Invoke it before writing or reviewing any component (the **frontend-designer** and **code-reviewer** agents do this automatically). For automated enforcement run the **`react-doctor`** skill (`npm run doctor`); it's advisory — `npm run build` + `npm run lint` remain the gate. To resolve a name→ID for new art, delegate to the **manifest-finder** agent.

## Key Patterns

**UI structure & styling:** route page shells, workspace layout, the `useMounted()` SSR gate, the theming system, and `shared-ui.tsx` components — see the **`mapledoro-ui`** skill.

**Per-character tool storage:** Per-character tool data (symbols, liberation, hexa skills) is stored in each character's `tools` field within the character store (`mapledoro_characters_store_v1`). Read/write via `characterToolStorage.ts` helpers. Global tool data (dailies, event planner, boss crystals, pitched boss drops, trace restoration) lives in a single `mapledoro_tools_v1` key via `globalToolsStore.ts`.

## Feature Docs

Non-obvious domain rules and invariants live in nested `CLAUDE.md` files under `src/features/`. Consult them when working on a feature.
