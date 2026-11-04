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
- [x] U1 Pure rule `usualProducts` (+ tests).
- [x] U2 Hook/data wiring and the "Suele llevar" row in the POS cart panel.

## Route per task
Delegated writer (reads several POS files first); parent verifies with typecheck, tests and browser.

## Progress / evidence
Delegated writer. Data source: existing `useCustomerPurchases(id)` (no contract, API.md or mock change). `npm run typecheck` clean; `npm test` 46 files / 421 tests pass (10 new cases for `usualProducts`).
Browser check (parent, dev server, mock): attached Rosa Huaman in the POS: row "Suele llevar" shows Losartan, Metformina and Azitromicina; tapping Azitromicina added it to the cart with the Receta tag and the prescription notice, and its chip disappeared; removing the customer hid the row. Also checked inside the 390 px cart sheet: chips wrap correctly. Test data cleared afterwards.
NOT checked: reduced motion, offline mode, `npm run build`, real phone.

## Next step
User decides push/PR (stacked on feat/copy-min-stock-new-branch and chore/remove-pending-module-route).
