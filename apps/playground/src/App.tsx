import { Presence, useLayout } from "@damped/react";
import { useCallback, useReducer, useState, type MouseEvent, type ReactNode } from "react";
import { ActivityView } from "./ActivityView";
import { BillsView } from "./BillsView";
import { Overview } from "./Overview";
import { Placeholder, ViewPanel } from "./ViewPanel";
import { Sidebar } from "./Sidebar";
import { SpringLab } from "./SpringLab";
import { TopBar } from "./TopBar";
import { activityReducer, draftTransaction, initialActivityState, visibleItems, type ActivityItem } from "./activity";
import type { Bill } from "./bills";
import { INITIAL_OVERVIEW, shuffleOverview, type OverviewData } from "./data";
import { useToast } from "./ToastProvider";
import { formatCurrency } from "./format";
import { LAB_ENTER, LAB_EXIT, VIEW_ENTER, VIEW_EXIT } from "./motion";
import { useMotion } from "./motion-context";
import { viewLabel, type ViewId } from "./views";

interface ViewContentProps {
  view: ViewId;
  overview: OverviewData;
  paid: ReadonlySet<string>;
  onPay(bill: Bill, amount: number): void;
  activity: ReactNode;
}

function ViewContent({ view, overview, paid, onPay, activity }: ViewContentProps) {
  switch (view) {
    case "overview":
      return <Overview data={overview} />;
    case "bills":
      return <BillsView paid={paid} onPay={onPay} />;
    case "activity":
      return activity;
    case "settings":
      return <Placeholder title="Settings">Preferences for Northbook will appear here.</Placeholder>;
  }
}

export function App() {
  const [view, setView] = useState<ViewId>("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [labOpen, setLabOpen] = useState(false);
  const [overview, setOverview] = useState(INITIAL_OVERVIEW);
  // Kept here, so a paid bill stays paid when the view is left and entered again.
  const [paid, setPaid] = useState<ReadonlySet<string>>(() => new Set());
  const toast = useToast();
  // Kept here for the same reason as `paid`, and because the top bar's "+ New" adds a transaction while Activity is open.
  const [activity, dispatch] = useReducer(activityReducer, undefined, initialActivityState);
  const addTransaction = () => {
    const item = draftTransaction(activity.added);
    dispatch({ type: "add", item });
    toast.show(`Added ${item.merchant}`);
  };
  const deleteTransaction = (item: ActivityItem) => {
    const index = activity.items.findIndex((entry) => entry.id === item.id);
    dispatch({ type: "remove", id: item.id });
    toast.show(`Deleted ${item.merchant}`, { action: { label: "Undo", onAction: () => dispatch({ type: "restore", item, index }) } });
  };
  const payBill = useCallback(
    (bill: Bill, amount: number) => {
      setPaid((current) => new Set(current).add(bill.id));
      toast.show(`Paid ${formatCurrency(amount)} to ${bill.payee}`);
    },
    [toast],
  );
  // The content area takes the space the sidebar gives up, so it animates its own box too.
  const { spring } = useMotion();
  const main = useLayout<HTMLElement>([collapsed], { ...spring("panel"), correct: "children" });

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
          labOpen={labOpen}
          onToggleLab={() => setLabOpen((current) => !current)}
          onNew={() => (view === "activity" ? addTransaction() : toast.show("New transaction draft created"))}
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
          <Presence enter={VIEW_ENTER} exit={VIEW_EXIT} options={spring("view")}>
            <ViewPanel key={view} view={view}>
              <ViewContent
                view={view}
                overview={overview}
                paid={paid}
                onPay={payBill}
                activity={
                  <ActivityView
                    items={visibleItems(activity)}
                    filter={activity.filter}
                    sort={activity.sort}
                    onFilter={(filter) => dispatch({ type: "filter", filter })}
                    onSort={(sort) => dispatch({ type: "sort", sort })}
                    onAdd={addTransaction}
                    onDelete={deleteTransaction}
                  />
                }
              />
            </ViewPanel>
          </Presence>
        </div>
      </main>
      {/* The lab enters and leaves like everything else; its panel is portaled to <body>, away from the transformed <main>. */}
      <Presence enter={LAB_ENTER} exit={LAB_EXIT} options={spring("view")}>
        {labOpen ? <SpringLab key="lab" /> : null}
      </Presence>
    </div>
  );
}
