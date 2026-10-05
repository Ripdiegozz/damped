export interface Merchant {
  id: string;
  name: string;
  /** Monthly amount in dollars. */
  amount: number;
}

/** Invented merchants for the list demo. */
export const MERCHANTS: readonly Merchant[] = [
  { id: "corner-grocery", name: "Corner Grocery", amount: 64.2 },
  { id: "city-power", name: "City Power", amount: 84.2 },
  { id: "fibernet", name: "FiberNet", amount: 59.9 },
  { id: "blue-gym", name: "Blue Gym", amount: 32 },
  { id: "harbor-insurance", name: "Harbor Insurance", amount: 118.5 },
];

const sameOrder = (a: readonly Merchant[], b: readonly Merchant[]): boolean => a.every((item, index) => item.id === b[index]!.id);

/** Fisher-Yates over a copy. The result never equals the input order, so a shuffle always moves something. */
export function shuffled(items: readonly Merchant[], random: () => number = Math.random): Merchant[] {
  const result = [...items];
  if (result.length < 2) return result;
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.min(index, Math.floor(random() * (index + 1)));
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  if (sameOrder(result, items)) result.push(result.shift()!);
  return result;
}

/** Alphabetical, ignoring case; equal names keep their relative order. */
export function sortedByName(items: readonly Merchant[]): Merchant[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}

/** Largest amount first. */
export function sortedByAmount(items: readonly Merchant[]): Merchant[] {
  return [...items].sort((a, b) => b.amount - a.amount);
}
