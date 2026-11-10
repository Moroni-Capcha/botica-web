# pos-scanner

## Objective
In the POS, a barcode scanner must work even when the search box is not focused, and an unknown code must say so instead of failing silently.

## Findings (existing behavior, not rebuilt)
- F2 focuses search, Ctrl+Enter opens payment, Esc clears or blurs search (`use-pos-shortcuts.ts`).
- Enter in the search box adds the product whose `barcode` equals the text (`onSearchKey` in `pos-screen.tsx`).
- Gaps: scans are lost when focus is on a button or the page body; an unknown code in the search box does nothing.

## Constraints
- Adding goes through the SAME `add` handler (stock, FEFO, offline). No shortcut around it.
- Scanner detection is a pure rule in `src/lib/domain/` with Vitest tests (burst of fast keys ending in Enter). No new dependencies.
- Does nothing while a dialog is open or while typing in another field; a recognized scan must not also press a focused button.
- UI text in Peruvian Spanish. No Co-Authored-By. Conventional commits. No push or merge without the user.
- Checks: `npm run typecheck`, `npm test`, browser check. TDD: not configured; the pure rule gets tests. Runner: Vitest.

## Tasks
- [x] S1 Pure scan detector `feedScanKey` (+ tests).
- [x] S2 `usePosScanner` hook wired in the POS screen, plus "code not found" feedback in the search box.

## Route per task
Direct inline (2 small files plus one wiring edit, already understood).

## Evidence
- typecheck clean; 461 tests pass (7 new in scan.test.ts).
- Browser (admin, mock): a fast burst with focus outside the search box added Paracetamol; an unknown code showed the not-found notice; slow typing did not add anything.
