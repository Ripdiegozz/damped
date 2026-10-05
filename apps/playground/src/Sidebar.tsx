import { useLayout } from "@damped/react";
import type { CSSProperties } from "react";
import { Icon } from "./icons";
import { SPRINGS } from "./motion";
import { VIEWS, type ViewId } from "./views";

const SIDEBAR_RADIUS_PX = 20;

interface SidebarProps {
  collapsed: boolean;
  active: ViewId;
  onSelect(view: ViewId): void;
}

export function Sidebar({ collapsed, active, onSelect }: SidebarProps) {
  // The width is set by CSS on re-render; useLayout plays the change from the old box with a spring. `correct`
  // keeps the content from stretching while the box scales, and `radius` keeps the corners round.
  const sidebar = useLayout<HTMLElement>([collapsed], { ...SPRINGS.panel, correct: "children", radius: SIDEBAR_RADIUS_PX });
  const index = VIEWS.findIndex((view) => view.id === active);
  // The pill is positioned by CSS from --index; the change of index is what useLayout animates, so a click in the
  // middle of a move starts from where the pill is, with the velocity it has.
  const indicator = useLayout<HTMLSpanElement>([index], SPRINGS.indicator);

  return (
    <aside id="sidebar" className="sidebar" ref={sidebar} data-collapsed={collapsed}>
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          N
        </span>
        <span className="brand-name">Northbook</span>
      </div>

      <nav className="nav" aria-label="Primary">
        <div className="nav-list" style={{ "--index": index } as CSSProperties}>
          <span className="nav-indicator" ref={indicator} aria-hidden="true" />
          {VIEWS.map((view) => (
            <button
              key={view.id}
              type="button"
              className="nav-item"
              aria-label={view.label}
              aria-current={view.id === active ? "page" : undefined}
              onClick={() => onSelect(view.id)}
            >
              <Icon name={view.id} />
              <span className="nav-label">{view.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <div className="user-chip">
        <span className="avatar" aria-hidden="true">
          JD
        </span>
        <span className="user-text">
          <span className="user-name">John Doe</span>
          <span className="user-role">Owner</span>
        </span>
      </div>
    </aside>
  );
}
