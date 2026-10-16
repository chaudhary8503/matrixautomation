import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router";

/**
 * New page → jump to the top (not when only ?query or #hash changes).
 * Back/forward → return to where the visitor was on that page.
 */
export function ScrollToTop() {
  const { pathname, key } = useLocation();
  const navigationType = useNavigationType();
  const positions = useRef(new Map<string, number>());
  const lastY = useRef(0);
  const currentKey = useRef(key);

  // We restore positions ourselves; the browser's own restoration would jump too early.
  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    const onScroll = () => {
      lastY.current = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    positions.current.set(currentKey.current, lastY.current); // the page we're leaving
    currentKey.current = key;
    const saved = navigationType === "POP" ? positions.current.get(key) : undefined;
    window.scrollTo({ top: saved ?? 0, left: 0, behavior: "instant" });
    lastY.current = saved ?? 0;
  }, [pathname]); // only on a new page, not on ?query changes

  return null;
}
