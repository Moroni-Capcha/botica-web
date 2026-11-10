# dark-mode

## Objective
Add a dark theme (Automatic by system, Light, Dark) for night shifts at the counter, without breaking the per-pharmacy brand colors.

## Findings
- No dark theme existed. The app is token-based (`--color-*` in `globals.css`), only ~20 raw palette classes and a handful of `bg-fg text-white` pairs need care.
- The pharmacy sets `--brand` / `--accent` at runtime (`BrandStyle`). A dark brand green used as text, outline or ring (41 uses of `text|ring|outline|border-brand`) is unreadable on a dark surface, so a derived token `--brand-ink` is needed (brand mixed 45 % with white in dark mode, contrast checked >= 5:1 even for a black brand).
- Thermal ticket already forces black on white in print; its on-screen preview must stay light too.

## Constraints
- Tokens only; do not hardcode colors in components. Contrast of every new pair checked with the WCAG formula (>= 4.5:1 text, >= 3:1 icons).
- Theme preference is per viewer: `localStorage` key `bh.theme` (`system` | `light` | `dark`), applied before first paint (inline script) to avoid a flash.
- The Digi!HME logo has dark letters: it must sit on a light plate in dark mode.
- UI text in Peruvian Spanish. No Co-Authored-By. Conventional commits. No push or merge without the user.
- Checks: `npm run typecheck`, `npm test`, browser check in both themes. TDD: not configured; the pure theme rules get tests. Runner: Vitest.

## Tasks
- [x] T1 Tokens: dark overrides, `--brand-ink`, `color-scheme`, focus gap; ticket preview stays light.
- [x] T2 Replace brand text/ring/outline/border with `brand-ink`; fix `bg-fg text-white` pairs, zinc picker, account banner, logo plate.
- [x] T3 Pure rules `theme.ts` (+ tests), no-flash script, `ThemeToggle` in the topbar and in the mobile "Más" menu.
- [x] T4 Browser check of key screens in both themes (desktop and 390 px).

## Route per task
Direct inline: mapping already done in this session, one writer, tasks are tightly coupled through the shared tokens.

## Evidence
- typecheck clean; 465 tests pass (4 new in theme.test.ts, incl. the head script matching resolveTheme).
- Contrast of every dark pair computed with the WCAG formula (text >= 4.5:1, icons >= 3:1); brand-ink >= 5:1 even for a black brand at 45 % mix.
- Browser (admin, mock): login, panel and POS in dark on desktop; Vencimientos, Comprobantes, Reportes and the More menu in dark at 390 px; the toggle cycles Automatico, Claro, Oscuro and stores the choice; console clean.
- Contrast scanner run in the browser over 12 screens in dark and in light (about 3,400 visible texts each) plus the command palette and the attendance kiosk dialog: only real finding was the avatar initials on the accent color, fixed with the new on-accent token. Brand colors black, dark blue and maroon checked in dark. Ticket stays black on white in dark.
- Scanner flags seen and discarded: the logo exclamation mark (4.47:1, same in light, it is the logo) and a value fading in on data refresh (opacity, not color).
- Not checked: printing the ticket on paper, Excel exports (unaffected), screens other than the 12 listed, and keyboard/screen-reader use in dark.
