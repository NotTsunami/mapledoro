---
name: react-doctor
description: Run the react-doctor CLI scanner on MapleDoro React/TypeScript code to catch correctness, performance, accessibility, and maintainability issues, then triage findings against this project's conventions. Use after UI/component work, when auditing a feature, or when the user asks for a health check. Advisory only — it informs review, it does not gate the build.
---

# react-doctor (MapleDoro)

react-doctor is a third-party CLI scanner (`npx react-doctor@latest`) that grades React code 0–100 and lists correctness/perf/a11y/maintainability findings. MapleDoro's hand-written "React-Doctor rules" in `CLAUDE.md` are derived from it — this skill runs the actual tool so those rules get real enforcement, and adds a11y/perf coverage ESLint doesn't have.

It is **advisory**, not a gate. The build gate is still `npm run build` + `npm run lint` (build-lint-verifier agent). Never block on the score and never mass-apply react-doctor's fixes.

## How to run

```sh
npm run doctor              # scoped to changes (== react-doctor . --verbose --scope changed)
npx react-doctor@latest . --verbose          # full-repo audit
npx react-doctor@latest . --score            # just the number
```

Prefer `--scope changed` after a chunk of work so you only see what you introduced. Full audits are for deliberate health checks.

## Triage (critical — the tool is generic, this project is not)

The CLI does not know MapleDoro's stack or conventions. Treat every finding as a hypothesis and read the file before acting. Project-specific rulings:

**Its fix advice sometimes violates our constraints — follow the project, not the tool:**
- "Move inline styles to a CSS class / **Tailwind** / styled-component" → Tailwind and CSS-in-JS are banned here. The correct fix is our rule: extract the large inline object into a named `CSSProperties` const (dynamic theme colors stay inline), or move it to a global CSS class. See the theming pattern in `CLAUDE.md`.

**Known false positives — do not "fix" without strong evidence:**
- **Unused export** on the `ResourceImage.tsx` components (`<ItemIcon>`, `<MobSprite>`, `<SkillIcon>`, `<HexaSkillIcon>`, `<FamiliarSprite>`) and other documented public APIs — these are the intended surface even if no in-repo module imports them yet. Knip (in `npm run lint`) is the authority on dead exports, not react-doctor.
- **Role used instead of HTML tag** (`role="option"`, etc.) on our custom dropdown/combobox widgets — often intentional because native `<option>`/`<select>` can't carry the styled/interactive content. Only change when a native element genuinely works.

**High-signal findings that map to rules we already hold — treat as real:**
- **Text is too small** → our min `0.75rem` (12px) floor. Fix these.
- **Large inline style object** → extract to named `CSSProperties` (per above).
- **Multiple/cascading setState in one effect**, **prop derived into useState**, **all state reset on prop change** → align with our `react-hooks/set-state-in-effect` and image-fallback rules. Fix or refactor per CLAUDE.md.

**Genuinely new coverage worth adopting case-by-case:** accessibility (missing/unassociated labels, accessible names), perf (await-in-loop → `Promise.all`, `includes` in loop → `Set`, `[...].sort()` → `toSorted()`, lazy ref init).

## Output discipline

Full output is long (100+ findings). When running inside the main context, scope to changed files or pipe to a scratch file and report only the triaged conclusions (true positive / false positive / needs-review + file:line), not the raw dump. This pairs naturally with the **code-reviewer** agent, which can run this scan as its automated pass before giving manual findings.

Do not commit, open PRs, or mass-fix a rule spanning dozens of files in one pass. Fix a representative case, confirm it holds, surface the rest as a worklist.
