import { Presence, useLayout } from "@damped/react";
import { useCallback, useState, type MouseEvent } from "react";
import { BillsView } from "./BillsView";
import { Overview } from "./Overview";
import { Placeholder, ViewPanel } from "./ViewPanel";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import type { Bill } from "./bills";
import { INITIAL_OVERVIEW, shuffleOverview, type OverviewData } from "./data";
import { useToast } from "./ToastProvider";
import { formatCurrency } from "./format";
import { SPRINGS, VIEW_ENTER, VIEW_EXIT } from "./motion";
import { viewLabel, type ViewId } from "./views";

interface ViewContentProps {
  view: ViewId;
  overview: OverviewData;
  paid: ReadonlySet<string>;
  onPay(bill: Bill, amount: number): void;
}

function ViewContent({ view, overview, paid, onPay }: ViewContentProps) {
  switch (view) {
    case "overview":
      return <Overview data={overview} />;
    case "bills":
      return <BillsView paid={paid} onPay={onPay} />;
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
  // Kept here, so a paid bill stays paid when the view is left and entered again.
  const [paid, setPaid] = useState<ReadonlySet<string>>(() => new Set());
  const toast = useToast();
  const payBill = useCallback(
    (bill: Bill, amount: number) => {
      setPaid((current) => new Set(current).add(bill.id));
      toast.show(`Paid ${formatCurrency(amount)} to ${bill.payee}`);
    },
    [toast],
  );
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
          onNew={() => toast.show("New transaction draft created")}
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
              <ViewContent view={view} overview={overview} paid={paid} onPay={payBill} />
            </ViewPanel>
          </Presence>
        </div>
      </main>
    </div>
  );
}
