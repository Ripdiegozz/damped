import { useSpring } from "@damped/react";
import { useEffect, useState } from "react";
import { useMotion } from "./motion-context";

/** A bar whose fill is a full-width element scaled from its left edge, so it never triggers layout while it moves. */
export function ProgressBar({ progress, label }: { progress: number; label: string }) {
  const { spring } = useMotion();
  // Only the first commit grows the fill in from empty. The flag is state that flips after mount, so render stays pure
  // and a StrictMode remount or a discarded concurrent render sees the same value; later targets retarget the fill.
  const [entering, setEntering] = useState(true);
  useEffect(() => setEntering(false), []);
  const fill = useSpring<HTMLDivElement>({ scaleX: progress }, { ...spring("progress"), ...(entering ? { from: { scaleX: 0 } } : {}) });

  return (
    <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
      <div className="progress-fill" ref={fill} data-progress={progress} />
    </div>
  );
}
