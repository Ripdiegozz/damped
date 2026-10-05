# Playground

## Objective

A public playground where people can try damped in a realistic interface: a fictional personal-finance app called **Northbook**. It is built on the public packages and published at `damped.dagadev.net` through GitHub Pages.

## Problem

The original proof of concept (and a first demo attempt) reused the app name, section names and card texts of the screen recording that inspired the library. That content must not ship. The playground also needs to show more than one effect: cards, toasts, sidebars, rows, and so on.

## Why

- People should be able to play with the animations, not only read about them.
- The library must not look copied from the person who inspired it.

## Scope

- In:
  - A React 19 app on `@damped/react` and `damped`.
  - App shell with a sidebar, three views, bills (card → dialog morph), activity rows, toasts, and a spring lab panel.
  - Keyboard support, reduced motion, a Playwright smoke test, a GitHub Pages deploy workflow, a README with a GIF recorded from the playground, and measured bundle sizes.
- Out:
  - Real data, persistence, routing libraries, and the `<Morph id>` registry (deferred as damped-v1 T13).

## Constraints

- **Original content only.**
  - People are John Doe (owner) and Jane Doe (shared account and contacts).
  - Merchants are generic and invented: Corner Grocery, City Power, FiberNet, Blue Gym, Harbor Insurance, and similar.
  - Nothing from the inspiring recording: none of its app name, section names or card texts.
  - Before every commit, check against the forbidden-terms list. That list is kept outside the repository on purpose, so the repository does not reference the recording either.
- **Public API only.** No imports from package internals.
- **Animations go through damped.** No CSS transitions for anything damped animates, and no React re-render per frame.
- Static output, deployable under a custom domain at `/`.
- Generated artifacts are in English.

## Tooling

- Bun 1.4.2 workspace; `Bun.build` for the app bundle; Playwright for the smoke tests.
- TDD is strict and enabled (source: user global configuration). Runners: `bun test` for logic, `bun run e2e` for the app.
- Verification gates check real exit codes, never `cmd | tail`.

## Delivery

- Merge gate (user, 2026-10-05): do not wait for CodeRabbit. `check` + `browser` (and GitGuardian when it reports) must be green.
- Strategy: `auto-chain`, `stacked-to-main`. The user authorized automatic delivery on 2026-10-05.
- Native review consent is treated as granted by the user's standing instruction, and every report discloses that.
- Hosting decided on 2026-10-05: the user will make the repository public, so GitHub Pages (free plan) is deployed by GitHub Actions. The custom domain is `damped.dagadev.net`; the user wrote "damper", which was flagged.
- User-owned steps:
  - Add a CNAME `damped` → `ripdiegozz.github.io` in Cloudflare.
  - Make the repository public.
  - Choose a license before publishing.

## Tasks

