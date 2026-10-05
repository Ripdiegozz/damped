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
| D1 | Scaffold `apps/docs` (Astro + Starlight + React), theme tokens, root scripts; the site builds | delegated (2+ non-trivial files) | done | this commit |
| D2 | Example typecheck harness: extract code blocks from the content and typecheck them | delegated | todo | |
| D3 | Live demo islands (six demos) with reduced-motion support | delegated | todo | |
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

## Next step

D2: example typecheck harness.
