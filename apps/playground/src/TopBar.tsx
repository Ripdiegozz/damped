import type { ReactNode } from "react";
import { Icon } from "./icons";

interface TopBarProps {
  title: string;
  sidebarExpanded: boolean;
  onToggleSidebar(): void;
  onNew(): void;
  labOpen: boolean;
  onToggleLab(): void;
  /** View-specific controls, shown before the primary action. */
  actions?: ReactNode;
}

export function TopBar({ title, sidebarExpanded, onToggleSidebar, onNew, labOpen, onToggleLab, actions }: TopBarProps) {
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
        <button type="button" className="button" aria-expanded={labOpen} aria-controls="spring-lab" onClick={onToggleLab}>
          Spring lab
        </button>
        <button type="button" className="button primary" onClick={onNew}>
          + New
        </button>
      </div>
    </header>
  );
}
