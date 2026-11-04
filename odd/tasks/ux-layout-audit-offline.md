# ux-layout-audit-offline

## Objective
Move the remaining daily-use screens off raw palette colors onto semantic tokens/base components: app frame (sidebar, topbar, mobile nav, `(app)/layout.tsx`), offline pieces (`connection-status`, `pending-sales-dialog`), Auditoría and the app error screens (`error.tsx`, `global-error.tsx`).

## Constraints
- The look must not regress: the frame keeps the brand-colored sidebar/mobile nav and the same layout, sizes and breakpoints; only raw palette classes become tokens.
- No new dependencies. UI text in Peruvian Spanish. Botica colors only via `--brand` / `--accent`.
- Do not change API, domain, mock, rules, numbers, routing or the NavLink exit animation.
- Status = icon + text. Touch targets >= 40 px. Motion only transform/opacity, reduced motion respected.
- Checks: `npm run typecheck`, `npm test`. TDD: not configured. Runner: Vitest.
- No Co-Authored-By. Conventional commits. One work-unit commit per phase. No push or merge without the user.

## Tasks
- [ ] L1 App frame: `src/components/layout/*`, `src/app/(app)/layout.tsx`.
- [ ] L2 Offline: `src/features/offline/*`.
- [ ] L3 Auditoría and error screens: `src/features/audit/*`, `src/app/error.tsx`, `src/app/global-error.tsx`.

## Route per task
One delegated writer (4+ files); parent verifies with typecheck, tests and browser at 1568, 768 and 390 px, then commits per phase.

## Progress / evidence

## Next step
Delegate writer.
