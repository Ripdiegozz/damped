import type { ReactNode } from "react";
import { AnimatedNumber } from "./AnimatedNumber";
import { formatCurrency } from "./format";

interface StatTileProps {
  id: string;
  label: string;
  value: number;
  note: string;
  children?: ReactNode;
}

export function StatTile({ id, label, value, note, children }: StatTileProps) {
  return (
    <article className="card stat" data-stat={id}>
      <h2 className="stat-label">{label}</h2>
      <AnimatedNumber className="stat-value" value={value} format={formatCurrency} />
      <p className="stat-note">{note}</p>
      {children}
    </article>
  );
}
