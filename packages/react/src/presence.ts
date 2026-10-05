import { enter, exit, type AnimationTargets, type EnterOptions } from "damped";
import {
  Children,
  Fragment,
  cloneElement,
  createElement,
  isValidElement,
  useRef,
  useState,
  type Key,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefCallback,
} from "react";
import { useIsomorphicLayoutEffect } from "./isomorphic";

export interface PresenceProps {
  /** Where a child starts when it is added; it animates to its identity values. */
  enter?: AnimationTargets;
  /** Where a removed child animates to before it is dropped. Without it, removed children disappear at once. */
  exit?: AnimationTargets;
  options?: EnterOptions;
  /** Also animate the children present on the first mount. Default false. */
  initial?: boolean;
  /**
   * Called once with the key of every child that left. After an exit animation it runs in the same batch as the render
   * that removes the child: the child is still in the DOM when this runs, so state set here re-renders together with
   * the removal (a layout snapshot taken in that render still sees the old layout). A child that leaves without an
   * animation (no `exit` targets, or nothing to animate) is reported right after the commit that removed it. It is not
   * called when an exit was interrupted by the key coming back, or when Presence unmounted meanwhile.
   */
  onExitComplete?: (key: Key) => void;
  /** Keyed elements that are host elements or components that take `ref` as a prop. */
  children?: ReactNode;
}

interface Slot {
  key: string;
  exiting: boolean;
}

type ChildElement = ReactElement<{ ref?: Ref<Element> }>;

interface Entry {
  userRef: Ref<Element> | undefined;
  ref: RefCallback<Element>;
}

interface Core {
  mounted: boolean;
  elements: Map<string, Element>;
  /** Last element rendered for each key; the copy an exiting child keeps rendering. */
  retained: Map<string, ChildElement>;
  phases: Map<string, "present" | "exiting">;
  refs: Map<string, Entry>;
  /** False between an unmount and a (StrictMode) remount; exits that settle then report nowhere. */
  active: boolean;
}

const KEY_ERROR =
  "<Presence> children need a unique `key`, so it can tell which one left. Give every child a key, e.g. <div key={id} />.";
const TYPE_ERROR = "<Presence> children must be elements (host elements or components that take `ref`), received text.";

// toArray prefixes explicit keys (".$a", ".1:$a"); the error should name the key the app wrote.
const readable = (key: string): string => key.replace(/^\.(?:[^$:]*:)*\$/, "");

function collect(children: ReactNode): { order: string[]; elements: Map<string, ChildElement> } {
  // toArray rewrites missing keys into index keys, which would hide the mistake; the original elements show it.
  Children.forEach(children, (child) => {
    if (child === null || child === undefined || typeof child === "boolean") return;
    if (!isValidElement(child)) throw new TypeError(TYPE_ERROR);
    if (child.key === null) throw new TypeError(KEY_ERROR);
  });
  const order: string[] = [];
  const elements = new Map<string, ChildElement>();
  for (const child of Children.toArray(children)) {
    if (!isValidElement(child) || child.key === null) continue;
    if (elements.has(child.key)) throw new TypeError(`${KEY_ERROR} The key "${readable(child.key)}" is used twice.`);
    order.push(child.key);
    elements.set(child.key, child as ChildElement);
  }
  return { order, elements };
}

// Present children in their order; each removed child re-enters right after the nearest earlier neighbour it had.
function merge(previous: readonly Slot[], order: readonly string[], retain: ReadonlySet<string> | undefined): Slot[] {
  const result: Slot[] = order.map((key) => ({ key, exiting: false }));
  if (retain === undefined) return result;
  const present = new Set(order);
  previous.forEach((slot, index) => {
    if (present.has(slot.key) || !retain.has(slot.key)) return;
    let at = 0;
    for (let before = index - 1; before >= 0; before--) {
      const found = result.findIndex((other) => other.key === previous[before]!.key);
      if (found >= 0) {
        at = found + 1;
        break;
      }
    }
    result.splice(at, 0, { key: slot.key, exiting: true });
  });
  return result;
}

const sameSlots = (a: readonly Slot[], b: readonly Slot[]): boolean =>
  a.length === b.length && a.every((slot, index) => slot.key === b[index]!.key && slot.exiting === b[index]!.exiting);

