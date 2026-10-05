import { useSpring } from "@damped/react";
import { useMotion } from "./motion-context";

/** A check mark that pops in when a bill is paid: it mounts at scale 0 and springs to 1, with a little overshoot. */
export function PaidBadge() {
  const { spring } = useMotion();
  const badge = useSpring<HTMLSpanElement>({ scale: 1 }, { ...spring("badge"), from: { scale: 0 } });
  return (
    <span className="paid-badge" ref={badge} aria-hidden="true">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="m5 12.5 4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
}
