import { useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { PresenceContext } from "framer-motion";
import { bootedFromSnapshot } from "@/lib/query-client";

/** framer-motion skips the `initial` state of every motion component that mounts under this. */
const NO_ENTRANCE = {
  id: "snapshot",
  isPresent: true,
  initial: false as const,
  register: () => () => {},
};

/**
 * When the visitor landed on a prerendered snapshot, the page they see first is already fully
 * drawn: playing entrance animations (fade from opacity 0) would make it blink. So on that first
 * page every motion component starts in its final state. As soon as they navigate elsewhere,
 * pages animate in as usual.
 */
export function SnapshotEntrance({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [landing] = useState(pathname);
  const active = bootedFromSnapshot && pathname === landing;
  return <PresenceContext.Provider value={active ? NO_ENTRANCE : null}>{children}</PresenceContext.Provider>;
}
