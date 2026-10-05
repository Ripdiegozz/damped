# Docs site

## Objective

A polished documentation site for the three damped packages, with live demos built on the real workspace packages. It is published at `https://damped.dagadev.net/`, and the Northbook playground moves to `https://damped.dagadev.net/playground/`.

## Problem

The packages have READMEs, but no place to learn the concepts (velocity continuity, interruption, FLIP, presence, the compositor driver), browse every export with its options and defaults, or try the motion without cloning the repository.

## Why

- Spring motion is easier to understand by playing with it than by reading about it.
- Every public export needs one reference page with its signature, options, defaults, behavior and edge cases.
- Code examples rot unless something typechecks them.

## Scope

- In:
  - `apps/docs`: a private workspace package, built to static files with Astro Starlight and React islands.
  - A custom landing page: hero with a live morph, three package cards and a short "why".
  - API reference for every public export of `@damped/core`, `@damped/react` and `@damped/native`.
  - Guides: getting started, springs explained, interruption and reversal, layout and morph, presence, the compositor driver, reduced motion and accessibility, React, React Native / Expo, testing with a fake frame source, FAQ (including when to use Motion or Reanimated instead).
  - Live demos: retargetable spring with a velocity readout, `bounce`/`duration` sliders, FLIP list reorder, card→dialog morph with reversal, presence enter/exit, compositor vs JS with a "block main thread" button.
  - A test that extracts every code example and typechecks it against the real types.
  - A docs smoke e2e and the CI and Pages wiring.
- Out:
  - Versioned docs, i18n, a blog, analytics.

## Constraints

- Source of truth for APIs: `packages/*/src/index.ts` and the tests. Evidence for numbers and behaviors: `odd/tasks/damped-v1.md` and `odd/tasks/playground.md`.
- **Original content only.** Invented data (John Doe, Jane Doe, generic merchants). Nothing from the screen recording that inspired the project. The forbidden-terms check runs before every commit; its list stays outside the repository.
- Do not edit `apps/playground/**`, `packages/**/README.md`, the root `README.md`, `.github/workflows/pages.yml` or `scripts/` until `feat/playground` has merged to `main`.
- Demos use only the public package APIs and respect `prefers-reduced-motion`.
- Dark and light themes, built-in search, static output.
- Generated artifacts are in English.

## Stack decision

Verified on 2026-10-05 against the npm registry and the Starlight docs (context7 `/withastro/starlight`):

- `astro` 7.3.5, `@astrojs/starlight` 0.42.5 (peer `astro ^7.2.10`), `@astrojs/react` 7.0.0 (peer React 17–19).
- Starlight gives search (Pagefind), dark/light themes, a `splash` template for the landing page, and MDX with framework islands. That covers "beautiful + live React demos + search + dark mode" without a custom shell, so it is the choice.
- `@astrojs/check` 0.9.10 only accepts TypeScript 5–6, and the repository uses TypeScript 7. Code examples are therefore typechecked by the repository's own `tsc` through an extraction test, not by `astro check`.
- React is pinned to the same version as `packages/react` so the islands and `@damped/react` share one React.

## Tooling

- Bun 1.4.2 workspaces. Astro build for the site.
- TDD is strict and enabled (source: user global configuration). Runners: `bun test` for unit tests, Playwright (`bun run e2e`, `e2e/*.e2e.ts`) for the browser.
- Gates check real exit codes: `bun test`, `bun run typecheck`, `bun run build`, the docs build and `bun run e2e`.

## Tasks

| ID | Task | Route | Status | Commit |
|----|------|-------|--------|--------|
| D1 | Scaffold `apps/docs` (Astro + Starlight + React), theme tokens, root scripts; the site builds | delegated (2+ non-trivial files) | done | `230d83a` |
| D2 | Example typecheck harness: extract code blocks from the content and typecheck them | delegated | done | `df4d9c4` |
| D3 | Live demo islands (six demos) with reduced-motion support | delegated | done | `aa42e07` |
| D4 | Custom landing page: hero with live morph, package cards, "why" | delegated | done | `f2834e1` |
| D5 | API reference for `@damped/core`, `@damped/react`, `@damped/native` | delegated | done | `4f88942` |
| D6 | Guides (eleven pages) | delegated | todo | |
| D7 | Docs smoke e2e (console errors, demos settle, search, internal links) and CI wiring | delegated | todo | |
| D8 | After `feat/playground` merges: merge `origin/main`, sync with the final READMEs (add `onExitComplete` to the `Presence` reference, re-check the bundle sizes), serve docs at `/` and Northbook at `/playground/` | delegated | blocked on `feat/playground` | |
| D9 | Deliver: one PR (`size:exception`), CI green, merge, verify the live site, screenshots and sizes | inline | todo | |

