/** After a pause ends, a toast stays at least this long (or its whole duration, if that is shorter). */
export const MIN_RESUME_MS = 1000;

interface PauseState {
  /** How long the timer was set for when it last started. */
  remaining: number;
  /** How long it has run since then. */
  elapsed: number;
  /** The toast's whole duration. */
  duration: number;
}

/** What is left on the dismissal timer after a pause: the unspent time, but never below the reading floor. */
export function remainingAfterPause({ remaining, elapsed, duration }: PauseState): number {
  return Math.max(remaining - elapsed, Math.min(MIN_RESUME_MS, duration));
}
