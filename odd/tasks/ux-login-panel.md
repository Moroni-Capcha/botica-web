# ux-login-panel

## Objective
Bring the first impression (login, PIN keypad, signup entry) and the daily panel (`/panel`) to the same standard as the POS and cash screens: semantic tokens and base components, clear hierarchy, purposeful motion, accessibility.

## Context
Foundations from `ux-pos-caja` are already in master: semantic tokens (text, surface, line, success/danger/warning/info/special, radius, shadow, type scale micro/caption/small, motion durations and easing), `Card`, `Chip`, `IconButton`, `SectionLabel`, global `focus-visible`, `src/lib/motion.ts`, `Pulse`/`useValuePulse`, dialog/toast exit animations, README "Movimiento" section.

## Constraints
- No new dependencies (CSS and Web Animations only). UI text in Peruvian Spanish. Never hardcode a botica name; botica colors come from `--brand` / `--accent` (the login previews them as soon as the botica is chosen). The Digi!HME logo has dark letters: only on light backgrounds.
- Do not change API, domain, mock or auth logic (PIN flow, owner login, signup logic stay as they are). Every number on the panel must stay identical.
- Motion: ease-out, under 300 ms for UI, only `transform` and `opacity`, never `transition: all`, respect `prefers-reduced-motion` through `src/lib/motion.ts` and the global CSS.
- Checks: `npm run typecheck`, `npm test`, `npm run build` (stop `npm run dev` and delete `.next` before building). TDD mode: not configured; pure helpers get tests. Runner: Vitest.
- Branch `feat/ux-login-panel`. One work-unit commit per phase. No push or merge without the user.

## Tasks
- [x] L1 Login (commit 048deb8): tokens and components instead of raw zinc/hardcoded values, hierarchy of the two columns, botica code step, Mostrador/Dueño switch, user list, PIN dots and keypad (hit areas, press feedback, shake on error, keyboard digits), loading/error states, mobile layout, accessibility (labels, live region for errors, focus order), signup entry link.
- [x] L2 Panel (commit b6aca4a): focal KPI ("Venta de hoy"), quieter secondary KPIs, chart cards, "Para atender hoy" list hierarchy and tones, scope toggle, setup checklist card, skeleton/empty/error states, number pulse and gentle entrance, responsive grid.

## Route per task
Each phase: one delegated writer; parent verifies with typecheck, tests and a browser check before the next phase.

## Progress / evidence
(branch created from master @ 332d15f)
- L1 048deb8: typecheck clean, 338 tests pass (333 + 5 new in pin.test.ts), build ok. Login files have 0 zinc/rose/amber classes, 0 text-[Npx], 0 transition-all. Not browser-verified by the writer. Kiosk dialog (features/attendance) not touched.

Browser check L1 (2026-11-02, dev server, no console errors): desktop layout with the compact brand column and benefit list, Mostrador/Dueño switch, user cards with selected ring and check, "PIN de 4 dígitos" dots; a wrong PIN (9999) shows red dots and "PIN incorrecto. Intenta de nuevo."; typing 1111 on the physical keyboard logs in the Principal account and lands on `/pos`. NOT checked: 360 px / tablet widths, Dueño form, kiosk dialog, offline card, reduced motion, keyboard-only navigation, other botica colors.

- L2 b6aca4a: typecheck clean, 344 tests pass (338 + 6 new in panel.test.ts), build ok. Panel, setup checklist and column chart files have 0 raw zinc/emerald/rose/amber/sky/violet classes, 0 text-[Npx], 0 hex colors, 0 transition-all. Not browser-verified by the writer (focal card, stagger, bar grow, alert list scroll/sticky, 360 px / tablet, reduced motion, other botica colors). Quiet KPI figure is text-xl (20 px, as in cash) instead of 22 px to avoid an arbitrary size.

## Next step
Browser check of L2, then open the PR.
