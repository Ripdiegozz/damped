import { morph, type MorphControls, type MorphOptions } from "@damped/core";
import { useEffect, useMemo, useRef, useState, type RefCallback } from "react";
import { useIsomorphicLayoutEffect } from "./isomorphic";

export interface MorphHandle {
  /** Ref for the element that is always visible (the card). */
  source: RefCallback<HTMLElement>;
  /** Ref for the element that opens (the dialog). Render it without a `hidden` prop: the hook owns that attribute. */
  target: RefCallback<HTMLElement>;
  /** Morphs source into target. Resolves true when it settled, false when a later open()/close() or an unmount cut it. */
  open(): Promise<boolean>;
  /** Morphs target back into source and re-hides the target once that settled. Same resolution as open(). */
  close(): Promise<boolean>;
  isOpen: boolean;
}

interface Run {
  controls: MorphControls;
  promise: Promise<boolean>;
}

interface Core {
  source: HTMLElement | null;
  target: HTMLElement | null;
  options: MorphOptions | undefined;
  wantOpen: boolean;
  run: Run | undefined;
  /** Targets whose initial visibility was decided, so re-attaching the same element never re-hides it. */
  seen: WeakSet<Element>;
  handle: Omit<MorphHandle, "isOpen">;
  dispose(): void;
}

function createCore(setOpen: (open: boolean) => void): Core {
  const core: Core = {
    source: null,
    target: null,
    options: undefined,
    wantOpen: false,
    run: undefined,
    seen: new WeakSet(),
    dispose() {
      core.run?.controls.stop();
    },
    handle: {
      source(node) {
        core.source = node;
      },
      target(node) {
        core.target = node;
        // Written to the DOM during the commit, so a closed target never paints.
        if (node !== null && !core.seen.has(node)) {
          core.seen.add(node);
          if (!core.wantOpen) node.hidden = true;
        }
      },
      open() {
        const { source, target } = core;
        if (source === null || target === null) return Promise.resolve(false);
        if (core.wantOpen) return core.run?.promise ?? Promise.resolve(true);
        const wasHidden = target.hidden;
        // Visible before morph() measures it.
        target.hidden = false;
        let controls: MorphControls;
        try {
          controls = morph(source, target, core.options);
        } catch (error) {
          target.hidden = wasHidden;
          return Promise.reject(error);
        }
        core.wantOpen = true;
        setOpen(true);
        return track(core, controls, false);
      },
      close() {
        const { source, target } = core;
        if (!core.wantOpen) return core.run?.promise ?? Promise.resolve(true);
        if (source === null || target === null) return Promise.resolve(false);
        let controls: MorphControls;
        try {
          controls = morph(target, source, core.options);
        } catch (error) {
          return Promise.reject(error);
        }
        core.wantOpen = false;
        setOpen(false);
        return track(core, controls, true);
      },
    },
  };
  return core;
}

function track(core: Core, controls: MorphControls, hideWhenSettled: boolean): Promise<boolean> {
  const run: Run = {
    controls,
    promise: controls.finished.then((settled) => {
      // A morph that was cut (settled false) leaves the target as the newer morph needs it.
      if (settled && hideWhenSettled && core.run === run && !core.wantOpen && core.target !== null) core.target.hidden = true;
      return settled;
    }),
  };
  core.run = run;
  return run.promise;
}

/**
 * Owns a card-to-dialog morph. Both elements stay mounted: while closed the hook keeps the target hidden through the
 * DOM `hidden` attribute, and `open()` unhides it before the morph measures it. `isOpen` is the only React state, and
 * it changes only when `open()` or `close()` is called, never per frame.
 *
 * The geometry morph() measures must not depend on `isOpen`: it is read synchronously, before React re-renders.
 */
export function useMorph(options?: MorphOptions): MorphHandle {
  const [isOpen, setOpen] = useState(false);
  const holder = useRef<Core | null>(null);
  holder.current ??= createCore(setOpen);
  const core = holder.current;

  useIsomorphicLayoutEffect(() => {
    core.options = options;
  });
  useEffect(() => () => core.dispose(), [core]);

  return useMemo(() => ({ ...core.handle, isOpen }), [core, isOpen]);
}
