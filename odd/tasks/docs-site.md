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
| D4 | Custom landing page: hero with live morph, package cards, "why" | delegated | todo | |
| D5 | API reference for `@damped/core`, `@damped/react`, `@damped/native` | delegated | todo | |
| D6 | Guides (eleven pages) | delegated | todo | |
| D7 | Docs smoke e2e (console errors, demos settle, search, internal links) and CI wiring | delegated | todo | |
| D8 | After `feat/playground` merges: merge `origin/main`, sync with the final READMEs, serve docs at `/` and Northbook at `/playground/` | delegated | blocked on `feat/playground` | |
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

## Next step

D4: custom landing page (hero with the live `MorphCard` in its `compact` variant, package cards, "why").