## Acceptance criteria

- `https://damped.dagadev.net/` serves the docs and `/playground/` serves Northbook.
- Every public export has a reference entry; every guide listed above exists.
- Every code example typechecks in `bun test`.
- The docs smoke e2e passes: no console errors on the landing page, each demo animates and settles, search returns results, no broken internal links.
- All CI is green and the forbidden-terms check is clean.

## Delivery

- One PR to `main`, approved as `size:exception` by the maintainer, with a "review path" section.
- Merge with `gh pr merge --merge` once `check` and `browser` pass. CodeRabbit is not awaited.
- Native review is on; the standing "automatic with everything" instruction grants consent per slice. Review boundary starts at `c202e6f`.

## Progress

- 2026-10-05: worktree `feat/docs` created from `origin/main` (`c202e6f`); stack verified; this document created.
- 2026-10-05: D1 done. `@damped/docs` at `apps/docs` (Astro 7.3.5, Starlight 0.42.5, `@astrojs/react` 7.0.0, React 19.2.3 pinned like `packages/react`) builds under Bun 1.4.2 to `apps/docs/dist` (7 pages, Pagefind search, self-hosted `@fontsource-variable` Inter, Fraunces and JetBrains Mono, no external requests).
  - Package resolution: the docs depend on `@damped/core` and `@damped/react` through `workspace:*`; both export `dist/`, so the root `bun run build` has to run before `bun run docs:build`. The root `build` is now `bun run --filter './packages/*' build` so it does not recurse into the docs.
  - `@damped/react` is mapped in the root `tsconfig.json` like `@damped/core`, and `apps/docs/{src,scripts,test}` joins the typecheck (`content.config.ts` is excluded because it imports the `astro:content` virtual module). `.astro` and `.mdx` files are not typechecked; examples are covered by D2.
  - The sidebar links `/playground/`, which does not exist until D8. The D7 link check has to exempt it until then.
  - Known build noise, harmless: Rolldown `MODULE_LEVEL_DIRECTIVE` warnings for `use astro:head-inject` and Starlight's empty `i18n` collection / `404` entry warnings.
  - Theme: teal accent on cool neutrals in `src/styles/theme.css`; text pairs measured at 4.5:1 or better for body, muted and accent text in both themes.

- 2026-10-05: D2 done, strict TDD. RED: `bun test apps/docs` failed with `Cannot find module '../scripts/examples'` / `'../scripts/typecheck-examples'`; GREEN: 18 pass. A deliberately wrong page (core, react and native blocks) failed the typecheck test with `file:line` messages and was removed; a permanent test feeds a wrong example straight to the harness.
  - `apps/docs/scripts/examples.ts` is pure (block extraction with CommonMark-style fences, nested and indented fences, CRLF, `nocheck`, tsc output parsing, diagnostic mapping); `scripts/typecheck-examples.ts` writes each block as its own module in `apps/docs/node_modules/.cache/examples-*` and runs the repo's `tsc` once (about 0.1 s with TypeScript 7), extending the root `tsconfig.json` with `types: []` and `paths` for the three packages.
  - Failure messages read `src/content/docs/<page>.mdx:<line>:<col> (code block at line <fence line>): TS<code> <message>`.
  - Native examples typecheck: `react-native`, `react-native-reanimated` and `react-native-worklets` ship their own types and are installed for `packages/native`; the harness maps them from there, so docs examples may import them. Authoring conventions: complete examples, `nocheck` in the info string to skip a block, no `fragment` marker.

