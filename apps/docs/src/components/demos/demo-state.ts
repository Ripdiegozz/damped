/*
 * Test-hook contract shared by every demo island (the docs e2e relies on it).
 *
 *   data-demo="<name>"         on the demo root: retarget-spring, spring-tuner, flip-reorder, morph-card,
 *                              presence, compositor-vs-js.
 *   data-state="idle|animating|settled"
 *                              idle: nothing has moved yet. animating: at least one animation is running.
 *                              settled: every animation this demo started has settled or was superseded by a
 *                              later one that settled. It goes back to animating on the next interaction.
 *   data-runs="<n>"            how many animations the demo has started; it only grows. A test waits for it to
 *                              increase, then for data-state to be settled.
 *
 * The attributes are written straight to the DOM from animation callbacks. React never re-renders per frame and
 * never owns them, so a test can read them while the demo is moving without disturbing it.
 */

export type DemoState = "idle" | "animating" | "settled";

export interface DemoStateTracker {
  readonly state: DemoState;
  readonly runs: number;
  /** Starts counting one animation that has no promise (a timer-driven one); end it with settle(). */
  begin(): void;
  /** Ends one animation started with begin(). Does nothing when none is running. */
  settle(): void;
  /** Counts an animation until `finished` resolves. A rejection ends it as not completed, never rethrows. */
  track(finished: Promise<boolean>): Promise<boolean>;
}

export function createDemoState(onChange: (state: DemoState, runs: number) => void): DemoStateTracker {
  let state: DemoState = "idle";
  let runs = 0;
  let pending = 0;

  const move = (next: DemoState): void => {
    if (next === state) return;
    state = next;
    onChange(state, runs);
  };

  const tracker: DemoStateTracker = {
    get state() {
      return state;
    },
    get runs() {
      return runs;
    },
    begin() {
      pending++;
      runs++;
      // A run that starts while animating still changes the counter, which tests read.
      if (state === "animating") onChange(state, runs);
      else move("animating");
    },
    settle() {
      if (pending === 0) return;
      pending--;
      if (pending === 0) move("settled");
    },
    track(finished) {
      tracker.begin();
      return finished.then(
        (completed) => {
          tracker.settle();
          return completed;
        },
        () => {
          tracker.settle();
          return false;
        },
      );
    },
  };
  return tracker;
}

/** Writes the contract attributes to a demo root. */
export function writeDemoState(root: HTMLElement | null, state: DemoState, runs: number): void {
  if (root === null) return;
  root.dataset.state = state;
  root.dataset.runs = String(runs);
}
