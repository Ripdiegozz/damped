// All bills are invented. The joint account belongs to John Doe and his partner Jane Doe.

export interface Bill {
  id: string;
  name: string;
  payee: string;
  amount: number;
  /** Days until the due date; negative when the bill is late. */
  dueInDays: number;
  autopay: boolean;
  note: string;
}

export const BILLS: readonly Bill[] = [
  {
    id: "harbor-insurance",
    name: "Harbor Insurance",
    payee: "Harbor Insurance",
    amount: 182.4,
    dueInDays: 3,
    autopay: true,
    note: "Home and contents policy, monthly premium.",
  },
  {
    id: "city-power",
    name: "City Power",
    payee: "City Power",
    amount: 94.3,
    dueInDays: 12,
    autopay: false,
    note: "Electricity for the last billing period.",
  },
  {
    id: "fibernet",
    name: "FiberNet",
    payee: "FiberNet",
    amount: 59.99,
    dueInDays: -2,
    autopay: false,
    note: "Home internet, 500 Mbps plan.",
  },
  {
    id: "blue-gym",
    name: "Blue Gym",
    payee: "Blue Gym",
    amount: 39,
    dueInDays: 6,
    autopay: true,
    note: "Monthly membership for two.",
  },
  {
    id: "metro-transit",
    name: "Metro Transit pass",
    payee: "Metro Transit",
    amount: 64,
    dueInDays: 1,
    autopay: false,
    note: "Monthly zone 1-3 pass.",
  },
  {
    id: "rent",
    name: "Rent",
    payee: "Oak Street Apartments",
    amount: 1850,
    dueInDays: 5,
    autopay: true,
    note: "October rent for the apartment on Oak Street.",
  },
  {
    id: "shared-groceries",
    name: "Shared groceries with Jane Doe",
    payee: "Jane Doe",
    amount: 212.75,
    dueInDays: 0,
    autopay: false,
    note: "John's half of this week's shopping.",
  },
];

const plural = (days: number): string => (days === 1 ? "1 day" : `${days} days`);

/** The due line of a card; late bills are flagged so the UI can color them. */
export function dueText(daysFromNow: number): { text: string; overdue: boolean } {
  if (!Number.isInteger(daysFromNow)) throw new RangeError(`dueText expects a whole number of days, received ${daysFromNow}`);
  if (daysFromNow < 0) return { text: `Overdue by ${plural(-daysFromNow)}`, overdue: true };
  if (daysFromNow === 0) return { text: "Due today", overdue: false };
  if (daysFromNow === 1) return { text: "Due tomorrow", overdue: false };
  return { text: `Due in ${plural(daysFromNow)}`, overdue: false };
}

const AMOUNT = /^\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/;

/** A positive amount of dollars and cents as typed by a person ("182.40", "$1,850"), or undefined when it is not one. */
export function parseAmount(text: string): number | undefined {
  const match = AMOUNT.exec(text.trim());
  if (match === null) return undefined;
  const value = Number(`${match[1]!.replaceAll(",", "")}.${match[2] ?? "0"}`);
  return value > 0 ? value : undefined;
}
