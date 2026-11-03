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
- [ ] I1 Inventario: tokens and components, table hierarchy and density, filters/search, stock and expiry chips, row actions, dialogs, states, mobile, accessibility, motion.
- [ ] I2 Vencimientos: expiry semaphore hierarchy, risk-in-money figure as focal, lists and actions (discount, move, write-off), states, mobile, accessibility, motion.

## Route per task
Each phase: one delegated writer; parent verifies with typecheck, tests and a browser check before the next phase.

## Progress / evidence
(branch created from master @ 14edda3)
- M0 done in 38fd187: --ease-out = cubic-bezier(0.16, 1, 0.3, 1) (also default Tailwind transition curve); cart line exit now opacity + translate3d with FLIP (`playFlip`/`useFlipList`), no grid-template-rows; CSS keyframes and WAAPI use translate3d/scale3d; will-change only during animateIn; memo rows (CartPanel, CartLineRow, ProductCard stable props, SaleRow, ClosingRow) with `useStableCallback`; add-to-cart POP_KEYFRAMES. Checks: typecheck clean, 352 tests pass (was 344), build OK. Not verified in a browser yet (parent: cart add/remove, bars, dialogs).

## Next step
I1 Inventario (after the parent's browser check of M0).
