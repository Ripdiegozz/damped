import {
  animate,
  entries,
  identityValue,
  peekSpringValue,
  toList,
  type AnimatableProperty,
  type AnimateOptions,
  type AnimationControls,
  type AnimationTargets,
  type DistributiveOmit,
} from "./animate";
import { springParams, type SpringOptions } from "./spring";

/*
 * enter() and exit() are animate() with presence semantics, so an exit that is interrupted by an enter() only retargets
 * the same values and keeps position and velocity. While an element exits it is inert and aria-hidden.
 */

export type EnterOptions = DistributiveOmit<AnimateOptions, "from">;

export type ExitOptions = AnimateOptions & {
  /** What to do once the exit settles without being interrupted: true (default) removes the element from the DOM; false leaves it; a function is called instead. */
  remove?: boolean | ((element: Element) => void);
};

interface ExitRecord {
  interrupted: boolean;
  properties: AnimatableProperty[];
  /** Puts back the `inert` and `aria-hidden` the element had before this exit. */
  restore(): void;
}

// The exit that currently owns each element.
const exits = new WeakMap<Element, ExitRecord>();

function hide(element: Element): () => void {
  const inert = element.hasAttribute("inert");
  const ariaHidden = element.getAttribute("aria-hidden");
  element.toggleAttribute("inert", true);
  element.setAttribute("aria-hidden", "true");
  return () => {
    element.toggleAttribute("inert", inert);
    if (ariaHidden === null) element.removeAttribute("aria-hidden");
    else element.setAttribute("aria-hidden", ariaHidden);
  };
}

function interrupt(element: Element): void {
  const record = exits.get(element);
  if (record === undefined) return;
  exits.delete(element);
  record.interrupted = true;
  record.restore();
}

function complete(element: Element, record: ExitRecord, remove: ExitOptions["remove"]): boolean {
  if (record.interrupted) return false;
  // A property that moves again was retargeted by something other than enter()/exit(), e.g. a direct animate() call.
  if (record.properties.some((property) => peekSpringValue(element, property)?.animating === true)) {
    interrupt(element);
    return false;
  }
  exits.delete(element);
  if (remove === false || typeof remove === "function") record.restore();
  if (typeof remove === "function") remove(element);
  else if (remove !== false) element.remove();
  return true;
}

/**
 * Jump to `from`, then animate each property to `to[property]` or its identity value (x/y/rotate/blur 0,
 * scale/scaleX/scaleY/opacity 1). An element that is already animating one of those values (for example one that is
 * exiting) is only retargeted, so it keeps its position and velocity; and the properties its exit was animating return
 * to their identity values unless `to` says otherwise.
 */
export function enter(
  target: Element | readonly Element[],
  from: AnimationTargets,
  to: AnimationTargets = {},
  options: EnterOptions = {},
): AnimationControls {
  const starts = entries(from, "enter from");
  const ends = entries(to, "enter to");
  springParams(options as SpringOptions);

  const controls = toList(target).map((element) => {
    const goals: AnimationTargets = {};
    for (const property of exits.get(element)?.properties ?? []) goals[property] = identityValue(property);
    for (const [property] of starts) goals[property] = identityValue(property);
    for (const [property, value] of ends) goals[property] = value;
    interrupt(element);

    const inFlight = (Object.keys(goals) as AnimatableProperty[]).some(
      (property) => peekSpringValue(element, property)?.animating === true,
    );
    return animate(element, goals, { ...options, ...(inFlight ? {} : { from }) });
  });

  return {
    finished: Promise.all(controls.map((entry) => entry.finished)).then(() => undefined),
    stop() {
      for (const entry of controls) entry.stop();
    },
  };
}

/**
 * Animate to `to`; once settled (not interrupted), remove/handle the element. Resolves true if the exit completed,
 * false if a later enter()/exit()/stop() interrupted it.
 */
export function exit(
  target: Element | readonly Element[],
  to: AnimationTargets,
  options: ExitOptions = {},
): { readonly finished: Promise<boolean>; stop(): void } {
  const { remove = true, ...animateOptions } = options;
  const properties = entries(to, "exit").map(([property]) => property);
  springParams(animateOptions as SpringOptions);

  const runs = toList(target).map((element) => {
    // A previous exit restores the original attributes first, so this one captures them rather than its own.
    interrupt(element);
    const record: ExitRecord = { interrupted: false, properties, restore: hide(element) };
    exits.set(element, record);
    const controls = animate(element, to, animateOptions);
    return { element, record, controls, finished: controls.finished.then(() => complete(element, record, remove)) };
  });

  return {
    finished: Promise.all(runs.map((run) => run.finished)).then((results) => results.every(Boolean)),
    stop() {
      for (const { element, record, controls } of runs) {
        if (exits.get(element) !== record) continue;
        interrupt(element);
        controls.stop();
      }
    },
  };
}
