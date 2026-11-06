# platform-console-detail-metrics

## Objective
Give Digi!HME support more than a list: a read-only detail of each botica (S1) and platform metrics (S2). Front only: contract in `docs/API.md` first, then types, `contract.ts`, `http.ts`, mock, pure domain rules with tests, screen, docs. The backend is built by someone else; we only define the contract and the mock.

## Constraints
- Platform session only (`platformApi`, `bh.platform.session`, no `X-Botica`). No botica screen links to the console.
- Privacy: never DNI, customer names, PIN, or sale line items in any platform payload or screen. Only counts, dates, plan, branch names and staff display names/roles.
- Read-only. No impersonation, no billing, no operator management (out of scope, needs backend/security decisions).
- Soles with 2 decimals (`round2`), prices with IGV, dates `YYYY-MM-DD` (America/Lima), instants ISO.
- Mock changes: same validations and `fail(code, message, status)`; bump `VERSION` if the data shape changes.
- UI text in Peruvian Spanish, semantic tokens only (no raw palette), reuse `src/components/ui/*`, no new dependencies, charts only with `ColumnChart`.
- Checks: `npm run typecheck`, `npm test`, `npm run build`. TDD: not configured. Runner: Vitest.
- Conventional commits, no AI attribution. One work-unit commit per phase. No push or merge without the user.

## Contract (decided by the parent)
S1 `GET /platform/tenants/:code` -> `TenantDetail`: `{ tenant: TenantSummary, branches: [{ id, name, active, closed }], staff: [{ name, role, active, lastLoginAt|null }], activity: { salesLast30Days: number, vouchersLast30Days: { accepted, pending, rejected }, lastSaleAt|null }, history: [{ at, action, reason }] }`. `history` are the Digi!HME actions on that botica (plan/prueba/suspension), newest first, max 20. `404 BOTICA_NO_ENCONTRADA`.
S2 `GET /platform/metrics` -> `PlatformMetrics`: `{ counts by status, newTenantsByMonth: [{ month: "YYYY-MM", count }] (last 6), inactive: TenantSummary[] (no activity for 14+ days, active or trial, max 10), trialsEndingSoon: TenantSummary[] (trial ends within 7 days, max 10), monthlyRecurringRevenue: number (sum of plan prices of status active, sin IGV and con IGV both as fields) }`.

## Tasks
- [ ] S1 Tenant detail: contract + types + http + mock + `domain/platform.ts` helpers with tests + dialog/page from the console list (row click) + docs.
- [ ] S2 Metrics: contract + types + http + mock + pure rules with tests + metrics block on `/consola` + docs.

## Route per task
One delegated writer per phase (sonnet, no git); parent verifies (typecheck, tests, build, `rg` for raw palette and leaked JSX, privacy check on payloads, browser check) and commits per phase.

## Progress / evidence
Pending.

## Next step
Delegate S1.