- 2026-10-05: D3 done, strict TDD. RED: `bun test apps/docs` failed with `Cannot find module '../src/components/demos/demo-state'` (and the four other pure modules); GREEN: 60 pass after the pure logic, 77 pass with the component and SSR tests (written after the components; checked by mutation: breaking the Escape key or a `data-demo` name turns them red).
  - Six islands in `apps/docs/src/components/demos/`, on the public APIs only, embedded on `guides/demos.mdx` ("Demos") with `client:visible`: `RetargetSpring` (`useSpringValue`, velocity readout and trace through refs), `SpringTuner` (`springParams`, `createSpring`, analytic curve), `FlipReorder` (`layout()` with `flushSync`), `MorphCard` (`useMorph`, `useSpring`; props `variant="default"|"compact"`, `className`, `onOpenChange`, for the D4 hero), `PresenceDemo` (`<Presence>` plus `layout()` for the siblings), `CompositorVsJs` (`animate` with the `compositor` driver, "Block main thread" busy-loops 1 s).
  - Pure logic with unit tests: `demo-state.ts` (data-state tracker), `spring-curve.ts`, `list-order.ts`, `morph-machine.ts`, `readout.ts` (velocity format and trace). Component tests render in happy-dom; a subprocess test renders all six with `renderToString` where `window`, `document` and `matchMedia` do not exist.
  - Styles live in `src/styles/demos.css` (registered in `customCss`), built from the theme tokens; demos opt out of Starlight's markdown styles with `not-content`. `apps/docs/tsconfig.json` sets `jsx: react-jsx` (Astro's base uses `preserve`, which Bun cannot run).
  - Test-hook contract (also the comment at the top of `demo-state.ts`): the demo root has `data-demo="retarget-spring|spring-tuner|flip-reorder|morph-card|presence|compositor-vs-js"`, `data-state="idle|animating|settled"` and `data-runs="<n>"` (animations started, only grows). Written to the DOM from animation callbacks, never through React. `morph-card` also has `data-phase="closed|opening|open|closing"`; `compositor-vs-js` writes `data-block-ms` after a block. A test waits for `data-runs` to grow, then for `data-state="settled"`.
  - Reduced motion (`useReducedMotion` reads `matchMedia` only on the client; the server renders as if off): the SpringValue demos (retarget, tuner) jump and offer "Play anyway"; `layout()`, `useMorph` and `<Presence>` get damped's own behavior (spatial jumps, fades stay); the compositor demo jumps both balls, with "Play anyway" (`reducedMotion: "never"`) because the comparison is the point. Every demo shows a visible note while reduced motion is on.
  - API gaps found: `<Presence>` has no completion callback on this branch, so the demo derives "settled" from a timer computed with `createSpring().settleTime()`; the siblings of a leaving toast glide only because damped sets `inert` on the leaving element (a documented behavior) and the stylesheet takes `[inert]` out of the flow. `animate()` exposes no velocity, so the velocity readout uses `createSpringValue`/`useSpringValue`, which do not follow `prefers-reduced-motion` by themselves.
  - Visual check: built, served `apps/docs/dist` and screenshotted every demo in dark and light, idle and mid-flight, with and without reduced motion, into `/tmp/damped-docs-shots/wip/`; no console errors.

- 2026-10-05: D4 done, strict TDD. RED: `bun test apps/docs/test/landing.test.ts` gave 2 pass / 8 fail (no `Hero` override, no package cards, no logo or favicon, no built-page match); GREEN: 10 pass (6 on the sources, 4 on `dist/index.html`).
  - Landing is `src/content/docs/index.mdx` (`template: splash`, `hero` frontmatter for title, tagline and the three actions: Get started, Try the playground, GitHub). The hero visual is a Starlight `Hero` component override, `src/components/landing/Hero.astro`, because the `hero` frontmatter cannot hold an island: it renders the same title, tagline and `LinkButton` actions and puts `<MorphCard client:load variant="compact" />` beside them with the hint "Click the card, then press Esc mid-flight to reverse it." The island's server markup is the hydrated markup, so the stage keeps its size (CLS 0.0004 measured). The `data-demo` contract is untouched.
  - Sections: three package rows (`src/components/landing/PackageCard.astro` with fenced `sh`/`ts`/`tsx` blocks in the MDX, so the D2 harness typechecks the snippets), "Why damped" (four points plus a size strip) and "Keep exploring" (`<CardGrid>` of `<LinkCard>`). Styles in `src/styles/landing.css`; the landing widens `--sl-content-width` to 70rem through `:root[data-has-hero]`.
  - Numbers quoted on the page, all from `evidence.md`: 3.95 KB gzip for an app that only calls `animate`, 6.97 KB gzip for the whole of `@damped/core`, about 0.74 KB for the compositor driver, state identical at 60 Hz, 144 Hz and an irregular cadence to 1e-12, a 250 ms busy loop in Chromium leaving the compositor box moving, 0 React renders per animation frame. The two sizes are the committed figures of the root README on `feat/playground` (`bun run sizes`); D8 should check them against the final README.
  - Logo: two SVG files (`src/assets/logo-dark.svg`, `logo-light.svg`, a spring settling on its target) set through Starlight's `logo` (`alt: ""` because the site title sits next to it); favicon `public/favicon.svg`. The page title is "Springs that keep their momentum" so the tab does not read "damped | damped".
  - **D6 must create exactly these guide slugs** (all linked from the landing): `springs-explained` (exists), `interruption-and-reversal`, `compositor`, `reduced-motion`, `layout-and-morph`, `presence`, `react`, `react-native`, `testing`, `faq`, under `src/content/docs/guides/`. D5 owns `reference/core`, `reference/react`, `reference/native` (linked from the cards). `/playground/` stays a dead link until D8; D7's link check must exempt it, and until D5/D6 land the landing links to pages that 404.
  - Visual check: built, served `apps/docs/dist` from a throwaway Bun server and screenshotted at 1440x900 and 390x844, dark and light, plus the hero card mid-open and mid-reversal, into `/tmp/damped-docs-shots/wip/landing-*.png`. No console errors or warnings, no external requests, no horizontal overflow. Code blocks scroll horizontally inside the cards at 390 px instead of wrapping.

