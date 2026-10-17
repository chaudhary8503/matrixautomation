import { useMemo, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { PresenceContext } from "framer-motion";
import { bootedFromSnapshot } from "@/lib/query-client";

const noop = () => {};
const register = () => noop;

/**
 * When the visitor landed on a prerendered snapshot, the page they see first is already fully
 * drawn: playing entrance animations (fade from opacity 0) would make it blink. So on that first
 * page every motion component starts in its final state (`initial: false`). After they navigate
 * elsewhere, pages animate in as usual.
 *
 * IMPORTANT: the context value must NEVER switch between an object and `null`. framer-motion's
 * hooks (usePresence, used by every AnimatePresence) call a different number of React hooks
 * depending on whether the context is null, and assume it never changes for a component's lifetime.
 * Switching it to null on navigation crashed the app with React error #311 (white screen).
 * So the value is always an object (an "always present" parent), and only `initial` changes.
 */
export function SnapshotEntrance({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [landing] = useState(pathname);
  const skipEntrance = bootedFromSnapshot && pathname === landing;
  const value = useMemo(
    () => ({ id: "app", isPresent: true, register, initial: skipEntrance ? (false as const) : undefined }),
    [skipEntrance],
  );
  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}
