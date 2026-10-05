import { useSpring } from "@damped/react";
import { useEffect, useRef } from "react";
import { useMotion } from "./motion-context";

/** A bar whose fill is a full-width element scaled from its left edge, so it never triggers layout while it moves. */
export function ProgressBar({ progress, label }: { progress: number; label: string }) {
  const { spring } = useMotion();
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);
  // `from` only matters for the first animation: the fill grows in from empty, and later targets retarget it.
  const fill = useSpring<HTMLDivElement>(
    { scaleX: progress },
    { ...spring("progress"), ...(mounted.current ? {} : { from: { scaleX: 0 } }) },
  );

  return (
    <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
      <div className="progress-fill" ref={fill} data-progress={progress} />
    </div>
  );
}
