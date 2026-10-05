# Branding and docs redesign

## Objective

Give damped its own identity: a mark built from the physics of the library, a restrained docs site where colour and energy belong only to motion, interactive explanations of the physics, and consistent favicons and metadata across the docs, the playground, the README and the packages.

## Problem

- The current look is generic template output: a serif display face with Inter and a teal accent, a coloured last word in the hero, three calls to action, a "Why" 2x2 grid with top rules, a band of big numbers, card grids, a gradient glow and rounded cards everywhere.
- The mark (a thin step-response curve) disappears at 16-32 px, has no wordmark, and its colours are duplicated in three files.
- Code frames are broken: `apps/docs/src/styles/theme.css:89-93` rounds every corner of `pre` and `.expressive-code .frame`, so the terminal header and file-name tabs detach from the code body with doubled borders. The same rule curves the thick left border of asides.
- The playground has no favicon; the README and the packages carry no identity.
- "Springs explained" describes the physics in prose and tables; the library's core idea (state is position and velocity, and it survives interruption) is never shown.

## Why

- A motion library is judged by how it feels. A site that looks like every other template undersells it.
- The physics is the differentiator. Showing it (a mass on a spring, damping, the phase portrait) explains damped better than any copy.

## Direction (approved by the user on 2026-10-05)

- **Quiet chrome, loud motion.** Base from Resend and Linear (restraint, precision, hierarchy); the energy of GSAP only on things that move.
- Dark-first, near-black surface (`#0a0a0b`), 1 px hairlines, small radii, no card shadows, no gradient glows.
- Typography: Geist for text and headings (tight tracking on display sizes), Geist Mono for labels, numbers and code. Fraunces and Inter are removed.
- One signal accent, proposed `#ff5f1f`, used **only** where something moves or comes to rest: spring traces, the active navigation indicator, the rest point of the mark. Light theme uses a darker step of the same hue for text so it meets 4.5:1. The final value is validated in the built site.
- Mark: the phase portrait of a damped oscillator. An even-weight spiral (about 0.8 turn, starting at the left, mirrored so it opens upwards) that stops clear of a separate rest dot. Approved variant: `5-hook-clear` from the exploration. A small-size cut is allowed if the master does not hold up at 16 px.
- The landing hero is a live spring instrument, not a fake product card.
- Physics explanations in the spirit of interactive essays (Ciechanowski): small figures you can drag and interrupt, built on the public damped APIs.

## Scope

- In:
  - `brand/`: master mark, small-size mark, wordmark and lockups as outlined SVG (no font dependency), colour and type tokens, a short usage note.
  - A generator (`bun run brand`) that writes every derived asset from `brand/`: favicon SVG (a fixed near-black tile that reads in light and dark browser chrome), `favicon.ico`, `apple-touch-icon.png`, 192/512 icons, `site.webmanifest`, Open Graph image, docs logo files, README lockups. Generated files are committed; a test fails when they drift from the generator.
  - Fix the code-frame and aside radius bug through Expressive Code `styleOverrides`, never with CSS on `pre` or `.frame`.
  - New docs theme: tokens, Starlight header, sidebar, content typography, code blocks, asides, tables, badges, search, and the demo styles moved onto the new tokens.
  - New landing page with a live spring instrument hero and sections without the template patterns.
  - Physics: rework "Springs explained" into an interactive explanation (mass on a spring, damping ratio, phase portrait, interruption with and without velocity), plus the figures' tests.
  - Favicons and head metadata (theme-color, manifest, Open Graph) on the docs and the playground.
  - README lockup (dark and light), `homepage`, `repository`, `bugs` and `keywords` in the three package manifests, repository description, homepage and topics on GitHub.
- Out:
  - Renaming the packages, i18n, a blog, a new docs framework.
  - Northbook's own in-app brand (a fictional app; it keeps its "N" mark inside the UI). Only its favicon and head metadata change.
  - The GitHub social preview image upload (no API; the generated image is handed to the user).

## Constraints

- Strict TDD (session configuration: "Strict TDD Mode: enabled"). Runner: `bun test` (unit, built-output), `bun run e2e` (Playwright). RED before GREEN for behaviour; asset work is covered by drift and built-output tests.
- No third-party requests from the site (fonts self-hosted through `@fontsource-variable`).
- WCAG AA text contrast in both themes; every interactive figure keyboard-operable and honouring `prefers-reduced-motion` like the existing demos (`data-demo` / `data-state` / `data-runs` contract).
- No content from the inspiring video (`damped/content-originality`); grep for those strings before delivery.
- Generated technical artifacts and copy in English.
- About 400 authored changed lines per task is a planning heuristic only.

## Tasks

