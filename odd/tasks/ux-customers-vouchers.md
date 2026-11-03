# ux-customers-vouchers

## Objective
Bring Clientes (`/clientes`) and Comprobantes (`/comprobantes`) to the standard of POS, cash, panel, inventory and expiry: semantic tokens, base components, hierarchy, accessibility, GPU-only motion.

## Constraints
- No new dependencies. UI text in Peruvian Spanish. Botica colors only via `--brand` / `--accent`.
- Do not change API, domain, mock, SUNAT states, credit-note rules or any number. Ticket 80 mm print layout keeps working.
- Motion: only transform/opacity, easing `cubic-bezier(0.16, 1, 0.3, 1)`, no re-render jank, reduced motion respected.
- Checks: `npm run typecheck`, `npm test`, `npm run build` (stop dev and delete `.next` before building). TDD: not configured; pure helpers get tests. Runner: Vitest.
- Branch `feat/ux-customers-vouchers`. One work-unit commit per phase. No push or merge without the user.

## Tasks
- [ ] C1 Clientes: customers-screen, customer-dialog (tokens, table/cards, search, states, consent/Ley 29733 clarity, a11y, mobile).
- [ ] C2 Comprobantes: vouchers-screen, status-badge, voucher-dialog, void-dialog, credit-note-dialog, ticket (tokens, SUNAT status chips, filters, states, mobile, a11y).

## Route per task
One delegated writer per phase; parent verifies with typecheck, tests and browser.

## Progress / evidence
(branch from master @ 23e54d9)

## Next step
Delegate C1.
