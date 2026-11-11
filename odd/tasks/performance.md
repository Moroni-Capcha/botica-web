# performance

## Objective
Make the whole system fast and fluid, also on low-end machines (2 cores, 4 GB or less).

## Method
Measure first. Production build (`next start`) with the mock catalog inflated to 3,036 products and 6,110 lots (a realistic pharmacy), measured in the browser with a long-task observer, DOM node counts and JS time. Frame timing was NOT used: the test tab throttles empty frames to about 1 s, so any metric that waits for a frame is an artifact.

## Findings (before)
- Bundles are already lean: about 100 kB per route plus 103 kB shared (about 200 kB first load). Not the bottleneck.
- No list was virtualized or paginated. POS rendered every product, Inventory every row, Expiry every lot.
  - POS: 77,284 DOM nodes, 6.5 s of long tasks on load, 83 MB JS heap.
  - Expiry: 111,806 DOM nodes, one 4.9 s long task.
- Search recomputed `toLowerCase` on 5 fields of every product per keystroke; sorting used `localeCompare` (rebuilds locale data per call).
- The menu alerts I added fetched lots (all branches) and vouchers on every screen, vouchers polled every minute everywhere.
- 24 orphan `next` processes from earlier test sessions were still running on the dev machine (cleaned up).

## Constraints
- No new dependencies (no virtualization library). Behavior of search, barcode scan and filters unchanged.
- UI text in Peruvian Spanish. No Co-Authored-By. Conventional commits. No push or merge without the user.
- Checks: `npm run typecheck`, `npm test`, browser measurement. TDD: not configured; pure rules get tests. Runner: Vitest.

## Tasks
- [x] P1 Render long lists in batches of 48 with an observer on the nearest scrolling container (`useIncrementalList`), applied to POS, Inventory and Expiry; shared "Mostrando X de Y" notice (`ListMore`).
- [x] P2 Search index built once per catalog (`product-search.ts`); one reusable `Intl.Collator` for sorting.
- [x] P3 Background queries of the menu alerts spaced to 5 minutes outside their own screens.
- [x] P4 Lite mode for modest machines: auto-detected (<= 2 cores or <= 2 GB), forced with `localStorage["bh.lite"] = "1"` or disabled with "0". Switches off animations and backdrop blur; shares the reduced-motion path in `motion.ts`.

- [x] P5 Adapt to the machine at run time. `PerfWatch` measures this device while it is used: load blocking >= 1.5 s (long tasks in the first 15 s) or 3 interactions slower than 250 ms (Event Timing) turns lite mode on by itself, remembers it (`bh.lite.learned`) and tells the person once. A three-state button (Automatic / Light / Full) in the topbar and in the mobile "Más" menu; the person's choice always wins over what was learned or detected.

## Route per task
Direct inline: measurement, then small coupled edits already understood in this session.

## Evidence (same stress catalog, production build, same machine)
| Screen | DOM nodes | Long tasks on load |
|---|---|---|
| POS | 77,284 -> 1,672 | 6.5 s -> 0.6 s |
| Expiry | 111,806 -> 2,210 | 5.1 s -> 0.4 s |
| Inventory | not measured before -> 2,049 | 0.3 s |
- JS heap on POS: 83 MB -> 15 MB. Other screens (Caja, Panel, Comprobantes, Traslados, Reportes, Compras): under 4,200 nodes, no long tasks above 100 ms.
- Growth on scroll verified in Inventory (48 rows per step) and POS; search still finds a product far beyond the first batch.
- Bugs caught by the browser check: (1) the observer used the window as root, so the next batch never loaded inside nested scroll containers; (2) the two head scripts were concatenated without a separator and the second never ran. Both fixed; the second has a test on the combined script.
- typecheck clean; 483 tests pass.

## Not done / needs a person
- Measurement on a real low-end machine (here: 16 cores). Numbers above are on a fast machine; expect several times slower on modest hardware.
- The thresholds of P5 (1.5 s of load blocking, 3 slow interactions of 250 ms) were chosen from this fast machine (a heavy screen blocks 0.6 s here) and from the INP guidance, not from real low-end hardware: tune them after measuring a modest machine. Event Timing and long tasks exist in Chromium only; elsewhere only the static hints (cores, memory) apply.
- Mock mode re-parses the whole localStorage database on each call; it does not exist in production (`NEXT_PUBLIC_API_MODE=http`) so it was left alone.
- The real backend must paginate or filter large lists; the front still receives the whole catalog in one response.

## Evidence (P5, production build, browser)
- Simulated slow machine (5 tasks of 400 ms after mount): lite mode on, learned flag stored, notice shown; before it, no data-perf attribute.
- Reload: the head script applies lite mode from the learned flag before first paint; the button reads "Automatico (ligero)".
- Button cycle Automatic -> Light -> Full -> Automatic: Full removes the attribute even with the learned flag set; Automatic returns to light.
- Healthy machine: POS with 3,036 products blocks 628 ms on load (limit 1,500 ms), nothing learned.
- Three real clicks slowed to 350 ms each turned lite mode on and stored it.
- typecheck clean; 489 tests pass.