| ID | Task | Route | Status | Commits |
| --- | --- | --- | --- | --- |
| B1 | Brand system: `brand/` sources (mark, small mark, outlined wordmark, lockups, tokens) and the `bun run brand` generator with a drift test | delegated (writer: 2+ non-trivial files) | done | `332a80a` `f1096e3` |
| B2 | Fix code frames and asides: Expressive Code `styleOverrides`, drop the radius rule, built-output test | inline (one mechanical, understood change) | done | `3d62d81` |
| B3 | Docs theme: Geist/Geist Mono, dark-first tokens, accent rules, Starlight chrome, code, asides, tables; demos on the new tokens; logo and favicons wired | delegated (writer) | done | `28478c4` `5f44c87` `e4978b3` `117231e` |
| B4 | Landing redesign: live spring instrument hero, new sections, updated landing tests | delegated (writer, worktree `feat/branding-landing`) | in progress (built; integration fixes running) | `9f252c0` `32413f0` |
| B5 | Physics: interactive "Springs explained" (mass on a spring, damping ratio, phase portrait, interruption) with unit, SSR and e2e coverage | delegated (writer, worktree `feat/branding-physics`) | in progress | |
| B6 | Playground favicon and head metadata; build copies the assets; e2e asserts they load under `/playground/` | delegated (writer with B7, worktree `feat/branding-meta`) | done (on `feat/branding-meta`, to merge) | `f03cb9a` |
| B7 | README lockup, package manifest metadata, GitHub repository description, homepage and topics | delegated (writer with B6) + inline `gh repo edit` | done (on `feat/branding-meta`, to merge; GitHub edited) | `9d97f6d` |
| B8 | Deliver: forbidden-strings grep, all gates, PRs, merge, verify the live site, screenshots | inline | todo | |

## Acceptance criteria

- The favicon is the new mark on `/`, on every docs page and on `/playground/`, in light and dark browser chrome, and stays legible at 16 px.
- Code blocks with a terminal header or file-name tab render as one joined frame; asides have straight left borders.
- No Fraunces or Inter in the built CSS; the accent appears only on motion elements, links and focus (checked by review of the built site, screenshots attached).
- The landing hero is a live, interruptible spring; the 2x2 "Why" grid, the big-number band and the gradient glow are gone.
- "Springs explained" has interactive figures for the mass on a spring, the damping ratio, the phase portrait and interruption, each keyboard-operable, with reduced-motion behaviour and passing e2e.
- `bun run brand` is idempotent and the drift test passes.
- README shows the lockup in both GitHub themes; the three manifests have `homepage`, `repository`, `bugs` and `keywords`.
- All gates green: `bun install --frozen-lockfile`, `bun run build`, `bun run docs:build`, `CI=true bun test`, `bun run typecheck`, `bun run docs:check`, `bun run e2e`, `bun run site:check`.

## Delivery

- Strategy: `auto-chain`, `stacked-to-main` (the standing "automatic with everything" authorization, `damped/delivery`). Planned slices:
  1. `feat/branding` → B1, B2, B3 (brand system, frame fix, theme).
  2. B4, B5 (landing and physics).
  3. B6, B7 (playground, README, metadata).
- Merge with `gh pr merge --merge` after `check` and `browser` pass. CodeRabbit is not awaited.
- Native review is on (global); consent comes from the standing instruction. Review boundary starts at `01d2b48`.

## Progress

- 2026-10-05: PR #23 merged (`01d2b48`) and Pages deployed it. The user judged the site and mark generic and asked for a redesign. Five mark concepts were explored over four rounds in `/tmp/brand/logo/`; the user chose the phase spiral `5-hook-clear` and approved the "quiet chrome, loud motion" direction, the frame fix and the physics explanations. Branch `feat/branding` created from `01d2b48`; this document created.

- 2026-10-05: B1 delegated to one writer (in progress). B2 done inline, strict TDD. RED: `bun test apps/docs/test/code-frames.test.ts` gave 1 pass / 1 skip / 3 fail (radius on `pre`/`.frame`, radius on `.starlight-aside`, no `expressiveCode.styleOverrides.borderRadius`). GREEN after `bun run build && bun run docs:build`: 5 pass, including the built-CSS check for `--ec-brdRad:0.375rem`. Visual check in dark: the terminal frame on `/reference/react/` and the file-name tabs on `/guides/testing/` render as one joined frame, and the aside on `/getting-started/` has a straight start border (`/tmp/brand/b2-*.png`). Review assessment for `01d2b48..3d62d81`: medium, `under_budget`, so the review is pending in the slice.

