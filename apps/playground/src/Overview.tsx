import { RecentActivity } from "./RecentActivity";
import { ProgressBar } from "./ProgressBar";
import { StatTile } from "./StatTile";
import { savingsProgress, type OverviewData } from "./data";
import { formatCurrency, formatPercent } from "./format";

export function Overview({ data }: { data: OverviewData }) {
  const progress = savingsProgress(data);
  return (
    <div className="overview">
      <div className="stats">
        <StatTile id="balance" label="Balance" value={data.balance} note="Joint account with Jane Doe" />
        <StatTile id="income" label="Income this month" value={data.income} note="Salary and transfers" />
        <StatTile id="spent" label="Spent this month" value={data.spent} note="Bills, groceries and more" />
        <StatTile
          id="savings"
          label="Savings goal"
          value={data.saved}
          note={`${formatPercent(progress)} of ${formatCurrency(data.goal, 0)}`}
        >
          <ProgressBar progress={progress} label="Savings goal" />
        </StatTile>
      </div>
      <section className="card activity" aria-labelledby="recent-activity-title">
        <h2 id="recent-activity-title">Recent activity</h2>
        <RecentActivity />
      </section>
    </div>
  );
}
