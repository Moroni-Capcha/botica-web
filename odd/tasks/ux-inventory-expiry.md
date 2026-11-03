# ux-inventory-expiry

## Objective
Bring Inventario (`/inventario`) and Vencimientos (`/vencimientos`) to the standard of POS, cash, login and panel (semantic tokens, base components, hierarchy, accessibility, motion), after tightening the motion rules.

## Motion rules added by the user (apply to this and every later UI task)
1. GPU only: animate `transform` (translate3d, scale) and `opacity`. Never width, height, margin, padding or `grid-template-rows`.
2. Easing: `cubic-bezier(0.16, 1, 0.3, 1)` (replaces the previous `--ease-out`).
3. Performance: no re-render jank; animations must not make React re-render lists (refs and Web Animations / CSS classes, memoized rows, stable keys).
4. No Framer Motion or any new dependency (project rule): CSS keyframes/transitions and Web Animations API cover the same needs.
Known violation found in the audit: `src/features/pos/cart-panel.tsx` animates `grid-template-rows` (cart line exit collapse).

## Constraints
- No new dependencies. UI text in Peruvian Spanish. Botica colors only via `--brand` / `--accent`.
- Do not change API, domain, mock or stock/FEFO/expiry logic: every number must stay identical.
- Reduced motion respected through `src/lib/motion.ts` and the global CSS.
- Checks: `npm run typecheck`, `npm test`, `npm run build` (stop `npm run dev` and delete `.next` before building). TDD mode: not configured; pure helpers get tests. Runner: Vitest.
- Branch `feat/ux-inventory-expiry`. One work-unit commit per phase. No push or merge without the user.

## Tasks
- [x] M0 Motion rules: change `--ease-out` to `cubic-bezier(0.16, 1, 0.3, 1)`, remove the `grid-template-rows` animation in the cart (replace with transform/opacity plus a FLIP-style translate for the lines below), audit every animation for layout properties and for re-render cost, update README "Movimiento" and `src/lib/motion.ts` docs/tests.
- [x] I1 Inventario: tokens and components, table hierarchy and density, filters/search, stock and expiry chips, row actions, dialogs, states, mobile, accessibility, motion.
- [x] I2 Vencimientos: expiry semaphore hierarchy, risk-in-money figure as focal, lists and actions (discount, move, write-off), states, mobile, accessibility, motion.

## Route per task
Each phase: one delegated writer; parent verifies with typecheck, tests and a browser check before the next phase.

## Progress / evidence
(branch created from master @ 14edda3)
- M0 done in 38fd187: --ease-out = cubic-bezier(0.16, 1, 0.3, 1) (also default Tailwind transition curve); cart line exit now opacity + translate3d with FLIP (`playFlip`/`useFlipList`), no grid-template-rows; CSS keyframes and WAAPI use translate3d/scale3d; will-change only during animateIn; memo rows (CartPanel, CartLineRow, ProductCard stable props, SaleRow, ClosingRow) with `useStableCallback`; add-to-cart POP_KEYFRAMES. Checks: typecheck clean, 352 tests pass (was 344), build OK. Not verified in a browser yet (parent: cart add/remove, bars, dialogs).

Browser check M0 (2026-11-02, dev server, no console errors): with 2 cart lines, removing the first one (Panadol Forte) fades it with a transform (opacity 1 -> 0) and removes it from the DOM at about 230 ms; the remaining line ends with no inline transform and no `will-change`; total updates. NOT checked: FLIP slide of lines below with 3+ lines, two quick removals, add-to-cart pop feel, mobile sheet, dialogs/toast with the new curve, kiosk shake, reduced motion, React Profiler.

- I1 done in 8447830 (pending parent browser check): inventory tokens only (0 zinc/raw colors/text-[Npx]/hex/transition-all/style width); KPI strip (focal cost + precio venta + quick filters Bajo mínimo / Agotados / Con vencidos with aria-pressed); search with F2 or / shortcut + kbd hint, clear filters, aria-live count; sticky table h-12 rows memo + useStableCallback, stock cell with tone chip, expiry badge + date, location in meta, hover/focus edit IconButton, mobile card list (<768 px, useMediaQuery); group bars use scaleX; stagger first 8 rows once; dialogs tokens + exact action labels. Checks: typecheck clean, 359 tests pass (was 352; +7 stock-tone), build OK. NOT verified in a browser.