- 2026-10-05: B1 done, delegated, strict TDD. RED: each new test failed on its missing module (`Cannot find module '../brand/tokens'`, `../scripts/ico`, `../brand/mark`, `../brand/lockup`, `../brand/svg`, `../scripts/brand-assets`). The small-cut gap test failed with `Expected: > 1  Received: 0.15` before the retune, and the drift test listed all 19 paths before generation. GREEN: 46 pass across 6 new files; `CI=true bun test` 873 pass / 0 fail; `bun run typecheck` 0; `bun install --frozen-lockfile` no changes; `bun run brand` twice gives identical SHA-256 for all 19 outputs. Parent spot check: `bun test test/brand-assets.test.ts` 8 pass.
  - Sources in `brand/` (`mark.ts`, `wordmark.ts`, `lockup.ts`, `og.ts`, `svg.ts`, `tokens.css`, `tokens.ts`, `README.md`); generator `scripts/brand-assets.ts` (pure) + `scripts/brand.ts` (CLI) + `scripts/ico.ts`; `bun run brand` writes 19 files into `apps/docs/public`, `apps/docs/src/assets`, `apps/playground/public`, `assets/brand` and `brand/`.
  - Master mark: `r0=12, pitch=8.4, turns=0.78, w=3.5, dot=2.4, size=26` (the approved geometry, 0.07/255 mean pixel error against the exploration render). Small cut: `pitch=8.6, turns=0.62, w=4.0, dot=2.8`, used for the favicon tile (size 24, rx 7) at 16-32 px; the 48 px ICO entry, apple-touch and 192/512 icons use the master. At 16 px the small cut reads as an arc with its rest dot; accepted for legibility.
  - Wordmark: Geist SemiBold outlined with opentype.js, tracking -0.025em; mark 1.04x the `d` ascender. opentype.js 2.0.0 flips y twice in `toPathData` and its rounding emitted `NaN`, so the path serialiser is our own.
  - Palette: accent `#ff5f1f` (dots and traces only, never text); text steps `--damped-accent-text-light: #c73800` (5.0:1 on `#fafaf9`) and `--damped-accent-text-dark: #ff6a2e` (6.9:1 on `#0a0a0b`). The generator reads the palette from `tokens.css`.
  - Dependencies pinned exactly for reproducible rasters: `@resvg/resvg-js` 2.6.2, `geist` 1.7.2, `opentype.js` 2.0.0. The resvg binding resolves under the isolated linker. Risk: byte-exact PNG drift checks are proven on linux-x64 only (CI matches); fall back to pixel comparison if arm64 differs.
  - Renders for review in `/tmp/brand/b1/` (favicon sheet, lockups, og, icons).

- 2026-10-05: Review assessment for `01d2b48..cc9ac75`: medium, `slice_budget_reached`, so the review was due. START asked for consent (44 files, 1316 lines). The user chose "Skip this time", and the exact decline invocation returned `declined` / `declined_this_candidate` for target `sha256:38f2593a…`. Verification for that range is therefore the writer's self-verification plus the parent spot check (medium tier, non-mini writer). B3 delegated to one writer.

- 2026-10-05: The user asked for maximum parallelism ("metele nitro, tirá paralelos"). Four writers now run at once. B3 is in the main checkout on `feat/branding`. B4, B5 and B6+B7 each have their own worktree under `../damped-worktrees/` on `feat/branding-landing`, `feat/branding-physics` and `feat/branding-meta`, all from `ecd4f04`, with `bun install --frozen-lockfile` done.
  - File ownership: B3 owns the theme, chrome, code blocks, demos and head; it was told to stay out of the landing. B4 owns the landing files. B5 owns `springs-explained.mdx`, `components/physics/` and `styles/physics.css`, plus one `customCss` line. B6+B7 own the playground head and build, the README and the package manifests.
  - Ports: `reuseExistingServer` is on locally, so each writer has its own `E2E_PORT` (B3 4173, B4 4174, B5 4175, B6+B7 4176) and its own static-server range.
  - Integration: merge the three branches into `feat/branding` after B3, re-verify visually on the merged theme, and dedupe the overlap between the B4 hero instrument and the B5 phase-portrait figure.

- 2026-10-05: B6+B7 done in their worktree, strict TDD. RED: `bun test apps/playground/test/head.test.ts test/package-metadata.test.ts` gave 1 pass / 9 fail, and the new playground e2e received `[]` icon requests. GREEN: 5 + 5 pass. Writer gates: `CI=true bun test` 883 pass, `bun run typecheck` 0, `bun run docs:check` 26 examples, `bun run site:check` 26 pages, `E2E_PORT=4176 bun run e2e` 98 passed, and the `/playground/` icons serve 200.
  - The playground `theme-color` is `#f1f2f4`, Northbook's own light `--bg`, and a unit test ties it to `styles.css`. The README lockup sits in the `<h1>` through `<picture>`. The three manifests have `keywords`, `homepage`, `bugs` and `repository.directory`.
  - Parent, inline: `gh repo edit` set the description ("Interruptible, physically based spring animations for the web, React and React Native."), the homepage `https://damped.dagadev.net` and 9 topics. The repository is PUBLIC.
