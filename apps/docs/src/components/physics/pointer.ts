export interface VelocityTracker {
  push(time: number, position: number): void;
  /** Units per second over the recent samples; 0 when the pointer has stopped or there is not enough to tell. */
  velocity(now: number): number;
  reset(): void;
}

export interface VelocityTrackerOptions {
  /** Samples older than this (ms, before the newest) are ignored. */
  windowMs?: number;
  /** A pointer silent for longer than this (ms) before the release is at rest. */
  staleMs?: number;
}

/**
 * Estimates how fast a dragged pointer moves, from a least-squares line through the last few samples. A release
 * hands that velocity to the spring, so a flick keeps going and a held-still release starts from rest.
 */
export function createVelocityTracker({ windowMs = 100, staleMs = 80 }: VelocityTrackerOptions = {}): VelocityTracker {
  let samples: { time: number; position: number }[] = [];
  return {
    push(time, position) {
      samples.push({ time, position });
      samples = samples.filter((sample) => sample.time >= time - windowMs);
    },
    velocity(now) {
      const last = samples.at(-1);
      if (last === undefined || samples.length < 2 || now - last.time > staleMs) return 0;
      const meanTime = samples.reduce((sum, sample) => sum + sample.time, 0) / samples.length;
      const meanPosition = samples.reduce((sum, sample) => sum + sample.position, 0) / samples.length;
      let covariance = 0;
      let variance = 0;
      for (const sample of samples) {
        covariance += (sample.time - meanTime) * (sample.position - meanPosition);
        variance += (sample.time - meanTime) ** 2;
      }
      // Samples that share a timestamp carry no direction.
      return variance === 0 ? 0 : (covariance / variance) * 1000;
    },
    reset() {
      samples = [];
    },
  };
}
