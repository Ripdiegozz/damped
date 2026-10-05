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
- Slices merged (cont.): #9 morph (`9a13224`, `size:exception`), #10 browser tests (`2759db3`, `size:exception`: test infrastructure only).
- Slices merged (cont.): #11 native math (`0b10103`, `size:exception`: 696 lockfile lines), #12 `withDamped` + `toReanimated` (`34f139c`, `size:exception`: tests).
- Slices merged (cont.): #13 presence (`393b2f7`, `size:exception`).
- Running authored-line count: ~8,960 (… + T8 779).

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
| T7 | `morph(from, to)`: FLIP both elements between each other's boxes (reusing layout internals), element opacity crossfade with a faster incoming fade (no mid-morph opacity dip), blur on the corrected content children, `finished: Promise<boolean>` (true unless superseded/stopped), velocity-continuous reversal. The shared-element registry moves to T9, where React needs it | delegated writer | [x] `a027f7d` + review fix `67e73a1` |
| T8 | Presence: `enter(el, from, to?)` (identity defaults) and `exit(el, to, { remove })`. The element stays in the DOM until the exit settles; re-entering mid-exit cancels the removal and keeps velocity; `inert` while exiting | delegated writer | [x] `1912c32`, `9ca07b1` remove-error isolation, `ba04569` review fix |
| T9 | React adapter `@damped/react` (React 19): `useSpringValue`, `useSpring(targets)` (ref-based `animate()`), `useLayout(deps)` (FLIP on re-render), `useMorph()` (both elements mounted, hook owns visibility + morph), `<Presence enter exit>` (keeps removed keyed children mounted until `exit()` settles); no per-frame re-render. **Scope change 2026-10-05:** `<Morph id>` with a global registry (Motion `layoutId`-style, measuring an element React already unmounted) is deferred to a follow-up (T13); `useMorph()` covers the card→modal case with the model proven in Playwright | delegated writer | [ ] |
| T13 | Follow-up: `<Morph id>` shared-element registry for conditional rendering (unmount/mount in one commit) | deferred | [ ] |
| T10 | Playwright real-browser tests for layout/FLIP and interruption | delegated writer | [x] `06eb534`, CI `79707fb`, review fixes `4225959` |
| T11 | Demo (POC rebuilt on the library), README with GIF, bundle-size measurement (per entry point; the whole core is 5.18 KB gzip after `morph`) | pending | [ ] |
| T12 | Expo / React Native: `@damped/native` targeting the latest stable Expo SDK 57 (Reanimated 4.5.1, worklets 0.10.1, RN 0.86.3, New Architecture). **Decision 2026-10-05: option (b).** (1) `toReanimated(options)` maps to exact physical `withSpring` config (stiffness/damping/mass, mass explicit since Reanimated defaults to 4). (2) `withDamped(toValue, options)` is a UI-thread custom animation via the public `defineAnimation`, with the exact analytic spring, NO velocity clipping on reversal, and overdamped support. Reanimated 4.5.1 `withSpring` clips reversal velocity to 0 and treats ζ>1 as critical (verified in its source). Self-contained worklet math with parity tests against the core; worklets babel plugin transform check. Done ahead of T8/T9 because it is independent and the research is fresh | delegated writer | [x] `aeb87a9` math, `01e888c` API, `8dc92f6` review fix (bundle worklet check) |

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
- T7: RED missing morph module → GREEN 272; 11 writer mutation checks. Reliability review approved (lineage `review-2c7642ab31450ea9`), burned. WARNING R3-001 (a failed morph superseded the running one) fixed in `67e73a1`: RED `finished` false → GREEN 274. R3-002 (stop before the first frame) does not reproduce, because values become animating synchronously; pinned by a test.
- T10: Playwright/Chromium suite (8 tests) passes 40/40 with `--repeat-each=5` (and with `--workers=8`). Real-browser numbers: the first FLIP frame is on the previous box; corrected child size error ≤1.5e-5 px; morph coverage ≥0.893; reversal at frame 7 continues +37.0 → +27.2 px before turning back. 4-lens review approved (lineage `review-0f66811493a52ef9`), burned; the reversal-timing WARNING was fixed by triggering the reversal inside the frame recorder. GitHub `browser` job green.
- T12 research (2026-10-05): Expo latest stable is SDK 57.0.26 (npm `dist-tags`, and `bundledNativeModules.json` lists reanimated 4.5.1). Reanimated `src/animation/spring/spring.ts`: `t = deltaTime / 1000`, velocity clipped when it points away from a new target, `zeta < 1 ? under : critical`, steps clamped to 64 ms. `defineAnimation` is exported from the package index.
- T12: RED missing math module → GREEN 40 parity tests (≤1e-9 against core); worklets plugin RED (`DEFAULT_REST_DELTA is not defined`: the plugin evaluates parameter defaults before binding the closure) → fixed. API RED 32 → GREEN 353. `bun build --minify` strips `"worklet"` directives, so the native package ships unminified (5.27 KB / 1.6 KB gzip). Reliability review approved (lineage `review-7c285d0863818792`), burned. WARNING R3-001 (dist not checked) fixed in `8dc92f6` with a bundle workletization test (RED with `minify: true`) → 357 pass. R3-002 (e2e server requires `E2E_PORT`) is intended, since `playwright.config.ts:18` always passes it. No simulator/device available, so on-device behavior is unverified. CI green on PRs #11/#12, including a cold-cache frozen install.
- T8: RED missing presence module → GREEN 393 with 17 mutation checks. Parent fix: a throwing `remove` callback rejected `finished`; it now resolves `true` and the error is rethrown asynchronously (RED → GREEN 394, mutation-checked). A first local commit had a failing test hidden by `| tail` and was amended before pushing; verification now checks exit codes. Reliability review approved (lineage `review-49b5bcd659d10d28`), burned. Its WARNING (bundle test temp dir inside `node_modules`) fixed in `ba04569`. Core 5.78 KB gzip (whole library). CI green on PR #13.
- Notes: TypeScript resolved to 7.x (native compiler); `tsc` typecheck and declaration emit work. Overdamped test uses `{ stiffness: 100, damping: 60 }` so it settles within the 10 s convergence check.

## Next step

T9 on branch `feat/react`, then T5 compositor, T11 demo. Next review base: `ba04569` (the reviewed presence slice).
