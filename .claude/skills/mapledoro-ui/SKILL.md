---
name: mapledoro-ui
description: MapleDoro's project-specific UI conventions — styling/theming system, layout structure, React-Doctor rules, and game-art image policy. Invoke before writing, refining, or reviewing any React/TSX component or workspace in this repo. This is the project constraint layer; pair it with the frontend-design skill (aesthetics) and the react-doctor skill (automated enforcement).
---

# MapleDoro UI conventions

The single source of truth for how UI is built and reviewed in MapleDoro. The **frontend-designer** agent applies these while building, **code-reviewer** enforces them, and the main thread follows them for small direct edits.

## Stack & styling constraints

- **Next.js 16** (App Router), **React 19**, **TypeScript** (strict).
- **Styling: inline styles for dynamic theming + global CSS. No Tailwind. No CSS-in-JS libraries.** Dynamic (per-theme) colors go inline; static shape lives in global CSS classes.
- Charts: `react-chartjs-2` / `chart.js`; hand-rolled SVG for small one-offs.

## Theming system (use it, don't reinvent it)

Form controls split **static shape** (global CSS classes) from **dynamic theme colors** (inline via `toolStyles(theme)` in `tool-styles.ts`, which returns **colors only** — `background` / `borderColor` / `color`).

- `className="tool-input"` — text/number/date inputs
- `className="tool-select"` — dropdowns
- `className="tool-field-label"` — uppercase field labels
- `className="tool-dialog-btn"` — modal action buttons

Context sizing (widths, compact paddings) stays inline. **Don't re-add radius/padding/font to per-tool style helpers — extend the CSS class instead.** Reuse `Field` (uppercase label + control), `Toggle`, and `PillGroup` from `shared-ui.tsx`. Prefer reusing existing theme properties over adding new ones.

## Layout conventions

- **Route pages** (`src/app/tools/<name>/page.tsx`) are thin `"use client"` shells wrapping a workspace in `AppShell`.
- **Workspace layout:** outer padding `1.5rem 1.5rem 2rem 2.75rem`, inner `maxWidth: 900, margin: "0 auto"`. `<ToolHeader>` first, then panel sections.
- **SSR/client gate:** read localStorage only through `useMounted()` (`src/lib/useMounted.ts`) — false during SSR/hydration, true after mount.

## React-Doctor rules (must follow)

- **Clickable elements:** real `<button>` (reset appearance: `background: none; border: none; padding: 0; font: inherit; text-align: inherit`). Only fall back to a `role="button"` div/span (`tabIndex={0}` + Enter/Space `onKeyDown`) when nesting interactive content.
- **Minimum font size `0.75rem` (12px)** — never smaller.
- **Image error fallbacks:** dual-render with refs (`display:none` on fallback, swap via `onError`), not `useState` toggles.
- **No `autoFocus`** — guarded ref callback: `ref={(el) => { if (el && document.activeElement !== el) el.focus(); }}`.
- **localStorage writes:** synchronously inside state updaters, not in a `useEffect` watching state.
- **Internal links → `next/link`.** Images default to `next/image`, but a plain `<img>` is the right call for small/fixed-size art where optimization wastes CDN transformations or makes the image worse — don't blindly enforce `next/image`.
- **No unused exported types** (Knip).
- **Extract large inline `style={{…}}` objects** into named `CSSProperties` vars outside JSX.

These derive from the react-doctor scanner. After UI work, run the **react-doctor** skill (`npm run doctor`) for an automated pass, then triage per that skill's rulings. It is advisory — `npm run build` + `npm run lint` remain the gate.

## Image policy

Game art comes from the self-hosted **MapleResource API** (`haku.network`) via pure id→URL components in `src/components/ResourceImage.tsx`: `<ItemIcon>`, `<MobSprite>`, `<SkillIcon>`, `<HexaSkillIcon>`, `<FamiliarSprite>` (new hosts → `next.config.mjs` `remotePatterns`). Item icons default shadowless (`iconRaw.png`; pass `shadow` for framed). Boss icons have no component — use `bossIconUrl(id)`, stored as `icon` strings in boss data (`bosses.ts`, `liberation-data.ts`, `astra-data.ts`, `trace-restoration-data.ts`). Familiars: `<FamiliarSprite>` is direct-sprite only; mob/card-backed ones use `<MobSprite>`/`<ItemIcon>` per manifest `spriteFrom`.

To resolve a name→ID for new art, delegate to the **manifest-finder** agent (no name→ID map; manifests are dev-only, `item.json` ~17 MB). Don't grep it yourself.

## Related

- Per-character vs global tool data storage: see `## Key Patterns` in the root `CLAUDE.md` (`characterToolStorage.ts` / `globalToolsStore.ts`).
- Nested `src/features/**/CLAUDE.md` carry feature-specific invariants — consult the one for the area you touch.
