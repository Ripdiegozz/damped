/** Items that start within this many pixels of the first one's top share its row. */
const SAME_ROW_PX = 1;

/** How many columns a wrapping grid currently has, from the top edge of each item in document order. */
export function columnCount(tops: readonly number[]): number {
  if (tops.length === 0) return 1;
  const first = tops[0]!;
  const inFirstRow = tops.findIndex((top) => Math.abs(top - first) > SAME_ROW_PX);
  return inFirstRow === -1 ? tops.length : Math.max(1, inFirstRow);
}

/** The item a key moves to, or undefined when the key is not a grid key. Moves that would leave the grid stay put. */
export function nextIndex(key: string, index: number, columns: number, count: number): number | undefined {
  switch (key) {
    case "ArrowRight":
      return Math.min(index + 1, count - 1);
    case "ArrowLeft":
      return Math.max(index - 1, 0);
    case "ArrowDown":
      return index + columns < count ? index + columns : index;
    case "ArrowUp":
      return index - columns >= 0 ? index - columns : index;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return undefined;
  }
}
