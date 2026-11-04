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
- [ ] A1 Asistencia: attendance-screen and its dialogs/kiosk (all files in `src/features/attendance/`).
- [ ] A2 Reportes: reports-screen and its pieces (all files in `src/features/reports/`).

## Route per task
One delegated writer (4+ files); parent verifies with typecheck, tests and browser at 1568, 768 and 390 px, then commits per phase.

## Progress / evidence

## Next step
Delegate writer.