- 2026-10-05: B3 done, strict TDD. RED: `theme.test.ts` 1 pass / 14 fail. After the user's aside correction (no start border, no tint) and the focus-ring fix, RED again with 18 pass / 3 fail. GREEN: writer gates `CI=true bun test` 894 pass, `bun run typecheck` 0, `bun run site:check` 26 pages, `E2E_PORT=4173 bun run e2e` 106 passed. One full-run flake on `playground-lab.e2e.ts:166` (the compositor dot during a main-thread block) passed 14/14 alone and on the next full run. Parent spot check: `bun test apps/docs/test/theme.test.ts apps/docs/test/code-frames.test.ts` 26 pass.
  - Geist and Geist Mono replace Inter, Fraunces and JetBrains Mono. `apps/docs/brand.mjs` reads `brand/tokens.css` for the config and defines the `damped-dark` and `damped-light` code themes. `theme.css` imports the tokens and maps `--sl-color-*`, with the accent variables neutral on purpose. Shared properties are documented at the top of `theme.css`.
  - The accent appears only on the 2px sidebar/TOC indicator, the selected tab underline, focus rings (`:focus-visible` only), link underlines, demo moving parts and syntax strings.
  - Asides are a 1px hairline box on the surface fill, with no radius, a mono uppercase label and a 6px status dot that is never the accent. A test enforces this.
  - Contrast, dark/light: body 12.5/13.4, muted 7.7/7.4, link 16.9/19.0, worst code token 5.9/5.5, indicator 6.9/5.0.
  - Open for B4: `landing.css` still has the glow, a card shadow and 10px radii. It is excluded from the scans (`NOT_SCANNED` in `theme.test.ts`); B4 must clean it and drop the exclusion. Also, with `replacesTitle`, the lockup alt and the sr-only title both say "damped".

- 2026-10-05: Merged `feat/branding-meta` into `feat/branding` (`5111236`): `CI=true bun test` 904 pass, `bun run typecheck` 0. Review assessment for `01d2b48..5111236`: medium, `slice_budget_reached`. START asked for consent (61 files, 2978 lines); the user chose "Skip this time", and the exact decline returned `declined_this_candidate` (target `sha256:8282bae4…`).
- 2026-10-05: Delivery. One honest slicing pass along the existing work units gives stacked PRs: #24 `feat/brand-system` (`ecd4f04`, B1+B2, about 1,100 authored lines plus generated assets) → `main`; #25 `feat/docs-theme` (`e2a1f7f`, B3, about 1,540 lines) → #24; #26 `feat/branding-meta` (B6+B7, 185 lines) → #24. #24 and #25 exceed the budget with no cohesive split, so `size:exception` is recommended and awaits the maintainer; the label is not applied yet. `feat/branding` stays the local integration branch. The PRs are watched in T3.

- 2026-10-05: CI on #26 failed because `check` built the playground after `bun test`, and the new playground head tests fail under `CI=true` without `dist`. Fixed in `b385778`: RED was the new `workflows.test.ts` order assertion; the failure was reproduced locally with `rm -rf apps/playground/dist && CI=true bun test apps/playground` (3 fail) and went GREEN after the build.
- 2026-10-05: CodeRabbit on #24. The favicon scope line is fixed in `741ae69`. The missing manifest link is answered: #25 adds it, and `theme.test.ts` asserts it.
- 2026-10-05: B4 done in its worktree (`9f252c0`, `32413f0`), strict TDD. Writer gates: `CI=true bun test` 919 pass, `E2E_PORT=4174 bun run e2e` 100 passed, no overflow at 390px. Merged into `feat/branding` (`7a66837`); the integrated branch gives `CI=true bun test` 951 pass after a full build.
  - The review assessment for `01d2b48..` with B4 came out HIGH because of the `ci.yml` shell steps. START asked for consent (77 files, 5367 lines); the user skipped it (`declined_this_candidate`, `sha256:262807f8…`). Under the off path, a high tier needs an independent verifier, which is running.
  - The visual check on the integrated theme looks good. Found: a thick orange focus ring after a mouse drag on the instrument track (the same script-`focus()` bug B3 fixed), plus `landing.css` leftovers (glow, shadow, radii above 6px) that `theme.test.ts` excludes. B4 has been resumed to merge `feat/docs-theme`, fix both, and drop the `NOT_SCANNED` exclusion.
- 2026-10-05: The T3 server restarted and cancelled B5 mid-task. The models were committed (`4152e72`) and the figures uncommitted. B5 has been resumed from its worktree state, with instructions to merge `feat/docs-theme` and adopt the shared properties.

## Next step

Maintainer decision on `size:exception` for #24 and #25; CI on #24-#26; wait for B4 and B5; integrate `feat/branding-meta`, `feat/branding-landing` and `feat/branding-physics`; then B8.