- 2026-10-05: D5 done, strict TDD. RED: `bun test apps/docs/test/exports.test.ts` failed with `Cannot find module '../scripts/exports'`, then `bun test apps/docs/test/reference.test.ts` gave `7 pass / 5 fail` with every export of the three packages listed as `missing`; GREEN: `12 pass / 0 fail` for the completeness test and 6 pass for the parser, `bun test` 616 pass.
  - Pages: `reference/core/` is now an overview (all 36 exports with links, shared conventions) plus eight pages, `springs`, `scheduler`, `spring-value`, `animate`, `compositor`, `layout`, `morph`, `presence`; `reference/react` (7 exports) and `reference/native` (5 exports, including the Reanimated 4.5.1 findings with line citations, the worklet and UI-thread model, and a computed reversal table). The sidebar has a nested "@damped/core" group so every page is reachable; `/reference/core/`, `/reference/react/` and `/reference/native/` keep their URLs.
  - Every export has its own `###` heading (anchor = lowercase name), a summary, a `nocheck` signature, a table, return value, behavior, edge cases, a typechecked example and a `**See also**` line. Examples are checked by `bun test apps/docs`: 58 blocks across the site, 48 of them in the reference. The six demos are embedded nine times, at most one per section (`SpringTuner` once, `CompositorVsJs` once, `FlipReorder` once, `RetargetSpring`, `MorphCard` and `PresenceDemo` on both a core page and the React page).
  - The completeness guard is `apps/docs/test/reference.test.ts` (with the pure parser in `apps/docs/scripts/exports.ts`, tested by `exports.test.ts`). TypeScript 7 ships no JavaScript compiler API, so the parser is a small scanner (comments and strings, brace depth, `export *`, `export * as`, named and type-only re-exports, local declarations) instead of the TypeScript API. The test asserts every runtime and type export has a heading with its exact name once, and each export section has a signature block, a checked example and a See also line; that headings do not repeat; that the core overview links every core page; and that every page is in the sidebar.
  - Anchor caveat: `springParams` and `SpringParams` slugify to the same anchor. Starlight gives the second one `-1`, so the function is `#springparams` and the type `#springparams-1`. The functions come first on the page to keep that stable; the parser mirrors the suffixing.
  - Build finding: Starlight's `<Tabs>` loads the native binding of its markdown processor (`satteri`) from the bundled prerender output, and Bun's isolated linker does not make `@bruits/satteri-*` resolvable from `dist/.prerender`, so any page with `<Tabs>` failed the build with "Cannot find native binding". The root `bunfig.toml` now sets `[install] publicHoistPattern = ["@bruits/satteri-*"]`, which hoists the platform bindings to the root `node_modules`. `bun install` also corrected three `@fontsource-variable/*` ranges in `bun.lock` that D1 had left as `*`.
  - New `src/styles/reference.css` (registered in `customCss`): quiet kind badges and a minimum width for the last table column so descriptions do not collapse into a tall strip at 390 px; tables scroll inside their container.
  - `<Presence onExitComplete>` is not on this branch and is not documented. **D8: add `onExitComplete` to `reference/react.mdx`** (the prop in the `Presence` table and `PresenceProps`, the timing table, the `useLayout` reflow example) after `feat/playground` merges, and add a README-derived sizing check.
  - Install snippets say the packages are not published to npm yet (as every README does). D8 should revisit that wording after the merge.
  - Visual check: built, served `apps/docs/dist` and screenshotted `springs`, `animate`, `react`, `native` and the core overview in dark and light at 1280 and 390 px into `/tmp/damped-docs-shots/wip/reference-*.png`; no console errors, no horizontal page overflow, every demo island on the reference pages renders. All reference links and anchors resolve in the built output (guide links point at the D6 slugs).

## Next step

D6: the eleven guides (`getting-started` expansion plus the slugs the reference and the landing link to: `springs-explained` (stub exists), `interruption-and-reversal`, `compositor`, `reduced-motion`, `layout-and-morph`, `presence`, `react`, `react-native`, `testing`, `faq`, `demos` (exists)). The reference already links to those exact slugs.
