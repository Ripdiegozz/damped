const currency = (fractionDigits: number, signed: boolean): Intl.NumberFormat =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    signDisplay: signed ? "exceptZero" : "auto",
  });

// Formatting runs on every animation frame for the stat tiles, so the formatters are built once.
const formatters = {
  cents: currency(2, false),
  whole: currency(0, false),
  signed: currency(2, true),
};
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 });
const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "$24,860.42"; pass 0 for whole dollars. */
export function formatCurrency(value: number, fractionDigits: 0 | 2 = 2): string {
  return (fractionDigits === 0 ? formatters.whole : formatters.cents).format(value);
}

/** "+$3,850.00" for income and "-$62.14" for spending. */
export function formatSignedCurrency(value: number): string {
  return formatters.signed.format(value);
}

/** "64%" for 0.64. */
export function formatPercent(ratio: number): string {
  return percent.format(ratio);
}

/** "Oct 3" for "2026-10-03". The date is read as a calendar day, so no time zone can move it. */
export function formatShortDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  const [year, month, day] = match === null ? [] : match.slice(1).map(Number);
  const date = year === undefined ? undefined : new Date(Date.UTC(year, month! - 1, day!));
  if (date === undefined || date.getUTCFullYear() !== year || date.getUTCMonth() !== month! - 1 || date.getUTCDate() !== day) {
    throw new RangeError(`formatShortDate expects a calendar date such as 2026-10-03, received "${isoDate}"`);
  }
  return shortDate.format(date);
}
