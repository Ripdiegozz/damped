import { Presence, useLayout } from "@damped/react";
import { useState, type MouseEvent } from "react";
import { Overview } from "./Overview";
import { Placeholder, ViewPanel } from "./ViewPanel";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { INITIAL_OVERVIEW, shuffleOverview, type OverviewData } from "./data";
import { SPRINGS, VIEW_ENTER, VIEW_EXIT } from "./motion";
import { viewLabel, type ViewId } from "./views";

function ViewContent({ view, overview }: { view: ViewId; overview: OverviewData }) {
  switch (view) {
    case "overview":
      return <Overview data={overview} />;
    case "bills":
      return <Placeholder title="Bills">Upcoming bills will appear here.</Placeholder>;
    case "activity":
      return <Placeholder title="Activity">Transactions will appear here.</Placeholder>;
    case "settings":
      return <Placeholder title="Settings">Preferences for Northbook will appear here.</Placeholder>;
  }
}

export function App() {
  const [view, setView] = useState<ViewId>("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [overview, setOverview] = useState(INITIAL_OVERVIEW);
  // The content area takes the space the sidebar gives up, so it animates its own box too.
  const main = useLayout<HTMLElement>([collapsed], { ...SPRINGS.panel, correct: "children" });

  // A plain #main link would add a hash to the URL; this keeps the address as it is.
  const skipToMain = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    document.getElementById("main")?.focus();
  };

  return (
    <div className="app">
      <a className="skip-link" href="#main" onClick={skipToMain}>
        Skip to main content
      </a>
      <Sidebar collapsed={collapsed} active={view} onSelect={setView} />
      <main id="main" className="main" tabIndex={-1} ref={main}>
        <TopBar
          title={viewLabel(view)}
          sidebarExpanded={!collapsed}
          onToggleSidebar={() => setCollapsed((current) => !current)}
          actions={
            view === "overview" ? (
              // A dev control: retargets the figures, which is the quickest way to see a spring being interrupted.
              <button type="button" className="button" onClick={() => setOverview((current) => shuffleOverview(current))}>
                Shuffle data
              </button>
            ) : undefined
          }
        />
        {/*
          Views swap inside one grid cell: the leaving view keeps its place in the flow and is drawn over the entering
          one, so neither needs a measured position, both keep the stage's width, and the stage is never empty (an
          absolutely positioned leaving view would need its box pinned first, or it would collapse to its content).
        */}
        <div className="stage">
          <Presence enter={VIEW_ENTER} exit={VIEW_EXIT} options={SPRINGS.view}>
            <ViewPanel key={view} view={view}>
              <ViewContent view={view} overview={overview} />
            </ViewPanel>
          </Presence>
        </div>
      </main>
    </div>
  );
}
