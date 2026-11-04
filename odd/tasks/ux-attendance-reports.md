# ux-attendance-reports

## Objective
Bring Asistencia (`/asistencia`) and Reportes (`/reportes`) to the standard of the redesigned modules: semantic tokens instead of raw `zinc`/`rose`/`amber`/`emerald` colors, base components (`Card`, `Chip`, `Segmented`, `Button`), hierarchy, accessibility, mobile at 390 px, GPU-only motion.

## Constraints
- No new dependencies. UI text in Peruvian Spanish. Botica colors only via `--brand` / `--accent`.
- Do not change API, domain, mock, rules or any number. Charts keep max 4 series, text never in the series color (CLAUDE.md).
- Motion: only transform/opacity, easing `cubic-bezier(0.16, 1, 0.3, 1)`, reduced motion respected. Keep the existing `animate-swap-in` wrappers and their `key`.
- Status always icon + text, never color alone. Cards under 768 px where a table scrolls sideways.
- Checks: `npm run typecheck`, `npm test`. TDD: not configured. Runner: Vitest.
- No Co-Authored-By. Conventional commits. One work-unit commit per phase. No push or merge without the user.

## Tasks
- [x] A1 (ba2e784) Asistencia: attendance-screen and its dialogs/kiosk (all files in `src/features/attendance/`).
- [x] A2 (60fea01) Reportes: reports-screen and its pieces (all files in `src/features/reports/`).

## Route per task
One delegated writer (4+ files); parent verifies with typecheck, tests and browser at 1568, 768 and 390 px, then commits per phase.

## Progress / evidence
Delegated writer, one pass over both phases. `npm run typecheck` clean; `npm test` 46 files / 421 tests pass. No raw palette classes left in `attendance/` or `reports/`. New `attendance-rows.tsx` and `reports-tables.tsx`; cards under 768 px; status as Chip with icon + text; timeline bars on tokens with a text legend.
Browser check (parent, dev server): 1568 px all four Asistencia tabs and Reportes; 390 and 768 px for both: no page-level overflow, no clipped content, no leaked code text.
NOT checked: dialogs (marcar, marca manual, nuevo trabajador, kiosk) on screen, Reportes sub-tabs other than Producto, real phone, `npm run build`.

## Next step
User decides push/PR. Remaining raw-palette areas: platform console, onboarding, layout (sidebar/topbar/mobile nav), offline, audit.
