import type { ReactNode, Ref } from "react";
import type { ViewId } from "./views";

interface ViewPanelProps {
  view: ViewId;
  /** Presence animates the element it receives through this ref (a prop in React 19). */
  ref?: Ref<HTMLElement>;
  children: ReactNode;
}

/** The element <Presence> animates: one per view, laid out in the same grid cell as the view that is leaving. */
export function ViewPanel({ view, ref, children }: ViewPanelProps) {
  return (
    <section className="view" data-view={view} ref={ref}>
      {children}
    </section>
  );
}

export function Placeholder({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card placeholder">
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
