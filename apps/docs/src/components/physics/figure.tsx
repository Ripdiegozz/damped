import { useId, type ReactNode, type Ref } from "react";

interface FigureProps {
  /** The `data-demo` of the test-hook contract (see ../demos/demo-state.ts). */
  demo: "physics-mass" | "physics-damping" | "physics-phase" | "physics-interruption";
  title: string;
  ref: Ref<HTMLDivElement>;
  children: ReactNode;
}

/** The root every physics figure shares: the not-content opt-out, the test hooks and a name for the group. */
export function Figure({ demo, title, ref, children }: FigureProps) {
  const titleId = useId();
  return (
    <div ref={ref} className="not-content physics-figure" data-demo={demo} data-state="idle" data-runs="0" role="group" aria-labelledby={titleId}>
      <p id={titleId} className="physics-title">
        {title}
      </p>
      {children}
    </div>
  );
}

interface ReadoutProps {
  label: string;
  name: string;
  /** What the server renders; the client writes the live value through `ref`. */
  children: string;
  ref?: Ref<HTMLElement>;
}

/** One term of a readout list. Figures that animate write `textContent` through the ref, never through React. */
export function Readout({ label, name, children, ref }: ReadoutProps) {
  return (
    <div>
      <dt>{label}</dt>
      <dd ref={ref} data-readout={name}>
        {children}
      </dd>
    </div>
  );
}
