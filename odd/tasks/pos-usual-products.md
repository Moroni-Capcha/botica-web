# pos-usual-products

## Objective
In the POS, when a customer is attached to the sale, suggest what they usually buy as tappable chips ("Suele llevar") that add the product to the cart in one tap.

## Constraints
- Prefer data the front already has (customer purchase history hooks/endpoints in `queries.ts`). If that data cannot give product-level history, STOP and report instead of widening the contract.
- Adding goes through the SAME handler the product card uses (FEFO, prescription flow, cold chain, stock checks, offline mode). No shortcut around Rx rules.
- Pure ranking rule in `src/lib/domain/` with Vitest tests; no new dependencies; UI text in Peruvian Spanish; no customer name or DNI in logs/audit.
- Hidden when there is no customer, no history, or nothing suggestible; products without stock are not suggested.
- Motion only transform/opacity; reduced motion respected; works at 390 px; touch target >= 40 px.
- No Co-Authored-By. Conventional commits. No push or merge without the user.
- Checks: `npm run typecheck`, `npm test`. TDD: not configured; the pure helper gets tests. Runner: Vitest.

## Tasks
- [ ] U1 Pure rule `usualProducts` (+ tests).
- [ ] U2 Hook/data wiring and the "Suele llevar" row in the POS cart panel.

## Route per task
Delegated writer (reads several POS files first); parent verifies with typecheck, tests and browser.

## Progress / evidence

## Next step
Delegate writer.