function refFor(core: Core, key: string, userRef: Ref<Element> | undefined): RefCallback<Element> {
  const cached = core.refs.get(key);
  if (cached !== undefined && cached.userRef === userRef) return cached.ref;
  const ref: RefCallback<Element> = (node) => {
    if (node === null) return;
    core.elements.set(key, node);
    let cleanup: void | (() => void);
    if (typeof userRef === "function") cleanup = userRef(node);
    else if (userRef) userRef.current = node;
    return () => {
      if (core.elements.get(key) === node) core.elements.delete(key);
      if (typeof userRef === "function") {
        if (typeof cleanup === "function") cleanup();
        else userRef(null);
      } else if (userRef) {
        userRef.current = null;
      }
    };
  };
  core.refs.set(key, { userRef, ref });
  return ref;
}

/**
 * Keeps removed children mounted until their exit animation settles. Children must be keyed elements (a missing key
 * throws), either host elements or components that pass `ref` on to an element; damped writes the animated values to
 * those elements directly, so React only renders when the set of children changes.
 */
export function Presence({
  enter: enterFrom,
  exit: exitTo,
  options,
  initial = false,
  onExitComplete,
  children,
}: PresenceProps): ReactElement {
  const present = collect(children);
  const [slots, setSlots] = useState<Slot[]>(() => present.order.map((key) => ({ key, exiting: false })));
  const holder = useRef<Core | null>(null);
  holder.current ??= { mounted: false, elements: new Map(), retained: new Map(), phases: new Map(), refs: new Map(), active: true };
  const core = holder.current;

  const next = merge(slots, present.order, exitTo === undefined ? undefined : new Set(core.retained.keys()));
  // Derived state: React re-renders at once, before children render or anything commits.
  if (!sameSlots(slots, next)) setSlots(next);

  const items = next.map((slot) => ({ ...slot, element: present.elements.get(slot.key) ?? core.retained.get(slot.key)! }));

  useIsomorphicLayoutEffect(() => {
    core.active = true;
    return () => {
      core.active = false;
    };
  }, [core]);

  useIsomorphicLayoutEffect(() => {
    const firstCommit = !core.mounted;
    core.mounted = true;
    const live = new Set(items.map((item) => item.key));
    // Children that were present and are gone without having exited: nothing animated, so they left with this commit.
    const departed: string[] = [];
    for (const key of [...core.phases.keys(), ...core.retained.keys(), ...core.refs.keys()]) {
      if (live.has(key)) continue;
      if (core.phases.get(key) === "present") departed.push(key);
      core.phases.delete(key);
      core.retained.delete(key);
      core.refs.delete(key);
    }
    if (core.active) for (const key of departed) onExitComplete?.(readable(key));

    const drop = (key: string): void => {
      setSlots((current) => {
        const kept = current.filter((slot) => !(slot.key === key && slot.exiting));
        return kept.length === current.length ? current : kept;
      });
      // Right after the state update and not inside it, so both land in one render.
      if (core.active) onExitComplete?.(readable(key));
    };

    for (const { key, exiting, element } of items) {
      const node = core.elements.get(key);
      const phase = core.phases.get(key);
      if (!exiting) {
        core.retained.set(key, element);
        core.phases.set(key, "present");
        if (node === undefined) continue;
        if (phase === undefined) {
          if (enterFrom !== undefined && (!firstCommit || initial)) void enter(node, enterFrom, {}, options);
        } else if (phase === "exiting") {
          // Interrupts the exit: the core keeps position and velocity and animates back to the identity values.
          void enter(node, enterFrom ?? {}, {}, options);
        }
      } else if (phase !== "exiting") {
        core.phases.set(key, "exiting");
        if (node === undefined || exitTo === undefined) {
          drop(key);
        } else {
          void exit(node, exitTo, { ...options, remove: false }).finished.then((completed) => {
            // A key that came back meanwhile is present again; its newer exit (if any) reports for itself.
            if (completed && core.phases.get(key) === "exiting") drop(key);
          });
        }
      }
    }
  });

  return createElement(
    Fragment,
    null,
    items.map(({ key, element }) =>
      cloneElement(element, { ref: refFor(core, key, element.props.ref) } as Partial<ChildElement["props"]>),
    ),
  );
}
