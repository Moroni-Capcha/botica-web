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
- [ ] T5 SUNAT vouchers: status, resend, void, credit note, 80 mm ticket print.
- [ ] T6 Offline POS (PWA + sales queue).
- [ ] T7 Audit log, internal Digi!HME console, Sentry hook, server-side pagination.

## Route per task
T1 delegated writer (contract/types/mock/http/domain/docs, 2+ files). Others decided at start.

## Progress / evidence
(branch created from master @3086017; typecheck + 93 tests green at start)

## Next step
T1.