Browser check I1 (2026-11-02, dev server, no console errors): `/inventario` shows the focal brand KPI "Inventario a costo S/ 3,911.09", "A precio de venta", and the quick-filter KPIs (Bajo mínimo 6, Agotados 1, Con vencidos 3); table with bold stock, tone chips (Agotado, Bajo mínimo), expiry chips with days, sticky header; clicking "Bajo mínimo" gives 6 of 36 products, `aria-pressed` on the card, "Limpiar filtros" appears, the result count is in an `aria-live` region; clicking a row opens the detail dialog (prices and margin, FEFO lots, kardex). NOT checked: `F2` and `/` shortcuts, mobile card list (<768 px), single vs all locals, product create/edit dialogs, reduced motion, encargado view. Visual nits: the three filter selects truncate their text ("Todos los labora...", "Todas las fc..."). Behavior note: the old "Productos" KPI and the old combined "Agotados o bajo mínimo" KPI (which counted both but filtered only "bajo") were replaced by separate quick filters; products and lots counts moved to the section header.

- I2 done in 8e38745 (pending parent browser check): expiry files have 0 zinc/raw colors/text-[Npx]/hex/transition-all/style width. Focal brand KPI "Pérdida estimada si no se actúa" (same figure) + 4 semaphore KPI cards as quick filters (aria-pressed, Pulse via shared `Kpi`, now in `features/shared/kpi.tsx`); header with ScopeToggle and secondary Excel; sections with h2 and aria-live count; "Todos los lotes" has a group header per semaphore tone (same order, groups are consecutive); rows are memo + stable callbacks, days-left Chip with icon + text, lot code/location muted, tabular right-aligned numbers, sticky table header (maxHeight 640) and Card list under 768 px; primary action per row via `primaryAction` (vencido -> baja; else traslado if suggested, else vender, else baja); exit fade (opacity + translate3d) and FLIP on write-off via useAnimatedList/useFlipList (list remounts on filter change so filtering does not animate; `orderAnimatedRows` keeps loss order); stagger of the first 8 rows once; write-off dialog with inline errors (Field error now role=alert), exact button labels ("Dar de baja N unidades" in danger tone / "Devolver N unidades"), effect preview. Table got optional `bodyRef`. Checks: typecheck clean, 367 tests pass (was 359; +8), build OK. NOT verified in a browser. Notes: no per-lot discount or transfer dialog exists (bulk discount bar and /traslados link stay); no read-only/offline banner added (none on this screen before).

Browser check I2: pending (parent).

Browser check I2 (2026-11-02, dev server, no console errors): `/vencimientos` shows the focal brand card "Pérdida estimada si no se actúa S/ 642.62" and four semaphore cards (Vencido 3, Crítico 7, Por vencer 12, Vigente 35) with counts, ranges, units and cost; "Prioridad de venta" list with day chips (icon + text), tabular figures, red loss column and per-row actions (primary "Vender", secondary "Baja o canje"); the write-off dialog opens in "Devolver al proveedor" mode with the preview ("Se devuelve, a costo: S/ 282.00", "Quedarán en el lote: 0 unidades") and a button with the exact action ("Devolver 6 unidades"); closed with Esc without saving. NOT checked: semaphore card filtering, "Todos los lotes" group headers, merma mode and its confirmation, the bulk discount bar, row exit after an action, mobile card list, reduced motion. Visual nits: the "Baja o canje" button is tight/clipped at the right edge of the table; the inventory filter selects truncate their text.

Visual nits fixed (2026-11-02, commit after bdaebbd): expiry row actions stack vertically and the table min width drops to 1100 (no horizontal scroll, buttons fully visible); inventory filter selects widened so their text is no longer truncated. Checked in the browser.

## Next step
Open the PR (user decision).