| ID | Task | Route | Status |
|----|------|-------|--------|
| P1 | Cleanup: delete the local demo commit with copied content (`84357bb`) and its GIF. Salvage the generic `sizes.ts` and the GIF recorder into `/tmp/damped-salvage/`. Verify `origin` never contained the copied texts | inline | [x] |
| P2 | Scaffold `apps/playground`: React 19 + workspace packages, `Bun.build` static output, served by the e2e server, base path `/` | delegated writer | [x] `22ca2a6` |
| P3 | App shell: collapsible sidebar (`useLayout`), active nav indicator moving between items, top bar, view switching with `<Presence>` | delegated writer | [x] `cbc09e1` |
| P4 | Overview: stat tiles with spring-animated numbers (`useSpringValue`), recent activity rows | delegated writer | [x] `15c63ad` |
| P5 | Bills: grid of bill cards; card → dialog with `useMorph` (radius, content correction, blur crossfade); full keyboard support (focus trap, Esc, re-open while closing, focus return); "Pay" raises a toast | delegated writer | [x] `ebb7bf9` |
| P6 | Activity: transaction rows with filter chips and sort (`useLayout` FLIP), add and delete rows (`<Presence>`) | delegated writer | [x] `51111ce` |
| P7 | Toasts: stacked toasts with `<Presence>` enter/exit and layout shift of the stack | delegated writer | [x] `f1f2c2f` |
| P7a | Library: `<Presence onExitComplete>` so the remaining children can reflow with `useLayout` when one leaves (found while building toasts); the toast stack then switches to it. Bills grid moves to a roving tabindex (a single tab stop, arrows move) | delegated writer | [x] `d13b3a2`, `97f5882`, `00ef68a`, `afe1eab` |
| P8 | Spring lab panel: duration and bounce for the whole app, a compositor-driver showcase, and a reduced-motion simulation toggle | delegated writer | [x] `b3499fe`, `a8c6570` |
| P9 | Playwright smoke tests: morph open/close/reverse, keyboard flow, toast, row add/delete, view switch | delegated writer | [x] covered by the per-feature e2e suites (71 tests) |
| P10 | Deploy: GitHub Pages workflow (build → upload artifact → deploy), `CNAME` for `damped.dagadev.net`, documented DNS step | delegated writer | [ ] |
| P11 | README with a GIF recorded from the playground, sizes script, links to the live playground | delegated writer | [ ] |
| P12 | Full per-package documentation (requested on 2026-10-05: "document everything"). A new `packages/core/README.md`; complete `packages/react/README.md` and `packages/native/README.md`. Every public export documented with signature, options table, defaults, behavior, example and edge cases | delegated writer | [ ] |

## Acceptance criteria

- No content from the inspiring recording anywhere in the repository.
- Every interaction animates through damped, and none re-renders React per frame.
- Keyboard: every interactive element is reachable, the dialog traps focus, and Esc closes with focus returned.
- Reduced motion: spatial motion jumps; fades remain.
- `bun test`, typecheck, build and `bun run e2e` pass; the Pages workflow builds the site.

## Progress

- 2026-10-05: Plan created. P1 done: the copied demo commit and GIF were deleted locally. Searching the pushed history for the forbidden terms returns nothing, and `origin/main` has no copied text.

- P2–P4: e2e RED (404 / 5 of 6 / 6 of 12 failing) → GREEN; 18 helper unit tests; playground e2e 48/48 with `--repeat-each 4`. Full suite: 529 unit, 24 e2e. The playground JS is 68 KB gzip (React included). The parent checked the screenshots (expanded and collapsed sidebar): original content, no forbidden terms. Exiting views share one grid cell. Rows are staggered through a mount timeout chain, because the core has no per-child delay.

- P5/P7: RED (missing helpers; 11/11 bills and 11/11 toast e2e failing) → GREEN; 550 unit, 138/138 e2e with `--repeat-each 3`; JS 72.9 KB gzip. One `useMorph` per card, dialogs portaled to `document.body`; focus moves to the card as soon as a close starts, so Enter can reverse it. The parent checked screenshots 4–7 (grid, mid-morph, open dialog, toasts). Finding: the toast removal reflow needed `snapshot()` in a cleanup, because `<Presence>` gives no signal when a child finishes exiting.
- P7a/P6/P8: `d13b3a2` onExitComplete, `97f5882` toast reflow, `00ef68a` roving tabindex, `51111ce` activity, `b3499fe` spring lab, `afe1eab` onExitComplete fires uniformly, `a8c6570` anchored lab with `aria-valuetext`. 589→600 unit tests, 142 e2e ×2. Screenshots 8–11 checked.
- 2026-10-05: the user made the repo public, verified `dagadev.net`, and set the `damped` CNAME to DNS only. Pages is enabled (workflow source, cname set). MIT license merged (#19). The core was renamed to `@damped/core` (#20) and merged into this branch, which now has 600 unit and 71 e2e tests passing.

## Next step

P10 deploy workflow, P11 root README + GIF + sizes, P12 package READMEs; then the playground PRs.
