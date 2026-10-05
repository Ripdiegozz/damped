import { useMorph, useSpring } from "@damped/react";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { PaidBadge } from "./PaidBadge";
import { dueText, parseAmount, type Bill } from "./bills";
import { countRender } from "./debug";
import { formatCurrency } from "./format";
import { BACKDROP_SPRING, BILL_MORPH } from "./motion";

const FOCUSABLE = "input:not([disabled]), button:not([disabled]), [href], select, textarea, [tabindex]:not([tabindex='-1'])";

interface BillCardProps {
  bill: Bill;
  paid: boolean;
  /** Whether this card is the grid's tab stop; the others are reached with the arrow keys. */
  tabStop: boolean;
  onPay(bill: Bill, amount: number): void;
}

/**
 * One bill: a card that morphs into its own dialog. Every card owns a useMorph, so the dialog it opens is already
 * the right one, its content is static, and its size cannot depend on which bill was clicked (morph() measures
 * the target synchronously, before React could render different content). The cost is seven hidden dialogs in the
 * DOM, which the browser does not lay out or expose.
 */
export function BillCard({ bill, paid, tabStop, onPay }: BillCardProps) {
  countRender("bill-card");
  const { source, target, open, close, isOpen } = useMorph(BILL_MORPH);
  const backdrop = useSpring<HTMLDivElement>({ opacity: isOpen ? 1 : 0 }, BACKDROP_SPRING);
  const cardRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(bill.amount.toFixed(2));
  const [invalid, setInvalid] = useState(false);
  const titleId = useId();
  const inputId = useId();
  const errorId = useId();
  const due = dueText(bill.dueInDays);

  const setCard = useCallback(
    (node: HTMLButtonElement | null) => {
      cardRef.current = node;
      source(node);
    },
    [source],
  );
  const setDialog = useCallback(
    (node: HTMLDivElement | null) => {
      dialogRef.current = node;
      target(node);
    },
    [target],
  );

  const openDialog = () => {
    if (!isOpen) {
      setText(bill.amount.toFixed(2));
      setInvalid(false);
    }
    void open();
  };

  const closeDialog = useCallback(() => {
    void close().then((settled) => {
      // Normally focus is already on the card; this only repairs a focus that was lost on the way.
      if (settled && document.activeElement === document.body) cardRef.current?.focus({ preventScroll: true });
    });
    // Back on the card at once: the dialog is inert while it travels back, and Enter or Space on the card reverses it.
    cardRef.current?.focus({ preventScroll: true });
  }, [close]);

  // Focus moves into the dialog when it opens, including when a closing dialog is reversed.
  useEffect(() => {
    if (!isOpen) return;
    const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? dialogRef.current)?.focus({ preventScroll: true });
  }, [isOpen]);

  // Escape closes and Tab stays inside while the dialog is open.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog();
        return;
      }
      const root = dialogRef.current;
      if (event.key !== "Tab" || root === null) return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = items[0];
      const last = items.at(-1);
      if (first === undefined || last === undefined) {
        event.preventDefault();
        root.focus();
      } else if (!root.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, closeDialog]);

  const pay = (event: FormEvent) => {
    event.preventDefault();
    const amount = parseAmount(text);
    if (amount === undefined) {
      setInvalid(true);
      inputRef.current?.focus();
      return;
    }
    onPay(bill, amount);
    closeDialog();
  };

  return (
    <>
      <button
        type="button"
        className="bill-card"
        ref={setCard}
        data-bill-card={bill.id}
        data-paid={paid}
        tabIndex={tabStop ? 0 : -1}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={openDialog}
      >
        {/* One child holds everything: morph() corrects and blurs the direct children of the card. */}
        <span className="bill-body">
          <span className="bill-head">
            <span className="bill-name">{bill.name}</span>
            {bill.autopay && <span className="badge">Autopay</span>}
          </span>
          <span className="bill-amount">{formatCurrency(bill.amount)}</span>
          {paid ? <span className="bill-due paid">Paid</span> : <span className={due.overdue ? "bill-due overdue" : "bill-due"}>{due.text}</span>}
          <span className="chip">
            <span className="chip-mark" aria-hidden="true">
              {bill.payee.charAt(0)}
            </span>
            {bill.payee}
          </span>
          {paid && <PaidBadge />}
        </span>
      </button>

      {/* In document.body: <main> keeps a transform after its layout animations, which would pin a fixed dialog inside it. */}
      {createPortal(
        <>
          <div
            className="backdrop"
            ref={backdrop}
            data-bill-backdrop={bill.id}
            data-open={isOpen}
            aria-hidden="true"
            onClick={closeDialog}
          />
          <div
            className="bill-dialog"
            ref={setDialog}
            data-bill-dialog={bill.id}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            inert={!isOpen}
          >
            <form className="dialog-body" onSubmit={pay} noValidate>
              <h2 id={titleId}>{bill.name}</h2>
              <p className="dialog-amount">{formatCurrency(bill.amount)}</p>
              <p className="dialog-payee">{bill.payee}</p>
              <p className="dialog-route">{`From: Joint checking (John & Jane Doe) → To: ${bill.payee}`}</p>
              <div className="field">
                <label htmlFor={inputId}>Amount</label>
                <input
                  id={inputId}
                  ref={inputRef}
                  inputMode="decimal"
                  autoComplete="off"
                  value={text}
                  disabled={paid}
                  aria-invalid={invalid}
                  aria-describedby={invalid ? errorId : undefined}
                  onChange={(event) => {
                    setText(event.target.value);
                    setInvalid(false);
                  }}
                />
                {invalid && (
                  <p id={errorId} role="alert" className="field-error">
                    Enter an amount greater than $0.00, such as 182.40.
                  </p>
                )}
              </div>
              <p className="dialog-note">{bill.note}</p>
              <div className="dialog-actions">
                <button type="button" className="button" onClick={closeDialog}>
                  Cancel
                </button>
                <button type="submit" className="button primary" disabled={paid}>
                  {paid ? "Paid" : "Pay now"}
                </button>
              </div>
            </form>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
