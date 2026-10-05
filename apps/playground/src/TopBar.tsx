import type { ReactNode } from "react";
import { Icon } from "./icons";

interface TopBarProps {
  title: string;
  sidebarExpanded: boolean;
  onToggleSidebar(): void;
  /** View-specific controls, shown before the primary action. */
  actions?: ReactNode;
}

export function TopBar({ title, sidebarExpanded, onToggleSidebar, actions }: TopBarProps) {
  return (
    <header className="topbar">
      <button
        type="button"
        className="icon-button"
        aria-label="Toggle sidebar"
        aria-expanded={sidebarExpanded}
        aria-controls="sidebar"
        onClick={onToggleSidebar}
      >
        <Icon name="sidebar" />
      </button>
      <h1 className="topbar-title">{title}</h1>
      <div className="topbar-actions">
        {actions}
        {/* A placeholder until toasts exist. */}
        <button type="button" className="button primary">
          + New
        </button>
      </div>
    </header>
  );
}
