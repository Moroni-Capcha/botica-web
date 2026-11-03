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
- [x] C1 Clientes (f646a3a): customers-screen, customer-dialog (tokens, table/cards, search, states, consent/Ley 29733 clarity, a11y, mobile).
- [x] C2 Comprobantes (4a9747b): vouchers-screen, status-badge, voucher-dialog, void-dialog, credit-note-dialog, ticket (tokens, SUNAT status chips, filters, states, mobile, a11y).

## Route per task
One delegated writer per phase; parent verifies with typecheck, tests and browser.

## Progress / evidence
(branch from master @ 23e54d9)
- C1 f646a3a `feat(ui): redesign customers screen`: new `customers-rows.tsx` (memo `RefillItem`, `CustomerRow`, `CustomerCard`, `ConsentChip`), Card list under 768 px, sticky table, aria-live counts, consent Chip (icon + text) in table, cards, refill list and dialog; refill status chips with icon + text; WhatsApp hex replaced by primary button. Consent and DNI/RUC validation untouched. Route: delegated writer.
- C2 4a9747b `feat(ui): redesign vouchers screens`: new `vouchers-rows.tsx` (memo `VoucherTableRow`, `VoucherCard`), `StatusBadge` now Chip with icon + text (Clock/CircleCheck/CircleX/Ban), filters in a Card with aria-live count, "Estado" filter is now a Segmented with live counts (same values, was a Select), clear-filters action, dialogs on tokens, ticket `text-[13px]`/`text-[10px]` moved to `.ticket-title`/`.ticket-fine` in globals.css (same px sizes), dashed rule border zinc-400 -> `border-muted`.
- Checks: `npm run typecheck` clean; `npm test` 43 files / 367 tests pass (after each commit); `npm run build` OK (.next deleted first). No new pure logic extracted, so no new tests.
- NOT verified in a browser: layout at 360/768/1280 px, focus rings, stagger, reduced motion, real print preview of the 80 mm ticket, Segmented overflow with 5 estado options on narrow screens, refill list and WhatsApp/tel links.

## Next step
Parent: browser check of /clientes and /comprobantes (incl. print preview of the ticket), then decide on push/PR.
