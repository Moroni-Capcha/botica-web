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
- [ ] I2 Vencimientos: expiry semaphore hierarchy, risk-in-money figure as focal, lists and actions (discount, move, write-off), states, mobile, accessibility, motion.

## Route per task
Each phase: one delegated writer; parent verifies with typecheck, tests and a browser check before the next phase.

## Progress / evidence
(branch created from master @ 14edda3)
- M0 done in 38fd187: --ease-out = cubic-bezier(0.16, 1, 0.3, 1) (also default Tailwind transition curve); cart line exit now opacity + translate3d with FLIP (`playFlip`/`useFlipList`), no grid-template-rows; CSS keyframes and WAAPI use translate3d/scale3d; will-change only during animateIn; memo rows (CartPanel, CartLineRow, ProductCard stable props, SaleRow, ClosingRow) with `useStableCallback`; add-to-cart POP_KEYFRAMES. Checks: typecheck clean, 352 tests pass (was 344), build OK. Not verified in a browser yet (parent: cart add/remove, bars, dialogs).

Browser check M0 (2026-11-02, dev server, no console errors): with 2 cart lines, removing the first one (Panadol Forte) fades it with a transform (opacity 1 -> 0) and removes it from the DOM at about 230 ms; the remaining line ends with no inline transform and no `will-change`; total updates. NOT checked: FLIP slide of lines below with 3+ lines, two quick removals, add-to-cart pop feel, mobile sheet, dialogs/toast with the new curve, kiosk shake, reduced motion, React Profiler.

- I1 done in 8447830 (pending parent browser check): inventory tokens only (0 zinc/raw colors/text-[Npx]/hex/transition-all/style width); KPI strip (focal cost + precio venta + quick filters Bajo mínimo / Agotados / Con vencidos with aria-pressed); search with F2 or / shortcut + kbd hint, clear filters, aria-live count; sticky table h-12 rows memo + useStableCallback, stock cell with tone chip, expiry badge + date, location in meta, hover/focus edit IconButton, mobile card list (<768 px, useMediaQuery); group bars use scaleX; stagger first 8 rows once; dialogs tokens + exact action labels. Checks: typecheck clean, 359 tests pass (was 352; +7 stock-tone), build OK. NOT verified in a browser.

## Next step
I2 Vencimientos (browser check of I1 first).
