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
- [x] L1 (a718493) App frame: `src/components/layout/*`, `src/app/(app)/layout.tsx`.
- [x] L2 (78d6593) Offline: `src/features/offline/*`.
- [x] L3 (951e55b) Auditoría and error screens: `src/features/audit/*`, `src/app/error.tsx`, `src/app/global-error.tsx`.

## Route per task
One delegated writer (4+ files); parent verifies with typecheck, tests and browser at 1568, 768 and 390 px, then commits per phase.

## Progress / evidence
Delegated writer, one pass over the three phases. `npm run typecheck` clean; `npm test` 46 files / 421 tests pass. Only 4 intentional `bg-white/xx` (translucent white on the brand-colored sidebar and mobile nav) remain.
Parent fix: the writer's 40 px topbar buttons truncated "Punto de venta" at 390 px; topbar padding/gap reduced on mobile (`px-3 gap-1.5`) and all six titles checked full-width.
Browser check (parent, dev server): 1568 px panel and Auditoria; 390 and 768 px Auditoria, Panel, POS and six titles: no page-level overflow, no clipped content. Auditoria cards under 768 px visible.
NOT checked on screen: the pending-sales dialog and offline states, error.tsx / global-error.tsx, real phone, `npm run build`.

## Next step
User decides push/PR. Remaining raw-palette areas: platform console, onboarding.
