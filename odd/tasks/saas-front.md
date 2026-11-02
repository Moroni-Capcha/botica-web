# saas-front

## Objective
Build the front-end side of the SaaS roadmap in `CLAUDE.md` (items 1-6), contract first, mock second, UI third.

## Constraints
- UI text in Peruvian Spanish; no new dependencies unless unavoidable; `docs/API.md` is the source of truth.
- Domain rules are pure, in `src/lib/domain/`, each with tests.
- Checks: `npm run typecheck`, `npm test`. TDD mode: not configured (ordinary functional checks; domain rules get tests anyway). Runner: Vitest.
- Branch: `feat/saas-front`. One work-unit commit per task. No push without user decision.

## Tasks
- [x] T1 (ef0cbff, typecheck ok, 101 tests) Contract + types + mock + domain: tenant (botica code), owner login (email/password), account status (trial/active/overdue/suspended), plan modules, read-only guard. Docs in `docs/API.md`.
- [x] T2+T3 done together (typecheck/build ok, 105 tests; NOT verified in browser). T2 Login UI: botica code + owner/counter modes; session carries tenant; PIN stays for counter.
- [x] T3 (cf166f0, with T2) Ajustes "Plan y facturación" tab, account banner, read-only blocking, modules gated by plan (`nav.ts`).
- [x] T4 (typecheck ok, 114 tests, build ok; NOT verified in browser) Guided signup (`/registro`) and first-run setup checklist on the panel. Mock: one dataset per botica code (`bh.mock.v1.<code>`), `VERSION` 13.
- [x] T5 (76bc25e, typecheck ok, 150 tests, build ok; NOT verified in browser or on a real 80 mm printer) SUNAT vouchers: status, resend, void (7-day rule), credit note (catalog 09: 01, 04, 06, 07, 09), 80 mm ticket print, `/comprobantes` screen + Excel. Mock `VERSION` 14. Notes do not yet subtract in reports/cash close.
- [x] T6 (5df2416, typecheck ok, 187 tests, build ok; NOT verified in a real browser: service worker install, IndexedDB queue, real offline/online switch and printing untested; `/sw.js` and `/manifest.webmanifest` only checked over HTTP on `next start`) Offline POS: PWA manifest + hand-written service worker (prod only), persistent sales queue (IndexedDB/localStorage) with `clientSaleId` idempotency and `OFF-0001` provisional tickets, FIFO auto/manual sync via `POST /sales/sync`, connection indicator + "Ventas por enviar" dialog, local stock reservation, persisted query cache. Mock `VERSION` unchanged (only optional fields added). Limits: session token lives in sessionStorage (closing the window offline requires login); only 256 px icon available; one tab assumed for OFF- numbering.
- [x] T7 (d776d59 audit, f206e39 console, e18876d monitoring + pagination; typecheck ok, 276 tests, build ok; NOT verified in a real browser: no screen, dialog, Excel download or error boundary was opened by hand; Sentry never contacted) Audit log, internal Digi!HME console, Sentry hook, server-side pagination.
  - Audit: `GET /audit` (admin, `Page<AuditEntry>`), one wrapper `auditWrites` in `mock/audit.ts` with per-endpoint rules (login incl. failed, sales/sync, void, credit note, price/cost changes, stock write-off/discount/purchase/transfers, cash, accounts, settings, branches); `/auditoria` screen with filters, pagination and Excel (module in Plan Crece and up). Mock `VERSION` 15 (`audit`, `createdAt`).
  - Console: `/consola` (route group `(platform)`), `POST /platform/login`, `POST /platform/logout`, `GET /platform/tenants` (paged, counts by status), `PATCH /platform/tenants/:code` (change plan, extend trial, suspend, reactivate, reason required, recorded in the botica audit). Separate token store `bh.platform.session`; `platformApi` is a separate client.
  - Monitoring: `src/lib/monitoring.ts` no-op without `NEXT_PUBLIC_SENTRY_DSN` and an SDK; PII scrubbed by `domain/privacy.ts`; `app/error.tsx`, `app/global-error.tsx`, TanStack Query cache hooks; README guide for DevOps.
  - Pagination: `Page<T>` convention in `docs/API.md`; required on audit and tenants, optional on `GET /kardex` and `GET /customers/all`; `Pagination` UI component. Not paginated on purpose: vouchers/credit notes (screen needs full-period status counts and filters) and reports.
- [x] T8 (713bd9c; typecheck ok, 294 tests, build ok; NOT verified in a real browser: cash, panel, reports, customers screens and their Excel downloads were not opened by hand) Credit notes subtract everywhere money is summarized. Pure rules in `domain/returns.ts` (+ `returns.test.ts`): notes count on the day/shift they were issued, by the original payment method (only cash touches the register), cost reverses at the origin lot cost only when stock returns. Contract: `CashSummary.returns/returnRows`, `CashClosing.returns`, `DailySales.returns`, `TodayStats.gross/returns` (`total` now net), `SalesReportLine.kind` (negative `devolucion` lines), `CustomerSummary.totalReturned`, `CustomerPurchase.returned`. Mock `VERSION` 16. Visible "Devoluciones / notas de crédito" line in cash, close detail, panel, reports and Excel exports. Known limit: a note issued while the register is closed subtracts from no shift.

## Route per task
T1 delegated writer (contract/types/mock/http/domain/docs, 2+ files). T2-T4 delegated writer.
T5, T6, T7, T8: delegated writer each (2+ non-trivial files, preparation reading goes with the write). Goal set by user 2026-11-02: finish all front work so the backend team can work undisturbed (contract in `docs/API.md` complete for every module).

## Progress / evidence
(branch created from master @3086017; typecheck + 93 tests green at start)

Browser check 2026-11-02 (dev server, Chrome, mock `bh-huanuco` data, no console errors on any page):
- Login (PIN), panel, `/comprobantes` (resend pending -> accepted, detail dialog with 80 mm ticket and actions), `/auditoria` (filters, paging, 55 -> 56 entries), `/consola` (operator login, tenant table), `/pos`.
- Offline POS simulated with `navigator.onLine = false`: banner "Sin conexión", sale saved as provisional `OFF-0001` ("1 por enviar"), back online it synced on its own and appeared as `B001-003128` in Comprobantes.
- Bug found and fixed: login with PIN re-submitted on every render after success (PIN stayed full while navigating), writing ~18 "Ingresó al sistema" audit entries per login. Fixed with a `sentPin` ref guard in `src/app/login/page.tsx`; re-tested: one login = one entry.
- NOT checked: real service worker install (prod build only), real 80 mm printer, Excel downloads, error boundary, real Sentry.
- Known gap: resending a voucher is not recorded in the audit log.

## Next step
Front work is complete (T1-T8). Remaining: PR decision, remaining manual checks above, and the backend implementing `docs/API.md`.
