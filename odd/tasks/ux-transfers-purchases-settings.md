# ux-transfers-purchases-settings

## Objective
Bring Traslados (`/traslados`), Compras (`/compras`) and Ajustes (`/ajustes`) to the standard of the other redesigned modules: semantic tokens instead of raw `zinc`/`rose`/`amber` colors, base components (`Card`, `Chip`, `Segmented`, `Button`), hierarchy, accessibility, mobile at 390 px, GPU-only motion.

## Constraints
- No new dependencies. UI text in Peruvian Spanish. Botica colors only via `--brand` / `--accent`.
- Do not change API, domain, mock, rules or any number.
- Motion: only transform/opacity, easing `cubic-bezier(0.16, 1, 0.3, 1)`, reduced motion respected. Tab switch already uses `animate-swap-in`; keep it.
- Checks: `npm run typecheck`, `npm test`. TDD: not configured; Runner: Vitest.
- Branch `feat/ux-transfers-purchases-settings` (from `fix/ux-mobile-pos`). One work-unit commit per phase. No push or merge without the user.

## Tasks
- [x] T1 Traslados (cb28433): transfers-screen, transfer-dialog.
- [x] T2 Compras (57a2cbe): purchases-screen, import-dialog, receive-dialog, supplier-dialog.
- [x] T3 Ajustes (893d518): settings-screen, plan-billing, account-dialog, branch-dialogs.

## Route per task
One delegated writer for all three (same pattern, 4+ files each); parent verifies with typecheck, tests and browser at 1568 px and 390 px, then commits one work unit per phase.

## Progress / evidence
(branch from fix/ux-mobile-pos @ 399a66a)

Evidence: delegated writer, one pass over all three phases. After each phase `npm run typecheck` clean and `npm test` 43 files / 367 tests pass. No raw palette colors left in transfers/, purchases/, settings/. New `transfers-rows.tsx` and `purchases-rows.tsx`; cards under 768 px for history, suggestions, receipts and accounts; status as Chip with icon + text.
Browser check (parent): 1568 px and 390 px (iframe), no page-level horizontal overflow, no console errors. NOT checked: dialogs (new transfer, receive, import, supplier, branch, account), 768 px, reduced motion.

## Next step
User decides push/PR; check the dialogs.
