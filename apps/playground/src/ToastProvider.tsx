import { Presence } from "@damped/react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ToastItem, type ToastData } from "./ToastItem";
import { DEBUG } from "./debug";
import { SPRINGS, TOAST_ENTER, TOAST_EXIT } from "./motion";

/** The stack holds this many toasts; raising one more makes the oldest leave. */
export const MAX_TOASTS = 4;
export const TOAST_DURATION_MS = 4000;

interface ToastApi {
  show(message: string): void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (api === null) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const nextId = useRef(1);
  const [gone, setGone] = useState(0);

  const show = useCallback((message: string) => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, message }].slice(-MAX_TOASTS));
  }, []);
  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);
  const api = useMemo(() => ({ show }), [show]);

  const duration = DEBUG.toastMs ?? TOAST_DURATION_MS;
  return (
    <ToastContext value={api}>
      {children}
      {/* In document.body, bottom right (bottom center on narrow screens), above the dialogs. */}
      {createPortal(
        <div className="toast-region">
          <Presence enter={TOAST_ENTER} exit={TOAST_EXIT} options={SPRINGS.toast} onExitComplete={() => setGone((count) => count + 1)}>
            {toasts.map((toast, index) => (
              <ToastItem key={toast.id} toast={toast} after={toasts.length - 1 - index} reflowKey={gone} duration={duration} onDismiss={dismiss} />
            ))}
          </Presence>
        </div>,
        document.body,
      )}
    </ToastContext>
  );
}
