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
- [ ] T7 Audit log, internal Digi!HME console, Sentry hook, server-side pagination.

## Route per task
T1 delegated writer (contract/types/mock/http/domain/docs, 2+ files). T2-T4 delegated writer.
T5, T6, T7: delegated writer each (2+ non-trivial files, preparation reading goes with the write). Goal set by user 2026-11-02: finish all front work so the backend team can work undisturbed (contract in `docs/API.md` complete for every module).

## Progress / evidence
(branch created from master @3086017; typecheck + 93 tests green at start)

## Next step
T7.
