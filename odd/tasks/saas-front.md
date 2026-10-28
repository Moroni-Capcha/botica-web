# saas-front

## Objective
Build the front-end side of the SaaS roadmap in `CLAUDE.md` (items 1-6), contract first, mock second, UI third.

## Constraints
- UI text in Peruvian Spanish; no new dependencies unless unavoidable; `docs/API.md` is the source of truth.
- Domain rules are pure, in `src/lib/domain/`, each with tests.
- Checks: `npm run typecheck`, `npm test`. TDD mode: not configured (ordinary functional checks; domain rules get tests anyway). Runner: Vitest.
- Branch: `feat/saas-front`. One work-unit commit per task. No push without user decision.

## Tasks
- [ ] T1 Contract + types + mock + domain: tenant (botica code), owner login (email/password), account status (trial/active/overdue/suspended), plan modules, read-only guard. Docs in `docs/API.md`.
- [ ] T2 Login UI: botica code + owner/counter modes; session carries tenant; PIN stays for counter.
- [ ] T3 Ajustes "Plan y facturación" tab, account banner, read-only blocking, modules gated by plan (`nav.ts`).
- [ ] T4 Guided signup and first-run setup wizard.
- [ ] T5 SUNAT vouchers: status, resend, void, credit note, 80 mm ticket print.
- [ ] T6 Offline POS (PWA + sales queue).
- [ ] T7 Audit log, internal Digi!HME console, Sentry hook, server-side pagination.

## Route per task
T1 delegated writer (contract/types/mock/http/domain/docs, 2+ files). Others decided at start.

## Progress / evidence
(branch created from master @3086017; typecheck + 93 tests green at start)

## Next step
T1.
