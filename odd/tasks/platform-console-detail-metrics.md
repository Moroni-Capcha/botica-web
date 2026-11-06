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
- [x] S1 (2720e4a) Tenant detail: contract + types + http + mock + `domain/platform.ts` helpers with tests + dialog from the console list (click the botica name) + docs.
- [x] S2 Metrics: contract + types + http + mock + pure rules with tests + metrics block on `/consola` + docs.

## Route per task
One delegated writer per phase (sonnet, no git); parent verifies (typecheck, tests, build, `rg` for raw palette and leaked JSX, privacy check on payloads, browser check) and commits per phase.

## Progress / evidence
Two delegated writers (sonnet), one per phase. Parent: `npm run typecheck` clean; `npm test` 46 files / 443 tests pass; `npm run build` passes; palette `rg` over `src/features/platform` clean.
Browser check (parent, dev server): 1568 px console with metrics (MRR S/ 129.80 con IGV, chart, empty "Sin actividad" and "Pruebas por vencer" states) and the detail dialog (branches, staff with role and last login, 30-day sales and SUNAT counts, empty Digi!HME history; no DNI, customer names or PIN). 390 and 768 px: no page overflow (375/375 and 753/753); the detail opens as a bottom sheet at 390 px.
Observations (not fixed): the four metric tiles and the four status filter cards repeat the same counts; the single bar in "Boticas nuevas por mes" is gray, not a brand color.
Data check after merge (parent, dev server, two mock boticas cloned in localStorage, one with a trial ending in 3 days and one idle for 30 days): "Sin actividad" listed the idle botica ("Hace 30 días") and "Pruebas por vencer" the trial ("Quedan 3 días"); tiles and chart (green bar) correct. Suspending the idle botica from the console refreshed the metrics on its own (MRR S/ 259.60 to S/ 129.80, Sin actividad 1 to 0, Suspendida 1), and its detail showed "Cuenta suspendida" with the reason in the history.
NOT checked: real phone, the lists with more than one row.

Follow-up fix (parent, inline): the metric tiles now show MRR, new botica this month, no-activity count and trials ending soon, so they no longer repeat the status filter cards; the chart no longer uses `highlightKey`, so the bar takes the series color. typecheck, 443 tests and build pass; not re-checked on screen.

## Next step
User decides merge.
