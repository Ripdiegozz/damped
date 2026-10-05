# damped v1

## Objective

A reusable, framework-agnostic spring animation library for interruptible, physically based UI motion: an analytic spring engine, compositor-friendly rendering, layout (FLIP) morphs between elements, and a thin React adapter.

## Problem

Smooth, "native-feeling" UI motion (card-to-modal morphs that reverse instantly from any point, keeping their velocity) needs three things that time-based CSS/keyframe animations do not give: spring physics with velocity continuity, FLIP layout animation with scale correction, and rendering restricted to compositor properties. Existing spring packages (`wobble`, `spring-kit`, `@flighthq/spring`) only cover the math.

## Why

The user wants these animations across their React and vanilla apps without re-implementing them per project. A working vanilla POC exists outside this repo (spring + FLIP + blur crossfade + keyboard support) and validated the approach.

## Scope

- In: analytic spring core, frame scheduler, `animate()`, WAAPI `linear()` compositor driver, layout FLIP with scale correction, shared-element `morph()`, presence (enter/exit), React adapter, demo + README GIF.
- Out (v1): Vue/Svelte adapters, gestures/drag, scroll-linked animation, SSR-specific helpers beyond not crashing on import.

## Constraints

- Core (`damped`) never imports React; the React adapter never re-renders per frame (writes go to the DOM through refs).
- The shared-element registry lives in the core so vanilla and React share one mechanism.
- Only compositor-friendly properties are animated per frame (`transform`, `opacity`, `filter`) unless a feature explicitly needs more.
- `prefers-reduced-motion` respected from the first public API.
- Bun is dev tooling only; published code must not depend on Bun.
- Core bundle target: under ~5 KB gzip (goal, measured at T11).

## Tooling

- Package manager / workspaces / test runner: Bun 1.4.2 (`bun test`, happy-dom preload).
- Build: `bun build` (ESM, minified) + `tsc --emitDeclarationOnly` for `.d.ts` (Bun.build has no declaration option).
- Real-browser layout tests: Playwright.
- TDD: **strict, enabled**. Source: user global configuration ("Strict TDD Mode: enabled"). Runner: `bun test`. Observe RED before GREEN for every behavior.

## Delivery

- Forecast: well above ~400 authored changed lines across the feature, so delivery will be sliced.
- Strategy: `auto-chain` with `stacked-to-main`. On 2026-10-05 the user authorized fully automatic delivery: a private GitHub repo (`Ripdiegozz/damped`), opening PRs, and merging them after the parent's review. Each PR is merged with a merge commit; the child is retargeted to `main` and branches are deleted.
- The user's standing "automatic with everything" instruction is treated as granting native review consent for this feature's slices. This is disclosed in every report.
- Slices merged: #1 scaffold (`4f007df`), #2 spring (`e674ccd`, `size:exception`: 275/482 test lines), #3 CI + non-finite time (`a9b0d91`), #4 scheduler (`3670495`, `size:exception`: 693/877 test lines).
- Slices merged (cont.): #5 review follow-ups (`07d6425`), #6 `SpringValue` + `animate()` (`12ccf15`, `size:exception`: ~1,100/1,482 test lines).
- Slices merged (cont.): #7 `rebase()` (`6c7b05b`), #8 FLIP layout (`bbc7b23`, `size:exception`: ~960/1,243 test lines).
- Running authored-line count: 4,578 (… + T6 1,414).

## Tasks

| ID | Task | Route | Status |
|----|------|-------|--------|
| T1 | Scaffold: Bun workspace, strict tsconfig, happy-dom preload, build scripts, smoke test | inline (mechanical config files) | [x] `4b2f9db` |
| T2 | Analytic spring: exact position/velocity at any `t` (under-, critically, over-damped), `duration`/`bounce` → stiffness/damping, settle detection, velocity continuity on retarget | delegated writer (2 non-trivial files) | [x] `39ed619` |
| T1b | CI: GitHub Actions running `bun test`, typecheck, build on PRs and `main` | inline (one mechanical file) | [x] `6f2c72b` |
| T2a | Follow-up (review R3-at-nonfinite-time): `at(NaN)` throws; `at(Infinity)` → exact settled state or throws if it never settles | delegated writer | [x] `678c96a` |
| T3 | Frame scheduler: single rAF loop, read-then-write phases, sleeps when idle, injectable clock/frame source. Includes a real frame-rate-independence test driving springs through the scheduler with different frame sizes (review R3-frame-independence-tautology: the T2 test only calls `at(0.5)` repeatedly) | delegated writer | [x] `b91ab84` |
| T3a | Review follow-ups: CI `permissions: contents: read` + SHA-pinned actions (R1-001); name the scheduler fallback frame delay (R2-001) | inline CI + writer | [x] CI `723a2e5`, constant `48df3fa` |
| T4 | `SpringValue` primitive (retargetable value driven by the scheduler) + `animate(el, props, opts)`: transform composition (`x`, `y`, `scale`, `scaleX`, `scaleY`, `rotate`), `opacity`, blur; interruption inherits velocity; `stop()` + `finished`; reduced motion | delegated writer | [x] `33c7580` + fix `53c1fe1` |
| T5 | Compositor driver: spring → CSS `linear()` easing via WAAPI, feature detection, fallback to JS driver, interruption from analytic state. **Reordered after T10**: happy-dom has no WAAPI, so it can only be verified in a real browser | pending | [ ] |
| T6 | Layout FLIP: `measureLayout`, `snapshot()`/`layout()`, center-origin deltas reusing `animate()` values (velocity inherited), `SpringValue.rebase()` for interruption across layout changes, inverse child scale correction, border-radius correction | delegated writer | [x] `e1f8931` rebase, `a9e74a2` layout, `5503a92` parent follow-ups, `2272370` review fix |
| T7 | `morph(from, to)`: FLIP both elements between each other's boxes (reusing layout internals), element opacity crossfade with a faster incoming fade (no mid-morph opacity dip), blur on the corrected content children, `finished: Promise<boolean>` (true unless superseded/stopped), velocity-continuous reversal. The shared-element registry moves to T9, where React needs it | delegated writer | [ ] |
| T8 | Presence: enter/exit, element stays mounted until exit settles | pending | [ ] |
| T9 | React adapter: `useSpring`, `<Morph id>` (+ core shared-element registry), `<Presence>`; no per-frame re-render | pending | [ ] |
| T10 | Playwright real-browser tests for layout/FLIP and interruption | pending | [ ] |
| T11 | Demo (POC rebuilt on the library), README with GIF, bundle-size measurement | pending | [ ] |

