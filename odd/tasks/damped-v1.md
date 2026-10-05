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
- Running authored-line count: 0.

## Tasks

| ID | Task | Route | Status |
|----|------|-------|--------|
| T1 | Scaffold: Bun workspace, strict tsconfig, happy-dom preload, build scripts, smoke test | inline (mechanical config files) | [ ] |
| T2 | Analytic spring: exact position/velocity at any `t` (under-, critically, over-damped), `duration`/`bounce` → stiffness/damping, settle detection, velocity continuity on retarget | delegated writer (2 non-trivial files) | [ ] |
| T3 | Frame scheduler: single rAF loop, read-then-write phases, sleeps when idle, injectable clock/frame source | pending | [ ] |
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

## Next step

T1 scaffold.
