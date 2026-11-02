# ux-pos-caja

## Objective
Improve look, order and motion of the POS and cash screens (the most used by the counter staff), then share what is built through the base components and tokens so the rest of the app can follow.

## Problem (audit 2026-11-02)
- Only 3 tokens (`--brand`, `--accent`, `--canvas`); everything else is raw zinc/amber/rose/emerald and `text-[11px]`, mixed radii and shadows.
- Product card: three identical grey boxes for unit/blister/box prices, no focal point. Cart lines and total appear/change without motion.
- Cash: primary action is black while POS "Cobrar" is green; five equal KPI tiles.
- Dialog and toast have enter animation but no exit; mobile cart sheet has no Escape or focus trap; JS animation ignores `prefers-reduced-motion`.
- Small hit areas (qty +/- 32 px, remove ~28 px, chips ~28 px); `focus-visible` only on `Button`; `text-zinc-400` (about 2.5:1) on white.
- No `Card`, `Chip`, `IconButton` components; the same long class strings are repeated.

## Constraints
- No new dependencies (CSS and native Web Animations only). UI text in Peruvian Spanish. Do not write a botica name in code; brand colors come from `--brand` / `--accent`.
- Domain rules, API contract and mock behavior must not change.
- Motion: ease-out, under 300 ms for UI, only `transform` and `opacity`, never `transition: all`, respect `prefers-reduced-motion` (CSS and JS).
- Checks: `npm run typecheck`, `npm test`, `npm run build` (stop `npm run dev` and delete `.next` before building). TDD mode: not configured; pure helpers get tests. Runner: Vitest.
- Branch `feat/ux-pos-caja`. One work-unit commit per phase. No push or merge without the user.

## Tasks
- [x] F1 Base (commit 08a7749): semantic tokens (success, danger, warning, muted text, radius, shadow, type scale), `Card`, `Chip`, `IconButton`, visible `focus-visible` everywhere, contrast fixes, 44 px hit areas, shared motion tokens (durations, easing).
- [ ] F2 POS: product card hierarchy, cart line enter/exit and total transition, change (vuelto) emphasis, keyboard flow (F2 focus search, Esc, refocus after add/close), accessible mobile cart sheet (Escape, focus trap, animation), payment dialog polish.
- [ ] F3 Cash: single primary button style, KPI hierarchy, table density and order, number transitions, close dialog flow.
- [ ] F4 Motion system: exit animations for Dialog and Toast, reduced-motion in JS animations, list stagger, shared helpers.

## Route per task
Each phase: one delegated writer (2+ non-trivial files; reading that prepares the write goes with the write). Parent verifies with typecheck, tests and a browser check before the next phase.

## Progress / evidence
(branch created from master @ d8882e9; typecheck + 298 tests green at start)
- F1 (delegated writer, commit 08a7749): tokens in globals.css (text/surface/line, success/danger/warning/info/special with -fg/-bg/-border, radius, shadow, type scale micro/caption/small, motion, focus ring), new ui/card, chip, icon-button (hitArea 44 px), section-label, tone map, rowButtonClass; cn extended for custom names. Checks: `rm -rf .next && npm run build` OK, typecheck OK, `npm test` 301/301 (298 + 3 new). Leftovers in pos/cash: text-zinc-400 0, text-[11px]/[12px] 0, raw emerald/rose/amber/sky/violet/zinc 0. Browser check pending (parent).

## Next step
F2 (POS). Browser check of F1 first.
