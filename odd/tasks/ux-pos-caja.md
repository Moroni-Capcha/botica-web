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
- [x] F2 POS (commit 60bb806): product card hierarchy, cart line enter/exit and total transition, change (vuelto) emphasis, keyboard flow (F2 focus search, Esc, refocus after add/close), accessible mobile cart sheet (Escape, focus trap, animation), payment dialog polish.
- [x] F3 Cash (commit 7a2a6c5): single primary button style, KPI hierarchy, table density and order, number transitions, close dialog flow.
- [ ] F4 Motion system: exit animations for Dialog and Toast, reduced-motion in JS animations, list stagger, shared helpers.

## Route per task
Each phase: one delegated writer (2+ non-trivial files; reading that prepares the write goes with the write). Parent verifies with typecheck, tests and a browser check before the next phase.

## Progress / evidence
(branch created from master @ d8882e9; typecheck + 298 tests green at start)
- F1 (delegated writer, commit 08a7749): tokens in globals.css (text/surface/line, success/danger/warning/info/special with -fg/-bg/-border, radius, shadow, type scale micro/caption/small, motion, focus ring), new ui/card, chip, icon-button (hitArea 44 px), section-label, tone map, rowButtonClass; cn extended for custom names. Checks: `rm -rf .next && npm run build` OK, typecheck OK, `npm test` 301/301 (298 + 3 new). Leftovers in pos/cash: text-zinc-400 0, text-[11px]/[12px] 0, raw emerald/rose/amber/sky/violet/zinc 0. Browser check pending (parent).

- F2 (delegated writer, commit 60bb806): product card hierarchy (primary presentation via pickPrimaryPresentation), F2 hint chip, animated cart lines and total pulse, payment dialog focal amount + big change, use-pos-shortcuts (F2, Esc, Ctrl+Enter, refocus), accessible CartSheet via shared useFocusTrap (stacked modals, scroll lock counter), src/lib/motion.ts (prefersReducedMotion, animateIn). Checks: `rm -rf .next && npm run build` OK, typecheck OK, `npm test` 320/320 (301 + 19 new). Leftovers in src/features/pos: raw colors 0, text-[Npx] 0; only arbitrary px is the pre-existing aside `w-[380px]`. Nothing verified in a browser (parent pending).

Browser check F1+F2 (2026-11-02, dev server, no console errors): focus ring visible on search; product cards show the unit as the primary price; F2 focuses the search; Ctrl+Enter opens "Cobrar" with the total as focal point, focus on "Monto recibido", segmented payment methods; typing 10 on a S/ 1.40 sale shows "Vuelto S/ 8.60" large in the success tone; Esc closes the dialog and focus returns to the search. NOT checked: mobile cart sheet, reduced motion, the feel of the cart line animations (only the end state), narrow phones.

- F3 (delegated writer, commit 7a2a6c5): primary Button in cash/close dialog; focal KPI 'Debe haber en caja' (text-4xl, first, brand) with quiet KPIs (text-xl, muted); sales table sticky header + h-11 rows + payment Chip with icon; movements form on one row with Field labels and Empty compact; history diff column with sign and label via new describeDifference (4 new tests); useValuePulse on KPIs, sales total and close dialog totals; close dialog in 2 numbered steps, 44 px inputs with select-all, first denomination autofocus, success moment (animateIn) with 'Caja cerrada'; opening card with autofocus input and inline error; Table gained optional maxHeight (sticky head), Empty gained compact. Checks: `rm -rf .next && npm run build` OK, typecheck OK, `npm test` 324/324 (320 + 4 new). Leftovers in src/features/cash: raw colors 0, text-[Npx] 0, bg-zinc-900|bg-black 0, transition-all 0, variant="dark" 0. Nothing verified in a browser (parent pending).

Browser check F3 (2026-11-02, dev server, no console errors): "Debe haber en caja" is the wide brand-filled first KPI (S/ 167.60, breakdown wraps), the other four KPIs are quieter, payment methods are chips with icons, sticky table header, "Hacer arqueo y cerrar" is brand green. Close dialog: first denomination focused, running total with per-row subtotals, counting S/ 167.60 shows "Cuadra" in success tone with Contado/Debe haber; counting 0 shows "Falta S/ 167.60" in danger tone and a required reason field. Closed with Esc without closing the register. NOT checked: the closing success moment, history table, mobile layout, inline opening error, Space on history rows.

## Next step
F4 (Motion system).
