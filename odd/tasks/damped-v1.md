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
- Strategy: `ask-on-risk` (default). Chain strategy (`stacked-to-main` or `feature-branch-chain`): pending; asked before the first pull request. No remote exists yet; push/PR are the user's decision.
- Running authored-line count: 699 (T1 236 incl. bun.lock, T2 463).

## Tasks

| ID | Task | Route | Status |
|----|------|-------|--------|
| T1 | Scaffold: Bun workspace, strict tsconfig, happy-dom preload, build scripts, smoke test | inline (mechanical config files) | [x] `4b2f9db` |
| T2 | Analytic spring: exact position/velocity at any `t` (under-, critically, over-damped), `duration`/`bounce` → stiffness/damping, settle detection, velocity continuity on retarget | delegated writer (2 non-trivial files) | [x] `39ed619` |
| T2a | Follow-up (review R3-at-nonfinite-time): define `at(t)` for non-finite `t` (NaN → RangeError or documented behavior; `Infinity` → settled final state, never NaN) with tests | pending | [ ] |
| T3 | Frame scheduler: single rAF loop, read-then-write phases, sleeps when idle, injectable clock/frame source. Includes a real frame-rate-independence test driving springs through the scheduler with different frame sizes (review R3-frame-independence-tautology: the T2 test only calls `at(0.5)` repeatedly) | pending | [ ] |
| T4 | `animate(el, props, opts)`: transform composition (`x`, `y`, `scale`, `scaleX`, `scaleY`, `rotate`), `opacity`, blur; interruption inherits velocity; `stop()` + `finished`; reduced motion | pending | [ ] |
| T5 | Compositor driver: spring → CSS `linear()` easing via WAAPI, feature detection, fallback to JS driver, interruption from analytic state | pending | [ ] |
| T6 | Layout FLIP: measure, parent transform + inverse child scale correction, border-radius correction | pending | [ ] |
| T7 | Shared-element registry + `morph(from, to)` with blur crossfade | pending | [ ] |
| T8 | Presence: enter/exit, element stays mounted until exit settles | pending | [ ] |
| T9 | React adapter: `useSpring`, `<Morph id>`, `<Presence>`; no per-frame re-render | pending | [ ] |
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

## Verification evidence

- T1: RED `bun test` → `ReferenceError: document is not defined` (no DOM preload); GREEN after `test/happydom.ts` + `bunfig.toml` → 1 pass. `bun run typecheck` exit 0; `bun run build` emits `dist/index.js` + `dist/index.d.ts`. Review assess: medium, `under_budget`.
- T2: RED `bun test` → `Cannot find module '../src/spring'`; GREEN → 66 pass, 0 fail (18181 expects), parent re-run confirmed. Typecheck exit 0; build OK (2.32 KB minified). Closed-form velocity derivatives and settle-time envelope bound checked by the parent. Review assess on `b1d62a5..39ed619`: medium, `review_due` (`slice_budget_reached`, 699 lines); user granted review; lens `review-reliability` approved (lineage `review-e21f083d333d7677`), acknowledged, authority burned. Reviewed boundary: `39ed619`. Two non-blocking suggestions became T2a and part of T3.
- Notes: TypeScript resolved to 7.x (native compiler); `tsc` typecheck and declaration emit work. Overdamped test uses `{ stiffness: 100, damping: 60 }` so it settles within the 10 s convergence check.

## Next step

T2a (non-finite `t`), then T3 frame scheduler. Next review base: `39ed619`.
