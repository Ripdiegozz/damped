const MINUS = "−";

/** "+1.2", "−0.4", "0.0": an explicit sign, a real minus sign and never a negative zero. */
export function signed(value: number, digits: number): string {
  const text = Math.abs(value).toFixed(digits);
  if (Number(text) === 0) return text;
  return `${value < 0 ? MINUS : "+"}${text}`;
}

/** A plain number with a real minus sign ("−0.33") and no plus sign. */
export function plain(value: number, digits: number): string {
  const text = Math.abs(value).toFixed(digits);
  return value < 0 && Number(text) !== 0 ? `${MINUS}${text}` : text;
}

/** Captures the pointer for a drag. Silent where the environment cannot (a test DOM, a synthetic event). */
export function capture(element: Element, pointerId: number): void {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Without capture the drag still works while the pointer stays over the element.
  }
}
