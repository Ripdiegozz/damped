import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { DEBUG } from "./debug";
import { DEFAULT_MOTION, effectiveReducedMotion, springFor, type MotionRole, type MotionSettings, type MotionSpring } from "./motion";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const query = matchMedia(QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** The system's reduced-motion preference, live. */
function useSystemReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => matchMedia(QUERY).matches, () => false);
}

interface MotionApi {
  settings: MotionSettings;
  update(changes: Partial<MotionSettings>): void;
  reset(): void;
  /** The system's preference, read-only. */
  systemReducedMotion: boolean;
  /** Reduce motion: the system asks for it, or the lab simulates it. */
  reduced: boolean;
  /** The spring for one surface; pass it as the `options` of the animation. */
  spring(role: MotionRole): MotionSpring;
}

const MotionContext = createContext<MotionApi | null>(null);

export function useMotion(): MotionApi {
  const api = useContext(MotionContext);
  if (api === null) throw new Error("useMotion must be used inside <MotionProvider>");
  return api;
}

export function MotionProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<MotionSettings>(DEFAULT_MOTION);
  const systemReducedMotion = useSystemReducedMotion();
  const update = useCallback((changes: Partial<MotionSettings>) => setSettings((current) => ({ ...current, ...changes })), []);
  const reset = useCallback(() => setSettings(DEFAULT_MOTION), []);

  const api = useMemo<MotionApi>(
    () => ({
      settings,
      update,
      reset,
      systemReducedMotion,
      reduced: effectiveReducedMotion(settings, systemReducedMotion),
      spring: (role) => springFor(settings, role, DEBUG.slow),
    }),
    [settings, update, reset, systemReducedMotion],
  );
  return <MotionContext value={api}>{children}</MotionContext>;
}
