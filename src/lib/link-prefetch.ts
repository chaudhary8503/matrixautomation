import type { QueryClient } from "@tanstack/react-query";
import { prefetchForPath } from "@/lib/queries";
import { preloadPublicPages, preloadRoute } from "@/routes";

type NetworkInfo = { saveData?: boolean; effectiveType?: string };

/**
 * Makes navigation feel instant without giving up code-splitting:
 * - hovering (≥ 60 ms), focusing or touching a link downloads that page's code and data,
 * - once the browser is idle, the code for every public page is downloaded.
 * Uses one delegated listener per event, so it covers every link (nav, cards, footer).
 */
export function installLinkPrefetch(client: QueryClient) {
  const connection = (navigator as Navigator & { connection?: NetworkInfo }).connection;
  if (connection?.saveData || connection?.effectiveType?.includes("2g")) return;

  const warmed = new Map<string, number>();
  const warm = (a: HTMLAnchorElement) => {
    if (a.target === "_blank" || a.hasAttribute("download")) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || url.pathname.startsWith("/admin")) return;
    const last = warmed.get(url.pathname);
    if (last && Date.now() - last < 30_000) return;
    warmed.set(url.pathname, Date.now());
    preloadRoute(url.pathname).catch(() => {});
    prefetchForPath(client, url.pathname).catch(() => {});
  };
  const linkOf = (e: Event) => (e.target as Element | null)?.closest?.<HTMLAnchorElement>("a[href]") ?? null;

  let pending: { a: HTMLAnchorElement; timer: number } | null = null;
  document.addEventListener(
    "mouseover",
    (e) => {
      const a = linkOf(e);
      if (!a || pending?.a === a) return;
      if (pending) clearTimeout(pending.timer);
      pending = { a, timer: window.setTimeout(() => warm(a), 60) };
    },
    { passive: true },
  );
  document.addEventListener(
    "mouseout",
    (e) => {
      if (pending && !pending.a.contains(e.relatedTarget as Node | null)) {
        clearTimeout(pending.timer);
        pending = null;
      }
    },
    { passive: true },
  );
  document.addEventListener("focusin", (e) => {
    const a = linkOf(e);
    if (a) warm(a);
  });
  document.addEventListener(
    "touchstart",
    (e) => {
      const a = linkOf(e);
      if (a) warm(a);
    },
    { passive: true },
  );

  // After the page has loaded and the browser is idle, fetch the remaining page chunks.
  const idle = (cb: () => void) =>
    typeof window.requestIdleCallback === "function"
      ? window.requestIdleCallback(cb, { timeout: 4000 })
      : setTimeout(cb, 2500); // Safari
  const start = () => idle(() => void preloadPublicPages().catch(() => {}));
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}