## Acceptance criteria

- Retargeting any running spring keeps position and velocity continuous (no jump, no velocity reset).
- Spring results are frame-rate independent (same state at time `t` regardless of frame sizes).
- Idle pages schedule no animation frames.
- Morphed children are not visibly distorted (inverse scale correction).
- Reduced motion: animations jump or crossfade without spatial motion.
- `bun test`, typecheck, and build pass; Playwright suite passes in a real browser.

## Progress

- 2026-10-05: Repository created; name `damped` chosen (free on npm). Plan agreed: phases 1 core → 2 layout → 3 presence + React → 4 demo/GIF.
- 2026-10-05: The private repo `Ripdiegozz/damped` was created. PRs #1–#4 are merged, and CI is green on `main`. GitHub Actions only registered the workflow once it reached `main`; PR #4 needed a close/reopen to get a CI run.

## Verification evidence

- T1: RED `bun test` → `ReferenceError: document is not defined` (no DOM preload); GREEN after `test/happydom.ts` + `bunfig.toml` → 1 pass. `bun run typecheck` exit 0; `bun run build` emits `dist/index.js` + `dist/index.d.ts`. Review assess: medium, `under_budget`.
- T2: RED `bun test` → `Cannot find module '../src/spring'`; GREEN → 66 pass, 0 fail (18181 expects), parent re-run confirmed. Typecheck exit 0; build OK (2.32 KB minified). Closed-form velocity derivatives and settle-time envelope bound checked by the parent. Review assess on `b1d62a5..39ed619`: medium, `review_due` (`slice_budget_reached`, 699 lines); user granted review; lens `review-reliability` approved (lineage `review-e21f083d333d7677`), acknowledged, authority burned. Reviewed boundary: `39ed619`. Two non-blocking suggestions became T2a and part of T3.
- T2a: RED 5 fail (NaN not throwing, Infinity → NaN); GREEN 74 pass. T3: RED `Cannot find module '../src/scheduler'`; GREEN 121 pass. A frame-independence test runs at 60 Hz, 144 Hz and an irregular cadence (≤1e-12), with an Euler control that diverges. The parent re-ran the tests and reviewed the scheduler logic. CI steps reproduced on a clean worktree (74 pass, typecheck, build). Review on `main..b91ab84`: high risk (CI shell), user standing grant, 4 lenses approved (lineage `review-93f2c283087f98c2`), acknowledged, authority burned; suggestions R1-001 and R2-001 → T3a. GitHub CI on PR #4: 6 checks passed.
- T4: RED missing modules → GREEN 190; mutation checks by the writer (continuity, ownership, reduced motion, write batching). The parent reviewed `value.ts`/`animate.ts`. 4-lens review approved (lineage `review-a2b05251d43c17db`), burned. Reliability WARNING (invalid spring options half-applied) fixed in `53c1fe1`: RED `requests: 1` → GREEN 191. Core bundle 7.94 KB min / 3.39 KB gzip. CI green on PRs #5/#6 and `main`.
- T6: RED `rebase is not a function` (10) / missing layout module → GREEN 238; writer mutation checks on velocity, rescale, no-op, origin, zero-size. Parent: `from` removed from `LayoutOptions` (RED typecheck `Unused '@ts-expect-error'` → GREEN, using a distributive `Omit` to keep the spring option union), origin pinned once per run. Review on `33c7580..5503a92` (incl. the T4 fix): medium, reliability lens approved (lineage `review-b6e38e59f13cd531`), burned. Its WARNING (stop() cleared corrections on a frozen layout) was fixed in `2272370`: RED child transform `""` → GREEN 240. Bundle 11.0 KB min / 4.55 KB gzip. CI green on PRs #7/#8.
- Notes: TypeScript resolved to 7.x (native compiler); `tsc` typecheck and declaration emit work. Overdamped test uses `{ stiffness: 100, damping: 60 }` so it settles within the 10 s convergence check.

## Next step

T7 on branch `feat/morph`. Next review base: `2272370` (the reviewed layout slice).
