// Classic script, loaded before the library so that every animation frame it requests is counted.
// Ordering guarantee: it wraps requestAnimationFrame before the library module is evaluated (each fixture lists this
// script ahead of its module script, and the library captures the wrapper when it first requests a frame), so a
// frame requested by the library can never bypass the counter.
(() => {
  const raw = window.requestAnimationFrame.bind(window);
  let requested = 0;
  window.requestAnimationFrame = (callback) => {
    requested++;
    return raw(callback);
  };

  window.e2e = {
    /** Frames requested through `window.requestAnimationFrame` so far (the recorder below is not counted). */
    frames: () => requested,
    /**
     * Calls `probe()` once per rendered frame until `stop()`, with an uncounted frame source so recording never
     * hides idleness. Callbacks run in registration order: start recording after calling the library, so each
     * sample sees what the library wrote in that same frame. `onSample` runs right after each sample is stored,
     * inside the same frame callback and before the library's next frame.
     */
    record(probe, onSample) {
      const samples = [];
      let active = true;
      let handle = 0;
      const step = (time) => {
        if (!active) return;
        samples.push({ time, value: probe() });
        onSample?.(samples);
        handle = raw(step);
      };
      handle = raw(step);
      return {
        samples,
        stop() {
          active = false;
          window.cancelAnimationFrame(handle);
        },
      };
    },
    /** Viewport box of an element, transforms included. */
    rect(element) {
      const { left, top, width, height } = element.getBoundingClientRect();
      return { x: left, y: top, width, height };
    },
    /** Resolves after the next rendered frame. */
    nextFrame: () => new Promise((resolve) => raw(() => resolve())),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
})();
