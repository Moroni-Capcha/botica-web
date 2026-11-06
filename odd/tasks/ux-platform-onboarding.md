# ux-platform-onboarding

## Objective
Move the last raw-palette areas, the Digi!HME internal console (`src/features/platform/*`) and onboarding (`src/features/onboarding/*`), onto semantic tokens and the base `ui/` components.

## Constraints
- Front only: no changes to API contract, types, mock, domain rules, routing or the backend docs.
- Look must not regress: same layout, sizes, breakpoints. The console keeps the Digi!HME navy/cyan via `--brand` / `--accent`.
- Only raw palette classes (zinc/emerald/sky/amber/rose/...) become tokens (`text-fg`, `bg-surface`, `border-line`, `text-success-fg`, `bg-warning-bg`, etc., see `src/app/globals.css`).
- No new dependencies. UI text in Peruvian Spanish. Status = icon + text. Touch targets >= 40 px on mobile. Reduced motion respected.
- Checks: `npm run typecheck`, `npm test`. TDD: not configured. Runner: Vitest.
- Conventional commits, no AI attribution. One work-unit commit per phase. No push or merge without the user.

## Tasks
- [x] P1 (ec98349) Platform console: `src/features/platform/*` (4 files).
- [x] P2 (68638bc) Onboarding: `src/features/onboarding/*` (signup-screen only; setup-checklist had just `text-white` on a success fill).

## Route per task
One delegated writer (sonnet, no git); parent verifies with typecheck, tests, an `rg` for leaked raw palette and stray JSX, and a browser check, then commits per phase.

## Progress / evidence
Delegated writer (sonnet), one pass. Parent: `npm run typecheck` clean; `npm test` 46 files / 421 tests pass; palette `rg` over both folders returns nothing; no stray JSX. Leftover `text-white` on brand/navy/success fills is intentional.
NOT checked on screen: console, login and signup in the browser; `npm run build`.

## Next step
User decides push/PR. Browser check of /consola and signup pending.
